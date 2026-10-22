import type { Prisma } from '@prisma/client';
import { todayIndia } from '../phase5/calendar';
// Active reminders are explicit pending work: merely passing their date never expires them.
// A contact before the due day cannot complete a future obligation. A newly scheduled
// same-day reminder remains active, regardless of another contact earlier that day.
export async function completeDueFollowUp(tx: Prisma.TransactionClient, leadId: string, contactDay = todayIndia()) {
  return tx.followUp.updateMany({ where: { lead_id: leadId, active: true, due_date: { lte: new Date(contactDay) } }, data: { active: false } });
}
export function followUpWindow(view: string, today = todayIndia()) {
  if (view === 'today') return { equals: new Date(today) };
  if (view === 'overdue') return { lt: new Date(today) };
  if (view === 'upcoming') return { gt: new Date(today) };
  return { lte: new Date(today) };
}
