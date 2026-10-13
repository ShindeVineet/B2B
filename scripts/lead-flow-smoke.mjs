/** Local end-to-end check. All created records are tracked and removed in finally. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { openSync, writeFileSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
const db = new PrismaClient();
const base = "http://127.0.0.1:3010";
const leadIds = [], partnerIds = [];
let server, chrome, ws;
const marker = randomUUID();
const log = openSync("/tmp/leadflow-smoke-server.log", "w");
const pause = ms => new Promise(r => setTimeout(r, ms));
async function main() {
  const head = await db.user.findFirstOrThrow({ where: { role: "b2b_head", active: true } });
  const associate = await db.user.findFirstOrThrow({ where: { role: "store_associate", active: true, store_id: { not: null } } });
  const analyst = await db.user.findFirstOrThrow({ where: { role: "analyst", active: true } });
  const rep = await db.user.findFirstOrThrow({ where: { role: "ground_rep", active: true } });
  const store = await db.store.findFirstOrThrow({ where: { active: true } });
  const token = u => jwt.sign({ id: u.id }, process.env.JWT_SECRET, { expiresIn: "10m" });
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3010", "-H", "127.0.0.1"], { stdio: ["ignore", log, log] });
  let ready = false;
  for (let i = 0; i < 80; i++) { try { ready = (await fetch(base + "/login")).ok; if (ready) break; } catch {} await pause(250); }
  assert.ok(ready, "server starts");
  const api = async (path, user, body, method = body ? "POST" : "GET") => {
    const r = await fetch(base + path, { method, headers: { ...(user ? { authorization: `Bearer ${token(user)}` } : {}), "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await r.json();
    if (method === "POST" && path === "/api/leads" && data.lead?.id) leadIds.push(data.lead.id);
    return { status: r.status, data };
  };
  assert.equal((await api("/api/store-visits", null)).status, 401);
  assert.equal((await api("/api/leads", analyst, { lead_source: "CDT", phone_no: "9876543210" })).status, 403);
  assert.equal((await api("/api/leads", associate, { lead_source: "Manual", phone_no: "9876543210", consultation: {} })).status, 403);
  for (const source of ["Phone", "CDT", "LinkedIn", "Google Maps", "Book Directory"]) assert.equal((await api("/api/leads", head, { lead_source: source })).status, 400);
  assert.equal((await api("/api/leads/cdt-import", head, { rows: [{ name: "No phone" }] })).status, 400);
  assert.equal((await api("/api/leads/linkedin-import", head, { rows: [{ "First name": "No phone" }] })).status, 400);
  assert.equal((await api("/api/leads/bulk-import", head, { rows: [{ lead_source: "Google Maps", phone_no: "9876543210" }] })).status, 400);
  const phone = "98" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
  const manual = await api("/api/leads", head, { lead_source: "Manual", company_name: `Verification ${marker}`, phone_no: phone, consultation: { notes: "Temporary test", visit_scheduled: true, visit_store_id: store.id, visit_scheduled_at: "2099-12-01T10:00:00+05:30" } });
  assert.equal(manual.status, 201, JSON.stringify(manual.data));
  const lead = manual.data.lead;
  assert.equal(lead.intake_team, "head"); assert.equal(lead.calling_associate_id, head.id);
  assert.equal(await db.consultation.count({ where: { lead_id: lead.id } }), 1);
  const visit = await db.storeVisit.findFirstOrThrow({ where: { lead_id: lead.id } });
  for (const user of [head, associate, analyst, rep]) {
    const board = await api("/api/store-visits", user);
    assert.equal(board.status, 200); assert.ok(board.data.visits.some(v => v.id === visit.id));
  }
  assert.equal((await api(`/api/leads/${lead.id}`, head, { lead_source: "CDT" }, "PATCH")).status, 400);
  const edit = await api(`/api/leads/${lead.id}`, head, { company_name: "Verification Registered LLP", owner_name: "Manager A" }, "PATCH");
  assert.equal(edit.status, 200); assert.equal(edit.data.lead.original_data.company_name, `Verification ${marker}`); assert.equal(edit.data.lead.lead_code, lead.lead_code);
  const prefill = await api(`/api/partners/prefill?lead_id=${lead.id}`, head);
  assert.equal(prefill.status, 200); assert.equal(prefill.data.fields.company_firm_name, "Verification Registered LLP");
  const walkin = await api("/api/leads", associate, { lead_source: "Walk-in", owner_name: `Visitor ${marker}`, phone_no: phone.slice(0, -1) + ((Number(phone.at(-1)) + 1) % 10), consultation: { next_follow_up_date: "2099-12-02" } });
  assert.equal(walkin.status, 201, JSON.stringify(walkin.data));
  assert.equal(walkin.data.lead.company_name, ""); assert.equal(walkin.data.lead.calling_associate_id, associate.id);
  assert.equal(await db.storeVisit.count({ where: { lead_id: walkin.data.lead.id } }), 0);
  const data = { company_firm_name: "Verification company", contact_person_name: "Project Manager A", designation: "Project Manager", mobile_number: phone, office_address: "Test office", pincode: "560001", city: "Bengaluru", state: "Karnataka", type_of_professional: "Builder", years_operating: "5", specialized_in: "Tiles", expected_monthly_order_value: 100, gst_registered: false, pan_no: "TEST", bank_account_name: "Verification company", bank_name: "Test", branch: "Test", account_no: "00000", ifsc_code: "TEST000", submitted_by: associate.id, partner_status: "active", source_lead_id: lead.id };
  for (const [i, name] of ["Project Manager A", "Project Manager B"].entries()) {
    const p = await db.partner.create({ data: { ...data, partner_code: `VERIFY-${marker}-${i}`, contact_person_name: name } }); partnerIds.push(p.id);
  }
  assert.equal((await api(`/api/partners/${partnerIds[0]}`, associate, data, "PATCH")).status, 403);
  const partnerEdit = await api(`/api/partners/${partnerIds[0]}`, head, { ...data, company_firm_name: "Verification company LLP", mobile_number: "9876543211", is_referral: true, referred_by_partner_id: partnerIds[1], whatsapp_group_created: true }, "PATCH");
  assert.equal(partnerEdit.status, 200, JSON.stringify(partnerEdit.data)); assert.equal(partnerEdit.data.partner.partner_code, `VERIFY-${marker}-0`); assert.equal(partnerEdit.data.partner.whatsapp_group_created, true);
  assert.equal(await db.partnerActivity.count({ where: { partner_id: partnerIds[0], action: "EDITED" } }), 1);
  assert.equal((await api(`/api/partners/${partnerIds[0]}`, head, { ...data, is_referral: true, referred_by_partner_id: partnerIds[0] }, "PATCH")).status, 400);
  assert.equal((await api("/api/store-visits", rep, { id: visit.id, status: "cancelled" }, "PATCH")).status, 403);
  assert.equal((await api("/api/store-visits", head, { id: visit.id, status: "completed" }, "PATCH")).status, 200);
  console.log("PASS: HTTP intake validation, atomic manual/walk-in creation, appointment visibility for all roles, original preservation, partner multi-contact identity, manager-only editing, referrals and audit history.");
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
  await call("Page.navigate", { url: base + "/leads/new" });
  await wait("document.querySelector('form select')?.options.length === 7");
  assert.equal(await evaluate("document.querySelectorAll('form input[required]').length"), 1);
  await evaluate("document.querySelector('form select').value='Google Maps'; document.querySelector('form select').dispatchEvent(new Event('change',{bubbles:true}))");
  await wait("document.querySelectorAll('form input[required]').length === 5");
  writeFileSync("/tmp/leadflow-intake-desktop.png", Buffer.from((await call("Page.captureScreenshot", { format: "png" })).data, "base64"));
  await evaluate("document.querySelector('form select').value='Manual'; document.querySelector('form select').dispatchEvent(new Event('change',{bubbles:true}))");
  await wait("document.body.innerText.includes('Initial consultation')");
  await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await pause(300);
  assert.ok(await evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "mobile page has no horizontal overflow");
  writeFileSync("/tmp/leadflow-intake-mobile.png", Buffer.from((await call("Page.captureScreenshot", { format: "png" })).data, "base64"));
  await call("Page.navigate", { url: base + "/partners?lead_id=" + lead.id });
  await wait("document.body.innerText.includes('WhatsApp group created')");
  assert.ok(await evaluate("document.body.innerText.includes('Original lead')"));
  console.log("PASS: browser source-specific required fields, manual consultation, onboarding checkboxes, original lead card, and mobile layout. Screenshots: /tmp/leadflow-intake-{desktop,mobile}.png");
}
try { await main(); }
catch (e) { console.error(e.message); process.exitCode = 1; }
finally {
  ws?.close(); chrome?.kill(); server?.kill();
  try {
    await db.$transaction(async tx => {
      await tx.partnerActivity.deleteMany({ where: { partner_id: { in: partnerIds } } });
      await tx.partner.updateMany({ where: { id: { in: partnerIds } }, data: { referred_by_partner_id: null } });
      await tx.partner.deleteMany({ where: { id: { in: partnerIds } } });
      await tx.storeVisit.deleteMany({ where: { lead_id: { in: leadIds } } });
      await tx.followUp.deleteMany({ where: { lead_id: { in: leadIds } } });
      await tx.lead.deleteMany({ where: { id: { in: leadIds } } });
    });
    console.log("Temporary verification records removed.");
  } finally { await db.$disconnect(); }
}
