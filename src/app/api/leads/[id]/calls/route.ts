import { isWonLead } from "@/lib/leads/interest-bucket";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getLeadFilterForUser } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { RequestError, failure } from "@/lib/phase5/http";
import { dateOnly, todayIndia } from "@/lib/phase5/calendar";
export { GET } from "@/app/api/cold-leads/[id]/calls/route";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser(req);
    if (!user || user.role === "analyst")
      throw new RequestError("Forbidden", 403);
    const { id } = await params;
    const body = await req.json();
    if (
      typeof body.notes !== "string" ||
      !body.notes.trim() ||
      body.notes.length > 10000
    )
      throw new RequestError("Enter call notes (up to 10,000 characters)");
    const date = body.next_follow_up_date
      ? dateOnly(body.next_follow_up_date)
      : null;
    if (date && date < todayIndia())
      throw new RequestError("Choose today or a future follow-up date");
    const call = await prisma.$transaction(async (tx) => {
      const lead = await tx.lead.findFirst({
        where: { id, AND: [getLeadFilterForUser(user)] },
        include: { partners: { select: { partner_status: true } } },
      });
      if (!lead) throw new RequestError("Lead not found", 404);
      if (isWonLead(lead)) throw new RequestError("Onboarded leads cannot log calls", 409);
      if (
        date &&
        ["onboarded", "Closed-Lost", "Closed-Won", "Converted"].includes(
          lead.status,
        )
      )
        throw new RequestError("Closed leads cannot receive active follow-ups");
      const existing = await tx.followUp.findUnique({ where: { lead_id: id } });
      const repId = lead.assigned_ground_rep_id || existing?.rep_id || user.id;
      const record = await tx.callLog.create({
        data: {
          lead_id: id,
          actor_id: user.id,
          outcome: "Office phone call",
          notes: body.notes.trim(),
          next_follow_up_date: date ? new Date(date) : null,
        },
      });
      await tx.lead.update({ where: { id }, data: { call_date: new Date() } });
      if (date)
        await tx.followUp.upsert({
          where: { lead_id: id },
          create: { lead_id: id, rep_id: repId, due_date: new Date(date) },
          update: { rep_id: repId, due_date: new Date(date), active: true },
        });
      await tx.activityLog.create({
        data: {
          lead_id: id,
          actor_id: user.id,
          action: "OFFICE_CALL_LOGGED",
          new_value: JSON.stringify({
            call_id: record.id,
            next_follow_up_date: date,
          }),
        },
      });
      return record;
    });
    return NextResponse.json({ call });
  } catch (error) {
    return failure(error);
  }
}
