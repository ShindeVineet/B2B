"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
export function AlternateLeadDetails({ leadId }: { leadId: string }) {
  const { user } = useAuth();
  const [values, setValues] = useState<Record<string, string>>({}), [error, setError] = useState(""), [saved, setSaved] = useState(false), [busy, setBusy] = useState(false);
  const [groupCreated, setGroupCreated] = useState(false), [typeTouched, setTypeTouched] = useState(false);
  const fields = [["gst_no", "GST number (optional)"], ["company_name", "Alternate / verified company name"], ["owner_name", "Alternate / verified contact name"], ["phone_no", "Alternate / verified phone"], ["address", "Verified address"], ["pin_code", "Verified PIN code"], ["website", "Website"], ["category", "Professional type"], ["google_map_link", "Google Maps link"]];
  useEffect(() => { let active = true; fetch(`/api/leads/${leadId}`).then(async r => { const d = await r.json(); if (!r.ok) throw Error(d.error); if (active) { setValues(d.lead); setGroupCreated(d.lead.whatsapp_group_created); } }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, [leadId]);
  const editable = ["b2b_head", "regional_manager", "store_associate"].includes(user?.role || "");
  return <form className="workspace-card space-y-3" onSubmit={async e => {
    e.preventDefault(); setBusy(true); setError(""); setSaved(false);
    try { const r = await fetch(`/api/leads/${leadId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...Object.fromEntries(fields.map(([key]) => [key, values[key] || ""])), whatsapp_group_created: groupCreated, partner_type: values.partner_type }) }); const d = await r.json(); if (!r.ok) throw Error(d.error); setSaved(true); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }}><h2 className="font-semibold">Current & alternate details</h2><p className="text-xs text-slate-600">These details are used for follow-up and onboarding. Original intake details remain above.</p>
    <fieldset disabled={!editable || busy} className="grid sm:grid-cols-2 gap-3">{fields.map(([key, label]) => <label key={key} className="text-sm">{label}<input className="block w-full border rounded-lg p-2 mt-1" type={key === "phone_no" ? "tel" : "text"} maxLength={key === "pin_code" ? 6 : 2000} value={values[key] || ""} onChange={e => setValues(v => ({ ...v, [key]: e.target.value, ...(key === "gst_no" && !typeTouched ? { partner_type: e.target.value.trim() ? "Company" : "Individual" } : {}) }))} /></label>)}</fieldset>
    <label className="block text-sm">Partner type<select className="block border rounded-lg p-2 mt-1" disabled={!editable || busy} value={values.partner_type || ""} onChange={e => { setTypeTouched(true); setValues(v => ({ ...v, partner_type: e.target.value })); }}><option value="">Automatic from GST</option><option>Company</option><option>Individual</option></select></label>
    <label className="flex gap-2 items-center text-sm"><input type="checkbox" checked={groupCreated} disabled={!editable || busy} onChange={e => setGroupCreated(e.target.checked)} />WhatsApp group created (Pipeline)</label>
    {editable && <button className="bg-orange-600 text-white rounded px-3 py-2" disabled={busy}>Save alternate details</button>}{error && <p role="alert" className="text-red-700">{error}</p>}{saved && <p role="status" className="text-green-800">Saved. Original details preserved.</p>}
  </form>;
}
