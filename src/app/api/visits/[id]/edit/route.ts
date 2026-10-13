import { sequenceRemaining } from "@/lib/routes/service";
import { snapshotRoutes } from "@/lib/phase5/snapshots";
import { assertEligible } from "@/lib/routes/pool";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  canUserManageLeads,
  getUserFilterForUser,
  getLeadFilterForUser,
} from "@/lib/permissions";
import { RequestError, failure } from "@/lib/phase5/http";
import { dateOnly, working } from "@/lib/phase5/calendar";
import { scheduleOf, repCounts } from "@/lib/phase5/schedule";
import { canPlotLead } from "@/lib/mapping/visibility";
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const u = await getCurrentUser(req);
    if (!u || !canUserManageLeads(u)) throw new RequestError("Forbidden", 403);
    const { id } = await params,
      b = await req.json(),
      date = dateOnly(b.date);
    const result = await prisma.$transaction(
      async (tx) => {
        const v = await tx.tripLead.findFirst({
          where: {
            id,
            lead: getLeadFilterForUser(u),
            trip: { ground_rep: getUserFilterForUser(u) },
          },
          include: {
            trip: {
              include: {
                assignment: { include: { weeks: true, capacities: true } },
                ground_rep: { include: { assigned_store: true } },
              },
            },
          },
        });
        if (!v?.trip.assignment) throw new RequestError("Visit not found", 404);
        if (
          v.completed ||
          v.status === "visited" ||
          v.trip.status === "completed"
        )
          throw new RequestError("Completed visits cannot be edited", 409);
        if (
          b.expected_date !== dateOnly(v.scheduled_date) ||
          b.expected_lead_id !== v.lead_id
        )
          throw new RequestError(
            "This visit changed. Refresh and try again.",
            409,
          );
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${v.trip.ground_rep_id}))`;
        if (v.route_id && b.confirm !== true) throw new RequestError("Confirm moving this visit out of its saved route",409);
        const s = scheduleOf(v.trip.assignment);
        if (date < s.start || date > s.end)
          throw new RequestError(
            "Extend the plan first before moving a visit beyond its end date.",
          );
        if (!working(date, s))
          throw new RequestError("Choose a working day in this plan.");
        const counts = await repCounts(tx, v.trip.ground_rep_id, [v.id]);
        if ((counts[date] || 0) >= (s.capacities[date] ?? s.capacity))
          throw new RequestError(
            "That day is full. Choose another working day or edit its daily capacity.",
            409,
          );
        const leadId = typeof b.lead_id === "string" ? b.lead_id : v.lead_id;
        const lead = await tx.lead.findFirst({
          where: { id: leadId, AND: [getLeadFilterForUser(u)] },
        });
        if (!lead) throw new RequestError("Lead not found", 404);
        if (leadId !== v.lead_id) {
          await assertEligible(tx, [leadId]);
          const base = v.trip.ground_rep.assigned_store;
          if (!base?.active)
            throw new RequestError(
              "Assign an active base store before adding replacement leads",
              409,
            );
          if (lead.assigned_store_id && lead.assigned_store_id !== base.id)
            throw new RequestError(
              "Replacement lead belongs to another store",
              409,
            );
        }
        if (!canPlotLead(lead))
          throw new RequestError(
            "Resolve this lead’s Mapping Issue before adding it to a plan.",
          );
        if (
          lead.assigned_ground_rep_id &&
          lead.assigned_ground_rep_id !== v.trip.ground_rep_id
        )
          throw new RequestError(
            "Reassign this lead to the plan’s rep before scheduling it.",
          );
        if (
          await tx.tripLead.count({
            where: {
              id: { not: id },
              lead_id: leadId,
              scheduled_date: new Date(date),
              trip: { status: { not: "completed" } },
            },
          })
        )
          throw new RequestError(
            "This lead already has a visit on that day.",
            409,
          );
        if (v.route_id) {
          await tx.routeLead.deleteMany({where:{route_id:v.route_id,lead_id:v.lead_id}});
          await sequenceRemaining(tx,v.route_id);
        }
        const updated = await tx.tripLead.update({
          where: { id },
          data: { lead_id: leadId, scheduled_date: new Date(date), route_id: null },
        });
        await tx.lead.update({
          where: { id: leadId },
          data: {
            assigned_ground_rep_id: v.trip.ground_rep_id,
            ...(leadId !== v.lead_id
              ? { assigned_store_id: v.trip.ground_rep.store_id }
              : {}),
            assigned_visit_date: new Date(date),
            ...(lead.status === "New" ? { status: "Assigned" } : {}),
          },
        });
        if (leadId !== v.lead_id) {
          const other = await tx.tripLead.findFirst({
            where: {
              lead_id: v.lead_id,
              trip: { status: { not: "completed" } },
            },
            orderBy: { scheduled_date: "asc" },
          });
          await tx.lead.update({
            where: { id: v.lead_id },
            data: { assigned_visit_date: other?.scheduled_date ?? null },
          });
        }
        if (v.route_id) await snapshotRoutes(tx,v.trip.ground_rep_id,[...new Set([dateOnly(v.scheduled_date),date])].map(d=>new Date(d)));
        await tx.activityLog.create({
          data: {
            lead_id: v.lead_id,
            actor_id: u.id,
            action: "VISIT_EDITED",
            old_value: JSON.stringify({
              lead_id: v.lead_id,
              date: dateOnly(v.scheduled_date),
            }),
            new_value: JSON.stringify({ lead_id: leadId, date, visit_id: id }),
          },
        });
        if (leadId !== v.lead_id)
          await tx.activityLog.create({
            data: {
              lead_id: leadId,
              actor_id: u.id,
              action: "VISIT_ASSIGNED",
              new_value: JSON.stringify({
                visit_id: id,
                date,
                rep_id: v.trip.ground_rep_id,
              }),
            },
          });
        return updated;
      },
      { isolationLevel: "Serializable" },
    );
    return NextResponse.json({
      visit: result,
      message: "Visit updated. Republish the plan to save a new route version.",
    });
  } catch (e) {
    return failure(e);
  }
}
