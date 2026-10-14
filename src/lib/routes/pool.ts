import type { Prisma } from "@prisma/client";
import { visitPoolReason, closedVisit } from "./eligibility";
import { canPlotLead } from "../mapping/visibility";
import { RequestError } from "../phase5/http";
export async function leadEligibility(
  tx: Prisma.TransactionClient,
  ids: string[],
  ownRoute?: string,
  excludeVisits: string[] = [],
) {
  const holders = await tx.plannedRoute.findMany({
    where: {
      status: { in: ["draft", "ready"] },
      ...(ownRoute ? { id: { not: ownRoute } } : {}),
    },
    select: { remainder_lead_ids: true },
  });
  const held = new Set(
    holders.flatMap((r) =>
      Array.isArray(r.remainder_lead_ids)
        ? r.remainder_lead_ids.filter(
            (id): id is string => typeof id === "string",
          )
        : [],
    ),
  );
  const leads = await tx.lead.findMany({
    where: { id: { in: ids } },
    include: {
      route_memberships: {
        where: {
          route_id: ownRoute ? { not: ownRoute } : undefined,
          route: { status: { in: ["draft", "ready", "assigned"] } },
        },
      },
      trip_leads: {
        where: { id: { notIn: excludeVisits } },
        include: { trip: true, consultation: true },
        orderBy: [
          { created_at: "desc" },
          { scheduled_date: "desc" },
          { id: "desc" },
        ],
      },
      consultations: { orderBy: { created_at: "desc" }, take: 1 },
    },
  });
  return leads.map((l) => {
    const latest = l.trip_leads[0];
    // Legacy visits predate visit-linked consultations: use latest lead consultation only for those rows.
    const visit = latest
      ? {
          ...latest,
          consultation:
            latest.consultation ||
            l.consultations.find(
              (c) =>
                c.rep_id === latest.trip.ground_rep_id &&
                c.visit_date.toISOString().slice(0, 10) ===
                  latest.scheduled_date.toISOString().slice(0, 10),
            ) ||
            null,
        }
      : null;
    const unresolved = l.trip_leads.some(
      (v) => !closedVisit(v) && !["skipped", "cancelled"].includes(v.status),
    );
    const reason = l.intake_team === "caller"
      ? "In Calling Queue — complete or verify its location before route planning"
      : l.intake_team !== "ground" && !l.assigned_ground_rep_id
      ? "Owned by the intake team — a manager must assign a ground rep before route planning"
      : !canPlotLead(l)
      ? "Resolve Mapping Issues first"
      : visitPoolReason(
          visit,
          unresolved,
          l.route_memberships.length > 0 || held.has(l.id),
        );
    return { lead: l, reason };
  });
}
export async function assertEligible(
  tx: Prisma.TransactionClient,
  ids: string[],
  ownRoute?: string,
  excludeVisits: string[] = [],
) {
  for (const id of [...new Set(ids)].sort())
    await tx.$queryRaw`SELECT id FROM leads WHERE id=${id} FOR UPDATE`;
  const rows = await leadEligibility(tx, ids, ownRoute, excludeVisits);
  const invalid = rows.find((r) => r.reason);
  if (rows.length !== new Set(ids).size)
    throw new RequestError("Some selected leads no longer exist", 409);
  if (invalid)
    throw new RequestError(
      `${invalid.lead.company_name}: ${invalid.reason}`,
      409,
    );
  return rows.map((r) => r.lead);
}
