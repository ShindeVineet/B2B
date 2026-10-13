import type { Prisma } from "@prisma/client";
import { RequestError } from "@/lib/phase5/http";
export async function checkReferral(tx: Prisma.TransactionClient, referredBy: string | null, partnerId?: string) {
  if (!referredBy) return;
  if (referredBy === partnerId) throw new RequestError("A partner cannot refer themselves");
  const referring = await tx.partner.findFirst({ where: { id: referredBy, partner_status: "active" }, select: { id: true } });
  if (!referring) throw new RequestError("Choose an existing active referring partner");
}
