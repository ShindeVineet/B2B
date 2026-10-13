export const CHANNELS = { ground: "Ground Team", store: "Store Walk-in", caller: "Inbound Calls", head: "Head / Other" } as const;
export type Channel = keyof typeof CHANNELS;
export function channelFor(input: { interaction_channel?: string | null; direct_store_meeting?: boolean; trip_lead_id?: string | null; lead_source?: string | null; intake_team?: string | null; rep_role?: string | null }): Channel {
  if (input.interaction_channel && input.interaction_channel in CHANNELS) return input.interaction_channel as Channel;
  if (input.direct_store_meeting) return "store";
  if (input.trip_lead_id) return "ground";
  const source = input.lead_source?.toLowerCase();
  if (source === "walk-in") return "store";
  if (["cdt", "linkedin", "phone", "calling"].includes(source || "")) return "caller";
  if (input.intake_team && input.intake_team in CHANNELS) return input.intake_team as Channel;
  return input.rep_role === "ground_rep" ? "ground" : "head";
}
export function latestByLead<T extends { lead_id: string; visit_date: Date | string; created_at?: Date | string; id: string }>(rows: T[]) {
  const ordered = [...rows].sort((a, b) => new Date(b.visit_date).getTime() - new Date(a.visit_date).getTime() || new Date(b.created_at || b.visit_date).getTime() - new Date(a.created_at || a.visit_date).getTime() || b.id.localeCompare(a.id));
  return [...new Map(ordered.reverse().map(row => [row.lead_id, row])).values()].sort((a,b) => new Date(b.visit_date).getTime() - new Date(a.visit_date).getTime());
}
export function summarizeChannels(consultations: { id: string; lead_id: string; visit_date: Date | string; created_at?: Date | string; interest_level: string | null; channel: Channel }[], partners: { id: string; channel: Channel }[]) {
  const channels = Object.keys(CHANNELS).map(key => ({ key: key as Channel, label: CHANNELS[key as Channel], consults: 0, hot: 0, warm: 0, cold: 0, unclassified: 0, onboarded: 0 }));
  const latest = latestByLead(consultations);
  for (const c of latest) { const row = channels.find(r => r.key === c.channel)!; row.consults++; const level = c.interest_level?.toLowerCase(); if (level === "high") row.hot++; else if (level === "medium") row.warm++; else if (level === "low") row.cold++; else row.unclassified++; }
  for (const p of partners) channels.find(r => r.key === p.channel)!.onboarded++;
  return { channels, consultedLeads: latest.length, consultationRecords: consultations.length, repeatConsultations: consultations.length - latest.length, onboarded: partners.length };
}

export function onboardingChannel(source: string | null, other: string | null, fallback: Channel): Channel {
  const value = (source === "Other" ? other : source)?.trim().toLowerCase();
  if (["walk in (direct)", "walk-in"].includes(value || "")) return "store";
  if (["on ground direct convert", "walk in (on ground)"].includes(value || "")) return "ground";
  if (["cdt", "linkedin ads", "follow up call", "pre-qualification call"].includes(value || "")) return "caller";
  return fallback;
}
