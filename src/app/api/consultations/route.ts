import { saveGroundConsultation } from "@/lib/consultations/save-ground";
import { failure } from "@/lib/phase5/http";
import type { Prisma } from "@prisma/client";
import { getLeadFilterForUser } from "@/lib/permissions";
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
    const paginated = searchParams.has("page");
    const page = Math.max(1, Math.floor(Number(searchParams.get("page")) || 1));
    const leadId = searchParams.get("lead_id");
    const repId = searchParams.get("rep_id");

    const where: Prisma.ConsultationWhereInput = {
      lead: getLeadFilterForUser(user),
    };
    if (leadId) where.lead_id = leadId;
    if (repId) where.rep_id = repId;

    if (user.role === "ground_rep" || searchParams.get("mine") === "true") {
      where.rep_id = user.id;
    }

    const leadFilter: Prisma.LeadWhereInput = getLeadFilterForUser(user);
    const clauses: Prisma.LeadWhereInput[] = [leadFilter];
    for (const [param, field] of [
      ["region", "region"],
      ["store", "assigned_store_id"],
    ] as const) {
      const value = searchParams.get(param);
      if (value) clauses.push({ [field]: value });
    }
    const q = searchParams.get("q")?.trim();
    if (q)
      where.OR = [
        { lead: { lead_code: { contains: q, mode: "insensitive" } } },
        { lead: { company_name: { contains: q, mode: "insensitive" } } },
        { lead: { phone_no: { contains: q } } },
        { decision_maker_phone: { contains: q } },
      ];
    where.lead = { AND: clauses };
    for (const field of ["outcome", "interest_level", "lead_type"] as const) {
      const value = searchParams.get(field);
      if (value) where[field] = value;
    }
    const from = searchParams.get("from"),
      to = searchParams.get("to");
    if (
      (from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) ||
      (to && !/^\d{4}-\d{2}-\d{2}$/.test(to))
    )
      return NextResponse.json(
        { error: "Invalid date filter" },
        { status: 400 },
      );
    if (from || to)
      where.visit_date = {
        ...(from ? { gte: new Date(from + "T00:00:00+05:30") } : {}),
        ...(to
          ? {
              lt: new Date(
                new Date(to + "T00:00:00+05:30").getTime() + 86400000,
              ),
            }
          : {}),
      };
    const consultations = await prisma.consultation.findMany({
      where,
      ...(paginated ? { skip: (page - 1) * 24, take: 24 } : {}),
      include: {
        store_visit: { include: { store: { select: { name: true } } } },
        lead: {
          select: {
            partners: { select: { partner_status: true } },
            id: true,
            lead_code: true,
            company_name: true,
            phone_no: true,
            address: true,
            status: true,
            lat: true,
            geocode_status: true,
            geocode_source: true,
            lng: true,
            region: true,
            assigned_store_id: true,
            assigned_ground_rep_id: true,
            calling_associate_id: true,
            lead_source: true,
            intake_team: true,
          },
        },
        rep: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy:
        searchParams.get("sort") === "company"
          ? { lead: { company_name: "asc" } }
          : {
              visit_date:
                searchParams.get("sort") === "oldest" ? "asc" : "desc",
            },
    });

    return NextResponse.json({
      success: true,
      consultations,
      totalCount: paginated
        ? await prisma.consultation.count({ where })
        : consultations.length,
    });
  } catch (err: unknown) {
    console.error("GET /api/consultations error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to fetch consultations",
      },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user || user.role === "analyst")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const body = await req.json();
    const lead = await prisma.lead.findFirst({
      where: { id: body.lead_id, AND: [getLeadFilterForUser(user)] },
    });
    if (!lead)
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    const consultation = await prisma.$transaction(tx => saveGroundConsultation(tx, user, lead, body.responses || body, body.trip_lead_id));
    return NextResponse.json({ success: true, consultation });
  } catch (e) {
    return failure(e);
  }
}
