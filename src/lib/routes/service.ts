import type { Prisma } from "@prisma/client";
import type { AuthUser } from "../auth";
import { getLeadFilterForUser, getUserFilterForUser } from "../permissions";
import { RequestError } from "../phase5/http";
import {
  routeDistance,
  orderDay,
  type ClusterLead,
} from "../clustering/cluster-leads";
import { scheduleOf, repCounts } from "../phase5/schedule";
import { working, dateOnly } from "../phase5/calendar";
import { assertEligible } from "./pool";
import { inIndia } from "../location";
import { snapshotRoutes } from "../phase5/snapshots";
export const routeInclude = {
  leads: {
    include: { lead: true },
    orderBy: { sequence_order: "asc" as const },
  },
  rep: { select: { id: true, name: true } },
  visits: {
    include: {
      trip: true,
      consultation: { include: { rep: { select: { name: true } } } },
    },
  },
};
export async function saveGeometry(
  tx: Prisma.TransactionClient,
  id: string,
  stops: ClusterLead[],
) {
  if (stops.some((p) => !inIndia(p)))
    throw new RequestError(
      "Correct missing or invalid stop locations before updating this route",
      409,
    );
  for (const [i, p] of stops.entries())
    await tx.routeLead.update({
      where: { route_id_lead_id: { route_id: id, lead_id: p.id } },
      data: { sequence_order: i + 1 },
    });
  return tx.plannedRoute.update({
    where: { id },
    data: {
      total_distance_km: routeDistance(stops),
      coordinates: stops.map((p) => ({ id: p.id, lat: p.lat, lng: p.lng })),
    },
  });
}
export async function routeById(
  tx: Prisma.TransactionClient,
  id: string,
  user: AuthUser,
) {
  const route = await tx.plannedRoute.findUnique({
    where: { id },
    include: routeInclude,
  });
  if (!route) throw new RequestError("Route not found", 404);
  if (!["b2b_head", "regional_manager"].includes(user.role))
    throw new RequestError("Forbidden", 403);
  return route;
}
export async function capacityFor(
  tx: Prisma.TransactionClient,
  user: AuthUser,
  tripId: string,
  date: string,
  additional: number,
) {
  const plan = await tx.tripPlan.findFirst({
    where: { id: tripId, ground_rep: getUserFilterForUser(user) },
    include: {
      assignment: { include: { weeks: true, capacities: true } },
      ground_rep: { include: { assigned_store: true } },
    },
  });
  if (!plan?.assignment || !["active", "published"].includes(plan.status))
    throw new RequestError("Choose a published plan for this rep", 409);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${plan.ground_rep_id}))`;
  const schedule = scheduleOf(plan.assignment);
  if (!working(date, schedule))
    throw new RequestError(
      "Choose a working day within the plan; extend it first if needed",
      409,
    );
  const used = await repCounts(tx, plan.ground_rep_id);
  let capacity = schedule.capacities[date] ?? schedule.capacity;
  const routeManaged = await tx.plannedRoute.count({
    where: { assigned_trip_id: tripId },
  });
  if (routeManaged && (used[date] || 0) + additional > capacity) {
    capacity = (used[date] || 0) + additional;
    await tx.tripDayCapacity.upsert({
      where: {
        trip_assignment_id_date: {
          trip_assignment_id: plan.assignment.id,
          date: new Date(date),
        },
      },
      create: {
        trip_assignment_id: plan.assignment.id,
        date: new Date(date),
        capacity,
      },
      update: { capacity },
    });
  }
  if ((used[date] || 0) + additional > capacity)
    throw new RequestError(
      `Daily capacity exceeded: ${Math.max(0, capacity - (used[date] || 0))} spaces remain. Edit plan capacity first.`,
      409,
    );
  return { plan, remaining: capacity - (used[date] || 0) };
}
export async function assignStops(
  tx: Prisma.TransactionClient,
  user: AuthUser,
  routeId: string,
  tripId: string,
  date: string,
  stops: ClusterLead[],
) {
  const { plan } = await capacityFor(tx, user, tripId, date, stops.length);
  const leads = await assertEligible(
    tx,
    stops.map((p) => p.id),
    routeId,
  );
  if (
    leads.some(
      (l) =>
        l.assigned_store_id && l.assigned_store_id !== plan.ground_rep.store_id,
    )
  )
    throw new RequestError(
      "A route lead belongs to another store. Remap it before assignment.",
      409,
    );
  if (!plan.ground_rep.assigned_store?.active)
    throw new RequestError(
      "Assign an active base store to this rep first",
      409,
    );
  for (const [i, p] of stops.entries()) {
    await tx.tripLead.create({
      data: {
        route_id: routeId,
        trip_id: tripId,
        lead_id: p.id,
        scheduled_date: new Date(date),
        sequence_order: i + 1,
      },
    });
    await tx.lead.update({
      where: { id: p.id },
      data: {
        assigned_ground_rep_id: plan.ground_rep_id,
        assigned_store_id: plan.ground_rep.store_id,
        assigned_visit_date: new Date(date),
        status: "Assigned",
      },
    });
    await tx.activityLog.create({
      data: {
        lead_id: p.id,
        actor_id: user.id,
        action: "ROUTE_ASSIGNED",
        new_value: JSON.stringify({ route_id: routeId, trip_id: tripId, date }),
      },
    });
  }
  return plan;
}
export async function removePending(
  tx: Prisma.TransactionClient,
  user: AuthUser,
  routeId: string,
  leadId?: string,
) {
  const visits = await tx.tripLead.findMany({
    where: {
      route_id: routeId,
      ...(leadId ? { lead_id: leadId } : {}),
      status: "pending",
      completed: false,
    },
    include: { trip: true, consultation: true },
  });
  for (const v of visits) {
    if (v.consultation) continue;
    await tx.tripLead.delete({ where: { id: v.id } });
    const other = await tx.tripLead.findFirst({
      where: { lead_id: v.lead_id, status: "pending", completed: false },
      include: { trip: true },
      orderBy: { created_at: "desc" },
    });
    await tx.lead.updateMany({
      where: { id: v.lead_id, assigned_ground_rep_id: v.trip.ground_rep_id },
      data: {
        assigned_ground_rep_id: other?.trip.ground_rep_id || null,
        assigned_visit_date: other?.scheduled_date || null,
      },
    });
    await tx.activityLog.create({
      data: {
        lead_id: v.lead_id,
        actor_id: user.id,
        action: "ROUTE_VISIT_UNASSIGNED",
        old_value: JSON.stringify({
          visit_id: v.id,
          route_id: routeId,
          rep_id: v.trip.ground_rep_id,
        }),
      },
    });
  }
  const dates = new Map(
    visits.map((v) => [
      `${v.trip.ground_rep_id}:${dateOnly(v.scheduled_date)}`,
      v,
    ]),
  );
  for (const v of dates.values())
    await snapshotRoutes(tx, v.trip.ground_rep_id, [
      new Date(dateOnly(v.scheduled_date)),
    ]);
}
export async function sequenceRemaining(
  tx: Prisma.TransactionClient,
  id: string,
) {
  const members = await tx.routeLead.findMany({
    where: { route_id: id },
    include: { lead: true },
  });
  const points = members.map((m) => ({
    id: m.lead_id,
    lat: m.lead.lat!,
    lng: m.lead.lng!,
  }));
  return saveGeometry(tx, id, orderDay(points, null));
}
export async function assertScoped(
  tx: Prisma.TransactionClient,
  user: AuthUser,
  ids: string[],
) {
  if (
    (await tx.lead.count({
      where: { id: { in: ids }, AND: [getLeadFilterForUser(user)] },
    })) !== new Set(ids).size
  )
    throw new RequestError("Lead outside your scope", 403);
}
