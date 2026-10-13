import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { currentDataIssues } from "@/lib/leads/data-issues";
import { failure } from "@/lib/phase5/http";
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user || user.role !== "b2b_head")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const leads = await prisma.lead.findMany({
      include: {
        partners: { select: { id: true, partner_code: true, partner_status: true } },
        ground_rep: { select: { name: true } },
        calling_associate: { select: { name: true } },
        consultations: { orderBy: [{ visit_date: "desc" }, { created_at: "desc" }, { id: "desc" }], include: { rep: { select: { name: true } } } },
        activity_logs: { where: { action: "FUNNEL_STATUS_UPDATED" }, orderBy: { created_at: "desc" }, take: 1, select: { new_value: true, created_at: true } },
      },
      orderBy: { id: "asc" },
    });
    const rows = leads.map(lead => {
      const c = lead.consultations[0];
      const metadata = lead.consultations.map(c => (c.responses || {}) as { issues?: unknown; source_row?: number; historical_onboarding_claim?: boolean; dashboard_reconciliation?: { row?: number } });
      return {
        id: lead.id, lead_code: lead.lead_code, company_name: lead.company_name,
        phone_no: lead.phone_no, pin_code: lead.pin_code, address: lead.address,
        interest: c?.interest_level || "NA", executive: c?.ground_staff_name || c?.rep.name || "NA",
        assignee: lead.ground_rep?.name || lead.calling_associate?.name || "Unassigned", outcome: c?.outcome || "No consultation",
        onboarding: lead.partners.some(p=>p.partner_status==="active") ? "Onboarded" : lead.partners.some(p=>p.partner_status==="pending_review") ? "Pending approval" : "Not onboarded",
        partners: lead.partners,
        issues: [...new Set([...currentDataIssues(lead), ...metadata.flatMap(m=>Array.isArray(m.issues)?m.issues.filter((v):v is string=>typeof v==="string"):[])])],
        sourceRows: metadata.flatMap(m=>m.dashboard_reconciliation?.row || m.source_row ? [m.dashboard_reconciliation?.row || m.source_row!] : []),
        consultationCount: lead.consultations.length,
        claim: metadata.some(m=>m.historical_onboarding_claim),
      };
    });
    const all = rows;
    const counts = {
      leads: all.length,
      consultations: rows.reduce((sum,r)=>sum+r.consultationCount,0),
      onboarded: all.filter((r) => r.onboarding === "Onboarded").length,
      pending: all.filter((r) => r.onboarding === "Pending approval").length,
      notOnboarded: all.filter((r) => r.onboarding === "Not onboarded").length,
      issues: all.filter((r) => r.issues.length).length,
    };
    const q = (req.nextUrl.searchParams.get("q") || "").toLowerCase();
    const tab = req.nextUrl.searchParams.get("tab") || "issues";
    const filtered = all.filter(
      (r) =>
        (tab === "all" ||
          (tab === "issues" && r.issues.length) ||
          (tab === "not_onboarded" && r.onboarding !== "Onboarded") ||
          (tab === "onboarded" && r.onboarding === "Onboarded")) &&
        (!q ||
          [
            r.company_name,
            r.lead_code,
            r.phone_no,
            r.executive,
            r.interest,
            ...r.issues,
          ]
            .join(" ")
            .toLowerCase()
            .includes(q)),
    );
    const page = Math.max(1, Number(req.nextUrl.searchParams.get("page")) || 1);
    return NextResponse.json({
      counts,
      total: filtered.length,
      page,
      pageSize: 24,
      rows: filtered.slice((page - 1) * 24, page * 24),
    });
  } catch (e) {
    return failure(e);
  }
}
