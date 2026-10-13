"use client";
import { useEffect, useState } from "react";
export function OriginalLead({ leadId }: { leadId: string }) {
  const [lead, setLead] = useState<{ lead_code: string; original_data: Record<string, unknown> } | null>(null), [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    fetch(`/api/leads/${leadId}`).then(async r => { const d = await r.json(); if (!r.ok) throw Error(d.error); if (active) setLead(d.lead); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [leadId]);
  return <section className="original-lead workspace-card"><h2 className="font-semibold text-sm">Original lead · {lead?.lead_code || "Loading…"} <span className="text-xs text-slate-500">Read only</span></h2>
    {error && <p role="alert" className="text-red-700 text-sm">{error}</p>}
    {lead && <><dl className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">{[["company_name", "Company"], ["owner_name", "Contact / owner"], ["phone_no", "Phone"], ["address", "Address"], ["pin_code", "PIN code"], ["lead_source", "Source"]].map(([key, label]) => <div key={key}><dt className="text-xs text-slate-500">{label}</dt><dd className="text-sm break-words">{String(lead.original_data?.[key] || "Not provided")}</dd></div>)}</dl><p className="text-xs text-slate-500 mt-3">{lead.original_data?.baseline === "migration" ? "Baseline preserved when data protection was introduced." : "Preserved at intake."} Verified or alternate details below do not alter this record.</p></>}
  </section>;
}
