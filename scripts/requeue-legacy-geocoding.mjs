import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
try {
  const result = await db.$transaction(async (tx) => {
    const jobs = await tx.geocodeJob.findMany({
      where: { items: { some: { status: "error" } } },
      select: { id: true },
    });
    const changed = await tx.geocodeJobItem.updateMany({
      where: { status: "error" },
      data: {
        status: "retrying",
        attempts: 0,
        retry_cycles: { increment: 1 },
        next_attempt_at: new Date(),
        lease_until: null,
        search_stage: "local",
        error: "Recovered legacy transient failure; local-first retry queued",
      },
    });
    await tx.geocodeJob.updateMany({
      where: { id: { in: jobs.map((j) => j.id) } },
      data: { status: "queued", finished_at: null },
    });
    return changed.count;
  });
  console.log(
    `Recovered ${result} legacy errors as local-first automatic retries`,
  );
} finally {
  await db.$disconnect();
}
