import { canPlotLead } from "@/lib/mapping/visibility";
import { refreshAllotment } from "@/lib/assignment/allotment";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  canAssignLeads,
  getLeadFilterForUser,
  getStoreFilterForUser,
} from "@/lib/permissions";
import { resolveAssignment } from "@/lib/assignment/validate";
import { matchLeadStore } from "@/lib/assignment/store-match";
import { RequestError, failure } from "@/lib/phase5/http";
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user || !canAssignLeads(user))
      throw new RequestError("Only the B2B Head can change lead assignments", 403);
    const {
      leadIds,
      storeId,
      repId,
      autoAssignToNearest = false,
      status,
    } = await req.json();
    if (
      !Array.isArray(leadIds) ||
      !leadIds.length ||
      leadIds.some((id) => typeof id !== "string")
    )
      throw new RequestError("Select leads to assign");
    const ids = [...new Set<string>(leadIds)];
    const leads = await prisma.lead.findMany({
      where: { id: { in: ids }, AND: [getLeadFilterForUser(user)] },
      include: { ground_rep: { select: { store_id: true } } },
    });
    if (leads.length !== ids.length)
      throw new RequestError("Lead outside your scope", 403);
    let assignedCount = 0,
      unmappedCount = 0;
    if (autoAssignToNearest) {
      const stores = await prisma.store.findMany({
        where: { active: true, AND: [getStoreFilterForUser(user)] },
        include: { service_pincodes: true },
      });
      const assignments = leads.map((lead) => ({
        lead,
        match: matchLeadStore(lead, stores),
      }));
      await prisma.$transaction(async (tx) => {
        for (const { lead, match } of assignments) {
          if (
            !canPlotLead(lead) ||
            !match.store ||
            lead.assigned_store_id ||
            lead.assigned_ground_rep_id
          ) {
            unmappedCount++;
            continue;
          }
          await refreshAllotment(tx, lead.id, user.id);
          const assigned = await tx.lead.findUniqueOrThrow({
            where: { id: lead.id },
          });
          if (assigned.assigned_store_id) assignedCount++;
          else unmappedCount++;
        }
      });
    } else {
      const target = await resolveAssignment(user, repId, storeId, leads);
      const data = {
        ...(target !== undefined ? { assigned_store_id: target || null } : {}),
        ...(repId !== undefined
          ? { assigned_ground_rep_id: repId || null }
          : {}),
        ...(status ? { status } : {}),
      };
      assignedCount = await prisma.$transaction(async (tx) => {
        for (const id of [...ids].sort())
          await tx.$queryRaw`SELECT id FROM leads WHERE id = ${id} FOR UPDATE`;
        if (
          (target || repId) &&
          (await tx.lead.findMany({ where: { id: { in: ids } } })).some(
            (l) => !canPlotLead(l),
          )
        )
          throw new RequestError(
            "Resolve Mapping Issues before assignment",
            409,
          );
        const result = await tx.lead.updateMany({
          where: { id: { in: ids } },
          data,
        });
        if (!status && (target || repId))
          await tx.lead.updateMany({
            where: { id: { in: ids }, status: "New" },
            data: { status: "Assigned" },
          });
        await tx.activityLog.createMany({
          data: leads.map((l) => ({
            lead_id: l.id,
            actor_id: user.id,
            action: "BULK_ASSIGNED",
            old_value: JSON.stringify({
              assigned_store_id: l.assigned_store_id,
              assigned_ground_rep_id: l.assigned_ground_rep_id,
            }),
            new_value: JSON.stringify(data),
          })),
        });
        return result.count;
      });
    }
    return NextResponse.json({
      success: true,
      assignedCount,
      unmappedCount,
      message: unmappedCount
        ? `${unmappedCount} leads need review: use Re-check Allotment to review changes, resolve Mapping Issues, or select overlapping service PIN coverage.`
        : undefined,
    });
  } catch (e) {
    return failure(e);
  }
}
