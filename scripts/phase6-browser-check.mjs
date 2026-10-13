import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import assert from "node:assert/strict";
const db = new PrismaClient();
let ws, repId, planId;
const leadIds = [];
(async () => {
  const head = await db.user.findFirstOrThrow({
    where: { role: "b2b_head", active: true },
  });
  const rep = await db.user.create({
    data: {
      name: "Phase 6 UI verification",
      email: `phase6-ui-${Date.now()}@example.test`,
      role: "ground_rep",
      store_id: (await db.store.findFirstOrThrow({where:{active:true}})).id,
      password_hash: "not-a-login-password",
    },
  });
  repId = rep.id;
  for (let i = 0; i < 2; i++) {
    const l = await db.lead.create({
      data: {
        company_name: "Phase 6 UI stop " + i,
        assigned_ground_rep_id: repId,
        lat: 12 + i * 0.5,
        lng: 77,
        geocode_status: "ok",
        location_verified: true,
      },
    });
    leadIds.push(l.id);
  }
  const p = await db.tripPlan.create({
    data: {
      name: "Phase 6 UI verification",
      ground_rep_id: repId,
      start_date: new Date("2099-01-01"),
      end_date: new Date("2099-01-03"),
      leads_per_day: 3,
      status: "draft",
      assignment: {
        create: {
          ground_rep_id: repId,
          start_date: new Date("2099-01-01"),
          end_date: new Date("2099-01-03"),
          leads_per_day_default: 3,
          base_working_days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
        },
      },
      trip_leads: {
        create: leadIds.map((id, i) => ({
          lead_id: id,
          scheduled_date: new Date("2099-01-01"),
          sequence_order: i + 1,
        })),
      },
    },
  });
  planId = p.id;
  const targets = await (await fetch("http://127.0.0.1:9223/json")).json();
  ws = new WebSocket(
    targets.find((t) => t.type === "page").webSocketDebuggerUrl,
  );
  await new Promise((r) => (ws.onopen = r));
  let seq = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const v = JSON.parse(e.data);
    if (v.id) {
      const p = pending.get(v.id);
      if (p) {
        clearTimeout(p.timer);
        pending.delete(v.id);
        if (v.error) p.reject(v.error);
        else p.resolve(v.result);
      }
    }
  };
  function call(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, {
        resolve,
        reject,
        timer: setTimeout(() => reject(Error(method + " timeout")), 10000),
      });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  const js = async (expression) =>
    (
      await call("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
      })
    ).result.value;
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  await call("Network.setCookie", {
    name: "leadmap_token",
    value: jwt.sign({ id: head.id }, process.env.JWT_SECRET, {
      expiresIn: "10m",
    }),
    url: "http://127.0.0.1:3000",
    httpOnly: true,
  });
  await call("Page.navigate", {
    url: "http://127.0.0.1:3000/plans?plan=" + planId,
  });
  await pause(2200);
  assert.equal(
    await js(
      "document.body.innerText.includes('Sparse day — leads are spread out')",
    ),
    true,
  );
  assert.equal(
    await js("document.querySelectorAll('[draggable=true]').length"),
    2,
  );
  await js(
    "[...document.querySelectorAll('label')].find(l=>l.textContent.trim()==='Spread Coverage').querySelector('input').click()",
  );
  await pause(900);
  assert.equal(
    (await db.tripAssignment.findUnique({ where: { trip_id: planId } }))
      .clustering_mode,
    "spread_coverage",
  );
  const dropped = await js(
    "(()=>{const source=document.querySelector('[draggable=true]');const target=[...document.querySelectorAll('h4')].find(h=>h.textContent.includes('2099-01-02'))?.parentElement;if(!source||!target)return false;const dataTransfer=new DataTransfer();source.dispatchEvent(new DragEvent('dragstart',{dataTransfer,bubbles:true}));target.dispatchEvent(new DragEvent('drop',{dataTransfer,bubbles:true,cancelable:true}));return true;})()",
  );
  assert.equal(dropped, true);
  await pause(1000);
  assert.equal(
    await db.tripLead.count({
      where: { trip_id: planId, scheduled_date: new Date("2099-01-02") },
    }),
    1,
  );
  await js(
    "[...document.querySelectorAll('button')].find(b=>b.textContent.includes('+ New plan')).click()",
  );
  await pause(500);
  assert.equal(
    await js(
      "!!document.querySelector('input[name=clustering_mode][value=compact_sequential]:checked')",
    ),
    true,
  );
  assert.equal(
    await js("document.body.innerText.includes('Per-day capacity')"),
    true,
  );
  await call("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    screenWidth: 390,
    screenHeight: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await call("Emulation.setVisibleSize", { width: 390, height: 844 });
  await pause(200);
  assert.equal(
    await js("document.documentElement.scrollWidth<=innerWidth"),
    true,
  );
  console.log(
    "PASS: sparse badge, mode persistence, real calendar drag/drop, initial mode default, per-day controls, mobile width.",
  );
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    ws?.close();
    if (repId) {
      const a = await db.tripAssignment.findMany({
        where: { ground_rep_id: repId },
        select: { id: true },
      });
      await db.tripDayCapacity.deleteMany({
        where: { trip_assignment_id: { in: a.map((v) => v.id) } },
      });
      await db.tripAssignment.deleteMany({ where: { ground_rep_id: repId } });
      await db.tripPlan.deleteMany({ where: { ground_rep_id: repId } });
      await db.lead.deleteMany({ where: { id: { in: leadIds } } });
      await db.user.delete({ where: { id: repId } });
    }
    await db.$disconnect();
  });
