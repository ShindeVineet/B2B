import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import assert from "node:assert/strict";
const db = new PrismaClient();
let ws;
try {
  const head = await db.user.findFirstOrThrow({
    where: {
      role: "ground_rep",
      assigned_leads: {
        some: {
          consultations: { some: { decision_maker_name: { not: "NA" } } },
        },
      },
    },
  });
  const target = await (
    await fetch("http://127.0.0.1:9229/json/new?about:blank", {
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

  await call("Page.navigate", { url: "http://127.0.0.1:3000/partners" });
  await wait('document.querySelectorAll("article").length===24');
  assert.equal(
    await evaluate("document.documentElement.scrollWidth<=innerWidth"),
    true,
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
  const lead = await db.lead.findFirstOrThrow({
    where: {
      assigned_ground_rep_id: head.id,
      consultations: { some: { decision_maker_name: { not: "NA" } } },
    },
  });
  await call("Page.navigate", {
    url: "http://127.0.0.1:3000/partners?lead_id=" + lead.id,
  });
  await wait('!!document.querySelector("#partner-contact_person_name")');
  assert.ok(
    await evaluate(
      'document.querySelector("#partner-contact_person_name").value.length>0',
    ),
  );
  await evaluate(
    `[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Add another contact').click()`,
  );
  assert.ok(
    await evaluate(
      `!!document.querySelector('[aria-label="Additional contact 1 name"]')`,
    ),
  );
  assert.equal(
    await evaluate("document.documentElement.scrollWidth<=innerWidth"),
    true,
  );
  console.log(
    "PASS ground partner cards, responsive layout, lead prefill and editable additional contact inputs",
  );
  await call("Browser.close");
} finally {
  ws?.close();
  await db.$disconnect();
}
