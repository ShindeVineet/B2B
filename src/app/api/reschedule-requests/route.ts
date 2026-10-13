import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user || !["b2b_head", "regional_manager"].includes(user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const requests = await prisma.activityLog.findMany({
    where: { action: "RESCHEDULE_REQUESTED" },
    include: {
      lead: { select: { company_name: true, lead_code: true } },
      actor: { select: { name: true } },
    },
    orderBy: { created_at: "desc" },
  });
  const decisions = await prisma.activityLog.findMany({
    where: {
      action: { in: ["RESCHEDULE_APPROVED", "RESCHEDULE_REJECTED"] },
      old_value: { in: requests.map((r) => r.id) },
    },
    select: { old_value: true },
  });
  const reviewed = new Set(decisions.map((d) => d.old_value));
  const visits = await prisma.tripLead.findMany({
    where: {
      id: { in: requests.flatMap((r) => (r.old_value ? [r.old_value] : [])) },
      completed: false,
      status: { in: ["pending", "rescheduled"] },
    },
    select: { id: true },
  });
  const actionable = new Set(visits.map((v) => v.id));
  return NextResponse.json({
    requests: requests
      .filter((r) => !reviewed.has(r.id) && actionable.has(r.old_value || ""))
      .map((r) => ({
        id: r.id,
        visit_id: r.old_value,
        lead: r.lead,
        requester: r.actor?.name,
        ...JSON.parse(r.new_value || "{}"),
      })),
  });
}
