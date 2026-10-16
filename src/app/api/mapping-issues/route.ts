import { currentDataIssues } from "@/lib/leads/data-issues";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getLeadFilterForUser } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
export async function GET(req: NextRequest) {
  const u = await getCurrentUser(req);
  if (!u || u.role === "ground_rep")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const countOnly = req.nextUrl.searchParams.get("count") === "true";
  const issueRelations = {
    partners: { select: { partner_status: true } },
    consultations: { orderBy: [{ visit_date: "desc" as const }, { created_at: "desc" as const }, { id: "desc" as const }], take: 1, select: { outcome: true, interest_level: true, visit_date: true, created_at: true } },
    activity_logs: { where: { action: "FUNNEL_STATUS_UPDATED" }, orderBy: { created_at: "desc" as const }, take: 1, select: { new_value: true, created_at: true } },
  };
  const issueCandidates = {
    AND: [
      getLeadFilterForUser(u),
      {
        OR: [
          { geocode_status: { in: ["mapping_issue" as const, "mismatch_flagged" as const, "invalid" as const] } },
          { status: "Needs Data Correction" },
          { consultations: { some: { outcome: { equals: "Wrong location", mode: "insensitive" as const } } } },
          { consultations: { some: { outcome: { equals: "Wrong location/office closed", mode: "insensitive" as const } } } },
          { activity_logs: { some: { action: "FUNNEL_STATUS_UPDATED", new_value: "Needs Data Correction" } } },
        ],
      },
    ],
  };
  if (countOnly) {
    const countRows = await prisma.lead.findMany({
      where: issueCandidates,
      select: {
        status: true,
        geocode_status: true,
        geocode_issue_reason: true,
        ...issueRelations,
      },
    });
    return NextResponse.json({
      count: countRows.filter((lead) => currentDataIssues(lead).length).length,
    });
  }
  const rows = await prisma.lead.findMany({
    where: issueCandidates,
    include: issueRelations,
    orderBy: [{ geocode_flagged_at: "asc" }, { id: "asc" }],
  });
  const leads = rows.map(lead => ({ ...lead, issue_reasons: currentDataIssues(lead) })).filter(lead => lead.issue_reasons.length);
  return NextResponse.json({ leads });
}
