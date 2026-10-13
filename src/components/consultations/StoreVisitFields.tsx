"use client";
import { useEffect, useState } from "react";
export function StoreVisitFields({ values, onChange, force = false }: { values: Record<string, unknown>; onChange: (key: string, value: string) => void; force?: boolean }) {
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    fetch("/api/intake-options").then(async r => { const d = await r.json(); if (!r.ok) throw Error(d.error); if (active) setStores(d.stores); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, []);
  const enabled = force || values.visit_scheduled === "true";
  return <section className="workspace-card store-visit-fields space-y-3">
    <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={enabled} disabled={force} onChange={e => onChange("visit_scheduled", String(e.target.checked))} />Schedule a store visit</label>
    <p className="text-xs text-slate-600">Store appointments are visible to all staff. Times are in India Standard Time.</p>
    {enabled && <div className="grid sm:grid-cols-2 gap-3">
      <label className="text-sm">Store *<select required className="block w-full border rounded-lg p-2 mt-1" value={String(values.visit_store_id || "")} onChange={e => onChange("visit_store_id", e.target.value)}><option value="">Choose store</option>{stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <label className="text-sm">Visit date & time (IST) *<input required type="datetime-local" className="block w-full border rounded-lg p-2 mt-1" value={String(values.visit_scheduled_at || "").replace(/\+05:30$/, "")} onChange={e => onChange("visit_scheduled_at", e.target.value ? e.target.value + "+05:30" : "")} /></label>
    </div>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
  </section>;
}
