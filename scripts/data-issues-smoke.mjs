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
 const get=async path=>{const r=await fetch(base+path,{headers:{authorization:`Bearer ${token(head)}`}});assert.equal(r.status,200);return r.json();};
 const all=[];for(let page=1;;page++){const d=await get('/api/leads?limit=1000&page='+page);all.push(...d.leads);if(all.length>=d.totalCount)break;}
 const flagged=all.filter(l=>l.funnel_status==='Needs Data Correction');assert.ok(flagged.length);
 const mapping=await get('/api/mapping-issues');assert.ok(flagged.every(l=>mapping.leads.some(m=>m.id===l.id)));
 assert.equal((await get('/api/mapping-issues?count=true')).count,mapping.leads.length);
 const issues=await get('/api/legacy-data');assert.ok(issues.counts.issues>=flagged.length);assert.equal(issues.counts.leads,all.length);
 const sample=flagged[0];const searched=await get('/api/legacy-data?q='+encodeURIComponent(sample.lead_code));assert.ok(searched.rows.some(r=>r.id===sample.id&&r.issues.length));
 console.log('PASS: '+flagged.length+' funnel correction leads visible in mapping and current Data Issues; count badge matches');
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

 await call('Page.navigate',{url:base+'/mapping-issues'});
 await wait("document.body.innerText.includes('Wrong Location/Office closed')");
 await call('Page.navigate',{url:base+'/legacy-data'});
 await wait("document.body.innerText.includes('Wrong Location/Office closed')");
 console.log('PASS: both issue pages render current consultation-reported problems. No records modified.');

}
try{await main();}catch(e){console.error(e.message);process.exitCode=1;}finally{ws?.close();chrome?.kill();server?.kill();await db.$disconnect();}
