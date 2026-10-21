import type { Prisma, Consultation, Lead } from "@prisma/client";
import { coldReasons, DEFAULT_COLD_CONFIG } from "./rules";
export async function notifyWorkflow(
  tx: Prisma.TransactionClient,
  leadId: string,
  type: string,
  key: string,
  message: string,
  users: string[],
) {
  if (!users.length) return;
  await tx.workflowNotification.createMany({
    data: users.map((id) => ({
      user_id: id,
      lead_id: leadId,
      type,
      dedupe_key: `${key}:${id}`,
      message,
    })),
    skipDuplicates: true,
  });
}
export async function managerRecipients(
  tx: Prisma.TransactionClient,
  lead: Lead,
) {
  const store = lead.assigned_store_id
    ? await tx.store.findUnique({
        where: { id: lead.assigned_store_id },
        select: { manager_id: true },
      })
    : null;
  if (store?.manager_id) return [store.manager_id];
  const managers = await tx.user.findMany({
    where: {
      active: true,
      role: "regional_manager",
      region: lead.region || "__unassigned__",
    },
    select: { id: true },
  });
  if (managers.length) return managers.map((m) => m.id);
  return (
    await tx.user.findMany({
      where: { active: true, role: "b2b_head" },
      select: { id: true },
    })
  ).map((h) => h.id);
}
export async function evaluateCold(
  tx: Prisma.TransactionClient,
  lead: Lead,
  c: Consultation,
  reassess = false,
) {
  const config =
    (await tx.coldLeadConfig.findUnique({ where: { id: "default" } })) ||
    DEFAULT_COLD_CONFIG;
  const reasons = coldReasons(c, config);
  const existing = await tx.coldLeadCase.findUnique({
    where: { lead_id: lead.id },
  });
  if (
    !reasons.length ||
    ["onboarded", "Closed-Lost", "Closed-Won", "Converted"].includes(
      lead.status,
    )
  ) {
    if (existing && !existing.resolved_at)
      await tx.coldLeadCase.update({
        where: { id: existing.id },
        data: { resolved_at: new Date() },
      });
    return;
  }
  if (!reassess && existing?.resolved_at && existing.consultation_id === c.id) return;
  const flag =
    existing && !existing.resolved_at ? existing.flagged_at : new Date();
  const row = await tx.coldLeadCase.upsert({
    where: { lead_id: lead.id },
    create: {
      lead_id: lead.id,
      consultation_id: c.id,
      rules: reasons,
      flagged_at: flag,
    },
    update: {
      consultation_id: c.id,
      rules: reasons,
      resolved_at: null,
      flagged_at: flag,
    },
  });
  await tx.lead.update({
    where: { id: lead.id },
    data: { status: "Needs Manager Review" },
  });
  await notifyWorkflow(
    tx,
    lead.id,
    "manager_review_needed",
    `cold:${row.id}:${flag.toISOString()}`,
    `${lead.company_name} needs a manager call: ${reasons.join(", ")}`,
    await managerRecipients(tx, lead),
  );
}
