import {sequenceRemaining} from "@/lib/routes/service";
import {snapshotRoutes} from "@/lib/phase5/snapshots";
import { canPlotLead } from "@/lib/mapping/visibility";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canUserManageLeads, getUserFilterForUser } from "@/lib/permissions";
import { RequestError, failure } from "@/lib/phase5/http";
import {
  dateOnly,
  todayIndia,
  validDays,
  weekStart,
  working,
  redistribute,
  addDays,
} from "@/lib/phase5/calendar";
import { scheduleOf, repCounts } from "@/lib/phase5/schedule";
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const u = await getCurrentUser(req);
    if (!u || !canUserManageLeads(u)) throw new RequestError("Forbidden", 403);
    const { id } = await params,
      b = await req.json();
    const result = await prisma.$transaction(
      async (tx) => {
        const plan = await tx.tripPlan.findFirst({
          where: { id, ground_rep: getUserFilterForUser(u) },
          include: {
            assignment: { include: { weeks: true, capacities: true } },
            trip_leads: { include: { lead: true } },
          },
        });
        if (!plan?.assignment) throw new RequestError("Plan not found", 404);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${plan.ground_rep_id}))`;
        const a = plan.assignment;
        if (b.clustering_mode !== undefined) {
          if (
            !["compact_sequential", "spread_coverage"].includes(
              b.clustering_mode,
            )
          )
            throw new RequestError("Invalid clustering mode");
          await tx.tripAssignment.update({
            where: { id: a.id },
            data: { clustering_mode: b.clustering_mode },
          });
          return { success: true };
        }
        if (b.claim) {
          if (u.role !== "regional_manager")
            throw new RequestError(
              "A regional manager must claim this legacy plan",
            );
          if (a.assigning_manager_id)
            throw new RequestError(
              "This plan already has an assigning manager",
            );
          await tx.tripAssignment.update({
            where: { id: a.id },
            data: { assigning_manager_id: u.id },
          });
          return { success: true };
        }
        if (b.end_date) {
          const end = dateOnly(b.end_date);
          if (end < dateOnly(a.end_date))
            throw new RequestError("Use this action only to extend the plan");
          await tx.tripAssignment.update({
            where: { id: a.id },
            data: { end_date: new Date(end) },
          });
          await tx.tripPlan.update({
            where: { id },
            data: { end_date: new Date(end) },
          });
          return { success: true };
        }
        const s = scheduleOf(a);
        if (b.capacity_date) {
          const d = dateOnly(b.capacity_date);
          if (
            d < s.start ||
            d > s.end ||
            !Number.isInteger(b.capacity) ||
            b.capacity < 1 ||
            b.capacity > 100
          )
            throw new RequestError(
              "Choose a plan date and capacity from 1 to 100",
            );
          const counts = await repCounts(tx, plan.ground_rep_id);
          if ((counts[d] || 0) > b.capacity)
            throw new RequestError(
              "Capacity cannot be lower than the visits already scheduled",
            );
          await tx.tripDayCapacity.upsert({
            where: {
              trip_assignment_id_date: {
                trip_assignment_id: a.id,
                date: new Date(d),
              },
            },
            create: {
              trip_assignment_id: a.id,
              date: new Date(d),
              capacity: b.capacity,
            },
            update: { capacity: b.capacity },
          });
          return { success: true };
        }
        const week = b.week_start ? dateOnly(b.week_start) : null;
        if (
          week &&
          (week !== weekStart(week) ||
            week > weekStart(s.end) ||
            addDays(week, 6) < s.start)
        )
          throw new RequestError("Choose a Monday within this plan");
        if (!b.reset && !validDays(b.working_days))
          throw new RequestError("Invalid working days");
        if (b.reset && !week) throw new RequestError("Choose a week to reset");
        if (!week && b.working_days.length === 0)
          throw new RequestError(
            "The base pattern needs at least one working day",
          );
        if (week) {
          if (b.reset) delete s.weeks[week];
          else s.weeks[week] = b.working_days;
        } else s.base = b.working_days;
        const orphaned = plan.trip_leads.filter(
          (v) =>
            !v.completed &&
            v.status !== "visited" &&
            !working(dateOnly(v.scheduled_date), s),
        );
        if (orphaned.length && !["this_week", "next_week"].includes(b.move))
          return { requires_choice: true, count: orphaned.length };
        const counts = await repCounts(
          tx,
          plan.ground_rep_id,
          orphaned.map((v) => v.id),
        );
        const moves: { id: string; date: string }[] = [];
        for (const w of [
          ...new Set(
            orphaned.map((v) => weekStart(dateOnly(v.scheduled_date))),
          ),
        ].sort()) {
          const start = b.move === "next_week" ? addDays(w, 7) : w,
            end = addDays(start, 6);
          const batch = redistribute(
            orphaned
              .filter((v) => weekStart(dateOnly(v.scheduled_date)) === w)
              .map((v) => v.id),
            [start, todayIndia()].sort().at(-1)!,
            end,
            s,
            counts,
          );
          if (!batch)
            throw new RequestError(
              "Not enough working-day capacity in the chosen week. Adjust capacity or extend the plan first.",
              409,
            );
          for (const m of batch) {
            counts[m.date] = (counts[m.date] || 0) + 1;
            moves.push(m);
          }
        }
        if (week) {
          const days = s.weeks[week];
          if (
            !days ||
            JSON.stringify([...days].sort()) ===
              JSON.stringify([...s.base].sort())
          )
            await tx.tripWeekOverride.deleteMany({
              where: {
                trip_assignment_id: a.id,
                week_start_date: new Date(week),
              },
            });
          else
            await tx.tripWeekOverride.upsert({
              where: {
                trip_assignment_id_week_start_date: {
                  trip_assignment_id: a.id,
                  week_start_date: new Date(week),
                },
              },
              create: {
                trip_assignment_id: a.id,
                week_start_date: new Date(week),
                working_days: days,
              },
              update: { working_days: days },
            });
        } else {
          await tx.tripAssignment.update({
            where: { id: a.id },
            data: { base_working_days: s.base },
          });
          const redundant = a.weeks
            .filter(
              (w) =>
                JSON.stringify([...(w.working_days as string[])].sort()) ===
                JSON.stringify([...s.base].sort()),
            )
            .map((w) => w.id);
          if (redundant.length)
            await tx.tripWeekOverride.deleteMany({
              where: { id: { in: redundant } },
            });
        }
        for (const m of moves) {
          const visit = plan.trip_leads.find((v) => v.id === m.id)!;
          if (!canPlotLead(visit.lead))
            throw new RequestError(
              "Resolve Mapping Issues before redistributing visits",
              409,
            );
          if(visit.route_id) {
            await tx.routeLead.deleteMany({where:{route_id:visit.route_id,lead_id:visit.lead_id}});
            await sequenceRemaining(tx,visit.route_id);
          }
          await tx.tripLead.update({
            where: { id: m.id },
            data: { scheduled_date: new Date(m.date), route_id: null },
          });
          await tx.lead.updateMany({
            where: {
              id: visit.lead_id,
              assigned_ground_rep_id: plan.ground_rep_id,
            },
            data: { assigned_visit_date: new Date(m.date) },
          });
          await tx.activityLog.create({
            data: {
              lead_id: visit.lead_id,
              actor_id: u.id,
              action: "SCHEDULE_REDISTRIBUTED",
              old_value: dateOnly(visit.scheduled_date),
              new_value: m.date,
            },
          });
        }
        if(orphaned.some(v=>v.route_id)) await snapshotRoutes(tx,plan.ground_rep_id,[...new Set([...orphaned.map(v=>dateOnly(v.scheduled_date)),...moves.map(m=>m.date)])].map(d=>new Date(d)));
        return { success: true, moved: moves.length };
      },
      { isolationLevel: "Serializable" },
    );
    return NextResponse.json(result);
  } catch (e) {
    return failure(e);
  }
}
