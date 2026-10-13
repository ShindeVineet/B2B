import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLeadFilterForUser } from "@/lib/permissions";
import { failure } from "@/lib/phase5/http";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // Readiness remains durable in consultation history, independent of documents.
    const leads = await prisma.lead.findMany({
      where: {
        AND: [
          getLeadFilterForUser(user),
          {
            consultations: { some: { outcome: "Ready for onboarding" } },
            partners: { none: { partner_status: "active" } },
          },
        ],
      },
      select: {
        id: true,
        lead_code: true,
        company_name: true,
        consultations: {
          where: { outcome: "Ready for onboarding" },
          orderBy: { created_at: "desc" },
          take: 1,
          select: { visit_date: true },
        },
        partners: {
          orderBy: { created_at: "desc" },
          take: 1,
          select: { id: true, partner_status: true, submitted_by: true },
        },
      },
      orderBy: { updated_at: "desc" },
    });
    return NextResponse.json({
      reminders: leads.map((lead) => {
        const partner = lead.partners[0];
        const canOpenPartner =
          partner &&
          (partner.submitted_by === user.id ||
            ["b2b_head", "regional_manager"].includes(user.role));
        return {
          id: lead.id,
          lead_code: lead.lead_code,
          company_name: lead.company_name,
          since: lead.consultations[0].visit_date,
          status: partner?.partner_status || "documents_pending",
          href: partner
            ? canOpenPartner
              ? `/partners?partner_id=${partner.id}`
              : `/leads/${lead.id}`
            : user.role === "analyst"
              ? `/leads/${lead.id}`
              : `/partners?lead_id=${lead.id}`,
        };
      }),
    });
  } catch (e) {
    return failure(e);
  }
}
