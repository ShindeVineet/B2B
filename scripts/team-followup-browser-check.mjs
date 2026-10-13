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

  await call("Emulation.setDeviceMetricsOverride",{width:1280,height:720,deviceScaleFactor:1,mobile:false});
  await call("Page.navigate",{url:"http://127.0.0.1:3000/dashboard"});
  await wait('document.body.textContent.includes("Team follow-ups")');
  await new Promise(r=>setTimeout(r,1500));
  await wait('!!document.querySelector("header")');
  assert.equal(await evaluate('getComputedStyle(document.querySelector("header")).getPropertyValue("backdrop-filter")'), 'none');
  const rep=await db.user.findFirstOrThrow({where:{role:"ground_rep",active:true}});
  await call("Network.setCookie",{name:"leadmap_token",value:jwt.sign({id:rep.id},process.env.JWT_SECRET,{expiresIn:"10m"}),url:"http://127.0.0.1:3000",httpOnly:true});
  await call("Page.navigate",{url:"http://127.0.0.1:3000/rep-portal"});
  await wait('[...document.querySelectorAll("button")].some(b=>b.textContent.includes("Build My Route"))');
  await new Promise(r=>setTimeout(r,1500));
  await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent.includes("Build My Route")).click()');
  await wait('[...document.querySelectorAll("h3")].some(h=>h.textContent.startsWith("PIN "))');
  await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent.includes("Log a call")).click()');
  await wait('!!document.querySelector("[data-dialog-overlay]")');
  assert.ok(await evaluate('document.body.textContent.includes("Next follow-up date (optional)")'));
  assert.equal(await evaluate('[...document.querySelectorAll("a")].filter(a=>a.getAttribute("href")?.startsWith("tel:")).length'),0);
  console.log("PASS solid buttons, Head team follow-ups, PIN/area route grouping and office-call dialog");

} finally {
  if (ws) ws.close();
  await db.$disconnect();
}
