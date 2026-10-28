"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { LEAD_SOURCES, intakeTeam, type LeadSource } from "@/lib/leads/intake";
import { ConsultationFields, type ConsultationValues } from "@/components/consultations/ConsultationFields";
import { compressPhoto } from "@/lib/consultations/compress";
import { validateResponses } from "@/lib/consultations/validation";
import { LEAD_TYPES, type FieldDefinition } from "@/lib/consultations/fields";
import { StoreVisitFields } from "@/components/consultations/StoreVisitFields";
import { addDays, todayIndia } from "@/lib/phase5/calendar";
const teamNames = { caller: "Caller", store: "Store associate", ground: "Ground team", head: "B2B Head" };
export function LeadIntakeForm({ initialSource = "Phone", groundVisit = false, onSaved }: { initialSource?: LeadSource; groundVisit?: boolean; onSaved?: () => void }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [source, setSource] = useState<LeadSource>(initialSource);
  const [values, setValues] = useState<Record<string, string>>({});
  const [consultation, setConsultation] = useState<ConsultationValues>({});
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [staff, setStaff] = useState("");
  const [preparingPhotos, setPreparingPhotos] = useState(false);
  const photos = useRef(new Map<string, File>());
  const clearPhotos = () => { for (const url of photos.current.keys()) URL.revokeObjectURL(url); photos.current.clear(); };
  useEffect(() => {
    const pending = photos.current;
    return () => { for (const url of pending.keys()) URL.revokeObjectURL(url); pending.clear(); };
  }, []);
  useEffect(() => {
    if (!groundVisit) return;
    let active = true;
    fetch("/api/form-fields").then(async r => {
      const d = await r.json(); if (!r.ok) throw Error(d.error);
      if (active) { setFields(d.fields); setStaff(d.staff_name); setConsultation(v => ({ visit_date: todayIndia(), ground_staff_name: d.staff_name, ...v })); }
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [groundVisit]);
  async function preparePhotos(field: FieldDefinition, files: FileList | File[] | null) {
    if (!files?.length) return;
    const current = Array.isArray(consultation[field.key]) ? consultation[field.key] as string[] : [];
    if (current.length + files.length > (field.max_files || 5)) { setError(field.label + ": maximum " + (field.max_files || 5) + " photos."); return; }
    setPreparingPhotos(true); setError("");
    const urls = [...current];
    try {
      for (const file of files) { const compressed = await compressPhoto(file); const url = URL.createObjectURL(compressed); photos.current.set(url, compressed); urls.push(url); }
    } catch (e) { setError((e as Error).message); }
    finally { setConsultation(v => ({ ...v, [field.key]: urls })); setPreparingPhotos(false); }
  }
  const [skipPhoneConsultation, setSkipPhoneConsultation] = useState(false);
  const [callPicked, setCallPicked] = useState<boolean | null>(null);
  const [callInterest, setCallInterest] = useState("");
  const [callFollowUp, setCallFollowUp] = useState(false);
  const [callFollowUpDate, setCallFollowUpDate] = useState("");
  const [callGroupCreated, setCallGroupCreated] = useState(false);
  const [callNotes, setCallNotes] = useState("");
  const [saved, setSaved] = useState<{ id: string; lead_code: string } | null>(null);
  const team = groundVisit ? "ground" : intakeTeam(source), combined = groundVisit || team === "head" || team === "store";
  const phoneConsultation = !groundVisit && source === "Phone" && !skipPhoneConsultation;
  if (saved) return <section className="workspace-card space-y-3"><h2 className="font-bold">Saved · {saved.lead_code}</h2><p>{combined || phoneConsultation ? "Lead and consultation saved together." : "Lead saved."} Assigned workflow: {teamNames[team]}.</p><Link className="text-orange-700 underline mr-4" href={`/leads/${saved.id}`}>View lead</Link><button type="button" onClick={() => { setSaved(null); setValues({}); clearPhotos(); setConsultation(groundVisit ? { visit_date: todayIndia(), ground_staff_name: staff } : {}); setSkipPhoneConsultation(false); setCallPicked(null); setCallInterest(""); setCallFollowUp(false); setCallFollowUpDate(""); setCallGroupCreated(false); setCallNotes(""); }}>Add another lead</button></section>;
  return <form className="space-y-4 max-w-4xl" onSubmit={async e => {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const answers = { ...consultation };
      const multipart = new FormData();
      if (groundVisit) {
        if (!fields.length) throw Error("Wait for the consultation fields to load.");
        for (const field of fields.filter(f => f.type === "photo")) {
          const urls = Array.isArray(answers[field.key]) ? answers[field.key] as string[] : [];
          answers[field.key] = urls.map((url, index) => {
            const file = photos.current.get(url); if (!file) throw Error("Choose the photo again.");
            const token = field.key.replaceAll("_", "-") + "-" + index;
            multipart.set(token, file);
            return "/api/photos/" + token;
          });
        }
        validateResponses(fields, answers, staff, false);
      }
      const payload = { ...values, lead_source: source, ...(groundVisit ? { ground_visit: true } : {}), ...(combined ? { consultation: answers } : {}), ...(phoneConsultation ? { calling_consultation: { call_picked: callPicked, ...(callPicked ? { interest_level: callInterest, next_follow_up_date: callFollowUp ? callFollowUpDate : null, whatsapp_group_created: callGroupCreated, notes: callNotes } : {}) } } : {}) };
      multipart.set("data", JSON.stringify(payload));
      const r = await fetch("/api/leads", { method: "POST", ...(groundVisit ? { body: multipart } : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }) });
      const d = await r.json(); if (!r.ok) throw Error(d.error); setSaved(d.lead); clearPhotos(); onSaved?.();
      window.dispatchEvent(new Event("store-visits-updated")); window.dispatchEvent(new Event("followups-updated"));
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }}>
    <fieldset disabled={busy || preparingPhotos} className="space-y-4">
      <section className="workspace-card space-y-4">
        {!groundVisit && <label className="block text-sm font-semibold">Lead source<select className="block w-full border rounded-lg p-2 mt-1" value={source} onChange={e => { setSource(e.target.value as LeadSource); setSkipPhoneConsultation(false); }}>{LEAD_SOURCES.filter(s => (s !== "Manual" || user?.role === "b2b_head") && (user?.role !== "store_associate" || ["Phone", "CDT", "LinkedIn", "Walk-in"].includes(s))).map(s => <option key={s}>{s}</option>)}</select></label>}
        <p className="intake-team">Handled by {teamNames[team]}{team === "head" ? " · High-value internet research leads" : ""}</p>
        <p className="text-xs text-slate-600">Original details are preserved when the lead ID is created. Add alternate or verified details later.</p>
        <div className="grid sm:grid-cols-2 gap-3">{[
          ["company_name", "Company name", "text"], ["owner_name", source === "Walk-in" ? "Partner name" : "Owner / contact name", "text"], ["phone_no", "Phone number", "tel"], ["address", "Address", "text"], ["pin_code", "PIN code", "text"], ["website", "Website", "url"], ["google_map_link", "Google Maps link", "url"], ["category", "Professional type / category", "text"],
        ].map(([key, label, type]) => {
          const required = groundVisit ? ["company_name", "phone_no"].includes(key) : key === "phone_no" || (key === "owner_name" && source === "Walk-in") || (team === "ground" && ["company_name", "owner_name", "address", "pin_code"].includes(key));
          return <label key={key} className="text-sm font-medium">{label}{required ? " *" : " (optional)"}<input className="block border rounded-lg p-2 mt-1 w-full" type={type} required={required} maxLength={key === "pin_code" ? 6 : 2000} value={values[key] || ""} onChange={e => {
            const value = e.target.value; setValues(v => ({ ...v, [key]: value }));
            const consultationKey = key === "company_name" ? "company_name" : key === "phone_no" ? "decision_maker_phone" : key === "owner_name" ? "decision_maker_name" : null;
            if (groundVisit && consultationKey) setConsultation(v => !v[consultationKey] || v[consultationKey] === values[key] ? { ...v, [consultationKey]: value } : v);
          }} /></label>;
        })}</div>
        {source === "Walk-in" && <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-sm">GST number (optional)<input aria-label="GST number" className="block w-full border rounded-lg p-2 mt-1" maxLength={30} value={values.gst_no || ""} onChange={e => setValues(v => ({ ...v, gst_no: e.target.value }))} /></label>
          <label className="text-sm">Partner type<select aria-label="Partner type" className="block w-full border rounded-lg p-2 mt-1" value={values.partner_type || ""} onChange={e => setValues(v => ({ ...v, partner_type: e.target.value }))}><option value="">Automatic: {values.gst_no?.trim() ? "Company" : "Individual"}</option><option>Company</option><option>Individual</option></select></label>
        </div>}
      </section>
      {!groundVisit && source === "Phone" && <section className="workspace-card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Calling consultation</h2><p className="text-xs text-slate-600">Record the call now, or skip it and assign the lead later.</p></div><button type="button" onClick={() => setSkipPhoneConsultation(value => !value)} className="rounded-lg bg-[#ff4500] px-3 py-1.5 text-xs font-semibold text-white">{skipPhoneConsultation ? "Add consultation" : "Skip for now"}</button></div>
        {!skipPhoneConsultation && <div className="space-y-4">
          <fieldset><legend className="text-sm font-semibold">Call Picked *</legend><div className="mt-2 flex gap-6">{[true, false].map(value => <label key={String(value)} className="flex items-center gap-2 text-sm"><input type="radio" name="new-lead-call-picked" required checked={callPicked === value} onChange={() => setCallPicked(value)} />{value ? "Yes" : "No"}</label>)}</div></fieldset>
          {callPicked === true && <>
            <label className="block text-sm font-semibold">Level of interest *<select required value={callInterest} onChange={e => setCallInterest(e.target.value)} className="mt-1 block w-full rounded-lg border p-3"><option value="">Select…</option>{["High", "Medium", "Low"].map(value => <option key={value}>{value}</option>)}</select></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={callFollowUp} onChange={e => setCallFollowUp(e.target.checked)} />Follow-up required</label>
            {callFollowUp && <label className="block text-sm font-semibold">Follow-up date *<input required type="date" min={todayIndia()} value={callFollowUpDate} onChange={e => setCallFollowUpDate(e.target.value)} className="mt-1 block w-full rounded-lg border p-3" /></label>}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={callGroupCreated} onChange={e => setCallGroupCreated(e.target.checked)} />Group Created</label>
            <label className="block text-sm font-semibold">Notes *<textarea required maxLength={10000} rows={4} value={callNotes} onChange={e => setCallNotes(e.target.value)} className="mt-1 block w-full rounded-lg border p-3" /></label>
          </>}
          {callPicked === false && <p className="rounded-lg bg-orange-50 p-3 text-sm" role="status">A follow-up will be scheduled automatically for tomorrow, {addDays(todayIndia(), 1)} (IST), when you save.</p>}
        </div>}
      </section>}
      {groundVisit && <section className="workspace-card space-y-5"><h2 className="font-semibold">Log consultation</h2>
        {!fields.length && <p role="status">Loading consultation fields…</p>}
        <ConsultationFields fields={fields} values={consultation} set={(key, value) => setConsultation(v => ({ ...v, [key]: value }))} staff={staff} admin={false} context="ground" disabled={busy || preparingPhotos} upload={preparePhotos} />
        {preparingPhotos && <p role="status">Preparing photos…</p>}
      </section>}
      {combined && !groundVisit && <section className="workspace-card space-y-3"><h2 className="font-semibold">Initial consultation</h2><p className="text-xs text-slate-600">Saved atomically with this lead. Consultation details can be completed later.</p>
        <div className="grid sm:grid-cols-2 gap-3"><label className="text-sm">Lead type<select className="block w-full border rounded-lg p-2" value={String(consultation.lead_type || "")} onChange={e => setConsultation(v => ({ ...v, lead_type: e.target.value }))}><option value="">Not specified</option>{LEAD_TYPES.map(t => <option key={t}>{t}</option>)}</select></label>
        <label className="text-sm">Interest level<select className="block w-full border rounded-lg p-2" value={String(consultation.interest_level || "")} onChange={e => setConsultation(v => ({ ...v, interest_level: e.target.value }))}><option value="">Not decided</option>{["High", "Medium", "Low"].map(t => <option key={t}>{t}</option>)}</select></label></div>
        {source === "Walk-in" && <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" role="switch" checked={consultation.direct_store_meeting === "true"} onChange={e => setConsultation(v => ({ ...v, direct_store_meeting: String(e.target.checked) }))} />Direct meeting with partner in store</label>}
        <label className="block text-sm">Consultation notes<textarea className="block w-full border rounded-lg p-2" maxLength={2000} value={String(consultation.notes || "")} onChange={e => setConsultation(v => ({ ...v, notes: e.target.value }))} /></label>
        <label className="block text-sm">Follow-up reminder (optional)<input className="block border rounded-lg p-2" type="date" min={todayIndia()} value={String(consultation.next_follow_up_date || "")} onChange={e => setConsultation(v => ({ ...v, next_follow_up_date: e.target.value }))} /></label>
        <StoreVisitFields values={consultation} onChange={(key, value) => setConsultation(v => ({ ...v, [key]: value }))} />
      </section>}
    </fieldset>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    <button disabled={busy || preparingPhotos || (groundVisit && !fields.length)} className="bg-orange-600 text-white rounded-lg px-4 py-2">{busy ? "Saving…" : groundVisit ? "Add" : combined || phoneConsultation ? "Save lead & consultation" : "Save lead"}</button>
  </form>;
}
