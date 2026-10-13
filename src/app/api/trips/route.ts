import { clusteringConfig } from "@/lib/clustering/config";
import { getLeadFilterForUser, getUserFilterForUser } from "@/lib/permissions";
import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const repId = searchParams.get("rep_id");
    const dateStr = searchParams.get("date"); // YYYY-MM-DD

    const targetRepId =
      user.role === "ground_rep" ? user.id : repId || undefined;

    const where: Prisma.TripPlanWhereInput = {
      ground_rep: getUserFilterForUser(user),
    };
    if (user.role === "ground_rep")
      where.status = { in: ["active", "published"] };
    if (targetRepId) {
      where.ground_rep_id = targetRepId;
    }

    const tripPlans = await prisma.tripPlan.findMany({
      where,
      include: {
        assignment: { include: { weeks: true, capacities: true } },
        ground_rep: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            store_id: true,
            assigned_store: true,
          },
        },
        trip_leads: {
          where: { lead: getLeadFilterForUser(user) },
          include: {
            consultation: {include:{rep:{select:{name:true}}}},
            lead: {
              select: {
                id: true,
                lead_code: true,
                company_name: true,
                phone_no: true,
                address: true,
                pin_code: true,
                geocode_status: true,
                geocode_source: true,
                lat: true,
                lng: true,
                status: true,
                category: true,
                notes: true,
                store: {
                  select: { id: true, name: true, lat: true, lng: true },
                },
                consultations: {
                  orderBy: { created_at: "desc" },
                  take: 1,
                },
              },
            },
          },
          orderBy: { sequence_order: "asc" },
        },
      },
      orderBy: { created_at: "desc" },
    });

    // If specific date is requested, extract day's leads
    const dayLeads = dateStr
      ? await (async () => {
          if (!Number.isFinite(new Date(dateStr).getTime())) return [];
          const startOfDay = new Date(dateStr);
          const endOfDay = new Date(startOfDay.getTime() + 86400000 - 1);

          const leadsForDay = await prisma.tripLead.findMany({
            where: {
              lead: getLeadFilterForUser(user),
              AND: [{ trip: where }],
              scheduled_date: {
                gte: startOfDay,
                lte: endOfDay,
              },
              ...(targetRepId ? { trip: { ground_rep_id: targetRepId } } : {}),
            },
            include: {
              consultation: {include:{rep:{select:{name:true}}}},
              lead: {
                include: {
                  store: true,
                  consultations: {
                    orderBy: { created_at: "desc" },
                    take: 3,
                  },
                },
              },
            },
            orderBy: { sequence_order: "asc" },
          });

          return leadsForDay;
        })()
      : [];

    return NextResponse.json({
      success: true,
      clustering_config: clusteringConfig(),
      tripPlans,
      dayLeads,
    });
  } catch (err: unknown) {
    console.error("GET /api/trips error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to fetch trip plans",
      },
      { status: 500 },
    );
  }
}
