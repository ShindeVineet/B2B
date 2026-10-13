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
  await call("Page.navigate", { url: "http://127.0.0.1:3000/partners" });
  await wait('document.querySelector("h1")?.textContent === "Partners"');
  await wait(
    '[...document.querySelectorAll("button")].some(b=>b.textContent.includes("B2B Head"))',
  );
  assert.equal(
    await evaluate('document.querySelectorAll("thead th").length'),
    11,
  );
  await evaluate(
    '[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="New onboarding").click()',
  );
  await wait('!!document.querySelector("#partner-gst_registered")');
  assert.equal(
    await evaluate('document.querySelectorAll("[id^=partner-]").length'),
    27,
  );
  assert.equal(
    await evaluate(
      'document.querySelectorAll("input[capture=environment]").length',
    ),
    2,
  );
  await evaluate(
    `(()=>{const s=document.querySelector('#partner-gst_registered');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'true');s.dispatchEvent(new Event('change',{bubbles:true}));})()`,
  );
  await wait('document.querySelector("#partner-gst_no").required === true');
  await call("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
    screenWidth: 390,
    screenHeight: 844,
  });
  await call("Emulation.setVisibleSize", { width: 390, height: 844 });
  assert.ok(
    await evaluate("document.documentElement.scrollWidth <= innerWidth+1"),
    "Onboarding has horizontal page overflow",
  );
  await evaluate(
    '[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="Cancel").click()',
  );
  await evaluate(
    '[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="Import historical partners").click()',
  );
  await wait(
    `!!document.querySelector('input[aria-label="Partner import file"]')`,
  );
  console.log(
    "Phase 7 browser checks passed: directory filters, all 27 form fields, photo capture controls, conditional GST requirement, mobile layout, import entry.",
  );
} finally {
  ws?.close();
  await db.$disconnect();
}
