import { writeFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import assert from "node:assert/strict";
if (!process.env.DATABASE_URL?.includes("/leadmap_phase9_test"))
  throw Error("Isolated database required");
const db = new PrismaClient();
let ws;
try {
  const head = await db.user.findFirstOrThrow({ where: { role: "b2b_head" } });
  const target = await (
    await fetch("http://127.0.0.1:9224/json/new?about:blank", {
      method: "PUT",
      signal: AbortSignal.timeout(10000),
    })
  ).json();
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const d = JSON.parse(e.data);
    if (d.id && pending.has(d.id)) {
      const p = pending.get(d.id);
      pending.delete(d.id);
      clearTimeout(p.timer);
      if (d.error) p.reject(d.error);
      else p.resolve(d.result);
    }
  };
  const call = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const key = ++id;
      pending.set(key, {
        resolve,
        reject,
        timer: setTimeout(() => reject(Error(method + " timeout")), 30000),
      });
      ws.send(JSON.stringify({ id: key, method, params }));
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
    for (let i = 0; i < 80; i++) {
      if (await evaluate(expression)) return;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw Error("Timed out: " + expression);
  };
  await call("Network.setCookie", {
    name: "leadmap_token",
    value: jwt.sign({ id: head.id }, process.env.JWT_SECRET),
    url: "http://localhost:3002",
    httpOnly: true,
  });
  await call("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await call("Page.navigate", { url: "http://localhost:3002/route-planner" });
  await wait('document.body.innerText.includes("Test Route A")');
  await new Promise(r=>setTimeout(r,1000));
  await evaluate(
    '[...document.querySelectorAll("button")].find(b=>b.textContent.startsWith("Test Route A")).click()',
  );
  await wait(
    'document.body.innerText.includes("Assign this route") && document.body.innerText.includes("Travel distance") && !!document.querySelector(".leaflet-container")',
  );
  await new Promise(r=>setTimeout(r,500));
  assert.equal(
    await evaluate("document.documentElement.scrollWidth <= window.innerWidth"),
    true,
  );
  await evaluate(
    '[...document.querySelectorAll("button")].find(b=>b.textContent.includes("Delete route")).click()',
  );
  await wait('!!document.querySelector("[role=dialog]")');
  for (const [width, height] of [
    [1280, 800],
    [390, 640],
  ]) {
    await call("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 500,
    });
    const fits = await evaluate(
      '(()=>{const e=document.querySelector("[role=dialog]");const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight+1&&r.left>=0&&r.right<=innerWidth+1})()',
    );
    assert.equal(fits, true);
  }
  await evaluate(
    '[...document.querySelectorAll("[role=dialog] button")].find(b=>b.textContent==="Cancel").click()',
  );
  const shot = await call("Page.captureScreenshot", { format: "png" });
  await writeFile(
    "/private/tmp/phase9-route-mobile.png",
    Buffer.from(shot.data, "base64"),
  );
  console.log(
    "PASS route review map, leg sidebar, desktop width, and confirmation dialog viewport at desktop/mobile sizes",
  );
  await call("Page.navigate", {url:"http://localhost:3002/calling?tab=Location"});
  await wait('document.body.innerText.includes("These locations were not found")');
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true);
  await call("Page.navigate", {url:"http://localhost:3002/import"});
  await wait('document.body.innerText.includes("Import LinkedIn Leads")');
  await new Promise(r=>setTimeout(r,1000));
  await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent.includes("Import LinkedIn Leads")).click()');
  await wait('!!document.querySelector(`input[aria-label="LinkedIn spreadsheet"]`)');
  await call("Page.navigate", {url:"http://localhost:3002/plans"});
  await wait('location.pathname === "/route-planner"');
  console.log("PASS calling queue, LinkedIn import tab and Plans redirect");
  await call("Page.close");
} finally {
  ws?.close();
  await db.$disconnect();
}
