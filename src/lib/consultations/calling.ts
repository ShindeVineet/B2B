import { addDays, dateOnly, todayIndia } from '../phase5/calendar';

export function callingFormFor(lead: { intake_team?: string | null; lead_source?: string | null }, role: string, tripId?: string | null) {
  return !tripId && role !== 'ground_rep' && (lead.intake_team === 'caller' || ['Phone', 'CDT', 'LinkedIn'].includes(lead.lead_source || ''));
}

export function parseCallingConsultation(raw: Record<string, unknown>, today = todayIndia()) {
  if (typeof raw.call_picked !== 'boolean') throw new RangeError('Choose Yes or No for Call Picked');
  if (typeof raw.notes !== 'string' || !raw.notes.trim() || raw.notes.length > 10000) throw new RangeError('Enter call notes (up to 10,000 characters)');
  const notes = raw.notes.trim();
  // An unanswered attempt must not replace interest or group state with hidden form values.
  if (!raw.call_picked) return { picked: false as const, interest: null, followUp: addDays(today, 1), group: undefined, notes };
  if (!['High', 'Medium', 'Low'].includes(String(raw.interest_level))) throw new RangeError('Choose a level of interest');
  if (typeof raw.whatsapp_group_created !== 'boolean') throw new RangeError('Choose Group Created');
  const followUp = raw.next_follow_up_date;
  if (followUp != null && followUp !== '' && typeof followUp !== 'string') throw new RangeError('Choose a valid follow-up date');
  const date = followUp ? dateOnly(followUp as string) : null;
  if (date && date < today) throw new RangeError('Follow-up date must be today or later');
  return { picked: true as const, interest: raw.interest_level as string, followUp: date, group: raw.whatsapp_group_created, notes };
}
