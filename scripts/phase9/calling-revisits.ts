import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { prisma as db } from "../../src/lib/prisma";
import { signToken } from "../../src/lib/auth";
import { POST as importLinkedin } from "../../src/app/api/leads/linkedin-import/route";
import { POST as revisit } from "../../src/app/api/leads/[id]/revisit/route";
import { GET as queue } from "../../src/app/api/calling-locations/route";
import { POST as create } from "../../src/app/api/route-plans/route";
import { PATCH as edit } from "../../src/app/api/route-plans/[id]/route";
import { getLeadEditFilterForUser } from "../../src/lib/permissions";
import { distributeWaitingCallers } from "../../src/lib/calling/distribute";
import { todayIndia, addDays, DAYS } from "../../src/lib/phase5/calendar";
async function main() {
  if (!process.env.DATABASE_URL?.includes("/leadmap_phase9_test"))
    throw Error("Isolated DB required");
  const head = await db.user.findFirstOrThrow({ where: { role: "b2b_head" } }),
    rep = await db.user.findFirstOrThrow({ where: { role: "ground_rep" } });
  const req = (body: object | undefined, as = head, path = "/") =>
    new NextRequest("http://localhost" + path, {
      method: body ? "POST" : "GET",
      headers: {
        authorization: "Bearer " + signToken(as),
        "content-type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  const associates: (typeof head)[] = [];
  for (let i = 0; i < 3; i++)
    associates.push(
      await db.user.create({
        data: {
          name: "Caller " + i,
          email: `caller${i}@test.invalid`,
          role: "store_associate",
          password_hash: "unused",
        },
      }),
    );
  const rows = Array.from({ length: 6 }, (_, i) => ({
    lead_id: "li-" + i,
    "First name": "Caller lead " + i,
    "Email address": "lead@test.invalid",
  }));
  let response: Response = await importLinkedin(req({ rows }));
  assert.equal(response.status, 200, await response.text());
  const leads = await db.lead.findMany({ where: { lead_source: "LinkedIn" } });
  assert.equal(leads.length, 6);
  for (const u of associates)
    assert.equal(
      leads.filter((l) => l.calling_associate_id === u.id).length,
      2,
    );
  response = await importLinkedin(req({ rows }));
  assert.equal((await response.json()).skipped, 6);
  const own = leads.find((l) => l.calling_associate_id === associates[0].id)!;
  assert.equal(
    await db.lead.count({
      where: { id: own.id, AND: [getLeadEditFilterForUser(associates[0])] },
    }),
    1,
  );
  assert.equal(
    await db.lead.count({
      where: { id: own.id, AND: [getLeadEditFilterForUser(associates[1])] },
    }),
    0,
  );
  for (let i = 0; i < 6; i++)
    await db.lead.create({
      data: { company_name: "Missing " + i, geocode_issue_reason: "not_found" },
    });
  await db.$transaction((tx) => distributeWaitingCallers(tx));
  for (const u of associates) {
    response = await queue(req(undefined, u, "/api/calling-locations"));
    assert.equal((await response.json()).total, 2);
  }
  response = await queue(req(undefined, head, "/api/calling-locations"));
  assert.equal((await response.json()).total, 6);
  response = await queue(req(undefined, rep, "/api/calling-locations"));
  assert.equal(response.status, 403);
  const lead = await db.lead.create({
    data: { company_name: "Repeat visit", assigned_ground_rep_id: rep.id },
  });
  await db.consultation.create({
    data: {
      lead_id: lead.id,
      rep_id: rep.id,
      outcome: "Not Interested",
      visit_date: new Date(),
      responses: {},
    },
  });
  const ctx = { params: Promise.resolve({ id: lead.id }) };
  response = await revisit(req({ date: todayIndia() }, rep), ctx);
  assert.equal(response.status, 200, await response.clone().text());
  const first = (await response.json()).trip_lead_id;
  response = await revisit(req({ date: todayIndia() }, rep), ctx);
  assert.equal((await response.json()).trip_lead_id, first);
  await db.tripLead.update({
    where: { id: first },
    data: { completed: true, status: "visited" },
  });
  response = await revisit(req({ date: addDays(todayIndia(), 2) }, rep), ctx);
  assert.equal(response.status, 200, await response.clone().text());
  const second = (await response.json()).trip_lead_id;
  assert.notEqual(first, second);
  assert.equal(
    (await db.tripLead.findUniqueOrThrow({ where: { id: first } })).status,
    "visited",
  );
  response = await revisit(req({ date: addDays(todayIndia(), 3) }, rep), ctx);
  assert.equal(response.status, 409);
  response = await revisit(req({ date: todayIndia() }, head), ctx);
  assert.equal(response.status, 403);
  const stops = [];
  for (let i = 0; i < 2; i++)
    stops.push(
      await db.lead.create({
        data: {
          company_name: "Simple route " + i,
          lat: 12.9 + i * 0.001,
          lng: 77.5,
          location_verified: true,
          geocode_status: "ok",
          assigned_store_id: rep.store_id,
        },
      }),
    );
  response = await create(
    req({
      lead_ids: stops.map((l) => l.id),
      leads_per_route: 2,
      area_filter: { label: "Simple" },
    }),
  );
  assert.equal(response.status, 200, await response.clone().text());
  const route = await db.plannedRoute.findUniqueOrThrow({
    where: { id: (await response.json()).ids[0] },
  });
  response = await edit(
    req({
      action: "assign",
      updated_at: route.updated_at.toISOString(),
      rep_id: rep.id,
      date: addDays(todayIndia(), 30),
      end_date: addDays(todayIndia(), 35),
      capacity: 5,
      working_days: [...DAYS],
      confirm: true,
    }),
    { params: Promise.resolve({ id: route.id }) },
  );
  assert.equal(response.status, 200, await response.text());
  assert.equal(await db.tripLead.count({ where: { route_id: route.id } }), 2);
  console.log(
    "PASS: direct draft assignment, round robin, dedupe, caller edit scope, queue permissions, immediate/future/repeated revisits and preserved visit history",
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
