import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
const db = new PrismaClient(),
  tag = "free-revamp-check-" + Date.now(),
  leads = [],
  stores = [],
  users = [],
  plans = [];
async function call(user, path, body, method = body ? "POST" : "GET") {
  const response = await fetch("http://127.0.0.1:3000/api" + path, {
    method,
    headers: {
      Authorization:
        "Bearer " +
        jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: "10m" }),
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, data: await response.json() };
}
try {
  const head = await db.user.findFirstOrThrow({
    where: { role: "b2b_head", active: true },
  });
  for (const [name, lat, pin] of [
    ["A", 12.9, "699981"],
    ["B", 13, "699982"],
  ]) {
    const s = await db.store.create({
      data: {
        name: tag + name,
        address: "Synthetic test",
        pin_code: pin,
        region: tag,
        lat,
        lng: 80,
        radius_km: 10,
        service_pincodes: { create: { pin_code: pin } },
      },
    });
    stores.push(s.id);
  }
  const rep = await db.user.create({
    data: {
      name: tag,
      email: tag + "@example.test",
      password_hash: "not-a-login",
      role: "ground_rep",
      store_id: stores[0],
      region: tag,
    },
  });
  users.push(rep.id);
  const create = async (data = {}) => {
    const l = await db.lead.create({
      data: {
        company_name: tag,
        pin_code: "699981",
        region: tag,
        geocode_status: "mapping_issue",
        ...data,
      },
    });
    leads.push(l.id);
    return l;
  };
  const issue = await create();
  for (const body of [
    { leadIds: [issue.id], storeId: stores[0] },
    { leadIds: [issue.id], repId: rep.id },
  ])
    assert.equal((await call(head, "/leads/bulk-assign", body)).status, 409);
  let r = await call(
    head,
    `/leads/${issue.id}`,
    { assigned_store_id: stores[0] },
    "PATCH",
  );
  assert.equal(r.status, 409, JSON.stringify(r));
  r = await call(
    head,
    `/leads/${issue.id}/location`,
    { lat: 12.91, lng: 80 },
    "PATCH",
  );
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.equal(
    (await db.lead.findUniqueOrThrow({ where: { id: issue.id } }))
      .assigned_store_id,
    stores[0],
  );
  // A conflicting PIN suggestion wins over distance and requires confirmation.
  await db.lead.update({
    where: { id: issue.id },
    data: { pin_code: "699982" },
  });
  r = await call(
    head,
    `/leads/${issue.id}/location`,
    { lat: 12.905, lng: 80 },
    "PATCH",
  );
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.equal(
    (await db.lead.findUniqueOrThrow({ where: { id: issue.id } }))
      .assigned_store_id,
    stores[0],
  );
  assert.ok(
    await db.activityLog.count({
      where: { lead_id: issue.id, action: "ALLOTMENT_REVIEW_REQUIRED" },
    }),
  );
  r = await call(head, "/leads/allotment", {
    action: "preview",
    leadIds: [issue.id],
  });
  assert.equal(r.status, 200, JSON.stringify(r));
  let row = r.data.rows[0];
  assert.equal(row.suggested_store.id, stores[1]);
  assert.equal(row.changed, true);
  let expected = {
    [issue.id]: {
      store_id: row.suggested_store.id,
      updated_at: row.updated_at,
    },
  };
  await db.lead.update({
    where: { id: issue.id },
    data: { notes: "Concurrent edit" },
  });
  r = await call(head, "/leads/allotment", {
    action: "confirm",
    leadIds: [issue.id],
    expected,
  });
  assert.equal(r.status, 409);
  r = await call(head, "/leads/allotment", {
    action: "preview",
    leadIds: [issue.id],
  });
  row = r.data.rows[0];
  expected = {
    [issue.id]: {
      store_id: row.suggested_store.id,
      updated_at: row.updated_at,
    },
  };
  r = await call(head, "/leads/allotment", {
    action: "confirm",
    leadIds: [issue.id],
    expected,
  });
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.equal(
    (await db.lead.findUniqueOrThrow({ where: { id: issue.id } }))
      .assigned_store_id,
    stores[1],
  );
  const assigned = await create({
    lat: 12.91,
    lng: 80,
    geocode_status: "ok",
    geocode_source: "manual",
    assigned_store_id: stores[0],
    assigned_ground_rep_id: rep.id,
  });
  const plan = await db.tripPlan.create({
    data: {
      name: tag,
      ground_rep_id: rep.id,
      start_date: new Date("2027-01-01"),
      end_date: new Date("2027-01-01"),
      leads_per_day: 1,
      status: "published",
      trip_leads: {
        create: {
          lead_id: assigned.id,
          scheduled_date: new Date("2027-01-01"),
          sequence_order: 1,
        },
      },
    },
  });
  plans.push(plan.id);
  const snapshot = await db.routeSnapshot.create({
    data: {
      ground_rep_id: rep.id,
      route_date: new Date("2027-01-01"),
      ordered_lead_ids: [assigned.id],
      coordinates: [{ lat: 12.91, lng: 80 }],
      trip_lead_ids: [],
      total_distance_km: 0,
      version: 1,
    },
  });
  await db.lead.update({
    where: { id: assigned.id },
    data: { pin_code: "699982" },
  });
  r = await call(
    head,
    `/leads/${assigned.id}/location`,
    { lat: 13.01, lng: 80 },
    "PATCH",
  );
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.equal(
    (await db.lead.findUniqueOrThrow({ where: { id: assigned.id } }))
      .assigned_store_id,
    stores[0],
  );
  assert.deepEqual(
    (await db.routeSnapshot.findUniqueOrThrow({ where: { id: snapshot.id } }))
      .coordinates,
    [{ lat: 12.91, lng: 80 }],
  );
  r = await call(head, "/leads/allotment", {
    action: "preview",
    leadIds: [assigned.id],
  });
  assert.match(r.data.rows[0].blocked, /team member/);
  r = await call(rep, "/leads/allotment", {
    action: "preview",
    leadIds: [assigned.id],
  });
  assert.equal(r.status, 403);
  const noArea = await call(head, "/geocode", {
    company_name: tag,
    pin_code: "999999",
    address: "Synthetic test",
    google_map_link: "https://www.google.com/maps?q=12.91,80",
  });
  assert.equal(noArea.status, 200);
  assert.equal(noArea.data.result.reason, "no_area_identified");
  console.log(
    "Free revamp workflow passed: Mapping Issues assignment blocks, automatic allotment on resolution, PIN priority, review/stale confirmation, published snapshot preservation, role access, no-area/link bypass rejection.",
  );
} finally {
  await db.routeSnapshot.deleteMany({
    where: { ground_rep_id: { in: users } },
  });
  await db.tripLead.deleteMany({ where: { trip_id: { in: plans } } });
  await db.tripPlan.deleteMany({ where: { id: { in: plans } } });
  await db.activityLog.deleteMany({ where: { lead_id: { in: leads } } });
  await db.leadPhone.deleteMany({ where: { lead_id: { in: leads } } });
  await db.lead.deleteMany({ where: { id: { in: leads } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.storeServicePincode.deleteMany({
    where: { store_id: { in: stores } },
  });
  await db.store.deleteMany({ where: { id: { in: stores } } });
  await db.$disconnect();
}
