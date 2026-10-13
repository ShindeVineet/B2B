import assert from "node:assert/strict";
import { createServer } from "node:http";
import { prisma } from "../src/lib/prisma";
import { processNextGeocode } from "../src/lib/mapping/jobs";
async function main() {
  const user = await prisma.user.findFirstOrThrow({
    where: { role: "b2b_head", active: true },
  });
  const activeJobs = await prisma.geocodeJob.findMany({
    where: { status: { in: ["queued", "running"] } },
    select: { id: true, status: true },
  });
  await prisma.geocodeJob.updateMany({
    where: { id: { in: activeJobs.map((j) => j.id) } },
    data: { status: "paused" },
  });
  const marker = "v3-queue-check-" + Date.now();
  const lead = await prisma.lead.create({
    data: { company_name: marker, pin_code: "560001" },
  });
  const job = await prisma.geocodeJob.create({
    data: {
      created_by: user.id,
      items: { create: { lead_id: lead.id, search_stage: "external" } },
    },
    include: { items: true },
  });
  const server = createServer((_req, res) => {
    res.writeHead(429, { "Retry-After": "120" });
    res.end("Retry later");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw Error("Server did not start");
  const url = `http://127.0.0.1:${address.port}`;
  process.env.NOMINATIM_SEARCH_URL = url + "/nominatim";
  process.env.OVERPASS_API_URL = url + "/overpass";
  const original = await prisma.geocodeProviderState.findMany();
  try {
    // The real index must already exist. Synthetic names never leave this machine.
    assert.ok(
      (await prisma.osmPoiRefresh.findUnique({ where: { id: "india" } }))
        ?.poi_count,
    );
    await Promise.all([processNextGeocode(), processNextGeocode()]);
    let item = await prisma.geocodeJobItem.findUniqueOrThrow({
      where: { id: job.items[0].id },
    });
    assert.equal(item.status, "retrying");
    assert.equal(item.attempts, 1);
    assert.ok(
      item.next_attempt_at &&
        item.next_attempt_at.getTime() > Date.now() + 90000,
    );
    assert.equal(
      (await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } }))
        .geocode_status,
      null,
    );
    await prisma.geocodeJobItem.update({
      where: { id: item.id },
      data: { attempts: 7, next_attempt_at: new Date(0) },
    });
    await processNextGeocode();
    item = await prisma.geocodeJobItem.findUniqueOrThrow({
      where: { id: item.id },
    });
    assert.equal(item.status, "retrying");
    assert.equal(item.retry_cycles, 1);
    assert.equal(item.attempts, 0);
    assert.ok(item.next_attempt_at!.getTime() > Date.now() + 23 * 3600000);
    console.log(
      "PASS: serialized worker, 429 cooldown persisted, no false Mapping Issue, bounded retry burst and scheduled recovery",
    );
  } finally {
    server.close();
    for (const job of activeJobs)
      await prisma.geocodeJob.update({
        where: { id: job.id },
        data: { status: job.status },
      });
    await prisma.geocodeJobItem.deleteMany({ where: { job_id: job.id } });
    await prisma.geocodeJob.delete({ where: { id: job.id } });
    await prisma.lead.delete({ where: { id: lead.id } });
    for (const state of original)
      await prisma.geocodeProviderState.upsert({
        where: { name: state.name },
        create: state,
        update: { last_request_at: state.last_request_at },
      });
    await prisma.geocodeProviderState.deleteMany({
      where: { name: { notIn: original.map((s) => s.name) } },
    });
  }
}
main()
  .finally(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
