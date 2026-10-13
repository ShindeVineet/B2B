"use client";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { WorkspaceDialog } from "@/components/shared/WorkspaceDialog";
import { StoreVisitFields } from "@/components/consultations/StoreVisitFields";
export function ScheduleVisitButton({ leadId, onSaved }: { leadId: string; onSaved?: () => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false), [values, setValues] = useState<Record<string,string>>({}), [busy, setBusy] = useState(false), [error, setError] = useState("");
  if (!user || user.role === "analyst") return null;
  return <><button type="button" className="border border-orange-200 rounded-lg px-3 py-2 text-xs text-orange-800" onClick={() => { setOpen(true); setError(""); }}>Schedule visit</button>
    {open && <WorkspaceDialog title="Schedule a store visit" onClose={() => { if (!busy) setOpen(false); }}><form className="space-y-4" onSubmit={async e => {
      e.preventDefault(); setBusy(true); setError("");
      try { const r = await fetch("/api/store-visits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...values, lead_id: leadId }) }); const d = await r.json(); if (!r.ok) throw Error(d.error); setOpen(false); window.dispatchEvent(new Event("store-visits-updated")); onSaved?.(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
    }}><fieldset disabled={busy}><StoreVisitFields values={values} force onChange={(key,value) => setValues(v => ({ ...v, [key]: value }))} /></fieldset><p className="text-xs text-slate-600">This books an appointment without adding a consultation record.</p>{error && <p role="alert" className="text-red-700">{error}</p>}<button disabled={busy} className="bg-orange-600 text-white rounded-lg px-4 py-2">{busy ? "Saving…" : "Schedule visit"}</button></form></WorkspaceDialog>}
  </>;
}
