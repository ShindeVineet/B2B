import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
const db = new PrismaClient();
let repId;
let planId;
const leadIds = [];
try {
  const head = await db.user.findFirstOrThrow({
      where: { role: "b2b_head", active: true },
    }),
    ops = await db.user.findFirstOrThrow({
      where: { role: "analyst", active: true },
    }),
    store = await db.store.findFirstOrThrow({ where: { active: true } });
  const rep = await db.user.create({
    data: {
      name: "Phase 6 verification rep",
      email: `phase6-${Date.now()}@example.test`,
      role: "ground_rep",
      password_hash: "not-a-login-password",
      store_id: store.id,
      region: store.region,
    },
  });
  repId = rep.id;
  async function call(url, body, method = "POST", user = head) {
    const r = await fetch("http://127.0.0.1:3000/api" + url, {
      method,
      headers: {
        Authorization:
          "Bearer " +
          jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
            expiresIn: "10m",
          }),
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: r.status, data: await r.json() };
  }
  for (let i = 0; i < 6; i++) {
    const l = await db.lead.create({
      data: {
        company_name: `Phase 6 verification ${i}`,
        assigned_ground_rep_id: rep.id,
        region: rep.region,
        lat: store.lat + 0.01 * i,
        lng: store.lng + 0.003 * i,
        geocode_status: "ok",
        location_verified: true,
      },
    });
    leadIds.push(l.id);
  }
  let r = await call("/trips/auto-plan", {
    ground_rep_id: rep.id,
    start_date: "2099-01-01",
    total_days: 3,
    leads_per_day: 2,
    base_working_days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    day_capacities: { "2099-01-02": 1 },
    lead_ids: leadIds,
    clustering_mode: "spread_coverage",
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  planId = r.data.tripPlan.id;
  assert.equal(r.data.tripPlan.unscheduledCount, 1);
  assert.deepEqual(
    r.data.tripPlan.dailyBatches.map((d) => d.leads.length),
    [2, 1, 2],
  );
  assert.equal(
    (await db.tripAssignment.findUnique({ where: { trip_id: planId } }))
      .clustering_mode,
    "spread_coverage",
  );
  assert.equal(
    await db.routeSnapshot.count({ where: { ground_rep_id: rep.id } }),
    0,
  );
  await call(`/trips/${planId}/schedule`, { end_date: "2099-01-04" }, "PATCH");
  r = await call(`/trips/${planId}/recluster`, {});
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.scheduled_count, 1);
  r = await call(`/trips/${planId}/publish`, {});
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.snapshots.length, 4);
  assert.ok(
    r.data.snapshots.every((s) => typeof s.cluster_span_km === "number"),
  );
  for (const snap of r.data.snapshots) {
    const ordered = await db.tripLead.findMany({
      where: { trip_id: planId, scheduled_date: new Date(snap.route_date) },
      orderBy: { sequence_order: "asc" },
    });
    assert.deepEqual(
      snap.ordered_lead_ids,
      ordered.map((v) => v.lead_id),
    );
  }

  const frozen = JSON.stringify(
    await db.routeSnapshot.findMany({
      where: { ground_rep_id: rep.id },
      orderBy: { id: "asc" },
    }),
  );
  const visits = await db.tripLead.findMany({
    where: { trip_id: planId },
    orderBy: { id: "asc" },
  });
  const before = JSON.stringify(visits);
  const extra = await db.lead.create({
    data: {
      company_name: "Phase 6 unscheduled extra",
      assigned_ground_rep_id: rep.id,
      lat: store.lat + 0.08,
      lng: store.lng + 0.01,
      geocode_status: "ok",
      location_verified: true,
    },
  });
  leadIds.push(extra.id);
  r = await call(`/trips/${planId}/recluster`, {});
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.scheduled_count, 0);
  assert.equal(r.data.unscheduled_count, 1);
  assert.equal(
    JSON.stringify(
      await db.tripLead.findMany({
        where: { trip_id: planId },
        orderBy: { id: "asc" },
      }),
    ),
    before,
  );
  await call(`/trips/${planId}/schedule`, { end_date: "2099-01-05" }, "PATCH");
  r = await call(`/trips/${planId}/recluster`, {});
  assert.equal(r.status, 200);
  assert.equal(r.data.scheduled_count, 1);
  assert.equal(
    (
      await db.tripLead.findFirstOrThrow({ where: { lead_id: extra.id } })
    ).scheduled_date
      .toISOString()
      .slice(0, 10),
    "2099-01-05",
  );
  assert.equal(
    (await call(`/trips/${planId}/recluster`, {}, "POST", ops)).status,
    403,
  );
  const selected = visits.filter((v) =>
    v.scheduled_date.toISOString().startsWith("2099-01-01"),
  );
  r = await call(`/trips/${planId}/recluster`, {
    visit_ids: selected.map((v) => v.id),
    include_unscheduled: false,
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.scheduled_count, 2);
  assert.equal(
    JSON.stringify(
      await db.routeSnapshot.findMany({
        where: { ground_rep_id: rep.id },
        orderBy: { id: "asc" },
      }),
    ),
    frozen,
  );
  const movable = await db.tripLead.findUniqueOrThrow({
    where: { id: selected[0].id },
  });
  r = await call(
    `/visits/${movable.id}/edit`,
    {
      date: "2099-01-05",
      lead_id: movable.lead_id,
      expected_lead_id: movable.lead_id,
      expected_date: movable.scheduled_date.toISOString().slice(0, 10),
    },
    "PATCH",
  );
  assert.equal(r.status, 200, JSON.stringify(r.data));
  await db.tripLead.update({
    where: { id: movable.id },
    data: { status: "visited", completed: true },
  });
  r = await call(`/trips/${planId}/recluster`, {
    visit_ids: [movable.id],
    include_unscheduled: false,
  });
  assert.equal(r.status, 400);
  console.log(
    "PASS: variable capacities, stored mode, draft preview, publish spans, unscheduled overflow, published-day protection, explicit re-clustering, immutable snapshots, manual move, completed-visit and Ops protection.",
  );
} finally {
  if (repId) {
    await db.routeSnapshot.deleteMany({ where: { ground_rep_id: repId } });
    const assignments = await db.tripAssignment.findMany({
      where: { ground_rep_id: repId },
      select: { id: true },
    });
    const ids = assignments.map((a) => a.id);
    await db.tripDayCapacity.deleteMany({
      where: { trip_assignment_id: { in: ids } },
    });
    await db.tripWeekOverride.deleteMany({
      where: { trip_assignment_id: { in: ids } },
    });
    await db.tripAssignment.deleteMany({ where: { ground_rep_id: repId } });
    await db.tripPlan.deleteMany({ where: { ground_rep_id: repId } });
    await db.lead.deleteMany({ where: { id: { in: leadIds } } });
    await db.user.delete({ where: { id: repId } });
  }
  await db.$disconnect();
}
