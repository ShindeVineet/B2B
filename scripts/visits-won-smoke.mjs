// Read-only live-data API/browser regression for map funnel status.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { openSync, existsSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
const db=new PrismaClient(),base='http://127.0.0.1:3010',marker=randomUUID();
const log=openSync('/tmp/visits-smoke-server.log','w');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let server,chrome,ws;
async function main(){
 const head=await db.user.findFirstOrThrow({where:{role:'ground_rep',active:true,assigned_leads:{some:{partners:{some:{partner_status:'active'}}}}}});
 const token=u=>jwt.sign({id:u.id},process.env.JWT_SECRET,{expiresIn:'10m'});
 server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p','3010','-H','127.0.0.1'],{stdio:['ignore',log,log]});
 let ready=false;for(let i=0;i<80;i++){try{ready=(await fetch(base+'/login')).ok;if(ready)break;}catch{}await pause(250);}assert.ok(ready);
 const rows=[];for(let page=1;;page++){const r=await fetch(base+`/api/leads?limit=1000&page=${page}`,{headers:{authorization:`Bearer ${token(head)}`}});const d=await r.json();assert.equal(r.status,200);rows.push(...d.leads);if(rows.length>=d.totalCount)break;}
 const won = rows.filter(l=>l.partners.some(p=>p.partner_status==='active'));
 assert.ok(won.length, 'rep has onboarded leads for regression');
 const warmResponse=await fetch(base+'/api/warm-leads',{headers:{authorization:`Bearer ${token(head)}`}});
 assert.equal(warmResponse.status,200);
 const warm=await warmResponse.json();
 assert.ok(warm.leads.every(l=>!l.partners.some(p=>p.partner_status==='active')), 'Warm API excludes active partners');
 console.log('PASS: Warm API excludes onboarded partners');
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
  const wait = async expression => { for (let i = 0; i < 80; i++) { if (await evaluate(expression)) return; await pause(150); } throw Error("Browser wait failed: " + expression); };
  await call("Network.setCookie", { name: "leadmap_token", value: token(head), url: base, httpOnly: true });
  await call("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

 await call('Page.navigate',{url:base+'/rep-portal'});
 await wait("!!document.querySelector('nav[aria-label=\"My Visits sections\"]') && !document.body.innerText.includes('Loading visits…')");
 assert.ok(!(await evaluate("document.body.innerText.includes('Consulted leads')")), 'dashboard KPI strip removed');
 for(const tab of ['Won','Hot Leads','Warm Leads','Cold Leads']){
   await evaluate(`(()=>{const b=[...document.querySelectorAll('nav[aria-label="My Visits sections"] button')].find(b=>b.textContent.startsWith(${JSON.stringify(tab)}));if(!b)throw Error('Missing tab');b.click();})()`);
   await wait(`!!document.querySelector('input[aria-label="Search assigned leads"]') && [...document.querySelectorAll('nav button')].some(b=>b.getAttribute('aria-current')==='page'&&b.textContent.startsWith(${JSON.stringify(tab)}))`);
   const ids=await evaluate("[...document.querySelectorAll('article[data-lead-id]')].map(el=>({id:el.dataset.leadId,bucket:el.dataset.interestBucket}))");
   assert.ok(ids.every(l=>l.bucket===tab),tab+' rows have exclusive classification');
   if(tab==='Won') {assert.ok(!(await evaluate("[...document.querySelectorAll('article button')].some(b=>/Log a call|Log revisit/.test(b.textContent))")), 'Won cards hide call and revisit');assert.ok(ids.length);assert.ok(ids.every(l=>won.some(w=>w.id===l.id)));}
   else assert.ok(ids.every(l=>!won.some(w=>w.id===l.id)),tab+' excludes onboarded leads');
   if(tab==='Won')writeFileSync('/tmp/visits-won.png',Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
 }
 console.log('PASS: compact My Visits layout, Won tab and exclusive Hot/Warm/Cold lists. No data modified.');

}
try{await main();}catch(e){console.error(e.message);process.exitCode=1;}finally{ws?.close();chrome?.kill();server?.kill();await db.$disconnect();}
