import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { funnelStatus } from "@/lib/leads/funnel-status";
import { latestContact } from "@/lib/last-contact";
import { failure, RequestError } from "@/lib/phase5/http";

const PAGE_SIZE = 30;

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (
      !user ||
      !["b2b_head", "regional_manager", "store_associate"].includes(user.role)
    )
      throw new RequestError("Forbidden", 403);

    const page = Math.max(
      1,
      Math.min(100000, Math.floor(Number(req.nextUrl.searchParams.get("page"))) || 1),
    );
    const search = req.nextUrl.searchParams.get("search")?.trim();
    const where: Prisma.LeadWhereInput = search
      ? {
          OR: [
            { lead_code: { contains: search, mode: "insensitive" } },
            { company_name: { contains: search, mode: "insensitive" } },
            { owner_name: { contains: search, mode: "insensitive" } },
            { phone_no: { contains: search } },
            { pin_code: { contains: search } },
          ],
        }
      : {};

    const [leads, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        select: {
          id: true,
          lead_code: true,
          company_name: true,
          owner_name: true,
          phone_no: true,
          website: true,
          google_map_link: true,
          address: true,
          pin_code: true,
          region: true,
          category: true,
          lead_source: true,
          intake_team: true,
          status: true,
          notes: true,
          extra_notes: true,
          call_date: true,
          created_at: true,
          assigned_store_id: true,
          assigned_ground_rep_id: true,
          calling_associate_id: true,
          whatsapp_group_created: true,
          store: { select: { id: true, name: true } },
          ground_rep: { select: { id: true, name: true } },
          calling_associate: { select: { id: true, name: true } },
          partners: { select: { partner_status: true } },
          store_visits: {
            where: { status: "scheduled" },
            orderBy: { scheduled_at: "asc" },
            take: 1,
            select: { status: true, scheduled_at: true, store: { select: { name: true } } },
          },
          consultations: {
            orderBy: [{ visit_date: "desc" }, { created_at: "desc" }, { id: "desc" }],
            take: 1,
            select: {
              outcome: true,
              interest_level: true,
              visit_date: true,
              created_at: true,
            },
          },
          activity_logs: {
            where: { action: "FUNNEL_STATUS_UPDATED" },
            orderBy: { created_at: "desc" },
            take: 1,
            select: { new_value: true, created_at: true },
          },
          call_logs: {
            orderBy: { created_at: "desc" },
            take: 1,
            select: { created_at: true },
          },
          follow_up: { select: { due_date: true, active: true } },
        },
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.lead.count({ where }),
    ]);

    return NextResponse.json({
      leads: leads.map((lead) => ({
        ...lead,
        funnel_status: funnelStatus(lead),
        latest_interest_level: lead.consultations[0]?.interest_level || null,
        last_contact_at: latestContact(
          lead.call_date,
          lead.call_logs[0]?.created_at,
          lead.consultations[0]?.visit_date,
        ),
        next_follow_up_date: lead.follow_up?.active
          ? lead.follow_up.due_date
          : null,
      })),
      page,
      pageSize: PAGE_SIZE,
      total,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    });
  } catch (error) {
    return failure(error);
  }
}
