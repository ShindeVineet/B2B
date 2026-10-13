import {sequenceRemaining} from "@/lib/routes/service";
import {snapshotRoutes} from "@/lib/phase5/snapshots";
import { leadEligibility, assertEligible } from "@/lib/routes/pool";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  canUserManageLeads,
  getUserFilterForUser,
  getLeadFilterForUser,
} from "@/lib/permissions";
import { failure, RequestError } from "@/lib/phase5/http";
import { dateOnly, addDays, todayIndia, working } from "@/lib/phase5/calendar";
import { scheduleOf, repCounts } from "@/lib/phase5/schedule";
import { clusterLeadsIntoDays } from "@/lib/clustering/cluster-leads";
import { clusteringConfig } from "@/lib/clustering/config";
import { canPlotLead } from "@/lib/mapping/visibility";
import { inIndia } from "@/lib/location";
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const u = await getCurrentUser(req);
    if (!u || !canUserManageLeads(u)) throw new RequestError("Forbidden", 403);
    const { id } = await params,
      b = await req.json(),
      ids = b.visit_ids ?? [];
    if (
      !Array.isArray(ids) ||
      ids.some((v) => typeof v !== "string") ||
      new Set(ids).size !== ids.length
    )
      throw new RequestError("Invalid visit selection");
    const result = await prisma.$transaction(
      async (tx) => {
        const plan = await tx.tripPlan.findFirst({
          where: { id, ground_rep: getUserFilterForUser(u) },
          include: {
            ground_rep: { include: { assigned_store: true } },
            assignment: { include: { weeks: true, capacities: true } },
            trip_leads: { include: { lead: true } },
          },
        });
        if (!plan?.assignment) throw new RequestError("Plan not found", 404);
        if (plan.status === "completed")
          throw new RequestError("Completed plans cannot be re-clustered");
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${plan.ground_rep_id}))`;
        const selected = plan.trip_leads.filter((v) => ids.includes(v.id));
        if (selected.length !== ids.length)
          throw new RequestError("Selected visit is outside this plan", 403);
        if (selected.some(v => v.route_id) && b.confirm !== true) throw new RequestError("Confirm removing selected visits from their saved routes for re-clustering",409);
        if (selected.some((v) => v.completed || v.status === "visited"))
          throw new RequestError("Completed visits cannot be re-clustered");
        const scopedCount = await tx.lead.count({
          where: {
            id: { in: selected.map((v) => v.lead_id) },
            AND: [getLeadFilterForUser(u)],
          },
        });
        if (scopedCount !== new Set(selected.map((v) => v.lead_id)).size)
          throw new RequestError("Selected lead is outside your scope", 403);
        if (selected.some((v) => !canPlotLead(v.lead)))
          throw new RequestError(
            "Resolve selected leads’ Mapping Issues first",
          );
        if (new Set(selected.map((v) => v.lead_id)).size !== selected.length)
          throw new RequestError("Select only one visit per lead");
        const unscheduled =
          b.include_unscheduled === false
            ? []
            : await tx.lead.findMany({
                where: {
                  AND: [getLeadFilterForUser(u)],
                  assigned_ground_rep_id: plan.ground_rep_id,
                  status: {
                    notIn: [
                      "onboarded",
                      "Closed-Lost",
                      "Closed-Won",
                      "Converted",
                    ],
                  },
                  trip_leads: {
                    none: { trip: { status: { not: "completed" } } },
                  },
                },
              });
        const eligibility = await leadEligibility(tx, unscheduled.map(l => l.id));
        const eligibleIds = new Set(eligibility.filter(r => !r.reason).map(r => r.lead.id));
        const pool = [
          ...selected.map((v) => v.lead),
          ...unscheduled.filter(l => canPlotLead(l) && eligibleIds.has(l.id)),
        ];
        if (!pool.length)
          throw new RequestError(
            "No unscheduled mapped leads or selected visits to re-cluster",
          );
        const s = scheduleOf(plan.assignment),
          counts = await repCounts(tx, plan.ground_rep_id, ids);
        const published = await tx.tripLead.findMany({
          where: {
            trip: {
              ground_rep_id: plan.ground_rep_id,
              status: { in: ["active", "published"] },
            },
            id: { notIn: ids },
          },
          select: { scheduled_date: true },
        });
        const protectedDates = new Set(
          published.map((v) => dateOnly(v.scheduled_date)),
        );
        const snapshotDays = await tx.routeSnapshot.findMany({
          where: {
            ground_rep_id: plan.ground_rep_id,
            route_date: { gte: plan.start_date, lte: plan.end_date },
          },
          orderBy: { version: "desc" },
          select: { route_date: true, trip_lead_ids: true },
        });
        const seen = new Set<string>();
        for (const snap of snapshotDays) {
          const date = dateOnly(snap.route_date);
          if (seen.has(date)) continue;
          seen.add(date);
          const visits = Array.isArray(snap.trip_lead_ids)
            ? snap.trip_lead_ids
            : [];
          if (visits.some((v) => typeof v === "string" && !ids.includes(v)))
            protectedDates.add(date);
        }
        const dates: string[] = [],
          capacities: number[] = [];
        for (
          let date = [s.start, todayIndia()].sort().at(-1)!;
          date <= s.end;
          date = addDays(date, 1)
        )
          if (working(date, s)) {
            dates.push(date);
            capacities.push(
              protectedDates.has(date)
                ? 0
                : Math.max(
                    0,
                    (s.capacities[date] ?? s.capacity) - (counts[date] || 0),
                  ),
            );
          }
        const store = plan.ground_rep.assigned_store;
        if (!store?.active || !inIndia(store))
          throw new RequestError(
            "Assign an active base store with valid coordinates before re-clustering",
            409,
          );
        if (
          pool.some(
            (l) => l.assigned_store_id && l.assigned_store_id !== store.id,
          )
        )
          throw new RequestError(
            "Some selected leads belong to another store; review their assignments before re-clustering",
            409,
          );
        const clustered = clusterLeadsIntoDays(
          pool.map((l) => ({ id: l.id, lat: l.lat!, lng: l.lng! })),
          capacities,
          store && inIndia(store) ? store : null,
          plan.assignment.clustering_mode,
          { twoOptPasses: clusteringConfig().two_opt_passes },
        );
        // Existing visits cannot vanish into overflow: require more capacity first.
        if (
          selected.some((v) =>
            clustered.unscheduled_lead_ids.includes(v.lead_id),
          )
        )
          throw new RequestError(
            "Not enough editable capacity for selected visits. Extend the plan or select fewer visits; no visits were moved.",
            409,
          );
        for(const v of selected) if(v.route_id) {
          await tx.routeLead.deleteMany({where:{route_id:v.route_id,lead_id:v.lead_id}});
          await sequenceRemaining(tx,v.route_id);
        }
        await assertEligible(tx, pool.map(l => l.id), undefined, ids);
        const selectedByLead = new Map(selected.map((v) => [v.lead_id, v]));
        for (const day of clustered.days) {
          if (!day.lead_ids.length) continue;
          const date = new Date(dates[day.day_index]);
          const last = await tx.tripLead.aggregate({
            where: {
              trip: {
                ground_rep_id: plan.ground_rep_id,
                status: { not: "completed" },
              },
              scheduled_date: date,
              id: { notIn: ids },
            },
            _max: { sequence_order: true },
          });
          const offset = last._max.sequence_order || 0;
          for (let i = 0; i < day.lead_ids.length; i++) {
            const leadId = day.lead_ids[i],
              old = selectedByLead.get(leadId);
            if (old)
              await tx.tripLead.update({
                where: { id: old.id },
                data: { scheduled_date: date, sequence_order: offset + i + 1, route_id: null },
              });
            else
              await tx.tripLead.create({
                data: {
                  trip_id: id,
                  lead_id: leadId,
                  scheduled_date: date,
                  sequence_order: offset + i + 1,
                },
              });
            await tx.lead.update({
              where: { id: leadId },
              data: { assigned_visit_date: date },
            });
            await tx.activityLog.create({
              data: {
                lead_id: leadId,
                actor_id: u.id,
                action: "VISIT_RECLUSTERED",
                old_value: old
                  ? JSON.stringify({
                      date: dateOnly(old.scheduled_date),
                      sequence: old.sequence_order,
                    })
                  : null,
                new_value: JSON.stringify({
                  trip_id: id,
                  date: dates[day.day_index],
                  sequence: offset + i + 1,
                  mode: plan.assignment.clustering_mode,
                }),
              },
            });
          }
        }
        if(selected.some(v=>v.route_id)) await snapshotRoutes(tx,plan.ground_rep_id,[...new Set([...selected.map(v=>dateOnly(v.scheduled_date)),...clustered.days.map(d=>dates[d.day_index])])].map(d=>new Date(d)));
        return {
          days: clustered.days,
          unscheduled_count: clustered.unscheduled_lead_ids.length,
          scheduled_count: clustered.days.reduce(
            (n, d) => n + d.lead_ids.length,
            0,
          ),
          protected_days: [...protectedDates],
          message:
            "Clustering saved. Publish / republish to save a route snapshot.",
        };
      },
      { isolationLevel: "Serializable", timeout: 60000 },
    );
    return NextResponse.json(result);
  } catch (e) {
    return failure(e);
  }
}
