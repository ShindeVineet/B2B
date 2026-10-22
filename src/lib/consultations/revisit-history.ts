import type { Consultation, Prisma } from '@prisma/client';
export type RevisitEntry = {
  id: string; visited_at: string; actor_id: string; staff_name: string;
  trip_lead_id: string | null; channel: string; outcome: string; notes: string;
  next_follow_up_date: string | null;
};
export function appendRevisit(previous: Consultation, entry: RevisitEntry): Prisma.ConsultationUpdateInput {
  const responses = previous.responses && typeof previous.responses === 'object' && !Array.isArray(previous.responses) ? previous.responses : {};
  const history = Array.isArray(responses.revisits) ? responses.revisits : [];
  if (history.some(row => row && typeof row === 'object' && !Array.isArray(row) && row.id === entry.id)) return {};
  return {
    outcome: entry.outcome,
    ...(entry.next_follow_up_date || entry.outcome !== "Couldn't meet" ? { next_follow_up_date: entry.next_follow_up_date ? new Date(entry.next_follow_up_date) : null } : {}),
    responses: {
      ...responses,
      original_consultation: responses.original_consultation ?? { outcome: previous.outcome, notes: previous.notes, interest_level: previous.interest_level, next_follow_up_date: previous.next_follow_up_date?.toISOString() ?? null },
      revisits: [...history, entry] as Prisma.InputJsonValue[],
    },
  };
}
