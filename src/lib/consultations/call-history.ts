import type { Consultation, Prisma } from '@prisma/client';

export type ConsultationCall = {
  call_id: string;
  called_at: string;
  caller: string;
  actor_id: string;
  outcome: string;
  notes: string;
  interest_level?: string | null;
  next_follow_up_date: string | null;
  whatsapp_group_created?: boolean;
};

// Keep the original consultation's date, author, channel and detailed answers.
// Only current interest/reminder fields change; every interaction remains dated.
export function appendConsultationCall(existing: Consultation, call: ConsultationCall): Prisma.ConsultationUpdateInput {
  const responses = existing.responses && typeof existing.responses === 'object' && !Array.isArray(existing.responses)
    ? existing.responses : {};
  const history = Array.isArray(responses.follow_up_calls) ? responses.follow_up_calls : [];
  if (history.some(item => item && typeof item === 'object' && !Array.isArray(item) && item.call_id === call.call_id)) return {};
  return {
    ...(call.interest_level ? { interest_level: call.interest_level, next_follow_up_date: call.next_follow_up_date ? new Date(call.next_follow_up_date) : null } : {}),
    responses: {
      ...responses,
      original_consultation: responses.original_consultation ?? {
        interest_level: existing.interest_level, next_follow_up_date: existing.next_follow_up_date?.toISOString() ?? null,
        notes: existing.notes, outcome: existing.outcome,
      },
      follow_up_calls: [...history, call] as Prisma.InputJsonValue[],
    },
  };
}

// Callers must hold the lead row lock before reading/updating its consultation.
export async function attachConsultationCall(tx: Prisma.TransactionClient, leadId: string, call: ConsultationCall) {
  const existing = await tx.consultation.findFirst({ where: { lead_id: leadId }, orderBy: [{ visit_date: 'desc' }, { created_at: 'desc' }, { id: 'desc' }] });
  if (!existing) return null;
  return tx.consultation.update({ where: { id: existing.id }, data: appendConsultationCall(existing, call) });
}
