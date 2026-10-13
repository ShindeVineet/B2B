import type { PrismaClient } from "@prisma/client";
/** Third and subsequent crossings are keyed by the third event, not by cron execution. */
export async function checkMissedPatterns(db: PrismaClient, now = new Date()) {
  const since = new Date(now.getTime() - 7 * 86400000);
  const events = await db.missedVisit.findMany({
    where: { created_at: { gte: since, lte: now } },
    include: {
      trip_lead: { include: { trip: { select: { ground_rep_id: true } } } },
    },
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
  });
  const groups = new Map<string, typeof events>();
  for (const e of events) {
    const rep = e.trip_lead.trip.ground_rep_id;
    groups.set(rep, [...(groups.get(rep) || []), e]);
  }
  const heads = await db.user.findMany({
    where: { role: "b2b_head", active: true },
    select: { id: true },
  });
  let created = 0;
  for (const list of groups.values()) {
    if (list.length < 3) continue;
    const third = list[2];
    // Once a continuing pattern has been notified, don't notify again as the rolling window shifts.
    const prior = await db.notification.findFirst({
      where: {
        type: "rep_missed_pattern",
        missed_visit_id: { in: list.map((e) => e.id) },
      },
    });
    if (prior) continue;
    const result = await db.notification.createMany({
      data: heads.map((h) => ({
        user_id: h.id,
        type: "rep_missed_pattern" as const,
        missed_visit_id: third.id,
      })),
      skipDuplicates: true,
    });
    created += result.count;
  }
  return { created };
}
