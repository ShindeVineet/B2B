import { prisma } from "../prisma";
import { notifyWorkflow } from "./service";
import { todayIndia } from "../phase5/calendar";
export async function runColdReminders(now = new Date()) {
  const today = new Date(todayIndia());
  const heads = await prisma.user.findMany({
    where: { role: "b2b_head", active: true },
    select: { id: true },
  });
  const cases = await prisma.coldLeadCase.findMany({
    where: {
      resolved_at: null,
      flagged_at: { lte: new Date(now.getTime() - 48 * 3600000) },
      lead: { status: "Needs Manager Review" },
    },
    include: { lead: { select: { company_name: true } } },
  });
  for (const c of cases) {
    const logged = await prisma.callLog.count({
      where: { lead_id: c.lead_id, created_at: { gte: c.flagged_at } },
    });
    if (!logged)
      await prisma.$transaction((tx) =>
        notifyWorkflow(
          tx,
          c.lead_id,
          "sla_breach",
          `cold-sla:${c.id}:${c.flagged_at.toISOString()}`,
          `No manager call for ${c.lead.company_name} within 48 hours`,
          heads.map((h) => h.id),
        ),
      );
  }
  // Data-correction escalation uses its existing status-entry time and correction audit actions.
  const corrections = await prisma.lead.findMany({
    where: {
      status: "Needs Data Correction",
      status_entered_at: { lte: new Date(now.getTime() - 48 * 3600000) },
    },
  });
  for (const l of corrections) {
    if (!l.status_entered_at) continue;
    const handled = await prisma.activityLog.count({
      where: {
        lead_id: l.id,
        created_at: { gte: l.status_entered_at },
        action: { in: ["LOCATION_UPDATED", "MANAGER_CALL_LOGGED"] },
      },
    });
    if (!handled)
      await prisma.$transaction((tx) =>
        notifyWorkflow(
          tx,
          l.id,
          "sla_breach",
          `correction-sla:${l.id}:${l.status_entered_at!.toISOString()}`,
          `${l.company_name} still needs data correction after 48 hours`,
          heads.map((h) => h.id),
        ),
      );
  }
  const callbacks = await prisma.callLog.findMany({
    where: {
      outcome: "Call back later",
      callback_date: { lte: today },
      lead: { cold_case: { resolved_at: null } },
    },
    include: { lead: { select: { company_name: true } } },
  });
  for (const call of callbacks) {
    const newer = await prisma.callLog.count({
      where: { lead_id: call.lead_id, created_at: { gt: call.created_at } },
    });
    if (!newer)
      await prisma.$transaction((tx) =>
        notifyWorkflow(
          tx,
          call.lead_id,
          "callback_reminder",
          `callback:${call.id}`,
          `Call back ${call.lead.company_name}`,
          [call.actor_id],
        ),
      );
  }
  const followups = await prisma.followUp.findMany({
    where: {
      active: true,
      due_date: { lte: today },
      lead: {
        status: {
          notIn: ["onboarded", "Closed-Lost", "Closed-Won", "Converted"],
        },
      },
    },
    include: { lead: { select: { company_name: true } } },
  });
  for (const f of followups)
    await prisma.$transaction((tx) =>
      notifyWorkflow(
        tx,
        f.lead_id,
        "followup_reminder",
        `followup:${f.id}:${f.due_date.toISOString()}`,
        `Follow up with ${f.lead.company_name}`,
        [f.rep_id],
      ),
    );
}
