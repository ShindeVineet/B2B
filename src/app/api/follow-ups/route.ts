import { failure } from "@/lib/phase5/http";
import { followUpWindow } from "@/lib/follow-ups/service";
import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getLeadFilterForUser } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
export async function GET(req: NextRequest) {
 try {
  const u = await getCurrentUser(req);
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const view = req.nextUrl.searchParams.get("view");
  if (view && !['pending', 'today', 'overdue', 'upcoming'].includes(view)) return NextResponse.json({ error: 'Invalid follow-up view' }, { status: 400 });
  const page = Math.max(1, Math.min(100000, Math.floor(Number(req.nextUrl.searchParams.get("page"))) || 1));
  const pageSize = 30;
  const where: Prisma.FollowUpWhereInput = {
        active: true,
        ...(view ? { due_date: followUpWindow(view) } : {}),
        lead: {
          AND: [getLeadFilterForUser(u)],
          partners: { none: { partner_status: "active" } },
          status: {
            notIn: ["onboarded", "Closed-Lost", "Closed-Won", "Converted"],
          },
        },
        ...(u.role === "ground_rep" ||
        req.nextUrl.searchParams.get("mine") === "true"
          ? { rep_id: u.id }
          : {}),
      };
  const [followups, total] = await prisma.$transaction([
    prisma.followUp.findMany({
      where,
      ...(view ? { skip: (page - 1) * pageSize, take: pageSize } : {}),
      include: {
        rep: { select: { id: true, name: true } },
        lead: {
          select: {
            lat: true,
            lng: true,
            geocode_status: true,
            geocode_source: true,
            id: true,
            lead_code: true,
            company_name: true,
            phone_no: true,
            assigned_ground_rep_id: true,
            calling_associate_id: true,
            intake_team: true,
            call_date: true,
            consultations: { select: { id: true }, take: 1 },
          },
        },
      },
      orderBy: [{ due_date: "asc" }, { id: "asc" }],
    }),
    prisma.followUp.count({ where }),
  ]);
  return NextResponse.json({ followups, total, page, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
 } catch (error) { return failure(error); }
}
