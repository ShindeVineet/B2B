import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { prisma as db } from "../../src/lib/prisma";
import { signToken } from "../../src/lib/auth";
import { POST as revisit } from "../../src/app/api/leads/[id]/revisit/route";
import { POST as reschedule } from "../../src/app/api/visits/[id]/reschedule/route";
import { todayIndia, addDays } from "../../src/lib/phase5/calendar";
async function main() {
  if (!process.env.DATABASE_URL?.includes("/leadmap_phase9_test"))
    throw Error("Isolated test database required");
  const head = await db.user.findFirstOrThrow({ where: { role: "b2b_head" } }),
    rep = await db.user.findFirstOrThrow({ where: { role: "ground_rep" } });
  const req = (body: object, user = rep) =>
    new NextRequest("http://localhost/api/check", {
      method: "POST",
      headers: {
        authorization: "Bearer " + signToken(user),
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
  const lead = await db.lead.create({
    data: {
      company_name: "Short revisit test",
      assigned_ground_rep_id: rep.id,
      lat: 12.97,
      lng: 77.6,
      location_verified: true,
      geocode_status: "ok",
    },
  });
  const original = await db.consultation.create({
    data: {
      lead_id: lead.id,
      rep_id: rep.id,
      outcome: "Visit scheduled",
      interest_level: "Medium",
      notes: "Original consultation",
    },
  });
  const ctx = { params: Promise.resolve({ id: lead.id }) };
  let response: Response = await revisit(
    req({ outcome: "Ready for onboarding", notes: "Ready to proceed" }),
    ctx,
  );
  assert.equal(response.status, 200, await response.clone().text());
  const first = (await response.json()).trip_lead_id;
  assert.equal(
    (await db.tripLead.findUniqueOrThrow({ where: { id: first } })).completed,
    true,
  );
  assert.equal(
    (
      await db.consultation.findUniqueOrThrow({
        where: { trip_lead_id: first },
      })
    ).outcome,
    "Ready for onboarding",
  );
  assert.equal(
    (await db.consultation.findUniqueOrThrow({ where: { id: original.id } }))
      .notes,
    "Original consultation",
  );
  assert.equal(
    await db.partner.count({ where: { source_lead_id: lead.id } }),
    0,
  );
  response = await revisit(req({ outcome: "Follow-up needed" }), ctx);
  assert.equal(response.status, 400);
  response = await revisit(
    req({
      outcome: "Follow-up needed",
      next_follow_up_date: addDays(todayIndia(), 3),
    }),
    ctx,
  );
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(
    (
      await db.followUp.findUniqueOrThrow({ where: { lead_id: lead.id } })
    ).due_date
      .toISOString()
      .slice(0, 10),
    addDays(todayIndia(), 3),
  );
  response = await revisit(req({ date: addDays(todayIndia(), 2) }), ctx);
  assert.equal(response.status, 200);
  const pending = (await response.json()).trip_lead_id;
  const visitCtx = { params: Promise.resolve({ id: pending }) };
  const before = await db.tripLead.findUniqueOrThrow({
    where: { id: pending },
  });
  response = await reschedule(
    req({
      date: addDays(todayIndia(), 90),
      expected_date: addDays(todayIndia(), 2),
      reason: "personal",
      note: "Need another date",
    }),
    visitCtx,
  );
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal((await response.json()).pending_approval, true);
  assert.equal(
    (
      await db.tripLead.findUniqueOrThrow({ where: { id: pending } })
    ).scheduled_date.toISOString(),
    before.scheduled_date.toISOString(),
  );
  const request = await db.activityLog.findFirstOrThrow({
    where: { lead_id: lead.id, action: "RESCHEDULE_REQUESTED" },
  });
  response = await reschedule(
    req({ request_id: request.id, decision: "approve" }),
    visitCtx,
  );
  assert.equal(response.status, 403);
  response = await reschedule(
    req({ request_id: request.id, decision: "approve" }, head),
    visitCtx,
  );
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(
    (
      await db.tripLead.findUniqueOrThrow({ where: { id: pending } })
    ).scheduled_date
      .toISOString()
      .slice(0, 10),
    addDays(todayIndia(), 90),
  );
  response = await reschedule(
    req({ request_id: request.id, decision: "approve" }, head),
    visitCtx,
  );
  assert.equal(response.status, 409);
  console.log(
    "PASS short revisit records, required follow-up, unchanged consultation, onboarding approval preserved, reschedule request permissions, deferred mutation and approval beyond old end date",
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
