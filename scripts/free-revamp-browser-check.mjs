import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import assert from "node:assert/strict";
const db = new PrismaClient();
let ws;
const tag = "free-browser-check-" + Date.now(),
  leadIds = [];
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
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await call("Page.navigate", { url: "http://127.0.0.1:3000/map" });
  await wait('!!document.querySelector(".leaflet-container")');
  await wait('!!document.querySelector(".marker-cluster")');
  assert.ok(
    await evaluate(
      '[...document.querySelectorAll("button")].some(b=>b.textContent==="Re-check Allotment")',
    ),
  );
  const fixture = await db.lead.create({
    data: {
      company_name: tag,
      lat: 12.97,
      lng: 77.69,
      geocode_status: "ok",
      geocode_source: "manual",
      google_map_link: "https://www.google.com/maps?q=28.6,77.2",
    },
  });
  leadIds.push(fixture.id);
  await db.consultation.create({
    data: {
      lead_id: fixture.id,
      rep_id: head.id,
      visit_date: new Date(),
      outcome: "Nurturing required",
    },
  });
  await call("Page.navigate", {
    url: "http://127.0.0.1:3000/leads/" + fixture.id,
  });
  await wait(
    'document.querySelector("h1")?.textContent.includes(' +
      JSON.stringify(tag) +
      ")",
  );
  await wait('!!document.querySelector(".leaflet-container")');
  assert.equal(
    await evaluate(
      '[...document.querySelectorAll("button")].filter(b=>b.textContent==="Navigate").length',
    ),
    1,
  );
  assert.equal(
    await evaluate(
      `document.querySelectorAll('a[href*="google.com/maps"]').length`,
    ),
    0,
  );
  await db.lead.update({
    where: { id: fixture.id },
    data: { lat: 12.98, lng: 77.7 },
  });
  await evaluate(
    'window.__navigationTest=null;window.open=()=>({opener:null,location:{replace:url=>{window.__navigationTest=url}},close:()=>{}});[...document.querySelectorAll("button")].find(b=>b.textContent==="Navigate").click()',
  );
  await wait("!!window.__navigationTest");
  assert.equal(
    await evaluate("window.__navigationTest"),
    "https://www.google.com/maps/dir/?api=1&destination=12.98,77.7",
  );
  await db.lead.update({
    where: { id: fixture.id },
    data: { geocode_status: "mapping_issue" },
  });
  await call("Page.reload");
  await wait(
    'document.querySelector("h1")?.textContent.includes(' +
      JSON.stringify(tag) +
      ")",
  );
  assert.equal(
    await evaluate(
      '[...document.querySelectorAll("button")].filter(b=>b.textContent==="Navigate").length',
    ),
    0,
  );
  assert.equal(
    await evaluate('document.querySelectorAll(".leaflet-container").length'),
    0,
  );
  await call("Page.navigate", { url: "http://127.0.0.1:3000/leads" });
  await wait(
    '[...document.querySelectorAll("button")].some(b=>b.textContent==="Re-check Allotment"&&!b.disabled)',
  );
  await evaluate(
    '(()=>{const original=window.fetch.bind(window);window.fetch=(url,options)=>{if(url==="/api/leads/allotment"){const body=JSON.parse(options.body);body.leadIds=[' +
      JSON.stringify(fixture.id) +
      '];options={...options,body:JSON.stringify(body)};}return original(url,options);};[...document.querySelectorAll("button")].find(b=>b.textContent==="Re-check Allotment").click();})()',
  );
  await wait(`!!document.querySelector('[aria-label="Allotment review"]')`);
  assert.ok(
    await evaluate(
      'document.body.textContent.includes("Resolve Mapping Issues first")',
    ),
  );
  await call("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  assert.ok(
    await evaluate(
      `document.querySelector('[aria-label="Allotment review"]').getBoundingClientRect().width <= innerWidth+1`,
    ),
  );
  console.log(
    "Free revamp browser checks passed: clustered Leaflet map, allotment review, Leaflet consultation thumbnail, one Navigate button, fresh-coordinate click, no navigation/thumbnail for Mapping Issues, mobile review layout.",
  );
} finally {
  ws?.close();
  await db.consultation.deleteMany({ where: { lead_id: { in: leadIds } } });
  await db.activityLog.deleteMany({ where: { lead_id: { in: leadIds } } });
  await db.lead.deleteMany({ where: { id: { in: leadIds } } });
  await db.$disconnect();
}
