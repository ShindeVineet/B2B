// Read-only live-data API/browser regression for map funnel status.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { openSync, existsSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
const db=new PrismaClient(),base='http://127.0.0.1:3010',marker=randomUUID();
const log=openSync('/tmp/funnel-smoke-server.log','w');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let server,chrome,ws;
async function main(){
 const head=await db.user.findFirstOrThrow({where:{role:'b2b_head',active:true}});
 const token=u=>jwt.sign({id:u.id},process.env.JWT_SECRET,{expiresIn:'10m'});
 server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p','3010','-H','127.0.0.1'],{stdio:['ignore',log,log]});
 let ready=false;for(let i=0;i<80;i++){try{ready=(await fetch(base+'/login')).ok;if(ready)break;}catch{}await pause(250);}assert.ok(ready);
 const rows=[];for(let page=1;;page++){const r=await fetch(base+`/api/leads?limit=1000&page=${page}`,{headers:{authorization:`Bearer ${token(head)}`}});const d=await r.json();assert.equal(r.status,200);rows.push(...d.leads);if(rows.length>=d.totalCount)break;}
 assert.ok(rows.some(l=>l.funnel_status==='Warm'));assert.ok(rows.some(l=>l.funnel_status==='Hot'));assert.ok(rows.some(l=>l.funnel_status==='Converted'));
 const counts={};for(const l of rows)counts[l.funnel_status]=(counts[l.funnel_status]||0)+1;
 console.log('PASS: live API funnel counts '+JSON.stringify(counts));
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

 await call('Page.navigate',{url:base+'/map'});
 await wait("!!document.querySelector('input[placeholder=\"Search company, phone, PIN, area...\"]')");
 for(const stage of ['Warm','Hot','Converted']){
  const sample=rows.find(l=>l.funnel_status===stage&&l.geocode_source!=='pincode_dataset'&&!['mapping_issue','mismatch_flagged','invalid'].includes(l.geocode_status)&&l.lat>=6&&l.lat<=38&&l.lng>=68&&l.lng<=98);assert.ok(sample,stage+' has a plottable lead');
  await evaluate(`(()=>{const el=document.querySelector('input[placeholder="Search company, phone, PIN, area..."]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(sample.lead_code)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await wait("document.querySelectorAll('.custom-lead-pin').length===1");
  await evaluate("document.querySelector('.custom-lead-pin').click()");
  await wait(`document.body.innerText.includes(${JSON.stringify(sample.lead_code)}) && [...document.querySelectorAll('aside[aria-label="Lead details"] dd')].some(d=>d.textContent===${JSON.stringify(stage==='Converted'?'Won · Onboarded':stage)})`);
  const historyResponse=await fetch(base+`/api/leads/${sample.id}/history`,{headers:{authorization:`Bearer ${token(head)}`}});
  assert.equal(historyResponse.status,200);const {lead:detail}=await historyResponse.json();
  assert.ok(await evaluate(`document.querySelector('aside[aria-label="Lead details"]').innerText.includes(${JSON.stringify('Consultations ('+detail.consultations.length+')')})`),'consultation count matches history');
  assert.equal(await evaluate("document.querySelectorAll('aside[aria-label=\"Lead details\"] select').length"),0,'assignment and funnel have no dropdowns');
  assert.ok(await evaluate("document.querySelector('aside[aria-label=\"Lead details\"]').innerText.includes('Assigned to')"),'assignment shown');
  if(stage==='Converted')assert.ok(!(await evaluate("[...document.querySelectorAll('aside[aria-label=\"Lead details\"] button')].some(b=>/Log a call|Log revisit|Start Onboarding/.test(b.textContent))")),'onboarded lead has no call/revisit action');
  assert.ok(await evaluate(`document.querySelector('.custom-lead-pin').innerHTML.includes(${JSON.stringify(stage==='Warm'?'#d97706':stage==='Hot'?'#ff4500':'#059669')})`),stage+' marker uses correct color');
 }
 writeFileSync('/tmp/funnel-map-status.png',Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
 console.log('PASS: Warm, Hot and Converted map marker colors and read-only funnel stages. No records modified.');
}
try{await main();}catch(e){console.error(e.message);process.exitCode=1;}finally{ws?.close();chrome?.kill();server?.kill();await db.$disconnect();}
