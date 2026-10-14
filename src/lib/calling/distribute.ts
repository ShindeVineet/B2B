import { Prisma } from "@prisma/client";
/** Persistent, transaction-serialized round robin; storeless callers share one rotation. */
export async function assignCaller(
  tx: Prisma.TransactionClient,
  leadId: string,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(928060)`;
  const lead = await tx.lead.findUnique({ where: { id: leadId } });
  if (!lead || lead.calling_associate_id) return;
  const users = await tx.user.findMany({
    where: {
      active: true,
      role: "store_associate",
      ...(lead.assigned_store_id ? { store_id: lead.assigned_store_id } : {}),
    },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  if (!users.length) return;
  const key = lead.assigned_store_id || "__global__";
  const cursor = await tx.callingRotation.findUnique({ where: { key } });
  const next =
    users[
      (users.findIndex((u) => u.id === cursor?.last_user_id) + 1) % users.length
    ];
  await tx.lead.update({
    where: { id: leadId },
    data: { calling_associate_id: next.id },
  });
  await tx.callingRotation.upsert({
    where: { key },
    create: { key, last_user_id: next.id },
    update: { last_user_id: next.id },
  });
}

/** Assign a new storeless import in one round-robin pass without one query per lead. */
export async function assignImportedCallers(
  tx: Prisma.TransactionClient,
  leadIds: string[],
) {
  if (!leadIds.length) return 0;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(928060)`;
  const users = await tx.user.findMany({
    where: { active: true, role: "store_associate" },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  if (!users.length) return 0;
  const key = "__global__";
  const cursor = await tx.callingRotation.findUnique({ where: { key } });
  const start = (users.findIndex((user) => user.id === cursor?.last_user_id) + 1) % users.length;
  const groups = new Map(users.map((user) => [user.id, [] as string[]]));
  for (const [index, leadId] of leadIds.entries())
    groups.get(users[(start + index) % users.length].id)!.push(leadId);
  for (const [userId, ids] of groups)
    if (ids.length)
      await tx.lead.updateMany({
        where: { id: { in: ids }, calling_associate_id: null },
        data: { calling_associate_id: userId },
      });
  const lastUser = users[(start + leadIds.length - 1) % users.length];
  await tx.callingRotation.upsert({
    where: { key },
    create: { key, last_user_id: lastUser.id },
    update: { last_user_id: lastUser.id },
  });
  return leadIds.length;
}

/** Includes the backlog and retries automatically when associates are added later. */
export async function distributeWaitingCallers(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(928060)`;
  const associates = await tx.user.findMany({
    where: { role: "store_associate", active: true },
    select: { store_id: true },
  });
  if (!associates.length) return 0;
  const leads = await tx.lead.findMany({
    where: {
      calling_associate_id: null,
      AND: [
        {
          OR: [
            { assigned_store_id: null },
            {
              assigned_store_id: {
                in: associates.flatMap((u) => (u.store_id ? [u.store_id] : [])),
              },
            },
          ],
        },
      ],
      OR: [
        { geocode_issue_reason: "not_found", location_verified: false, intake_team: "ground" },
        { lead_source: { in: ["CDT", "Phone", "LinkedIn"] } },
        { intake_team: "caller" },
      ],
    },
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
    select: { id: true },
    take: 500,
  });
  for (const lead of leads) await assignCaller(tx, lead.id);
  return leads.length;
}
