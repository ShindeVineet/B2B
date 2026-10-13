"use client";
import { useEffect, useState } from "react";
import { isWonLead } from "@/lib/leads/interest-bucket";
import { LeadHistory } from "@/components/leads/LeadHistory";
import { LeadCall } from "@/components/leads/LeadCall";
import { ScheduleVisitButton } from "@/components/leads/ScheduleVisitButton";

type Consultation = {
  id: string; visit_date: string; outcome: string; interest_level: string | null;
  decision_maker_name?: string | null; decision_maker_phone?: string | null;
  products_discussed?: string | null; notes?: string | null; next_steps?: string | null;
  next_follow_up_date?: string | null; rep: { name: string };
};
type Summary = {
  company_name: string; owner_name?: string | null; phone_no?: string | null;
  address?: string | null; pin_code?: string | null; category?: string | null;
  lead_source?: string | null; lead_type?: string | null; gst_no?: string | null;
  website?: string | null; notes?: string | null; whatsapp_group_created?: boolean;
  ground_rep?: { name: string } | null; calling_associate?: { name: string } | null;
  store?: { name: string } | null; consultations: Consultation[];
  partners: { id: string; partner_code: string; company_legal_name?: string | null; contact_person_name: string; partner_status: string }[];
  store_visits: { id: string; scheduled_at: string; status: string; store: { name: string } }[];
};
const date = (value: string) => new Date(value).toLocaleDateString("en-IN", {timeZone:"Asia/Kolkata",day:"numeric",month:"short",year:"numeric"});
export function MapLeadSummary({leadId, status}: {leadId:string;status:string}) {
  const [lead,setLead]=useState<Summary|null>(null),[error,setError]=useState("");
  useEffect(()=>{
    const controller=new AbortController();
    fetch(`/api/leads/${leadId}/history`,{signal:controller.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error||"Unable to load lead details");return d.lead;}).then(setLead).catch(e=>{if(!controller.signal.aborted)setError(e.message);});
    return()=>controller.abort();
  },[leadId]);
  if(error)return <p role="alert" className="text-sm text-red-700">{error}</p>;
  if(!lead)return <p role="status" className="text-sm text-slate-500">Loading lead details…</p>;
  const won=isWonLead({...lead,status});
  const fields=[
    ["Funnel status",won?"Won · Onboarded":status],
    ["Assigned to",[lead.ground_rep?.name,lead.calling_associate?.name].filter(Boolean).join(" · ")||"Unassigned"],
    ["Store",lead.store?.name||"Unassigned"],
    ["Contact",[lead.owner_name,lead.phone_no].filter(Boolean).join(" · ")],
    ["Source / type",[lead.lead_source,lead.lead_type,lead.category].filter(Boolean).join(" · ")],
    ["Address",[lead.address,lead.pin_code].filter(Boolean).join(" · ")],
    ["GST",lead.gst_no],["Website",lead.website],
    ["WhatsApp group",lead.whatsapp_group_created?"Created":"Not created"],
  ];
  return <div className="space-y-4 text-xs">
    <dl className="rounded-xl border border-orange-200 bg-orange-50/40 p-3 space-y-2">{fields.filter(([,v])=>v).map(([label,value])=><div key={label}><dt className="text-slate-500">{label}</dt><dd className="font-medium text-slate-900 break-words">{value}</dd></div>)}</dl>
    {lead.notes&&<p className="text-slate-600 whitespace-pre-wrap">{lead.notes}</p>}
    <section aria-label="Consultation summary"><h4 className="font-bold text-sm mb-2">Consultations ({lead.consultations.length})</h4>
      {!lead.consultations.length&&<p className="text-slate-500">No consultations recorded.</p>}
      <div className="space-y-2">{lead.consultations.map(c=><article key={c.id} className="border border-slate-200 border-l-2 border-l-[#ff4500] rounded-lg p-3 space-y-1">
        <p className="font-semibold">{c.outcome}{c.interest_level?` · ${c.interest_level} interest`:""}</p>
        <p className="text-slate-500">{date(c.visit_date)} · {c.rep.name}</p>
        {(c.decision_maker_name||c.decision_maker_phone)&&<p>{[c.decision_maker_name,c.decision_maker_phone].filter(Boolean).join(" · ")}</p>}
        {c.products_discussed&&<p>Products: {c.products_discussed}</p>}
        {c.notes&&<p className="line-clamp-3 whitespace-pre-wrap">{c.notes}</p>}
        {c.next_steps&&<p>Next: {c.next_steps}</p>}
        {c.next_follow_up_date&&<p>Follow-up: {date(c.next_follow_up_date)}</p>}
      </article>)}</div>
    </section>
    {lead.partners.length>0&&<section><h4 className="font-bold text-sm mb-2">Partners</h4>{lead.partners.map(p=><p key={p.id} className="mb-2">{p.partner_code} · {p.contact_person_name}<br/><span className="text-slate-500">{p.company_legal_name?`${p.company_legal_name} · `:""}{p.partner_status}</span></p>)}</section>}
    {lead.store_visits.length>0&&<section><h4 className="font-bold text-sm mb-2">Store visits</h4>{lead.store_visits.map(v=><p key={v.id}>{date(v.scheduled_at)} · {new Date(v.scheduled_at).toLocaleTimeString("en-IN",{timeZone:"Asia/Kolkata",hour:"2-digit",minute:"2-digit"})} IST · {v.store.name} · {v.status}</p>)}</section>}
    <div className="flex flex-wrap gap-2"><LeadHistory leadId={leadId}/>{!won&&<><LeadCall leadId={leadId}/><ScheduleVisitButton leadId={leadId}/></>}</div>
  </div>;
}
