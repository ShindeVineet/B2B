import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import assert from "node:assert/strict";
const db = new PrismaClient();
let ws;
try {
  const head = await db.user.findFirstOrThrow({ where: { role: "b2b_head" } });
  const auth = {
    authorization:
      "Bearer " + jwt.sign({ id: head.id }, process.env.JWT_SECRET),
  };
  const summary = await (
    await fetch("http://127.0.0.1:3000/api/legacy-data?tab=all", {
      headers: auth,
    })
  ).json();
  const consultations = await (
    await fetch("http://127.0.0.1:3000/api/consultations?page=1", {
      headers: auth,
    })
  ).json();
  const target = await (
    await fetch("http://127.0.0.1:9227/json/new?about:blank", {
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
    url: "http://127.0.0.1:3000",
    httpOnly: true,
  });
  await call("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  });

  await call("Page.navigate", { url: "http://127.0.0.1:3000/legacy-data" });
  await wait(
    'document.body.innerText.includes("Historical data & onboarding")',
  );
  await wait('document.querySelectorAll("article").length === 24');
  assert.equal(
    await evaluate("document.documentElement.scrollWidth <= innerWidth"),
    true,
  );
  await evaluate(
    `[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Not yet onboarded').click()`,
  );
  await wait(
    `document.body.innerText.includes("${summary.counts.notOnboarded + summary.counts.pending} leads")`,
  );
  await evaluate(
    `[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Next').click()`,
  );
  await wait(
    'document.body.innerText.includes("Page 2") && document.querySelectorAll("article").length===24',
  );
  await call("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  assert.equal(
    await evaluate("document.documentElement.scrollWidth<=innerWidth"),
    true,
  );
  await call("Page.navigate", { url: "http://127.0.0.1:3000/consultations" });
  await wait(
    `document.body.innerText.includes("${consultations.totalCount} consultations")`,
  );
  assert.equal(
    await evaluate('document.querySelectorAll("article").length'),
    24,
  );
  await evaluate(
    `[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='View details').click()`,
  );
  await wait('document.body.innerText.includes("Original old_data record")');
  assert.equal(
    await evaluate("document.documentElement.scrollWidth<=innerWidth"),
    true,
  );
  console.log(
    "PASS historical review tabs, 24-card pagination, consultation source details and mobile layout",
  );
} finally {
  ws?.close();
  await db.$disconnect();
}
