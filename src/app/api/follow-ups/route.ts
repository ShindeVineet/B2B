import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getLeadFilterForUser } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
export async function GET(req: NextRequest) {
  const u = await getCurrentUser(req);
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({
    followups: await prisma.followUp.findMany({
      where: {
        active: true,
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
      },
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
          },
        },
      },
      orderBy: { due_date: "asc" },
    }),
  });
}
