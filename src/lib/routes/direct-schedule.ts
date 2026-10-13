import type { Prisma } from "@prisma/client";
import type { AuthUser } from "../auth";
import { getUserFilterForUser } from "../permissions";
import { dateOnly, validDays, working } from "../phase5/calendar";
import { scheduleOf, repCounts } from "../phase5/schedule";
import { RequestError } from "../phase5/http";
import { inIndia } from "../location";
export async function routeDayAvailability(
  tx: Prisma.TransactionClient,
  user: AuthUser,
  repId: string,
  date: string,
  requestedCapacity: number,
) {
  dateOnly(date);
  if (
    !Number.isInteger(requestedCapacity) ||
    requestedCapacity < 1 ||
    requestedCapacity > 100
  )
    throw new RequestError("Daily capacity must be between 1 and 100");
  const rep = await tx.user.findFirst({
    where: {
      id: repId,
      active: true,
      role: { in: ["ground_rep", "regional_manager", "b2b_head"] },
      AND: [getUserFilterForUser(user)],
    },
    include: { assigned_store: true },
  });
  if (!rep?.assigned_store?.active || !inIndia(rep.assigned_store))
    throw new RequestError(
      "Choose a team member with an active store and confirmed store location",
      409,
    );
  const existing = await tx.tripAssignment.findMany({
    where: {
      ground_rep_id: repId,
      start_date: { lte: new Date(date) },
      end_date: { gte: new Date(date) },
      trip: { status: { in: ["active", "published"] } },
    },
    include: { weeks: true, capacities: true },
  });
  const limits = existing.map((a) => {
    const s = scheduleOf(a);
    return working(date, s) ? (s.capacities[date] ?? s.capacity) : 0;
  });
  const capacity = Math.min(requestedCapacity, ...limits);
  const counts = await repCounts(tx, repId);
  return {
    rep,
    capacity,
    used: counts[date] || 0,
    remaining: Math.max(0, capacity - (counts[date] || 0)),
    existing_limit: limits.length ? Math.min(...limits) : null,
  };
}
export async function createRouteCalendar(
  tx: Prisma.TransactionClient,
  user: AuthUser,
  input: {
    rep_id: string;
    date: string;
    end_date: string;
    capacity: number;
    working_days: string[];
    name: string;
  },
) {
  const start = dateOnly(input.date),
    end = dateOnly(input.end_date);
  if (
    end < start ||
    new Date(end).getTime() - new Date(start).getTime() > 366 * 86400000
  )
    throw new RequestError("Choose a scheduling range of at most one year");
  if (!validDays(input.working_days) || !input.working_days.length)
    throw new RequestError("Choose working days");
  if (
    !working(start, {
      start,
      end,
      base: input.working_days,
      weeks: {},
      capacity: input.capacity,
      capacities: {},
    })
  )
    throw new RequestError(
      "The visit date must be one of the selected working days",
    );
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.rep_id}))`;
  const rep = await tx.user.findFirst({
    where: {
      id: input.rep_id,
      active: true,
      role: { in: ["ground_rep", "regional_manager", "b2b_head"] },
      AND: [getUserFilterForUser(user)],
    },
    include: { assigned_store: true },
  });
  if (!rep?.assigned_store?.active || !inIndia(rep.assigned_store))
    throw new RequestError(
      "Choose a team member with an active store and confirmed store location",
      409,
    );
  const used = await repCounts(tx, input.rep_id);
  const available = { capacity: (used[start] || 0) + input.capacity };
  return tx.tripPlan.create({
    data: {
      name: input.name,
      ground_rep_id: input.rep_id,
      start_date: new Date(start),
      end_date: new Date(end),
      leads_per_day: available.capacity,
      status: "published",
      assignment: {
        create: {
          ground_rep_id: input.rep_id,
          assigning_manager_id: user.id,
          start_date: new Date(start),
          end_date: new Date(end),
          leads_per_day_default: available.capacity,
          base_working_days: input.working_days,
        },
      },
    },
  });
}
