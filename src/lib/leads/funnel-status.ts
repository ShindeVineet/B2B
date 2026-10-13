import { STATUS_CONFIG } from "@/lib/lead-status";
export const FUNNEL_STATUS_CONFIG = {
  New: STATUS_CONFIG.New,
  Assigned: STATUS_CONFIG.Assigned,
  Hot: STATUS_CONFIG.Hot,
  Warm: { ...STATUS_CONFIG.Hot, label: "Warm Lead", hex: "#d97706", glow: "rgba(217,119,6,0.4)", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", icon: "☀" },
  Cold: STATUS_CONFIG.Cold,
  Consulted: { ...STATUS_CONFIG.Assigned, label: "Consulted", icon: "✓" },
  "Visit Scheduled": { ...STATUS_CONFIG.Assigned, label: "Visit Scheduled", icon: "▦" },
  "Ready for Onboarding": { ...STATUS_CONFIG.Hot, label: "Ready for Onboarding", icon: "✓" },
  "Onboarding Pending": { ...STATUS_CONFIG.Assigned, label: "Onboarding Pending", icon: "◷" },
  Converted: { ...STATUS_CONFIG.Converted, label: "Onboarded" },
  Lost: STATUS_CONFIG.Lost,
  "Needs Manager Review": { ...STATUS_CONFIG.Cold, label: "Needs Manager Review" },
  "Needs Data Correction": { ...STATUS_CONFIG.Cold, label: "Needs Data Correction", icon: "!" },
};
export type FunnelStatus = keyof typeof FUNNEL_STATUS_CONFIG;
type Input = {
  status: string;
  assigned_store_id?: string | null; assigned_ground_rep_id?: string | null; calling_associate_id?: string | null;
  partners?: { partner_status: string }[];
  consultations?: { outcome: string; interest_level: string | null; visit_date: Date | string; created_at?: Date | string }[];
  store_visits?: { status: string }[];
  activity_logs?: { new_value: string | null; created_at: Date | string }[];
};
const normalize = (s?: string | null) => s?.trim().toLowerCase() || "";
export function funnelStatus(lead: Input): FunnelStatus {
  if (lead.partners?.some(p => p.partner_status === "active")) return "Converted";
  // Callers supply the latest consultation and explicit funnel edit, ordered newest first.
  const consultation = lead.consultations?.[0], edit = lead.activity_logs?.[0];
  if (edit?.new_value && edit.new_value in FUNNEL_STATUS_CONFIG && (!consultation || +new Date(edit.created_at) >= +new Date(consultation.created_at || consultation.visit_date))) return edit.new_value as FunnelStatus;
  if (lead.partners?.some(p => p.partner_status === "pending_review")) return "Onboarding Pending";
  const outcome = normalize(consultation?.outcome);
  if (outcome === "lost" || outcome === "closed-lost" || outcome.startsWith("lost lead")) return "Lost";
  if (outcome === "wrong location/office closed") return "Needs Data Correction";
  if (outcome === "dont want commission") return "Needs Manager Review";
  if (lead.store_visits?.some(v => v.status === "scheduled") || outcome === "visit scheduled") return "Visit Scheduled";
  if (outcome === "on-boarding done" || outcome === "converted") return "Ready for Onboarding";
  const interest = normalize(consultation?.interest_level);
  if (interest === "high") return "Hot";
  if (interest === "medium") return "Warm";
  if (interest === "low" || interest === "not interested") return "Cold";
  if (consultation) return "Consulted";
  const aliases: Record<string,FunnelStatus> = { onboarded: "Converted", "closed-lost": "Lost", "active — visit scheduled": "Visit Scheduled", "active — nurturing": "Warm" };
  if (aliases[normalize(lead.status)]) return aliases[normalize(lead.status)];
  if (lead.status !== "New" && lead.status in FUNNEL_STATUS_CONFIG) return lead.status as FunnelStatus;
  return lead.assigned_store_id || lead.assigned_ground_rep_id || lead.calling_associate_id ? "Assigned" : "New";
}
