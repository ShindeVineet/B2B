import assert from "node:assert/strict";
import { writeFileSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import Papa from "papaparse";
import { NextRequest } from "next/server";
import { prisma as db } from "../../src/lib/prisma";
import { signToken } from "../../src/lib/auth";
import { GET } from "../../src/app/api/legacy-data/route";
import { TEAM_PERSONAS } from "../../src/lib/personas";
async function main() {
  if (!process.env.DATABASE_URL?.includes("/leadmap_phase9_test"))
    throw Error("Isolated database required");
  for (const person of TEAM_PERSONAS) {
    await db.user.upsert({
      where: { email: person.email },
      create: {
        name: person.name,
        email: person.email,
        role: person.role,
        password_hash: "test-only",
      },
      update: { name: person.name, role: person.role },
    });
  }
  const head = await db.user.findUniqueOrThrow({
    where: { email: TEAM_PERSONAS[0].email },
  });
  const rep = await db.user.findUniqueOrThrow({
    where: { email: TEAM_PERSONAS[1].email },
  });
  const company = "Legacy check " + Date.now();
  const file = "/private/tmp/legacy-check.csv";
  const base = {
    Timestamp: "01/07/2026 10:00:00",
    "Company name ": company,
    "Interest Level": "medium",
    "Name of Ground Executive": rep.name,
    "Mobile Number": "9876543210",
    "Lead Outcome": "Nurturing required",
    "Decision Maker Name": "Test Contact",
    "Next Follow-up Date": "05/07/2026",
  };
  writeFileSync(
    file,
    Papa.unparse([
      base,
      {
        ...base,
        Timestamp: "02/07/2026 11:00:00",
        "Interest Level": "High",
        "Next Follow-up Date": "",
      },
    ]),
  );
  const run = () => {
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/import-legacy-consultations.ts",
        file,
        "--apply",
      ],
      { encoding: "utf8", env: process.env },
    );
    assert.equal(result.status, 0, result.stderr + result.stdout);
    return JSON.parse(result.stdout);
  };
  try {
    const report = run();
    assert.equal(report.newLeads, 1);
    assert.equal(report.consultations, 2);
    const lead = await db.lead.findFirstOrThrow({
      where: { company_name: company },
      include: {
        consultations: { orderBy: { created_at: "desc" } },
        follow_up: true,
      },
    });
    assert.equal(lead.lead_source, "old_data");
    assert.equal(lead.assigned_ground_rep_id, rep.id);
    assert.equal(lead.consultations[0].interest_level, "High");
    assert.equal(lead.consultations.length, 2);
    assert.equal(
      lead.follow_up?.due_date.toISOString().slice(0, 10),
      "2026-07-05",
    );
    const again = run();
    assert.equal(again.alreadyImported, 2);
    assert.equal(again.newLeads, 0);
    const get = (user = head) =>
      GET(
        new NextRequest(
          "http://localhost/api/legacy-data?tab=all&q=" +
            encodeURIComponent(company),
          { headers: { authorization: "Bearer " + signToken(user) } },
        ),
      );
    const response = await get();
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.total, 1);
    assert.equal(data.rows[0].consultationCount, 2);
    assert.equal(data.rows[0].onboarding, "Not onboarded");
    assert.equal((await get(rep)).status, 403);
    console.log(
      "PASS historical import, repeat consultations, interest/executive mapping, follow-up dates, idempotency and admin-only review",
    );
  } finally {
    unlinkSync(file);
  }
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
