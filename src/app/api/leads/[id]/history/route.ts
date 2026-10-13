import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLeadFilterForUser } from "@/lib/permissions";
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const u = await getCurrentUser(req);
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const lead = await prisma.lead.findFirst({
    where: { id, AND: [getLeadFilterForUser(u)] },
    include: {
      ground_rep: { select: { name: true } },
      calling_associate: { select: { name: true } },
      store: { select: { name: true } },
      consultations: { orderBy: [{ visit_date: "desc" }, { created_at: "desc" }], include: { rep: { select: { name: true } } } },
      call_logs: { orderBy: { created_at: "desc" }, include: { actor: { select: { name: true } } } },
      store_visits: { orderBy: { scheduled_at: "desc" }, include: { store: { select: { name: true } } } },
      partners: { select: { id: true, partner_code: true, company_firm_name: true, company_legal_name: true, contact_person_name: true, partner_status: true, onboarded_at: true } },
      trip_leads: { orderBy: { scheduled_date: "desc" }, include: { trip: { select: { name: true } } } },
      activity_logs: {
        orderBy: { created_at: "desc" },
        include: { actor: { select: { name: true } } },
      },
    },
  });
  return lead
    ? NextResponse.json({ lead })
    : NextResponse.json({ error: "Not found" }, { status: 404 });
}
