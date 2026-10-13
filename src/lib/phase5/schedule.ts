import type {
  TripAssignment,
  TripWeekOverride,
  TripDayCapacity,
  Prisma,
} from "@prisma/client";
import { dateOnly, type Schedule } from "./calendar";
export function scheduleOf(
  a: TripAssignment & {
    weeks: TripWeekOverride[];
    capacities: TripDayCapacity[];
  },
): Schedule {
  return {
    start: dateOnly(a.start_date),
    end: dateOnly(a.end_date),
    base: a.base_working_days as string[],
    weeks: Object.fromEntries(
      a.weeks.map((w) => [
        dateOnly(w.week_start_date),
        w.working_days as string[],
      ]),
    ),
    capacity: a.leads_per_day_default,
    capacities: Object.fromEntries(
      a.capacities.map((c) => [dateOnly(c.date), c.capacity]),
    ),
  };
}
export async function repCounts(
  tx: Prisma.TransactionClient,
  rep: string,
  exclude: string[] = [],
) {
  const visits = await tx.tripLead.findMany({
    where: {
      trip: { ground_rep_id: rep, status: { not: "completed" } },
      id: { notIn: exclude },
    },
    select: { scheduled_date: true },
  });
  const counts: Record<string, number> = {};
  for (const v of visits) {
    const d = dateOnly(v.scheduled_date);
    counts[d] = (counts[d] || 0) + 1;
  }
  return counts;
}
