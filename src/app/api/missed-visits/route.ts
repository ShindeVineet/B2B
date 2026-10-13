import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canUserManageLeads, getLeadFilterForUser } from "@/lib/permissions";
import { failure } from "@/lib/phase5/http";
import { dateOnly } from "@/lib/phase5/calendar";
export async function GET(req: NextRequest) {
  try {
    const u = await getCurrentUser(req);
    if (!u || !canUserManageLeads(u))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const p = req.nextUrl.searchParams,
      from = p.get("from"),
      to = p.get("to"),
      rep = p.get("rep");
    const events = await prisma.missedVisit.findMany({
      where: {
        trip_lead: {
          lead: getLeadFilterForUser(u),
          ...(rep ? { trip: { ground_rep_id: rep } } : {}),
        },
        created_at: {
          ...(from
            ? { gte: new Date(dateOnly(from) + "T00:00:00+05:30") }
            : {}),
          ...(to
            ? {
                lt: new Date(
                  new Date(dateOnly(to) + "T00:00:00+05:30").getTime() +
                    86400000,
                ),
              }
            : {}),
        },
      },
      include: {
        trip_lead: {
          include: {
            lead: { select: { lead_code: true, company_name: true } },
            trip: {
              select: { ground_rep: { select: { id: true, name: true } } },
            },
          },
        },
      },
      orderBy: { created_at: "desc" },
    });
    return NextResponse.json({ events });
  } catch (e) {
    return failure(e);
  }
}
