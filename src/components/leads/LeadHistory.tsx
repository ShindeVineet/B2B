"use client";
import { ReadableDetails as Details } from "@/components/shared/ReadableDetails";
import { useState } from "react";
import { WorkspaceDialog } from "@/components/shared/WorkspaceDialog";
type Row = Record<string, unknown>;
const currentFields = ["lead_code", "company_name", "owner_name", "phone_no", "address", "pin_code", "category", "lead_source", "intake_team", "status", "gst_no", "partner_type", "whatsapp_group_created", "notes", "extra_notes"];
const sections = ["original_data","consultations","call_logs","activity_logs","partners","store_visits","trip_leads"];
export function LeadHistory({ leadId, label = "Full lead history" }: { leadId: string; label?: string }) {
  const [open, setOpen] = useState(false), [lead, setLead] = useState<Row | null>(null), [error, setError] = useState("");
  const load = async () => { setOpen(true); setLead(null); setError(""); try { const r = await fetch(`/api/leads/${leadId}/history`); const d = await r.json(); if (!r.ok) throw Error(d.error); setLead(d.lead); } catch(e) { setError((e as Error).message); } };
  return <><button className="text-orange-700 border border-orange-200 rounded-lg px-3 py-2 text-xs" type="button" onClick={() => void load()}>{label}</button>
    {open && <WorkspaceDialog title={`Lead history${lead ? ` · ${lead.lead_code}` : ""}`} onClose={() => setOpen(false)}>
      {error && <p role="alert" className="text-red-700">{error}</p>}{!lead && !error && <p>Loading full history…</p>}
      {lead && <>
        <section className="workspace-card original-lead"><h3 className="font-bold mb-3">Original lead · Read only</h3><Details value={(lead.original_data || {}) as Row} /></section>
        <section className="workspace-card"><h3 className="font-bold mb-3">Current details</h3><Details value={Object.fromEntries(Object.entries(lead).filter(([k]) => currentFields.includes(k)))} /></section>
        <details className="workspace-card"><summary className="cursor-pointer font-semibold text-sm">Additional recorded details</summary><div className="mt-3"><Details value={Object.fromEntries(Object.entries(lead).filter(([k]) => !sections.includes(k) && !currentFields.includes(k)))} /></div></details>
        {[ ["consultations","Consultations"], ["store_visits","Store visits"], ["call_logs","Calls"], ["partners","Onboarded partners"], ["trip_leads","Ground visits"], ["activity_logs","Activity history"] ].map(([key,title]) => <section key={key}><h3 className="font-bold mb-3">{title}</h3>{((lead[key] || []) as Row[]).length === 0 ? <p className="text-sm text-slate-500">No records.</p> : ((lead[key] || []) as Row[]).map((row,i) => <details key={String(row.id || i)} className="workspace-card mb-3" open={key === "consultations" && i === 0}><summary className="cursor-pointer text-sm font-semibold">{String(row.outcome || row.action || row.partner_code || row.status || title)} · {row.visit_date || row.scheduled_at || row.created_at ? new Date(String(row.visit_date || row.scheduled_at || row.created_at)).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) + " IST" : ""}</summary><div className="mt-3"><Details value={row} /></div></details>)}</section>)}
      </>}
    </WorkspaceDialog>}
  </>;
}
