import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
const db = new PrismaClient(),
  tag = "assignment-check-" + Date.now(),
  userIds = [],
  storeIds = [],
  leadIds = [],
  planIds = [];
async function call(user, url, body, method = body ? "POST" : "GET") {
  const r = await fetch("http://127.0.0.1:3000/api" + url, {
    method,
    headers: {
      Authorization:
        "Bearer " +
        jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: "10m" }),
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, data: await r.json() };
}
try {
  const head = await db.user.findFirstOrThrow({
    where: { role: "b2b_head", active: true },
  });
  for (let i = 0; i < 2; i++) {
    const r = await call(head, "/stores", {
      name: tag + "-" + i,
      address: "Test store",
      pin_code: "699991",
      region: tag,
      radius_km: 5,
      lat: 12.9 + i * 0.1,
      lng: 80,
      service_pin_codes: i ? "699992" : "699991",
    });
    assert.equal(r.status, 201, JSON.stringify(r));
    storeIds.push(r.data.store.id);
  }
  const [a, b] = await db.store.findMany({
    where: { id: { in: storeIds } },
    orderBy: { name: "asc" },
  });
  const rep = await db.user.create({
    data: {
      name: tag,
      email: tag + "@example.test",
      password_hash: "not-a-login",
      role: "ground_rep",
      region: tag,
    },
  });
  userIds.push(rep.id);
  let r = await call(head, "/users", { id: rep.id, store_id: a.id }, "PATCH");
  assert.equal(r.status, 200, JSON.stringify(r));
  for (const [i, d] of [0.03, 0.01, 0.05, 0.02, 0.04].entries()) {
    const l = await db.lead.create({
      data: {
        company_name: tag + "-" + i,
        pin_code: "699991",
        lat: a.lat + d,
        lng: a.lng,
        geocode_status: "ok",
      },
    });
    leadIds.push(l.id);
  }
  r = await call(head, "/leads/bulk-assign", {
    leadIds,
    autoAssignToNearest: true,
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.assignedCount, 5);
  r = await call(head, "/leads/bulk-assign", { leadIds, repId: rep.id });
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.equal(
    await db.lead.count({
      where: {
        id: { in: leadIds },
        assigned_store_id: a.id,
        assigned_ground_rep_id: rep.id,
      },
    }),
    5,
  );
  r = await call(head, "/trips/auto-plan", {
    ground_rep_id: rep.id,
    start_date: "2099-01-01",
    total_days: 3,
    leads_per_day: 2,
    base_working_days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    lead_ids: leadIds,
  });
  assert.equal(r.status, 200, JSON.stringify(r));
  planIds.push(r.data.tripPlan.id);
  const visits = await db.tripLead.findMany({
    where: { trip_id: planIds[0] },
    orderBy: [{ scheduled_date: "asc" }, { sequence_order: "asc" }],
  });
  assert.deepEqual(
    visits.map((v) => v.lead_id),
    [leadIds[1], leadIds[3], leadIds[0], leadIds[4], leadIds[2]],
  );
  assert.equal(
    await db.routeSnapshot.count({ where: { ground_rep_id: rep.id } }),
    0,
  );
  // An overlap requires explicit store selection and does not alter saved lead coordinates.
  r = await call(
    head,
    "/stores/" + b.id,
    { service_pin_codes: "699991,699992" },
    "PATCH",
  );
  assert.equal(r.status, 200);
  const unmapped = await db.lead.create({
    data: { company_name: tag + "-overlap", pin_code: "699991" },
  });
  leadIds.push(unmapped.id);
  r = await call(head, "/leads/bulk-assign", {
    leadIds: [unmapped.id],
    autoAssignToNearest: true,
  });
  assert.equal(r.data.assignedCount, 0);
  assert.equal(r.data.unmappedCount, 1);
  const refreshed = await db.lead.findUnique({ where: { id: unmapped.id } });
  assert.equal(refreshed.assigned_store_id, null);
  assert.equal(refreshed.lat, null);
  r = await call(head, "/leads/bulk-assign", {
    leadIds: [unmapped.id],
    storeId: b.id,
  });
  assert.equal(r.status, 200);
  r = await call(head, "/leads/bulk-assign", {
    leadIds: [unmapped.id],
    repId: rep.id,
  });
  assert.equal(r.status, 409);
  // Managers and Heads can receive their own plans once a base store is assigned.
  for (const role of ["regional_manager", "b2b_head"]) {
    const member = await db.user.create({
      data: {
        name: tag,
        email: tag + "-" + role + "@example.test",
        password_hash: "not-a-login",
        role,
        region: tag,
      },
    });
    userIds.push(member.id);
    r = await call(head, "/users", { id: member.id, store_id: a.id }, "PATCH");
    assert.equal(r.status, 200, JSON.stringify(r));
    const l = await db.lead.create({
      data: {
        company_name: tag + "-" + role,
        assigned_store_id: a.id,
        lat: 12.91,
        lng: 80,
        geocode_status: "ok",
      },
    });
    leadIds.push(l.id);
    r = await call(head, "/leads/bulk-assign", {
      leadIds: [l.id],
      repId: member.id,
    });
    assert.equal(r.status, 200, JSON.stringify(r));
    r = await call(head, "/trips/auto-plan", {
      ground_rep_id: member.id,
      start_date: "2099-01-01",
      total_days: 1,
      leads_per_day: 1,
      base_working_days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
      lead_ids: [l.id],
    });
    assert.equal(r.status, 200, JSON.stringify(r));
    planIds.push(r.data.tripPlan.id);
    r = await call(member, "/leads?rep_id=" + member.id);
    assert.equal(r.status, 200);
    assert.ok(
      r.data.leads.every((x) => x.assigned_ground_rep_id === member.id),
    );
  }
  console.log(
    "Assignment workflow passed: service PIN lists, overlap review, base stores, consistent rep/store assignments, closest-first daily batches, draft snapshot protection, manager/Head recipients.",
  );
} finally {
  const assignments = await db.tripAssignment.findMany({
    where: { trip_id: { in: planIds } },
    select: { id: true },
  });
  const aids = assignments.map((a) => a.id);
  await db.routeSnapshot.deleteMany({
    where: { ground_rep_id: { in: userIds } },
  });
  await db.tripDayCapacity.deleteMany({
    where: { trip_assignment_id: { in: aids } },
  });
  await db.tripWeekOverride.deleteMany({
    where: { trip_assignment_id: { in: aids } },
  });
  await db.tripAssignment.deleteMany({ where: { id: { in: aids } } });
  await db.tripPlan.deleteMany({ where: { id: { in: planIds } } });
  await db.lead.deleteMany({ where: { id: { in: leadIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.store.deleteMany({ where: { id: { in: storeIds } } });
  await db.$disconnect();
}
