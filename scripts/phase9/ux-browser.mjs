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

  await db.lead.deleteMany({where:{company_name:{startsWith:'UX Fixture'}}});
  await db.lead.createMany({data:[{company_name:'UX Fixture A',pin_code:'560001',region:'UX Region',lat:12.96,lng:77.6,location_verified:true,geocode_status:'ok'},{company_name:'UX Fixture B',pin_code:'560002',region:'UX Region',lat:12.97,lng:77.61,location_verified:true,geocode_status:'ok'}]});
  await call('Page.navigate',{url:'http://localhost:3002/route-planner'});
  await wait('document.body.innerText.includes("UX Region")');
  await new Promise(r=>setTimeout(r,1000));
  const choose=async(label,value)=>evaluate(`(()=>{const l=[...document.querySelectorAll('label')].find(l=>l.textContent.trim().startsWith(${JSON.stringify(label)}));const s=l.querySelector('select');s.value=${JSON.stringify(value)};s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await choose('PIN / area','560001');
  await wait('[...document.querySelectorAll("label")].find(l=>l.textContent.trim().startsWith("Region")).querySelector("select").value==="UX Region"');
  await choose('Region','UX Region');
  await wait('[...document.querySelectorAll("label")].find(l=>l.textContent.trim().startsWith("PIN / area")).querySelector("select").value===""');
  await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent.includes("Load eligible leads")).click()');
  await wait('document.body.innerText.includes("2 leads match these filters")');
  await evaluate('[...document.querySelectorAll("summary")].find(e=>e.textContent.includes("Select leads on the map")).click()');
  await wait('document.body.innerText.includes("Select rectangle")');
  await evaluate('[...document.querySelectorAll("button")].find(e=>e.textContent==="Select rectangle").click()');
  await new Promise(r=>setTimeout(r,700));
  await evaluate('document.querySelector(".leaflet-container").scrollIntoView({block:"center"})');
  await new Promise(r=>setTimeout(r,500));
  const rect=await evaluate('(()=>{const r=document.querySelector(".leaflet-container").getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()');
  for(const [x,y] of [[rect.x+50,rect.y+50],[rect.x+rect.w-50,rect.y+rect.h-50]]){
    await call('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});
    await call('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});
  }
  await wait('document.body.innerText.includes("Rectangle selected")');
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
  assert.equal(await evaluate('[...document.querySelectorAll("header nav")].some(n=>getComputedStyle(n).display!=="none"&&[...n.querySelectorAll("a")].some(a=>a.textContent.includes("Route Builder")))'),true);
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:740,deviceScaleFactor:1,mobile:true});
  await new Promise(r=>setTimeout(r,300));
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
  await call('Page.navigate',{url:'http://localhost:3002/calling'});
  await wait('document.body.innerText.includes("Calling Queue")');
  await new Promise(r=>setTimeout(r,800));
  assert.equal(await evaluate('[...document.querySelectorAll("main button")].find(b=>b.textContent.trim()==="All").className.includes("bg-orange")'),true);
  console.log('PASS linked PIN/region dropdowns, explicit pool counts, two-click rectangle, desktop nav, mobile width, All calling default');
  await call('Page.close');
} finally {ws?.close();await db.$disconnect();}
