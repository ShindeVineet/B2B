import { getStoreFilterForUser } from "../permissions";
import type { Prisma } from "@prisma/client";
import { canPlotLead } from "../mapping/visibility";
import { matchLeadStore, type ServiceStore } from "./store-match";
export function allotmentSuggestion(
  lead: Parameters<typeof matchLeadStore>[0],
  stores: readonly ServiceStore[],
) {
  return canPlotLead(lead) ? matchLeadStore(lead, stores) : null;
}
/** Runs in the same transaction as a location write. Published plans are never rewritten. */
export async function refreshAllotment(
  tx: Prisma.TransactionClient,
  leadId: string,
  actorId: string,
) {
  await tx.$queryRaw`SELECT id FROM leads WHERE id = ${leadId} FOR UPDATE`;
  const lead = await tx.lead.findUniqueOrThrow({ where: { id: leadId } });
  const stores = await tx.store.findMany({
    where: { active: true },
    include: { service_pincodes: true },
  });
  const match = allotmentSuggestion(lead, stores);
  if (!match?.store) return;
  const actor = await tx.user.findUniqueOrThrow({ where: { id: actorId } });
  const permitted = await tx.store.count({
    where: { id: match.store.id, AND: [getStoreFilterForUser(actor)] },
  });
  const published = await tx.tripLead.count({
    where: {
      lead_id: leadId,
      trip: { status: { in: ["active", "published"] } },
    },
  });
  const publishedSnapshot = await tx.routeSnapshot.count({
    where: { ordered_lead_ids: { array_contains: [leadId] } },
  });
  if (
    !lead.assigned_store_id &&
    !lead.assigned_ground_rep_id &&
    !published &&
    !publishedSnapshot &&
    permitted > 0
  ) {
    await tx.lead.update({
      where: { id: leadId },
      data: {
        assigned_store_id: match.store.id,
        ...(lead.status === "New" ? { status: "Assigned" } : {}),
      },
    });
    await tx.activityLog.create({
      data: {
        lead_id: leadId,
        actor_id: actorId,
        action: "ALLOTMENT_AUTO_ASSIGNED",
        old_value: null,
        new_value: JSON.stringify({
          store_id: match.store.id,
          source: match.kind,
        }),
      },
    });
  } else if (lead.assigned_store_id !== match.store.id) {
    const value = JSON.stringify({
      from: lead.assigned_store_id,
      to: match.store.id,
      source: match.kind,
    });
    const last = await tx.activityLog.findFirst({
      where: { lead_id: leadId, action: "ALLOTMENT_REVIEW_REQUIRED" },
      orderBy: { created_at: "desc" },
    });
    if (last?.new_value !== value)
      await tx.activityLog.create({
        data: {
          lead_id: leadId,
          actor_id: actorId,
          action: "ALLOTMENT_REVIEW_REQUIRED",
          old_value: lead.assigned_store_id,
          new_value: value,
        },
      });
  }
}
