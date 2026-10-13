import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
const db = new PrismaClient();
const tag = `import-queue-check-${Date.now()}-`;
try {
  const head = await db.user.findFirstOrThrow({
    where: { role: "b2b_head", active: true },
  });
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${jwt.sign({ id: head.id }, process.env.JWT_SECRET, { expiresIn: "10m" })}`,
  };
  const post = async (rows) => {
    const r = await fetch("http://127.0.0.1:3000/api/leads/bulk-import", {
      method: "POST",
      headers,
      body: JSON.stringify({ rows }),
    });
    return { status: r.status, data: await r.json() };
  };
  const invalid = await post([
    { company_name: tag + "valid" },
    { company_name: tag + "invalid", phone_no: "Test Person" },
  ]);
  assert.equal(invalid.status, 400);
  assert.match(invalid.data.error, /Data row 2/);
  assert.equal(
    await db.lead.count({ where: { company_name: { startsWith: tag } } }),
    0,
  );
  // No PIN/address: synthetic rows cannot trigger public provider requests.
  const rows = Array.from({ length: 3211 }, (_, i) => ({
    company_name: tag + i,
    phone_no: String(8000000000 + i),
    pin_code: "",
  }));
  const start = Date.now();
  const result = await post(rows);
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.equal(result.data.totalImported, 3211);
  assert.equal(result.data.queuedCount, 3211);
  assert.ok(result.data.geocodeJobId);
  assert.equal(
    await db.geocodeJobItem.count({
      where: { job_id: result.data.geocodeJobId },
    }),
    3211,
  );
  const progress = await fetch(
    `http://127.0.0.1:3000/api/geocoding/jobs?id=${result.data.geocodeJobId}`,
    { headers },
  );
  const body = await progress.json();
  assert.equal(body.jobs[0].total, 3211);
  const deadline = Date.now() + 15000;
  let processed = 0;
  while (Date.now() < deadline) {
    processed = await db.geocodeJobItem.count({ where: { job_id: result.data.geocodeJobId, status: { in: ["accepted", "issue", "skipped", "error"] } } });
    if (processed) break;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  assert.ok(processed > 0, "Background worker must process queued import rows");
  console.log(
    `PASS: invalid-cell atomic validation, 3211-row save + persistent queue (${Date.now() - start}ms), scoped progress`,
  );
} finally {
  const leads = await db.lead.findMany({
    where: { company_name: { startsWith: tag } },
    select: { id: true },
  });
  const ids = leads.map((l) => l.id);
  const items = await db.geocodeJobItem.findMany({
    where: { lead_id: { in: ids } },
    select: { job_id: true },
  });
  await db.geocodeJobItem.deleteMany({ where: { lead_id: { in: ids } } });
  await db.geocodeJob.deleteMany({
    where: { id: { in: [...new Set(items.map((i) => i.job_id))] } },
  });
  await db.activityLog.deleteMany({ where: { lead_id: { in: ids } } });
  await db.leadPhone.deleteMany({ where: { lead_id: { in: ids } } });
  await db.lead.deleteMany({ where: { id: { in: ids } } });
  await db.$disconnect();
}
