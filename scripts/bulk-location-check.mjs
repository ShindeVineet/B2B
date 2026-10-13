import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import assert from "node:assert/strict";
const db = new PrismaClient();
const ids = [];
try {
  const user = await db.user.findFirstOrThrow({
    where: { role: "b2b_head", active: true },
  });
  const fixtures = [];
  for (const reason of [
    "Imported matched name differs from firm; confirm location",
    "not_found",
    "Imported matched name differs from firm; confirm location",
  ]) {
    const l = await db.lead.create({
      data: {
        company_name: "Bulk location check fixture",
        lat: 12.97,
        lng: 77.59,
        geocode_status: "mismatch_flagged",
        geocode_issue_reason: reason,
      },
    });
    ids.push(l.id);
    fixtures.push(l);
  }
  const payload = fixtures.map((l) => ({
    id: l.id,
    lat: l.lat,
    lng: l.lng,
    updated_at: l.updated_at.toISOString(),
  }));
  payload[2].lat = 13;
  const r = await fetch("http://127.0.0.1:3000/api/mapping-issues/confirm", {
    method: "POST",
    headers: {
      Authorization:
        "Bearer " + jwt.sign({ id: user.id }, process.env.JWT_SECRET),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ leads: payload }),
  });
  const result = await r.json();
  assert.equal(r.status, 200, JSON.stringify(result));
  assert.deepEqual(result, { confirmed: 1, skipped: 2 });
  const saved = await db.lead.findMany({ where: { id: { in: ids } } });
  assert.equal(saved.filter((l) => l.location_verified).length, 1);
  console.log(
    "PASS bulk confirmation accepts only name mismatches and skips other reasons and stale coordinates",
  );
} finally {
  await db.lead.deleteMany({ where: { id: { in: ids } } });
  await db.$disconnect();
}
