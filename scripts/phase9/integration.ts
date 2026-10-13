import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { prisma as db } from "../../src/lib/prisma";
import { signToken } from "../../src/lib/auth";
import {
  POST as create,
  GET as pool,
} from "../../src/app/api/route-plans/route";
import { PATCH as edit } from "../../src/app/api/route-plans/[id]/route";
import { GET as open } from "../../src/app/api/consultations/open/route";
import { POST as consult } from "../../src/app/api/consultations/route";
import { PATCH as editVisit } from "../../src/app/api/visits/[id]/edit/route";
import { POST as direct } from "../../src/app/api/trips/auto-plan/route";
import { CONSULTATION_FIELDS } from "../../src/lib/consultations/fields";
async function main() {
  if (!process.env.DATABASE_URL?.includes("/leadmap_phase9_test"))
    throw Error("Isolated test DB required");
  await db.$executeRawUnsafe(
    "TRUNCATE TABLE users, stores, leads, form_fields CASCADE",
  );
  const head = await db.user.create({
    data: {
      name: "Head",
      email: "head@test.invalid",
      role: "b2b_head",
      password_hash: "unused",
    },
  });
  const store = await db.store.create({
    data: {
      name: "Test store",
      address: "Test",
      pin_code: "560001",
      lat: 12.9,
      lng: 77.5,
      region: "Test",
    },
  });
  const rep = await db.user.create({
    data: {
      name: "Rep",
      email: "rep@test.invalid",
      role: "ground_rep",
      password_hash: "unused",
      store_id: store.id,
    },
  });
  const req = (path: string, body?: object, as = head) =>
    new NextRequest("http://localhost" + path, {
      method: body ? "POST" : "GET",
      headers: {
        authorization: "Bearer " + signToken(as),
        "content-type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  const leads = [];
  for (let i = 0; i < 13; i++)
    leads.push(
      await db.lead.create({
        data: {
          company_name: `Test ${i}`,
          lat: 12.9 + i * 0.001,
          lng: 77.5 + i * 0.001,
          geocode_status: "ok",
          geocode_source: "manual",
          location_verified: true,
          assigned_store_id: store.id,
        },
      }),
    );
  const response = await create(
    req("/api/route-plans", {
      lead_ids: leads.slice(0, 11).map((l) => l.id),
      leads_per_route: 5,
      area_filter: { label: "Test" },
    }),
  );
  const data = await response.json();
  assert.equal(response.status, 200, JSON.stringify(data));
  assert.equal(data.ids.length, 2);
  assert.equal(data.remainder.length, 1);
  const change = async (id: string, body: object) => {
    const r = await db.plannedRoute.findUniqueOrThrow({ where: { id } });
    return edit(
      req("/api/route-plans/" + id, {
        ...body,
        updated_at: r.updated_at.toISOString(),
      }),
      { params: Promise.resolve({ id }) },
    );
  };
  assert.equal((await change(data.ids[1], { action: "ready" })).status, 409);
  const poolResponse = await pool(req("/api/route-plans?pool=true"));
  assert.equal(
    (await poolResponse.json()).leads.length,
    2,
    "members and remainder reserved",
  );
  assert.equal(
    (await change(data.ids[0], { action: "remainder", choice: "defer" }))
      .status,
    200,
  );
  assert.equal((await change(data.ids[0], { action: "ready" })).status, 200);
  const plan = await db.tripPlan.create({
    data: {
      name: "Test plan",
      ground_rep_id: rep.id,
      start_date: new Date("2026-10-05"),
      end_date: new Date("2026-10-31"),
      leads_per_day: 10,
      status: "published",
      assignment: {
        create: {
          ground_rep_id: rep.id,
          assigning_manager_id: head.id,
          start_date: new Date("2026-10-05"),
          end_date: new Date("2026-10-31"),
          leads_per_day_default: 10,
          base_working_days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
        },
      },
    },
  });
  const assigned = await change(data.ids[0], {
    action: "assign",
    trip_id: plan.id,
    date: "2026-10-12",
  });
  assert.equal(assigned.status, 200, await assigned.text());
  assert.equal(
    (
      await create(
        req("/api/route-plans", {
          lead_ids: leads.slice(0, 5).map((l) => l.id),
          leads_per_route: 5,
          area_filter: { label: "Duplicate" },
        }),
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await create(
        req(
          "/api/route-plans",
          {
            lead_ids: [leads[12].id],
            leads_per_route: 1,
            area_filter: { label: "Forbidden" },
          },
          rep,
        ),
      )
    ).status,
    403,
  );
  assert.equal(
    (await change(data.ids[0], { action: "add", lead_id: leads[12].id }))
      .status,
    409,
  );
  assert.equal(
    (
      await change(data.ids[0], {
        action: "add",
        lead_id: leads[12].id,
        confirm: true,
      })
    ).status,
    200,
  );
  assert.equal(
    await db.tripLead.count({ where: { route_id: data.ids[0] } }),
    6,
  );
  assert.equal(
    (
      await change(data.ids[0], {
        action: "remove",
        lead_id: leads[12].id,
        confirm: true,
      })
    ).status,
    200,
  );
  assert.equal(
    await db.tripLead.count({ where: { route_id: data.ids[0] } }),
    5,
  );
  const visits = await db.tripLead.findMany({
    where: { route_id: data.ids[0] },
  });
  assert.equal(visits.length, 5);
  for (const [i, f] of CONSULTATION_FIELDS.entries())
    await db.formField.create({
      data: {
        key: f.key,
        label: f.label,
        type: f.type,
        required: f.required,
        options: f.options || [],
        required_when: f.required_when || undefined,
        max_files: f.max_files,
        display_order: i,
      },
    });
  const responses: Record<string, string | string[]> = {};
  for (const f of CONSULTATION_FIELDS) {
    responses[f.key] =
      f.type === "photo" || f.type === "multi_select"
        ? []
        : f.type === "date"
          ? "2026-10-12"
          : f.options?.[0] || "Test";
  }
  responses.alternate_mobile_number = "";
  responses.outcome = "Visit scheduled";
  responses.next_follow_up_date = "2026-10-15";
  const photo = await db.photoAsset.create({
    data: {
      lead_id: visits[0].lead_id,
      owner_id: rep.id,
      filename: "phase9-test.jpg",
      mime_type: "image/jpeg",
      size_bytes: 1,
    },
  });
  responses.site_photos = ["/api/photos/" + photo.id];
  responses.visiting_card_photos = [];
  const submitted = await consult(
    req(
      "/api/consultations",
      { lead_id: visits[0].lead_id, trip_lead_id: visits[0].id, responses },
      rep,
    ),
  );
  assert.equal(submitted.status, 200, await submitted.text());
  assert.equal(
    (
      await open(
        req(
          `/api/consultations/open?lead_id=${visits[0].lead_id}&trip_lead_id=${visits[0].id}`,
          undefined,
          rep,
        ),
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await consult(
        req(
          "/api/consultations",
          { lead_id: visits[0].lead_id, trip_lead_id: visits[0].id, responses },
          rep,
        ),
      )
    ).status,
    409,
  );
  const before = await db.tripLead.findUniqueOrThrow({
    where: { id: visits[0].id },
  });
  assert.equal((await change(data.ids[0], { action: "unassign" })).status, 409);
  assert.equal(
    (await change(data.ids[0], { action: "unassign", confirm: true })).status,
    200,
  );
  assert.deepEqual(
    await db.tripLead.findUniqueOrThrow({ where: { id: visits[0].id } }),
    before,
  );
  assert.equal(
    await db.tripLead.count({ where: { route_id: data.ids[0] } }),
    1,
  );
  assert.equal(
    await db.lead.count({
      where: {
        id: { in: visits.slice(1).map((v) => v.lead_id) },
        assigned_ground_rep_id: null,
      },
    }),
    4,
  );
  assert.equal(
    (
      await change(data.ids[0], {
        action: "remove",
        lead_id: visits[0].lead_id,
      })
    ).status,
    200,
  );
  const follow = await direct(
    req("/api/trips/auto-plan", {
      ground_rep_id: rep.id,
      start_date: "2026-10-15",
      total_days: 1,
      leads_per_day: 10,
      lead_ids: [visits[0].lead_id],
    }),
  );
  assert.equal(follow.status, 200, await follow.text());
  const newVisit = await db.tripLead.findFirstOrThrow({
    where: { lead_id: visits[0].lead_id, id: { not: visits[0].id } },
  });
  assert.equal(newVisit.route_id, null);
  assert.equal(newVisit.status, "pending");
  assert.deepEqual(
    await db.tripLead.findUniqueOrThrow({ where: { id: visits[0].id } }),
    before,
  );
  const emptyResponse = await direct(
    req("/api/trips/auto-plan", {
      ground_rep_id: rep.id,
      start_date: "2026-11-02",
      total_days: 6,
      leads_per_day: 8,
      empty_plan: true,
    }),
  );
  const empty = await emptyResponse.json();
  assert.equal(emptyResponse.status, 200, JSON.stringify(empty));
  assert.equal(
    await db.tripLead.count({ where: { trip_id: empty.tripPlan.id } }),
    0,
  );
  assert.equal((await change(data.ids[1], { action: "ready" })).status, 200);
  assert.equal(
    (
      await change(data.ids[1], {
        action: "assign",
        trip_id: plan.id,
        date: "2026-10-13",
      })
    ).status,
    200,
  );
  const moving = await db.tripLead.findFirstOrThrow({
    where: { route_id: data.ids[1], status: "pending" },
  });
  const moveBody = {
    date: "2026-10-14",
    lead_id: moving.lead_id,
    expected_lead_id: moving.lead_id,
    expected_date: "2026-10-13",
  };
  assert.equal(
    (
      await editVisit(req("/api/visits/" + moving.id + "/edit", moveBody), {
        params: Promise.resolve({ id: moving.id }),
      })
    ).status,
    409,
  );
  const moved = await editVisit(
    req("/api/visits/" + moving.id + "/edit", { ...moveBody, confirm: true }),
    { params: Promise.resolve({ id: moving.id }) },
  );
  assert.equal(moved.status, 200, await moved.text());
  assert.equal(
    (await db.tripLead.findUniqueOrThrow({ where: { id: moving.id } }))
      .route_id,
    null,
  );
  assert.equal(
    await db.routeLead.count({
      where: { route_id: data.ids[1], lead_id: moving.lead_id },
    }),
    0,
  );
  console.log(
    "PASS: reservation, remainder gate, assignment, unique consultation, visited-row refusal, unassignment preservation, and new direct follow-up row",
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
