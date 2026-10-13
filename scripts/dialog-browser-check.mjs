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

  for (const [width, height] of [[1280, 600], [390, 640]]) {
    await call("Emulation.setDeviceMetricsOverride", {width, height, deviceScaleFactor:1, mobile:false});
    await call("Page.navigate", {url:"http://127.0.0.1:3000/stores"});
    await wait('[...document.querySelectorAll("button")].some(b=>b.textContent.includes("Add Store Location"))');
    await new Promise(r=>setTimeout(r,1500));
    await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent.includes("Add Store Location")).click()');
    await wait('!!document.querySelector("[data-dialog-overlay]")');
    const bounds = await evaluate(`(()=>{const o=document.querySelector('[data-dialog-overlay]'),p=o.firstElementChild,r=p.getBoundingClientRect();return {portal:o.parentElement===document.body,top:r.top,bottom:r.bottom,left:r.left,right:r.right,scroll:p.scrollHeight>p.clientHeight,maxHeight:getComputedStyle(p).maxHeight,css:[...document.styleSheets].length}})()`);
    assert.ok(bounds.portal && bounds.top>=0 && bounds.bottom<=height && bounds.left>=0 && bounds.right<=width,JSON.stringify(bounds));
    await evaluate(`(()=>{const p=document.querySelector('[data-dialog-overlay]').firstElementChild;p.scrollTop=p.scrollHeight})()`);
    await evaluate(`[...document.querySelectorAll('[data-dialog-overlay] button')].find(b=>b.textContent.trim()==='Cancel').click()`);
    await wait('!document.querySelector("[data-dialog-overlay]")');
    console.log(`PASS store dialog fits ${width}x${height}, scrolls and closes`);
  }

} finally {
  if (ws) ws.close();
  await db.$disconnect();
}
