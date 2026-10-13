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

  await call("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await call("Page.navigate", { url: "http://127.0.0.1:3000/map" });
  await wait('!!document.querySelector("summary[aria-label^=Advanced]")');
  await wait('!!document.querySelector("select[aria-label=Category]")');
  assert.equal(
    await evaluate(
      'document.querySelector("select[aria-label=Category]").closest("details").open',
    ),
    false,
  );
  assert.ok(await evaluate('!!document.querySelector(".leaflet-container")'));
  await evaluate(
    'document.querySelector("summary[aria-label^=Advanced]").click()',
  );
  await wait(
    'document.querySelector("select[aria-label=Category]").closest("details").open',
  );
  await wait('document.body.textContent.includes("Retrying")');
  assert.ok(
    await evaluate('document.body.textContent.includes("Re-run geocoding")'),
  );
  await evaluate(
    'document.querySelector("summary[aria-label^=Advanced]").click()',
  );
  await wait(
    '!document.querySelector("select[aria-label=Category]").closest("details").open',
  );
  await wait('!!document.querySelector(".marker-cluster")');
  await new Promise((resolve) => setTimeout(resolve, 500));
  const shot = await call("Page.captureScreenshot", { format: "png" });
  await writeFile(
    "/private/tmp/v3-map-toolbar.png",
    Buffer.from(shot.data, "base64"),
  );
  console.log(
    "PASS: map loads, advanced filters collapsed, Actions exposes re-runs and Retrying status",
  );
} finally {
  if (ws) ws.close();
  await db.$disconnect();
}
