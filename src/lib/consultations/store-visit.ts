import type { Prisma } from "@prisma/client";
import { RequestError } from "@/lib/phase5/http";
export function parseStoreVisit(raw: Record<string, unknown>) {
  const enabled = raw.visit_scheduled === true || raw.visit_scheduled === "true" || raw.visit_scheduled === "on" || raw.outcome === "Visit scheduled";
  if (!enabled) return null;
  if (typeof raw.visit_store_id !== "string" || !raw.visit_store_id) throw new RequestError("Choose the store for the scheduled visit");
  // Intake uses an explicit India offset; clients may also send ISO UTC.
  const value = raw.visit_scheduled_at;
  if (typeof value !== "string" || !/(Z|[+-]\d{2}:\d{2})$/.test(value)) throw new RequestError("Choose a visit date and time");
  const at = new Date(value);
  if (!Number.isFinite(at.getTime()) || at.getTime() <= Date.now()) throw new RequestError("The store visit must be in the future");
  return { store_id: raw.visit_store_id, scheduled_at: at };
}
export async function saveStoreVisit(tx: Prisma.TransactionClient, raw: Record<string, unknown>, leadId: string, consultationId: string) {
  const visit = parseStoreVisit(raw);
  if (!visit) return;
  if (!await tx.store.findFirst({ where: { id: visit.store_id, active: true } })) throw new RequestError("Choose an active store");
  await tx.storeVisit.create({ data: { ...visit, lead_id: leadId, consultation_id: consultationId } });
}
