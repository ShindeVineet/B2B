import { currentDataIssues } from "@/lib/leads/data-issues";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getLeadFilterForUser } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
export async function GET(req: NextRequest) {
  const u = await getCurrentUser(req);
  if (!u || u.role === "ground_rep")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const rows = await prisma.lead.findMany({
    where: getLeadFilterForUser(u),
    include: {
      partners: { select: { partner_status: true } },
      consultations: { orderBy: [{ visit_date: "desc" }, { created_at: "desc" }, { id: "desc" }], take: 1, select: { outcome: true, interest_level: true, visit_date: true, created_at: true } },
      activity_logs: { where: { action: "FUNNEL_STATUS_UPDATED" }, orderBy: { created_at: "desc" }, take: 1, select: { new_value: true, created_at: true } },
    },
    orderBy: [{ geocode_flagged_at: "asc" }, { id: "asc" }],
  });
  const leads = rows.map(lead => ({ ...lead, issue_reasons: currentDataIssues(lead) })).filter(lead => lead.issue_reasons.length);
  if (req.nextUrl.searchParams.get("count") === "true") return NextResponse.json({ count: leads.length });
  return NextResponse.json({ leads });
}
