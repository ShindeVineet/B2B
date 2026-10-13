import { leadEligibility, assertEligible } from "@/lib/routes/pool";
import {
  clusterLeadsIntoDays,
  type ClusteringMode,
} from "@/lib/clustering/cluster-leads";
import { clusteringConfig } from "@/lib/clustering/config";
import { inIndia } from "@/lib/location";
import {
  BASE_DAYS,
  validDays,
  dayName,
  dateOnly,
  todayIndia,
} from "@/lib/phase5/calendar";
import { canPlotLead } from "@/lib/mapping/visibility";
import type { Prisma } from "@prisma/client";
import {
  canUserManageLeads,
  getLeadFilterForUser,
  getUserFilterForUser,
  getStoreFilterForUser,
} from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

interface PointWithId {
  geocode_status?: string | null;
  geocode_source?: string | null;
  id: string;
  lat: number;
  lng: number;
  company_name: string;
}

class CapacityConflict extends Error {
  constructor(
    public conflicts: {
      id: string;
      trip_id: string;
      scheduled_date: Date;
      lead: { id: string; company_name: string };
    }[],
  ) {
    super(
      "This day already has visits. Edit the existing visits below, adjust capacity, or choose another date range.",
    );
  }
}
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!canUserManageLeads(user))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const body = await req.json();
    const {
      ground_rep_id,
      name,
      start_date,
      leads_per_day = 10,
      total_days = 20, // default 20 working days = ~1 month
      lead_ids,
      store_id,
    } = body;

    if (
      !Number.isInteger(leads_per_day) ||
      leads_per_day < 1 ||
      leads_per_day > 100 ||
      !Number.isInteger(total_days) ||
      total_days < 1 ||
      total_days > 366 ||
      (start_date && !Number.isFinite(new Date(start_date).getTime()))
    )
      return NextResponse.json(
        {
          error:
            "Enter a valid date, 1–100 leads per day, and 1–366 working days.",
        },
        { status: 400 },
      );
    if (!ground_rep_id) {
      return NextResponse.json(
        { error: "ground_rep_id is required" },
        { status: 400 },
      );
    }

    const emptyPlan = body.empty_plan === true;
    const mode: ClusteringMode = body.clustering_mode ?? "compact_sequential";
    if (!["compact_sequential", "spread_coverage"].includes(mode))
      return NextResponse.json(
        { error: "Invalid clustering mode" },
        { status: 400 },
      );
    const overrides: Record<string, number> = body.day_capacities ?? {};
    if (
      !overrides ||
      typeof overrides !== "object" ||
      Array.isArray(overrides) ||
      Object.entries(overrides).some(
        ([day, cap]) =>
          !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
          !Number.isInteger(cap) ||
          cap < 1 ||
          cap > 100,
      )
    )
      return NextResponse.json(
        { error: "Invalid daily capacity overrides" },
        { status: 400 },
      );
    const baseDays = body.base_working_days ?? BASE_DAYS;
    if (!validDays(baseDays) || !baseDays.length)
      return NextResponse.json(
        { error: "Select at least one working day" },
        { status: 400 },
      );
    const rep = await prisma.user.findFirst({
      where: {
        id: ground_rep_id,
        active: true,
        role: { in: ["ground_rep", "regional_manager", "b2b_head"] },
        AND: [getUserFilterForUser(user)],
      },
      include: { assigned_store: true },
    });

    if (!rep) {
      return NextResponse.json(
        { error: "Ground rep not found" },
        { status: 404 },
      );
    }

    if (!rep.assigned_store?.active || !inIndia(rep.assigned_store))
      return NextResponse.json(
        {
          error:
            "Assign this team member an active base store with a valid location on the Ground Team page first",
        },
        { status: 409 },
      );
    if (store_id && store_id !== rep.store_id)
      return NextResponse.json(
        { error: "Plan origin must be the team member’s assigned base store" },
        { status: 409 },
      );
    const targetStoreId = rep.store_id!;
    const startPoint =
      rep.assigned_store && inIndia(rep.assigned_store)
        ? { lat: rep.assigned_store.lat, lng: rep.assigned_store.lng }
        : null;

    if (store_id) {
      const store = await prisma.store.findFirst({
        where: {
          id: store_id,
          active: true,
          AND: [getStoreFilterForUser(user)],
        },
      });
      if (!store)
        return NextResponse.json(
          { error: "Store outside your scope" },
          { status: 403 },
        );
    }

    if (
      Array.isArray(lead_ids) &&
      (await prisma.lead.count({
        where: {
          id: { in: lead_ids },
          assigned_store_id: { not: targetStoreId },
          AND: [getLeadFilterForUser(user)],
        },
      }))
    )
      return NextResponse.json(
        {
          error:
            "Selected leads belong to another store. Choose a member from that store or explicitly remap those leads first.",
        },
        { status: 409 },
      );
    // Fetch candidate leads
    let candidateLeads: PointWithId[] = [];

    if (Array.isArray(lead_ids) && lead_ids.length > 0) {
      const permitted = await prisma.lead.count({
        where: { id: { in: lead_ids }, AND: [getLeadFilterForUser(user)] },
      });
      if (permitted !== new Set(lead_ids).size)
        return NextResponse.json(
          { error: "Lead outside your scope" },
          { status: 403 },
        );
      const dbLeads = await prisma.lead.findMany({
        where: {
          id: { in: lead_ids },
          lat: { not: null },
          lng: { not: null },
        },
        select: {
          id: true,
          lat: true,
          lng: true,
          geocode_status: true,
          geocode_source: true,
          lead_code: true,
          company_name: true,
        },
      });
      candidateLeads = dbLeads.map((l) => ({
        geocode_status: l.geocode_status,
        geocode_source: l.geocode_source,
        id: l.id,
        lat: l.lat!,
        lng: l.lng!,
        company_name: l.company_name,
      }));
    } else {
      // Fetch unassigned or assigned-to-store leads for this rep/store
      const whereCondition: Prisma.LeadWhereInput = {
        AND: [
          getLeadFilterForUser(user),
          {
            OR: [
              { assigned_ground_rep_id: null },
              { assigned_ground_rep_id: ground_rep_id },
            ],
          },
        ],
        trip_leads: { none: { status: "pending", completed: false } },
        lat: { not: null },
        lng: { not: null },
        status: { in: ["New", "Assigned", "Mapped", "Active — Visit Scheduled", "Active — Nurturing"] },
      };

      if (targetStoreId) {
        whereCondition.assigned_store_id = targetStoreId;
      }

      const dbLeads = await prisma.lead.findMany({
        where: whereCondition,
        select: {
          id: true,
          lat: true,
          lng: true,
          geocode_status: true,
          geocode_source: true,
          lead_code: true,
          company_name: true,
        },
      });

      candidateLeads = dbLeads.map((l) => ({
        geocode_status: l.geocode_status,
        geocode_source: l.geocode_source,
        id: l.id,
        lat: l.lat!,
        lng: l.lng!,
        company_name: l.company_name,
      }));
    }

    if (emptyPlan) candidateLeads = [];
    const eligibility = await leadEligibility(prisma, candidateLeads.map(l => l.id));
    const eligibleIds = new Set(eligibility.filter(r => !r.reason).map(r => r.lead.id));
    if (Array.isArray(lead_ids) && lead_ids.length && eligibility.some(r => r.reason))
      return NextResponse.json({error: eligibility.filter(r => r.reason).map(r => `${r.lead.company_name}: ${r.reason}`).join("; ")}, {status:409});
    candidateLeads = candidateLeads.filter(l => eligibleIds.has(l.id));
    if (!Array.isArray(lead_ids) || !lead_ids.length)
      candidateLeads = candidateLeads.filter(canPlotLead);

    if (
      !emptyPlan && Array.isArray(lead_ids) &&
      lead_ids.length &&
      candidateLeads.length !== new Set(lead_ids).size
    )
      return NextResponse.json(
        {
          error:
            "Some selected leads have no coordinates. Update their locations before creating this plan.",
        },
        { status: 400 },
      );
    if (!emptyPlan && candidateLeads.length === 0) {
      return NextResponse.json(
        { error: "No eligible unscheduled leads for this rep/store. Check store assignment, existing draft/published visits and location review status." },
        { status: 400 },
      );
    }

    if (candidateLeads.some((l) => !canPlotLead(l)))
      return NextResponse.json(
        { error: "Correct invalid coordinates before planning" },
        { status: 400 },
      );
    const scheduled = await prisma.tripLead.findMany({
      where: {
        lead_id: { in: candidateLeads.map((l) => l.id) },
        status: "pending", completed: false,
      },
      select: { lead_id: true },
    });
    const scheduledIds = new Set(scheduled.map((v) => v.lead_id));
    if (
      Array.isArray(lead_ids) &&
      candidateLeads.some((l) => scheduledIds.has(l.id))
    )
      return NextResponse.json(
        {
          error:
            "Some selected leads already have scheduled visits. Select those visits in Plans and use Re-cluster instead.",
        },
        { status: 409 },
      );
    candidateLeads = candidateLeads.filter((l) => !scheduledIds.has(l.id));
    if (!emptyPlan && !candidateLeads.length)
      return NextResponse.json(
        { error: "No unscheduled mapped leads available." },
        { status: 400 },
      );
    const planStartDate = new Date(
      start_date ? dateOnly(start_date) : todayIndia(),
    );
    const workingDates: string[] = [];
    for (
      let cursor = new Date(planStartDate);
      workingDates.length < total_days;
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    ) {
      const day = cursor.toISOString().slice(0, 10);
      if (baseDays.includes(dayName(day))) workingDates.push(day);
    }
    if (Object.keys(overrides).some((day) => !workingDates.includes(day)))
      return NextResponse.json(
        { error: "Capacity overrides must be working days within this plan." },
        { status: 400 },
      );
    const clustered = clusterLeadsIntoDays(
      candidateLeads,
      workingDates.map((day) => overrides[day] ?? leads_per_day),
      startPoint,
      mode,
      { twoOptPasses: clusteringConfig().two_opt_passes },
    );
    const dailyBatches = clustered.days.map((day) => ({
      date: new Date(workingDates[day.day_index]),
      cluster_span_km: day.cluster_span_km,
      leads: day.lead_ids.map((id, i) => ({ id, order: i + 1 })),
    }));
    const planEndDate = new Date(workingDates.at(-1)!);

    const tripPlan = await prisma.$transaction(
      async (tx) => {
        const plan = await tx.tripPlan.create({
          data: {
            ground_rep_id,
            name: name || `Plan for ${rep.name}`,
            start_date: planStartDate,
            end_date: planEndDate,
            leads_per_day,
            status: "draft",
          },
        });
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ground_rep_id}))`;
        for (const id of candidateLeads.map((l) => l.id).sort())
          await tx.$queryRaw`SELECT id FROM leads WHERE id = ${id} FOR UPDATE`;
        await assertEligible(tx, dailyBatches.flatMap(b => b.leads.map(l => l.id)));
        const currentLeads = await tx.lead.findMany({
          where: { id: { in: candidateLeads.map((l) => l.id) } },
        });
        if (
          currentLeads.some(
            (l) =>
              !canPlotLead(l) ||
              candidateLeads.find((c) => c.id === l.id)?.lat !== l.lat ||
              candidateLeads.find((c) => c.id === l.id)?.lng !== l.lng,
          )
        )
          throw new Error(
            "Lead locations changed. Refresh and resolve Mapping Issues before planning.",
          );
        const assignment = await tx.tripAssignment.create({
          data: {
            trip_id: plan.id,
            clustering_mode: mode,
            ground_rep_id,
            assigning_manager_id:
              user.role === "regional_manager" ? user.id : null,
            start_date: planStartDate,
            end_date: planEndDate,
            leads_per_day_default: leads_per_day,
            base_working_days: baseDays,
          },
        });
        if (clustered.unscheduled_lead_ids.length)
          await tx.lead.updateMany({
            where: { id: { in: clustered.unscheduled_lead_ids } },
            data: {
              assigned_ground_rep_id: ground_rep_id,
              assigned_store_id: targetStoreId,
              status: "Assigned",
            },
          });
        for (const [date, capacity] of Object.entries(overrides))
          await tx.tripDayCapacity.create({
            data: {
              trip_assignment_id: assignment.id,
              date: new Date(date),
              capacity,
            },
          });
        const stillScheduled = await tx.tripLead.count({
          where: {
            lead_id: {
              in: dailyBatches.flatMap((b) => b.leads.map((l) => l.id)),
            },
            trip: { id: { not: plan.id } }, status: "pending", completed: false,
          },
        });
        if (stillScheduled)
          throw Error("A lead was scheduled concurrently. Refresh and retry.");
        for (const batch of dailyBatches) {
          const occupied = await tx.tripLead.findMany({
            include: {
              lead: {
                select: { id: true, lead_code: true, company_name: true },
              },
            },
            where: {
              trip: { ground_rep_id, status: { not: "completed" } },
              scheduled_date: {
                gte: batch.date,
                lt: new Date(batch.date.getTime() + 86400000),
              },
            },
          });
          if (
            occupied.length + batch.leads.length >
            (overrides[batch.date.toISOString().slice(0, 10)] ?? leads_per_day)
          )
            throw new CapacityConflict(occupied);
          await tx.tripLead.createMany({
            data: batch.leads.map((item) => ({
              trip_id: plan.id,
              route_id: null,
              lead_id: item.id,
              scheduled_date: batch.date,
              sequence_order: item.order,
            })),
          });
          await tx.lead.updateMany({
            where: { id: { in: batch.leads.map((item) => item.id) } },
            data: {
              assigned_ground_rep_id: ground_rep_id,
              assigned_store_id: targetStoreId,
              assigned_visit_date: batch.date,
              status: "Assigned",
            },
          });
        }
        await tx.activityLog.createMany({
          data: dailyBatches.flatMap((batch) =>
            batch.leads.map((item) => ({
              lead_id: item.id,
              actor_id: user.id,
              action: "TRIP_PLAN_GENERATED",
              new_value: plan.id,
            })),
          ),
        });
        return plan;
      },
      { isolationLevel: "Serializable" },
    );

    return NextResponse.json({
      success: true,
      tripPlan: {
        id: tripPlan.id,
        name: tripPlan.name,
        repName: rep.name,
        totalDays: dailyBatches.length,
        totalLeadsScheduled: dailyBatches.reduce(
          (sum, batch) => sum + batch.leads.length,
          0,
        ),
        unscheduledCount: clustered.unscheduled_lead_ids.length,
        unscheduledLeadIds: clustered.unscheduled_lead_ids,
        dailyBatches,
      },
    });
  } catch (err: unknown) {
    if (err instanceof CapacityConflict)
      return NextResponse.json(
        { error: err.message, conflicts: err.conflicts },
        { status: 409 },
      );
    if (err instanceof RangeError)
      return NextResponse.json({ error: err.message }, { status: 400 });
    console.error("POST /api/trips/auto-plan error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to generate trip plan",
      },
      { status: 500 },
    );
  }
}
