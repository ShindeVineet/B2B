import { writeFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import assert from "node:assert/strict";
const db = new PrismaClient();
let ws;
try {
  const head = await db.user.findFirstOrThrow({
    where: { role: "b2b_head", active: true },
  });
  const targets = await (await fetch("http://127.0.0.1:9223/json")).json();
  ws = new WebSocket(
    targets.find((t) => t.type === "page").webSocketDebuggerUrl,
  );
  await new Promise((r) => (ws.onopen = r));
  let seq = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const v = JSON.parse(e.data);
    if (v.id && pending.has(v.id)) {
      const p = pending.get(v.id);
      clearTimeout(p.timer);
      pending.delete(v.id);
      if (v.error) p.reject(v.error);
      else p.resolve(v.result);
    }
  };
  const call = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, {
        resolve,
        reject,
        timer: setTimeout(() => reject(Error(method + " timeout")), 15000),
      });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) =>
    (
      await call("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
      })
    ).result.value;
  const wait = async (expression) => {
    for (let i = 0; i < 50; i++) {
      if (await evaluate(expression)) return;
      await new Promise((r) => setTimeout(r, 200));
    }
    throw Error("UI condition timed out: " + expression);
  };
  await call("Network.setCookie", {
    name: "leadmap_token",
    value: jwt.sign({ id: head.id }, process.env.JWT_SECRET, {
      expiresIn: "10m",
    }),
    url: "http://127.0.0.1:3000",
    httpOnly: true,
  });
  const paths = [
    "/dashboard",
    "/map",
    "/mapping-issues",
    "/leads",
    "/unmapped",
    "/stores",
    "/import",
    "/reps",
    "/plans",
    "/routes",
    "/consultations",
    "/cold-leads",
    "/partners",
    "/rep-portal",
  ];
  await call("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  for (const path of paths) {
    await call("Page.navigate", { url: "http://127.0.0.1:3000" + path });
    await wait(
      "location.pathname===" +
        JSON.stringify(path) +
        ' && document.readyState==="complete" && !!document.querySelector("header nav")',
    );
    await wait('!document.body.textContent.includes("Application error")');
    assert.ok(
      await evaluate(
        'getComputedStyle(document.querySelector("button")).backgroundImage.includes("gradient")',
      ),
      path + " missing glass button style",
    );
    assert.ok(
      await evaluate("document.documentElement.scrollWidth <= innerWidth+1"),
      path + " desktop page overflow",
    );
  }
  await call("Page.navigate", { url: "http://127.0.0.1:3000/partners" });
  await wait('document.querySelector("h1")?.textContent==="Partners"');
  await wait(
    '[...document.querySelectorAll("button")].some(b=>b.textContent.trim()==="New onboarding")',
  );
  await wait(
    '[...document.querySelectorAll("button")].some(b=>b.textContent.includes("B2B Head"))',
  );
  await evaluate(
    '[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="New onboarding").click()',
  );
  await wait('!!document.querySelector("#partner-company_firm_name")');
  assert.equal(
    await evaluate('document.querySelectorAll(".partner-form-section").length'),
    5,
  );
  assert.equal(
    await evaluate('document.querySelectorAll("[id^=partner-]").length'),
    27,
  );
  assert.ok(
    await evaluate(
      'document.querySelectorAll(".partner-form-section svg").length >= 5',
    ),
  );
  await writeFile(
    "/private/tmp/florzy-onboarding-desktop.png",
    Buffer.from(
      (await call("Page.captureScreenshot", { format: "png" })).data,
      "base64",
    ),
  );
  await call("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  assert.ok(
    await evaluate("document.documentElement.scrollWidth <= innerWidth+1"),
    "Partner form mobile overflow",
  );
  assert.ok(
    await evaluate(
      'getComputedStyle(document.querySelector("#partner-company_firm_name")).color === "rgb(23, 32, 51)"',
    ),
  );
  await writeFile(
    "/private/tmp/florzy-onboarding-mobile.png",
    Buffer.from(
      (await call("Page.captureScreenshot", { format: "png" })).data,
      "base64",
    ),
  );
  console.log(
    "UI checks passed: all 14 workspace pages load with glass controls and no desktop overflow; partner form has five icon sections, 27 fields, readable controls and no mobile overflow.",
  );
} finally {
  ws?.close();
  await db.$disconnect();
}
