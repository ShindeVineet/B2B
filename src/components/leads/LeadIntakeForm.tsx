"use client";
import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { LEAD_SOURCES, intakeTeam, type LeadSource } from "@/lib/leads/intake";
import { LEAD_TYPES } from "@/lib/consultations/fields";
import { StoreVisitFields } from "@/components/consultations/StoreVisitFields";
import { todayIndia } from "@/lib/phase5/calendar";
const teamNames = { caller: "Caller", store: "Store associate", ground: "Ground team", head: "B2B Head" };
export function LeadIntakeForm({ initialSource = "Phone" }: { initialSource?: LeadSource }) {
  const { user } = useAuth();
  const [source, setSource] = useState<LeadSource>(initialSource);
  const [values, setValues] = useState<Record<string, string>>({});
  const [consultation, setConsultation] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [saved, setSaved] = useState<{ id: string; lead_code: string } | null>(null);
  const team = intakeTeam(source), combined = team === "head" || team === "store";
  if (saved) return <section className="workspace-card space-y-3"><h2 className="font-bold">Saved · {saved.lead_code}</h2><p>{combined ? "Lead and consultation saved together." : "Lead saved."} Assigned workflow: {teamNames[team]}.</p><Link className="text-orange-700 underline mr-4" href={`/leads/${saved.id}`}>View lead</Link><button type="button" onClick={() => { setSaved(null); setValues({}); setConsultation({}); }}>Add another lead</button></section>;
  return <form className="space-y-4 max-w-4xl" onSubmit={async e => {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const r = await fetch("/api/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...values, lead_source: source, ...(combined ? { consultation } : {}) }) });
      const d = await r.json(); if (!r.ok) throw Error(d.error); setSaved(d.lead);
      window.dispatchEvent(new Event("store-visits-updated")); window.dispatchEvent(new Event("followups-updated"));
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }}>
    <fieldset disabled={busy} className="space-y-4">
      <section className="workspace-card space-y-4">
        <label className="block text-sm font-semibold">Lead source<select className="block w-full border rounded-lg p-2 mt-1" value={source} onChange={e => setSource(e.target.value as LeadSource)}>{LEAD_SOURCES.filter(s => (s !== "Manual" || user?.role === "b2b_head") && (user?.role !== "store_associate" || ["Phone", "CDT", "LinkedIn", "Walk-in"].includes(s))).map(s => <option key={s}>{s}</option>)}</select></label>
        <p className="intake-team">Handled by {teamNames[team]}{team === "head" ? " · High-value internet research leads" : ""}</p>
        <p className="text-xs text-slate-600">Original details are preserved when the lead ID is created. Add alternate or verified details later.</p>
        <div className="grid sm:grid-cols-2 gap-3">{[
          ["company_name", "Company name", "text"], ["owner_name", source === "Walk-in" ? "Partner name" : "Owner / contact name", "text"], ["phone_no", "Phone number", "tel"], ["address", "Address", "text"], ["pin_code", "PIN code", "text"], ["website", "Website", "url"], ["google_map_link", "Google Maps link", "url"], ["category", "Professional type / category", "text"],
        ].map(([key, label, type]) => {
          const required = key === "phone_no" || (key === "owner_name" && source === "Walk-in") || (team === "ground" && ["company_name", "owner_name", "address", "pin_code"].includes(key));
          return <label key={key} className="text-sm font-medium">{label}{required ? " *" : " (optional)"}<input className="block border rounded-lg p-2 mt-1 w-full" type={type} required={required} maxLength={key === "pin_code" ? 6 : 2000} value={values[key] || ""} onChange={e => setValues(v => ({ ...v, [key]: e.target.value }))} /></label>;
        })}</div>
        {source === "Walk-in" && <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-sm">GST number (optional)<input aria-label="GST number" className="block w-full border rounded-lg p-2 mt-1" maxLength={30} value={values.gst_no || ""} onChange={e => setValues(v => ({ ...v, gst_no: e.target.value }))} /></label>
          <label className="text-sm">Partner type<select aria-label="Partner type" className="block w-full border rounded-lg p-2 mt-1" value={values.partner_type || ""} onChange={e => setValues(v => ({ ...v, partner_type: e.target.value }))}><option value="">Automatic: {values.gst_no?.trim() ? "Company" : "Individual"}</option><option>Company</option><option>Individual</option></select></label>
        </div>}
      </section>
      {combined && <section className="workspace-card space-y-3"><h2 className="font-semibold">Initial consultation</h2><p className="text-xs text-slate-600">Saved atomically with this lead. Consultation details can be completed later.</p>
        <div className="grid sm:grid-cols-2 gap-3"><label className="text-sm">Lead type<select className="block w-full border rounded-lg p-2" value={consultation.lead_type || ""} onChange={e => setConsultation(v => ({ ...v, lead_type: e.target.value }))}><option value="">Not specified</option>{LEAD_TYPES.map(t => <option key={t}>{t}</option>)}</select></label>
        <label className="text-sm">Interest level<select className="block w-full border rounded-lg p-2" value={consultation.interest_level || ""} onChange={e => setConsultation(v => ({ ...v, interest_level: e.target.value }))}><option value="">Not decided</option>{["High", "Medium", "Low"].map(t => <option key={t}>{t}</option>)}</select></label></div>
        {source === "Walk-in" && <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" role="switch" checked={consultation.direct_store_meeting === "true"} onChange={e => setConsultation(v => ({ ...v, direct_store_meeting: String(e.target.checked) }))} />Direct meeting with partner in store</label>}
        <label className="block text-sm">Consultation notes<textarea className="block w-full border rounded-lg p-2" maxLength={2000} value={consultation.notes || ""} onChange={e => setConsultation(v => ({ ...v, notes: e.target.value }))} /></label>
        <label className="block text-sm">Follow-up reminder (optional)<input className="block border rounded-lg p-2" type="date" min={todayIndia()} value={consultation.next_follow_up_date || ""} onChange={e => setConsultation(v => ({ ...v, next_follow_up_date: e.target.value }))} /></label>
        <StoreVisitFields values={consultation} onChange={(key, value) => setConsultation(v => ({ ...v, [key]: value }))} />
      </section>}
    </fieldset>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    <button disabled={busy} className="bg-orange-600 text-white rounded-lg px-4 py-2">{busy ? "Saving…" : combined ? "Save lead & consultation" : "Save lead"}</button>
  </form>;
}
