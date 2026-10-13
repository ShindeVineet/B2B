import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { prisma as db } from "../../src/lib/prisma";
import { signToken } from "../../src/lib/auth";
import { GET } from "../../src/app/api/onboarding-reminders/route";
async function main() {
  if (!process.env.DATABASE_URL?.includes("/leadmap_phase9_test"))
    throw Error("Isolated database required");
  const rep = await db.user.findFirstOrThrow({ where: { role: "ground_rep" } });
  const head = await db.user.findFirstOrThrow({ where: { role: "b2b_head" } });
  const lead = await db.lead.create({
    data: {
      company_name: "Persistent reminder test",
      assigned_ground_rep_id: rep.id,
    },
  });
  const read = async (user = rep) => {
    const r = await GET(
      new NextRequest("http://localhost/api/onboarding-reminders", {
        headers: { authorization: "Bearer " + signToken(user) },
      }),
    );
    assert.equal(r.status, 200);
    return (await r.json()).reminders.find(
      (r: { id: string }) => r.id === lead.id,
    );
  };
  try {
    assert.equal(await read(), undefined);
    await db.consultation.create({
      data: {
        lead_id: lead.id,
        rep_id: rep.id,
        outcome: "Ready for onboarding",
      },
    });
    assert.equal((await read()).status, "documents_pending");
    assert.equal((await read(head)).status, "documents_pending");
    await db.consultation.create({
      data: { lead_id: lead.id, rep_id: rep.id, outcome: "Couldn't meet" },
    });
    assert.ok(
      await read(),
      "Readiness survives subsequent updates and reloads",
    );
    await db.lead.update({
      where: { id: lead.id },
      data: { assigned_ground_rep_id: null },
    });
    assert.equal(
      await read(),
      undefined,
      "Rep cannot access unassigned lead reminders",
    );
    assert.ok(await read(head));
    const partner = await db.partner.create({
      data: {
        source_lead_id: lead.id,
        submitted_by: rep.id,
        company_firm_name: "Reminder test",
        contact_person_name: "Test",
        designation: "Owner",
        mobile_number: "9000000000",
        office_address: "Test",
        pincode: "560001",
        city: "Bengaluru",
        state: "KA",
        type_of_professional: "Architect",
        years_operating: "1",
        specialized_in: "Both",
        expected_monthly_order_value: 0,
        gst_registered: false,
        pan_no: "TEST",
        bank_account_name: "Test",
        bank_name: "Test",
        branch: "Test",
        account_no: "0",
        ifsc_code: "TEST",
      },
    });
    assert.equal((await read(head)).status, "pending_review");
    assert.ok((await read(head)).href.includes(partner.id));
    await db.partner.update({
      where: { id: partner.id },
      data: { partner_status: "rejected" },
    });
    assert.equal((await read(head)).status, "rejected");
    await db.partner.update({
      where: { id: partner.id },
      data: { partner_status: "active" },
    });
    assert.equal(
      await read(head),
      undefined,
      "Approved onboarding resolves reminder",
    );
    console.log(
      "PASS durable readiness, role scope, pending/rejected application links and approval resolution",
    );
  } finally {
    await db.partner.deleteMany({ where: { source_lead_id: lead.id } });
    await db.consultation.deleteMany({ where: { lead_id: lead.id } });
    await db.lead.delete({ where: { id: lead.id } });
  }
}
main().finally(() => db.$disconnect());
