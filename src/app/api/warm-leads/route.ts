import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { dashboardScope } from "@/lib/dashboard/service";
import { prisma } from "@/lib/prisma";
import { failure, RequestError } from "@/lib/phase5/http";
import { isWonLead } from "@/lib/leads/interest-bucket";
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req); if (!user) throw new RequestError("Unauthorized", 401);
    const rows = await prisma.lead.findMany({ where: dashboardScope(user), include: {
      partners: { select: { partner_status: true } },
      consultations: { orderBy: [{ visit_date: "desc" }, { created_at: "desc" }, { id: "desc" }], take: 1 },
      store_visits: { where: { status: "scheduled" }, orderBy: { scheduled_at: "asc" }, take: 1, include: { store: { select: { name: true } } } },
    }, orderBy: { updated_at: "desc" } });
    const leads = rows.filter(l => !isWonLead(l) && l.consultations[0]?.interest_level?.toLowerCase() === "medium").map(l => ({ ...l, latest_interest_level: "Medium", latest_consultation_outcome: l.consultations[0].outcome }));
    return NextResponse.json({ leads });
  } catch (e) { return failure(e); }
}
