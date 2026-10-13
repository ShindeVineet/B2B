import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getLeadFilterForUser, getStoreFilterForUser, getUserFilterForUser } from "@/lib/permissions";
import { findNearestStore } from "@/lib/geo";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const leadFilter = getLeadFilterForUser(user);
    const storeFilter = getStoreFilterForUser(user);

    // Fetch active stores
    const stores = await prisma.store.findMany({
      where: { active: true, ...storeFilter },
      include: {
        _count: {
          select: { leads: { where: leadFilter } },
        },
      },
    });

    // Total leads
    const totalLeads = await prisma.lead.count({ where: leadFilter });

    // Status breakdown
    const statusCountsRaw = await prisma.lead.groupBy({
      by: ["status"],
      where: leadFilter,
      _count: { id: true },
    });

    const statusCounts: Record<string, number> = {
      New: 0,
      Assigned: 0,
      Hot: 0,
      Cold: 0,
      Converted: 0,
      Lost: 0,
    };
    for (const item of statusCountsRaw) {
      statusCounts[item.status] = item._count.id;
    }

    // Leads assigned vs unassigned to store
    const assignedToStoreCount = await prisma.lead.count({
      where: {
        ...leadFilter,
        assigned_store_id: { not: null },
      },
    });

    const unassignedStoreCount = totalLeads - assignedToStoreCount;

    // Reps & leads per rep
    const reps = await prisma.user.findMany({
      where: {
        AND: [getUserFilterForUser(user)],
        role: "ground_rep",
        active: true,
        ...(user.role === "ground_rep" ? { id: user.id } : {}),
        
      },
      include: {
        _count: {
          select: { assigned_leads: { where: leadFilter } },
        },
      },
    });

    // Unmapped leads calculation:
    // leads with no store assigned AND (no coordinates OR distance > radius_km to all stores)
    const unassignedLeads = await prisma.lead.findMany({
      where: {
        ...leadFilter,
        assigned_store_id: null,
      },
      select: {
        id: true,
        lat: true,
        lng: true,
      },
    });

    let unmappedOutsideRadiusCount = 0;
    for (const l of unassignedLeads) {
      if (l.lat == null || l.lng == null) {
        unmappedOutsideRadiusCount++;
      } else {
        const prox = findNearestStore(l.lat, l.lng, stores);
        if (!prox.isWithinRadius) {
          unmappedOutsideRadiusCount++;
        }
      }
    }

    return NextResponse.json({
      totalLeads,
      assignedToStoreCount,
      unassignedStoreCount,
      unmappedOutsideRadiusCount,
      statusCounts,
      storesCount: stores.length,
      repsCount: reps.length,
      leadsPerStore: stores.map((s) => ({
        id: s.id,
        name: s.name,
        region: s.region,
        leadCount: s._count.leads,
        radius_km: s.radius_km,
      })),
      leadsPerRep: reps.map((r) => ({
        id: r.id,
        name: r.name,
        region: r.region,
        leadCount: r._count.assigned_leads,
      })),
    });
  } catch (err) {
    console.error("Dashboard stats error:", err);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
