import { isWonLead } from "@/lib/leads/interest-bucket";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getLeadFilterForUser, canUserManageLeads } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { RequestError, failure } from "@/lib/phase5/http";
import { dateOnly, todayIndia } from "@/lib/phase5/calendar";
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const u = await getCurrentUser(req);
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const lead = await prisma.lead.findFirst({
    where: { id, AND: [getLeadFilterForUser(u)] },
    select: { id: true },
  });
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    calls: await prisma.callLog.findMany({
      where: { lead_id: id },
      include: { actor: { select: { name: true } } },
      orderBy: { created_at: "desc" },
    }),
  });
}
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const u = await getCurrentUser(req);
    if (!u || !canUserManageLeads(u)) throw new RequestError("Forbidden", 403);
    const { id } = await params,
      b = await req.json();
    if (
      ![
        "Converted",
        "Reactivated",
        "Call back later",
        "Not interested",
      ].includes(b.outcome)
    )
      throw new RequestError("Choose a call outcome");
    if (
      typeof b.notes !== "string" ||
      !b.notes.trim() ||
      b.notes.length > 10000
    )
      throw new RequestError("Call notes are required");
    if (
      b.outcome === "Not interested" &&
      (typeof b.reason !== "string" || !b.reason.trim())
    )
      throw new RequestError("A closed-lost reason is required");
    const date = ["Reactivated", "Call back later"].includes(b.outcome)
      ? dateOnly(b.date)
      : null;
    if (date && date < todayIndia())
      throw new RequestError("Choose today or a future date");
    const call = await prisma.$transaction(
      async (tx) => {
        const lead = await tx.lead.findFirst({
          where: { id, AND: [getLeadFilterForUser(u)] },
          include: { cold_case: true, partners: { select: { partner_status: true } } },
        });
        if (!lead?.cold_case || lead.cold_case.resolved_at)
          throw new RequestError(
            "This cold-lead case is no longer active",
            409,
          );
        if (isWonLead(lead)) throw new RequestError("Onboarded leads cannot log calls", 409);
        const consultation = await tx.consultation.findUniqueOrThrow({
          where: { id: lead.cold_case.consultation_id },
        });
        const record = await tx.callLog.create({
          data: {
            lead_id: id,
            actor_id: u.id,
            outcome: b.outcome,
            notes: b.notes.trim(),
            reason: b.outcome === "Not interested" ? b.reason.trim() : null,
            callback_date:
              b.outcome === "Call back later" ? new Date(date!) : null,
            next_follow_up_date:
              b.outcome === "Reactivated" ? new Date(date!) : null,
          },
        });
        const status =
          b.outcome === "Converted"
            ? "onboarded"
            : b.outcome === "Reactivated"
              ? "Assigned"
              : b.outcome === "Not interested"
                ? "Closed-Lost"
                : lead.status;
        await tx.lead.update({
          where: { id },
          data: {
            status,
            call_date: new Date(),
            call_outcome: b.outcome,
            ...(b.outcome === "Converted"
              ? { outcome: "On-boarding Done" }
              : {}),
          },
        });
        if (b.outcome !== "Call back later")
          await tx.coldLeadCase.update({
            where: { id: lead.cold_case.id },
            data: { resolved_at: new Date() },
          });
        if (b.outcome === "Reactivated")
          await tx.followUp.upsert({
            where: { lead_id: id },
            create: {
              lead_id: id,
              rep_id: lead.assigned_ground_rep_id || consultation.rep_id,
              due_date: new Date(date!),
            },
            update: {
              rep_id: lead.assigned_ground_rep_id || consultation.rep_id,
              due_date: new Date(date!),
              active: true,
            },
          });
        else if (b.outcome !== "Call back later")
          await tx.followUp.updateMany({
            where: { lead_id: id },
            data: { active: false },
          });
        await tx.activityLog.create({
          data: {
            lead_id: id,
            actor_id: u.id,
            action: "MANAGER_CALL_LOGGED",
            old_value: lead.status,
            new_value: JSON.stringify({
              outcome: b.outcome,
              notes: b.notes.trim(),
              reason: b.reason || null,
              date,
            }),
          },
        });
        return record;
      },
      { isolationLevel: "Serializable" },
    );
    return NextResponse.json({ call });
  } catch (e) {
    return failure(e);
  }
}
