import { clusterSpan } from "../clustering/cluster-leads";
import type { Prisma } from "@prisma/client";
import { canPlotLead } from "@/lib/mapping/visibility";
import { distanceKm } from "@/lib/location";
import { RequestError } from "./http";
export async function snapshotRoutes(
  tx: Prisma.TransactionClient,
  repId: string,
  dates: Date[],
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${repId}))`;
  const snapshots = [];
  for (const day of dates) {
    const end = new Date(day.getTime() + 86400000);
    const assignedStops = await tx.tripLead.findMany({
      where: {
        trip: { ground_rep_id: repId, status: { in: ["active", "published"] } },
        scheduled_date: { gte: day, lt: end },
      },
      include: { lead: true },
      orderBy: [{ sequence_order: "asc" }, { id: "asc" }],
    });
    const stops = assignedStops;
    if (stops.some((s) => !canPlotLead(s.lead)))
      throw new RequestError(
        "Correct missing or invalid locations before publishing.",
      );
    const coordinates = stops.map((s) => ({
      lat: s.lead.lat!,
      lng: s.lead.lng!,
    }));
    const previous = await tx.routeSnapshot.findFirst({
      where: { ground_rep_id: repId, route_date: day },
      orderBy: { version: "desc" },
    });
    snapshots.push(
      await tx.routeSnapshot.create({
        data: {
          ground_rep_id: repId,
          route_date: day,
          ordered_lead_ids: stops.map((s) => s.lead_id),
          trip_lead_ids: stops.map((s) => s.id),
          coordinates,
          cluster_span_km: clusterSpan(coordinates),
          total_distance_km: coordinates.reduce(
            (sum, p, i) => sum + (i ? distanceKm(coordinates[i - 1], p) : 0),
            0,
          ),
          version: (previous?.version || 0) + 1,
        },
      }),
    );
  }
  return snapshots;
}
