import { addDays } from "../phase5/calendar";
export const dailyReportRange = (date: string) => ({
  gte: new Date(`${date}T00:00:00+05:30`),
  lt: new Date(`${addDays(date, 1)}T00:00:00+05:30`),
});
export type DailyInteraction = {
  id: string;
  lead_id: string;
  channel?: string;
  interest_level?: string | null;
  created_at: Date | string;
};
type CallAudit = { action: string; new_value: string | null };
// A first call may create a consultation; subsequent calls reuse it. Count the
// dated call once, while retaining standalone caller consultations in the report.
export function dailyInbound<C extends DailyInteraction, L extends DailyInteraction>(consultations: C[], calls: L[], events: CallAudit[]) {
  const callIds = new Set(calls.map(call => call.id));
  const linked = new Set<string>();
  const interest = new Map<string, string>();
  for (const event of events) {
    if (!["CALLING_CONSULTATION_LOGGED", "OFFICE_CALL_LOGGED", "CALL_NOT_PICKED"].includes(event.action)) continue;
    try {
      const data = JSON.parse(event.new_value || "null");
      if (!data || !callIds.has(data.call_id)) continue;
      if (typeof data.consultation_id === "string") linked.add(data.consultation_id);
      if (typeof data.interest_level === "string") interest.set(data.call_id, data.interest_level);
    } catch { /* Historical malformed audits must not hide the underlying call. */ }
  }
  return [
    ...consultations.filter(row => row.channel === "caller" && !linked.has(row.id)),
    ...calls.map(row => ({ ...row, channel: "caller", interest_level: interest.get(row.id) || null })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime() || b.id.localeCompare(a.id));
}
