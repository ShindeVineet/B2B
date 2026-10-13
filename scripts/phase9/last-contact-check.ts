import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { prisma as db } from "../../src/lib/prisma";
import { signToken } from "../../src/lib/auth";
import { GET } from "../../src/app/api/leads/route";
import { POST } from "../../src/app/api/leads/[id]/calls/route";
async function main() {
  if (!process.env.DATABASE_URL?.includes("/leadmap_phase9_test"))
    throw Error("Isolated DB only");
  const rep = await db.user.findFirstOrThrow({ where: { role: "ground_rep" } });
  const name = "Last contact regression " + Date.now();
  const lead = await db.lead.create({
    data: { company_name: name, assigned_ground_rep_id: rep.id },
  });
  const headers = {
    authorization: "Bearer " + signToken(rep),
    "Content-Type": "application/json",
  };
  const read = async () => {
    const r = await GET(
      new NextRequest(
        "http://localhost/api/leads?search=" + encodeURIComponent(name),
        { headers },
      ),
    );
    assert.equal(r.status, 200);
    return (await r.json()).leads[0];
  };
  try {
    assert.equal((await read()).last_contact_at, null);
    await db.consultation.create({
      data: {
        lead_id: lead.id,
        rep_id: rep.id,
        outcome: "Nurturing required",
        visit_date: new Date("2026-01-01"),
      },
    });
    assert.equal((await read()).last_contact_at, "2026-01-01T00:00:00.000Z");
    const r = await POST(
      new NextRequest("http://localhost/api/leads/" + lead.id + "/calls", {
        method: "POST",
        headers,
        body: JSON.stringify({ notes: "Reached customer" }),
      }),
      { params: Promise.resolve({ id: lead.id }) },
    );
    assert.equal(r.status, 200);
    const after = await read();
    assert.ok(after.last_contact_at > "2026-01-01T00:00:00.000Z");
    await db.followUp.create({
      data: {
        lead_id: lead.id,
        rep_id: rep.id,
        due_date: new Date("2099-01-01"),
      },
    });
    assert.equal((await read()).last_contact_at, after.last_contact_at);
    console.log(
      "PASS ground call logging, latest contact, and future reminder exclusion",
    );
  } finally {
    await db.followUp.deleteMany({ where: { lead_id: lead.id } });
    await db.callLog.deleteMany({where:{lead_id:lead.id}});
    await db.lead.delete({ where: { id: lead.id } });
  }
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
