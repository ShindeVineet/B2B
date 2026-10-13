import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { prisma as db } from "../../src/lib/prisma";
import { signToken } from "../../src/lib/auth";
import { GET as consultations } from "../../src/app/api/consultations/route";
import { POST as create } from "../../src/app/api/leads/walk-in/route";
import { POST as revisit } from "../../src/app/api/leads/[id]/revisit/route";
import { todayIndia, addDays } from "../../src/lib/phase5/calendar";
async function main() {
  if (!process.env.DATABASE_URL?.includes("/leadmap_phase9_test"))
    throw Error("Isolated database required");
  const associate = await db.user.findFirstOrThrow({
    where: { role: "store_associate" },
  });
  const rep = await db.user.findFirstOrThrow({ where: { role: "ground_rep" } });
  const req = (body: object, user = associate) =>
    new NextRequest("http://localhost/api/check", {
      method: "POST",
      headers: {
        authorization: "Bearer " + signToken(user),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  const name = "Walk-in regression " + Date.now();
  const body = {
    customer_name: name,
    phone_no: "9876543210",
    interest_level: "Low",
    lead_type: "Architect",
    notes: "Store visit",
    next_follow_up_date: addDays(todayIndia(), 2),
  };
  assert.equal((await create(req(body, rep))).status, 403);
  assert.equal((await create(req({ customer_name: name }))).status, 400);
  assert.equal(
    (await create(req({ ...body, lead_type: "Invalid" }))).status,
    400,
  );
  const response = await create(req(body));
  assert.equal(response.status, 201, await response.clone().text());
  const { lead } = await response.json();
  try {
    const saved = await db.lead.findUniqueOrThrow({
      where: { id: lead.id },
      include: { consultations: true, follow_up: true },
    });
    assert.ok(saved.lead_code);
    assert.equal(saved.lead_source, "Walk-in");
    assert.equal(saved.category, "Architect");
    assert.equal(saved.consultations[0].lead_type, "Architect");
    const mine = await consultations(
      new NextRequest(
        `http://localhost/api/consultations?mine=true&rep_id=${rep.id}`,
        { headers: { authorization: "Bearer " + signToken(associate) } },
      ),
    );
    assert.equal(mine.status, 200);
    const own = (await mine.json()).consultations;
    assert.ok(own.some((c: { lead_id: string }) => c.lead_id === lead.id));
    assert.ok(own.every((c: { rep_id: string }) => c.rep_id === associate.id));
    assert.equal(saved.lat, null);
    assert.equal(saved.pin_code, null);
    assert.equal(saved.assigned_ground_rep_id, null);
    assert.equal(saved.calling_associate_id, associate.id);
    assert.equal(saved.consultations[0].interest_level, "Low");
    assert.ok(saved.follow_up);
    assert.equal((await create(req(body))).status, 409);
    const ctx = { params: Promise.resolve({ id: lead.id }) };
    assert.equal(
      (await revisit(req({ outcome: "Ready for onboarding" }), ctx)).status,
      200,
    );
    assert.equal(
      (await revisit(req({ date: addDays(todayIndia(), 4) }), ctx)).status,
      200,
    );
    assert.equal(
      await db.consultation.count({ where: { lead_id: lead.id } }),
      2,
    );
    assert.equal(await db.tripLead.count({ where: { lead_id: lead.id } }), 0);
    assert.equal(
      (await revisit(req({ outcome: "Not interested" }, rep), ctx)).status,
      403,
    );
    console.log(
      "PASS walk-in intake, optional location, consultation, reminder, duplicate prevention, owner revisit and role protection",
    );
  } finally {
    await db.followUp.deleteMany({ where: { lead_id: lead.id } });
    await db.lead.delete({ where: { id: lead.id } });
  }
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
