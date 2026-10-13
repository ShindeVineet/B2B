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
    await fetch("http://[::1]:9224/json/new?about:blank", {
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
    url: "http://127.0.0.1:3002",
    httpOnly: true,
  });
  await call("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  });

  await call("Page.navigate", { url: "http://127.0.0.1:3002/route-planner" });
  await wait('document.body.innerText.includes("Assign this route")');
  await new Promise((r) => setTimeout(r, 1000));
  assert.equal(
    await evaluate(
      'document.body.innerText.includes("Daily capacity") || document.body.innerText.includes("Allow rescheduling until")',
    ),
    false,
  );
  await evaluate(
    `[...document.querySelectorAll('nav[aria-label="Route workspace"] button')].find(b=>b.textContent.includes("Assigned routes")).click()`,
  );
  await wait('document.body.innerText.includes("Reschedule requests")');
  assert.equal(
    await evaluate('document.body.innerText.includes("Create Route Map")'),
    false,
  );
  assert.equal(
    await evaluate("document.documentElement.scrollWidth<=innerWidth"),
    true,
  );
  const rep = await db.user.findFirstOrThrow({ where: { role: "ground_rep" } });
  await call("Network.setCookie", {
    name: "leadmap_token",
    value: jwt.sign({ id: rep.id }, process.env.JWT_SECRET),
    url: "http://127.0.0.1:3002",
    httpOnly: true,
  });
  await call("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 740,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await call("Page.navigate", { url: "http://127.0.0.1:3002/rep-portal" });
  await wait('document.body.innerText.includes("All Assigned")');
  await new Promise((r) => setTimeout(r, 1000));
  await evaluate(
    '[...document.querySelectorAll("button")].find(b=>b.textContent.includes("All Assigned")).click()',
  );
  await wait('document.body.innerText.includes("Log revisit")');
  await evaluate(
    '[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="Log revisit").click()',
  );
  await wait(`!!document.querySelector('[aria-label="Log revisit"]')`);
  assert.equal(
    await evaluate(
      `document.querySelector('[aria-label="Log revisit"]').textContent.includes("Ready for onboarding")`,
    ),
    true,
  );
  assert.equal(
    await evaluate(
      `document.querySelector('[aria-label="Log revisit"]').querySelectorAll("select").length`,
    ),
    2,
  );

  await new Promise((r) => setTimeout(r, 300));
  assert.equal(
    await evaluate(
      `(()=>{const r=document.querySelector('[aria-label="Log revisit"]').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight+1&&r.right<=innerWidth+1})()`,
    ),
    true,
  );
  console.log(
    "PASS distinct assigned tab, simplified assignment, short revisit form and mobile dialog fit",
  );
  await call("Page.close");
} finally {
  ws?.close();
  await db.$disconnect();
}
