import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { prisma as db } from "../../src/lib/prisma";
import { signToken } from "../../src/lib/auth";
import { GET } from "../../src/app/api/partners/prefill/route";
import {
  visiblePartners,
  canReviewPartners,
} from "../../src/lib/partners/access";
import { getLeadFilterForUser } from "../../src/lib/permissions";
async function main() {
  if (!process.env.DATABASE_URL?.includes("/leadmap_phase9_test"))
    throw Error("Isolated DB only");
  const rep = await db.user.findFirstOrThrow({ where: { role: "ground_rep" } }),
    manager = await db.user.upsert({
      where: { email: "prefill-manager@test.invalid" },
      create: {
        name: "Test Store Lead",
        email: "prefill-manager@test.invalid",
        role: "regional_manager",
        password_hash: "test-only",
      },
      update: {},
    });
  const lead = await db.lead.create({
    data: {
      company_name: "Prefill fixture",
      phone_no: "9876543210",
      assigned_ground_rep_id: rep.id,
      extra_notes:
        "contact_name: Imported Contact\nemail: test@example.invalid",
    },
  });
  try {
    const get = async () => {
      const r = await GET(
        new NextRequest(
          "http://localhost/api/partners/prefill?lead_id=" + lead.id,
          { headers: { authorization: "Bearer " + signToken(rep) } },
        ),
      );
      assert.equal(r.status, 200);
      return (await r.json()).fields;
    };
    assert.equal((await get()).contact_person_name, "Imported Contact");
    await db.consultation.create({
      data: {
        lead_id: lead.id,
        rep_id: rep.id,
        outcome: "Nurturing required",
        decision_maker_name: "Original Person",
        alternate_mobile_number: "8765432109",
        created_at: new Date("2026-01-01"),
      },
    });
    await db.consultation.create({
      data: {
        lead_id: lead.id,
        rep_id: rep.id,
        outcome: "Ready for onboarding",
        decision_maker_name: "NA",
      },
    });
    const fields = await get();
    assert.equal(fields.contact_person_name, "Original Person");
    assert.equal(fields.additional_phones, "8765432109");
    assert.equal(fields.mobile_number, "9876543210");
    const active = await db.partner.findMany({
      where: { partner_status: "active" },
    });
    const visible = await visiblePartners(rep);
    for (const p of active) assert.ok(visible.some((v) => v.id === p.id));
    assert.equal(canReviewPartners(rep), false);
    assert.equal(
      await db.lead.count({ where: getLeadFilterForUser(manager) }),
      await db.lead.count(),
    );
    console.log(
      "PASS imported name fallback, original consultation fallback, alternate phones, ground partner visibility, approval restriction and Store Lead full lead scope",
    );
  } finally {
    await db.lead.delete({ where: { id: lead.id } });
  }
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
