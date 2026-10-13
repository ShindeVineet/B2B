import { sequenceRemaining } from "@/lib/routes/service";
import { snapshotRoutes } from "@/lib/phase5/snapshots";
import { canPlotLead } from "@/lib/mapping/visibility";
import { NextRequest, NextResponse } from "next/server";
import { MissedReason } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLeadFilterForUser, getUserFilterForUser } from "@/lib/permissions";
import { RequestError, failure } from "@/lib/phase5/http";
import { dateOnly, todayIndia, addDays } from "@/lib/phase5/calendar";

async function handle(req: NextRequest, id: string, commit: boolean) {
  try {
    const u = await getCurrentUser(req);
    if (!u || !["b2b_head", "regional_manager", "ground_rep"].includes(u.role))
      throw new RequestError("Forbidden", 403);
    let b = commit ? await req.json() : {};
    const result = await prisma.$transaction(
      async (tx) => {
        const v = await tx.tripLead.findFirst({
          where: {
            id,
            lead: getLeadFilterForUser(u),
            trip: {
              ground_rep: getUserFilterForUser(u),
              status: { in: ["active", "published"] },
            },
          },
          include: {
            lead: true,
            trip: {
              include: {
                assignment: { include: { weeks: true, capacities: true } },
              },
            },
          },
        });
        if (!v) throw new RequestError("Visit not found", 404);
        if (!canPlotLead(v.lead))
          throw new RequestError(
            "Resolve Mapping Issues before rescheduling this visit",
            409,
          );
        if (v.completed || v.status === "visited")
          throw new RequestError("A completed visit cannot be marked missed");
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${v.trip.ground_rep_id}))`;
        const a = v.trip.assignment;
        const old = dateOnly(v.scheduled_date),
          earliest = [todayIndia(), addDays(old, 1)].sort().at(-1)!;
        const manager = ["b2b_head", "regional_manager"].includes(u.role);
        if (!commit)
          return {
            suggested_date: earliest,
            scheduled_date: old,
            end_date: null,
            requires_approval: !manager,
            message: manager
              ? "Choose a new date. Saving approves the reschedule."
              : "Your current visit date remains unchanged until a manager approves.",
          };
        let requestId: string | null = null;
        if (b.request_id) {
          if (!manager)
            throw new RequestError(
              "Only Head or Store Lead can review requests",
              403,
            );
          await tx.$queryRaw`SELECT id FROM activity_log WHERE id=${String(b.request_id)} FOR UPDATE`;
          const request = await tx.activityLog.findFirst({
            where: {
              id: String(b.request_id),
              action: "RESCHEDULE_REQUESTED",
              lead_id: v.lead_id,
              old_value: id,
            },
          });
          if (!request) throw new RequestError("Request not found", 404);
          if (
            await tx.activityLog.count({
              where: {
                old_value: request.id,
                action: { in: ["RESCHEDULE_APPROVED", "RESCHEDULE_REJECTED"] },
              },
            })
          )
            throw new RequestError("Request already reviewed", 409);
          requestId = request.id;
          if (b.decision === "reject") {
            await tx.activityLog.create({
              data: {
                lead_id: v.lead_id,
                actor_id: u.id,
                action: "RESCHEDULE_REJECTED",
                old_value: request.id,
                new_value: "Rejected",
              },
            });
            return { success: true, rejected: true };
          }
          if (b.decision !== "approve")
            throw new RequestError("Choose approve or reject");
          b = JSON.parse(request.new_value || "{}");
        }
        if (b.expected_date !== old)
          throw new RequestError(
            "This visit changed. Reopen the reschedule form.",
            409,
          );
        if (!Object.values(MissedReason).includes(b.reason))
          throw new RequestError("Choose a missed-visit reason");
        if (
          b.note != null &&
          (typeof b.note !== "string" || b.note.length > 2000)
        )
          throw new RequestError("Note must be at most 2000 characters");
        const date = dateOnly(b.date);
        if (date < earliest)
          throw new RequestError(
            "Choose a later date, today or in the future",
            409,
          );
        if (!manager) {
          const requests = await tx.activityLog.findMany({
            where: {
              lead_id: v.lead_id,
              old_value: id,
              action: "RESCHEDULE_REQUESTED",
            },
          });
          const decisions = await tx.activityLog.findMany({
            where: {
              old_value: { in: requests.map((r) => r.id) },
              action: { in: ["RESCHEDULE_APPROVED", "RESCHEDULE_REJECTED"] },
            },
            select: { old_value: true },
          });
          if (
            requests.some((r) => !decisions.some((d) => d.old_value === r.id))
          )
            throw new RequestError(
              "A reschedule request is already awaiting approval",
              409,
            );
          await tx.activityLog.create({
            data: {
              lead_id: v.lead_id,
              actor_id: u.id,
              action: "RESCHEDULE_REQUESTED",
              old_value: id,
              new_value: JSON.stringify({
                date,
                expected_date: old,
                reason: b.reason,
                note: b.note || null,
              }),
            },
          });
          return { success: true, pending_approval: true, date };
        }
        // Approval is the explicit authority to move beyond the former schedule window.
        if (new Date(date) > v.trip.end_date) {
          await tx.tripPlan.update({
            where: { id: v.trip_id },
            data: { end_date: new Date(date) },
          });
          if (a)
            await tx.tripAssignment.update({
              where: { id: a.id },
              data: { end_date: new Date(date) },
            });
        }
        if (requestId)
          await tx.activityLog.create({
            data: {
              lead_id: v.lead_id,
              actor_id: u.id,
              action: "RESCHEDULE_APPROVED",
              old_value: requestId,
              new_value: date,
            },
          });
        const event = await tx.missedVisit.create({
          data: {
            trip_lead_id: id,
            reason: b.reason,
            note: b.note || null,
            original_date: new Date(old),
            new_date: new Date(date),
          },
        });
        if (v.route_id) {
          await tx.routeLead.deleteMany({
            where: { route_id: v.route_id, lead_id: v.lead_id },
          });
          await sequenceRemaining(tx, v.route_id);
        }
        await tx.tripLead.update({
          where: { id },
          data: {
            route_id: null,
            status: "rescheduled",
            missed_reason: b.reason,
            missed_reason_note: b.note || null,
            original_scheduled_date: v.original_scheduled_date || new Date(old),
            scheduled_date: new Date(date),
          },
        });
        await tx.lead.updateMany({
          where: {
            id: v.lead_id,
            assigned_ground_rep_id: v.trip.ground_rep_id,
          },
          data: { assigned_visit_date: new Date(date) },
        });
        if (a?.assigning_manager_id)
          await tx.notification.create({
            data: {
              user_id: a.assigning_manager_id,
              type: "visit_missed",
              missed_visit_id: event.id,
            },
          });
        await tx.activityLog.create({
          data: {
            lead_id: v.lead_id,
            actor_id: u.id,
            action: "VISIT_MISSED",
            old_value: old,
            new_value: JSON.stringify({
              date,
              reason: b.reason,
              note: b.note || null,
            }),
          },
        });
        if (v.route_id)
          await snapshotRoutes(tx, v.trip.ground_rep_id, [
            new Date(old),
            new Date(date),
          ]);
        return { success: true, date };
      },
      { isolationLevel: "Serializable" },
    );
    return NextResponse.json(result);
  } catch (e) {
    return failure(e);
  }
}
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(req, (await params).id, false);
}
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(req, (await params).id, true);
}
