import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
try {
  const auditedId = process.argv
    .find((arg) => arg.startsWith("--audited-job="))
    ?.split("=")[1];
  if (!auditedId) throw Error("Pass the audited job ID");
  const source = await p.geocodeJob.findUniqueOrThrow({
    where: { id: auditedId },
    include: { items: true },
  });
  const jobs = await p.geocodeJob.findMany({
    where: { status: { in: ["queued", "running", "paused"] } },
    orderBy: { created_at: "desc" },
    include: { items: true },
  });
  const newest = jobs.find(
    (j) =>
      j.id !== source.id &&
      j.created_by === source.created_by &&
      j.created_at > source.created_at &&
      source.items.every((item) =>
        j.items.some((i) => i.lead_id === item.lead_id),
      ),
  );
  await p.$transaction(
    async (tx) => {
      if (newest)
        for (const item of source.items) {
          await tx.geocodeJobItem.updateMany({
            where: { job_id: newest.id, lead_id: item.lead_id },
            data: {
              status: item.status,
              search_stage: item.search_stage,
              attempts: item.attempts,
              retry_cycles: item.retry_cycles,
              error: item.error,
              lease_until: null,
              next_attempt_at: item.next_attempt_at,
            },
          });
        }
      const seen = new Set();
      let duplicates = 0;
      for (const job of jobs) {
        const skip = [];
        for (const item of job.items) {
          if (
            seen.has(item.lead_id) &&
            ["pending", "processing", "retrying"].includes(item.status)
          )
            skip.push(item.id);
          else seen.add(item.lead_id);
        }
        if (skip.length) {
          await tx.geocodeJobItem.updateMany({
            where: { id: { in: skip } },
            data: {
              status: "skipped",
              error: null,
              lease_until: null,
              next_attempt_at: null,
            },
          });
          duplicates += skip.length;
        }
        const remaining = await tx.geocodeJobItem.count({
          where: {
            job_id: job.id,
            status: { in: ["pending", "processing", "retrying"] },
          },
        });
        if (!remaining)
          await tx.geocodeJob.update({
            where: { id: job.id },
            data: { status: "completed", finished_at: new Date() },
          });
      }
      console.log(
        JSON.stringify({
          activeJob: newest?.id || source.id,
          duplicateQueuedItemsRemoved: duplicates,
        }),
      );
    },
    { timeout: 60000 },
  );
} finally {
  await p.$disconnect();
}
