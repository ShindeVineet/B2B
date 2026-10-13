// Read-only live-data API/browser regression for map funnel status.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { openSync, existsSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
const db=new PrismaClient(),base='http://127.0.0.1:3010',marker=randomUUID();
const log=openSync('/tmp/route-restoration-smoke.log','w');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let server,chrome,ws;
async function main(){
 const head=await db.user.findFirstOrThrow({where:{role:'b2b_head',active:true}});
 const token=u=>jwt.sign({id:u.id},process.env.JWT_SECRET,{expiresIn:'10m'});
 server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p','3010','-H','127.0.0.1'],{stdio:['ignore',log,log]});
 let ready=false;for(let i=0;i<80;i++){try{ready=(await fetch(base+'/login')).ok;if(ready)break;}catch{}await pause(250);}assert.ok(ready);
 const r=await fetch(base+'/api/route-plans',{headers:{authorization:`Bearer ${token(head)}`}});
 assert.equal(r.status,200);assert.deepEqual((await r.json()).routes,[]);
 console.log('PASS: saved route data is empty');
  const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  assert.ok(existsSync(chromePath), "Chrome available for browser verification");
  chrome = spawn(chromePath, ["--headless=new", "--disable-gpu", "--no-first-run", "--remote-debugging-port=9333", `--user-data-dir=/tmp/leadflow-chrome-${marker}`, "about:blank"], { stdio: "ignore" });
  let target;
  for (let i = 0; i < 80; i++) { try { target = await (await fetch("http://127.0.0.1:9333/json/new?about:blank", { method: "PUT" })).json(); break; } catch {} await pause(250); }
  assert.ok(target?.webSocketDebuggerUrl, "browser starts");
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let counter = 0; const pending = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); clearTimeout(p.timer); if (m.error) p.reject(Error(m.error.message)); else p.resolve(m.result); } };
  const call = (method, params = {}) => new Promise((resolve, reject) => { const id = ++counter; pending.set(id, { resolve, reject, timer: setTimeout(() => reject(Error(method + " timeout")), 20000) }); ws.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expression => { const r = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.text); return r.result.value; };
  const wait = async expression => { for (let i = 0; i < 80; i++) { if (await evaluate(expression)) return; await pause(150); } console.log(await evaluate("document.body.innerText.slice(0,5000)")); throw Error("Browser wait failed: " + expression); };
  await call("Network.setCookie", { name: "leadmap_token", value: token(head), url: base, httpOnly: true });
  await call("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

 await call('Page.navigate',{url:base+'/dashboard'});
 await wait("[...document.querySelectorAll('a')].some(a=>a.textContent==='Open Route Builder')");
 await evaluate("[...document.querySelectorAll('a')].find(a=>a.textContent==='Open Route Builder').click()");
 await wait("location.pathname==='/route-planner' && document.body.innerText.includes('No saved routes')");
 await pause(1500);
 console.log('Pool API',await evaluate("fetch('/api/route-plans?pool=true').then(async r=>({status:r.status,total:(await r.json()).total}))"));
 await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Load eligible leads').click()");
 await wait("document.body.innerText.includes('leads match these filters:') || [...document.querySelectorAll('[role=alert]')].some(e=>e.textContent.trim())");
 console.log(await evaluate("[...document.querySelectorAll('[role=alert],[role=status]')].map(e=>e.textContent).join(' | ')"));
 assert.equal(await evaluate("[...document.querySelectorAll('[role=alert]')].map(e=>e.textContent.trim()).filter(Boolean).join('')"),'');
 if(await evaluate("document.body.innerText.includes('Select pool leads')")) await wait("!!document.querySelector('.leaflet-container') && document.querySelector('.leaflet-container').getBoundingClientRect().height>200");
 writeFileSync('/tmp/route-restored.png',Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
 console.log('PASS: B2B Head dashboard link opens Route Builder; empty routes and eligible lead loading verified. No records modified.');

}
try{await main();}catch(e){console.error(e.message);process.exitCode=1;}finally{ws?.close();chrome?.kill();server?.kill();await db.$disconnect();}
