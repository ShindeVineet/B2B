"use client";
import { useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
type Visit = { id: string; scheduled_at: string; store: { id: string; name: string }; lead: { lead_code: string; company_name: string; owner_name: string | null } };
export function StoreVisits({ today = false, receiving = false }: { today?: boolean; receiving?: boolean }) {
  const { user } = useAuth();
  const [visits, setVisits] = useState<Visit[]>([]), [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try { const r = await fetch(`/api/store-visits?today=${today}&receiving=${receiving}`); const d = await r.json(); if (!r.ok) throw Error(d.error); if (active) { setVisits(d.visits); setError(""); } } catch (e) { if (active) setError((e as Error).message); }
    };
    void refresh(); const timer = setInterval(refresh, 60000);
    window.addEventListener("store-visits-updated", refresh);
    return () => { active = false; clearInterval(timer); window.removeEventListener("store-visits-updated", refresh); };
  }, [today, receiving]);
  const manage = ["b2b_head", "regional_manager", "store_associate"].includes(user?.role || "");
  return <section className="store-visit-board" aria-label="Scheduled store visits"><details open={today}>
    <summary className="flex items-center gap-2 cursor-pointer font-semibold text-sm"><CalendarClock size={18} className="text-[#ff4500]" />{today ? "Visits Today" : "Store appointments"} <span className="appointment-count">{visits.length}</span><span className="ml-auto text-xs font-normal text-slate-500">{receiving ? "Your store" : "All stores"} · IST</span></summary>
    {error && <p className="text-red-700 text-sm mt-2" role="alert">{error}</p>}
    {!visits.length && !error && <p className="text-sm mt-3 text-slate-500">{today ? "No visits scheduled for today." : "No scheduled store visits."}</p>}
    <div className="appointment-grid">{visits.map(v => <article key={v.id} className="appointment-card">
      <p className="text-xs font-semibold text-orange-800">{new Date(v.scheduled_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })} IST</p>
      <h3 className="font-semibold text-sm mt-1">{v.lead.company_name || v.lead.owner_name || "Company details pending"}</h3><p className="text-xs text-slate-600">{v.lead.lead_code} · {v.store.name}</p>
      {manage && (user?.role !== "store_associate" || user.store_id === v.store.id) && <div className="flex gap-2 mt-2">{["completed", "cancelled"].map(status => <button key={status} disabled={!!busy} type="button" className="text-xs border rounded px-2 py-1" onClick={async () => {
        setBusy(v.id); setError(""); try { const r = await fetch("/api/store-visits", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: v.id, status }) }); const d = await r.json(); if (!r.ok) throw Error(d.error); window.dispatchEvent(new Event("store-visits-updated")); } catch (e) { setError((e as Error).message); } finally { setBusy(""); }
      }}>{status === "completed" ? "Mark attended" : "Cancel visit"}</button>)}</div>}
    </article>)}</div>
  </details></section>;
}
