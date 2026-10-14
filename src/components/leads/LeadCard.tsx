"use client";
import { isWonLead } from "@/lib/leads/interest-bucket";
import { ScheduleVisitButton } from "./ScheduleVisitButton";
import { LeadHistory } from "./LeadHistory";
import { LeadCall } from "./LeadCall";
import { useAuth } from "@/context/AuthContext";
export type CardLead = { id: string; lead_code?: string; company_name: string; owner_name?: string | null; phone_no?: string | null; address?: string | null; pin_code?: string | null; category?: string | null; lead_source?: string | null; status: string; funnel_status?: string; partners?: { partner_status: string }[]; latest_interest_level?: string | null; store_visits?: { scheduled_at: string; store: { name: string } }[] };
export function LeadCard({ lead, children, onSaved }: { lead: CardLead; children?: React.ReactNode; onSaved?: () => void }) {
  const { user } = useAuth();
  return <article className="workspace-card self-start min-w-0 space-y-3"><p className="text-xs font-semibold text-slate-500">{lead.lead_code}</p><h3 className="font-semibold break-words">{lead.company_name || lead.owner_name || "Company details pending"}</h3><p className="text-xs text-orange-800">{isWonLead(lead) ? "Won" : lead.funnel_status || lead.status} {!isWonLead(lead) && lead.latest_interest_level ? `· ${lead.latest_interest_level} interest` : ""}</p><p className="text-xs text-slate-500">Source: {lead.lead_source || "Not recorded"}</p><p className="text-sm">{lead.owner_name}{lead.phone_no ? ` · ${lead.phone_no}` : ""}</p><p className="text-xs text-slate-600">{[lead.address,lead.pin_code,lead.category].filter(Boolean).join(" · ")}</p>
    <p className="text-xs text-slate-600">Visit date: {lead.store_visits?.[0] ? `${new Date(lead.store_visits[0].scheduled_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST · ${lead.store_visits[0].store.name}` : "Not scheduled"}</p>
    <div className="flex flex-wrap gap-2"><ScheduleVisitButton leadId={lead.id} onSaved={onSaved} /><LeadHistory leadId={lead.id} />{user?.role !== "analyst" && !isWonLead(lead) && <LeadCall leadId={lead.id} />}{children}</div>
  </article>;
}
