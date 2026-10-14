import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  canAssignLeads,
  getLeadFilterForUser,
  getStoreFilterForUser,
} from "@/lib/permissions";
import {
  allotmentSuggestion,
  refreshAllotment,
} from "@/lib/assignment/allotment";
import { failure, RequestError } from "@/lib/phase5/http";
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user || !canAssignLeads(user))
      throw new RequestError("Only the B2B Head can change lead assignments", 403);
    const body = await req.json();
    if (
      !Array.isArray(body.leadIds) ||
      !body.leadIds.length ||
      body.leadIds.length > 5000 ||
      body.leadIds.some((id: unknown) => typeof id !== "string")
    )
      throw new RequestError("Select 1–5000 leads");
    if (!["preview", "confirm"].includes(body.action))
      throw new RequestError("Choose preview or confirm");
    const ids = [...new Set<string>(body.leadIds)].sort();
    const rows = await prisma.$transaction(
      async (tx) => {
        // Row locks serialize confirmation against concurrent location/assignment edits.
        for (const id of ids)
          await tx.$queryRaw`SELECT id FROM leads WHERE id = ${id} FOR UPDATE`;
        const leads = await tx.lead.findMany({
          where: { id: { in: ids }, AND: [getLeadFilterForUser(user)] },
          include: {
            store: true,
            ground_rep: { select: { store_id: true, name: true } },
          },
        });
        if (leads.length !== ids.length)
          throw new RequestError("Lead outside your scope", 403);
        const stores = await tx.store.findMany({
          where: { active: true },
          include: { service_pincodes: true },
        });
        const permitted = new Set(
          (
            await tx.store.findMany({
              where: { active: true, AND: [getStoreFilterForUser(user)] },
              select: { id: true },
            })
          ).map((s) => s.id),
        );
        const results = [];
        for (const lead of leads) {
          const match = allotmentSuggestion(lead, stores);
          const target = match?.store;
          const blocked = !match
            ? "Resolve Mapping Issues first"
            : match.kind === "overlap"
              ? "Overlapping service PINs: select a store manually"
              : !target
                ? "No active store found"
                : !permitted.has(target.id)
                  ? "Suggested store is outside your region; ask the B2B Head"
                  : lead.ground_rep && lead.ground_rep.store_id !== target.id
                    ? "Reassign or clear the team member before confirming another store"
                    : null;
          if (body.action === "confirm") {
            const expected = body.expected?.[lead.id];
            if (!target || blocked)
              throw new RequestError(blocked || "No suggestion", 409);
            if (
              !expected ||
              expected.store_id !== target.id ||
              expected.updated_at !== lead.updated_at.toISOString()
            )
              throw new RequestError(
                "Lead or suggestion changed. Re-check allotment before confirming.",
                409,
              );
            await tx.lead.update({
              where: { id: lead.id },
              data: {
                assigned_store_id: target.id,
                ...(lead.status === "New" ? { status: "Assigned" } : {}),
              },
            });
            await tx.activityLog.create({
              data: {
                lead_id: lead.id,
                actor_id: user.id,
                action: "ALLOTMENT_CONFIRMED",
                old_value: lead.assigned_store_id,
                new_value: target.id,
              },
            });
          } else if (!blocked) await refreshAllotment(tx, lead.id, user.id);
          const current = await tx.lead.findUniqueOrThrow({
            where: { id: lead.id },
            include: { store: true },
          });
          results.push({
            id: lead.id,
            lead_code: lead.lead_code,
            company_name: lead.company_name,
            current_store: current.store?.name || "Unassigned",
            suggested_store: target
              ? { id: target.id, name: target.name }
              : null,
            updated_at: current.updated_at.toISOString(),
            changed: !!target && current.assigned_store_id !== target.id,
            blocked,
            source: match?.kind || null,
          });
        }
        return results;
      },
      { timeout: 60000 },
    );
    return NextResponse.json({ rows });
  } catch (e) {
    return failure(e);
  }
}
