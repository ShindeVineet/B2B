"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { WarmLeads } from "@/components/leads/WarmLeads";
import { ColdLeads } from "@/components/cold/ColdLeads";
import { StoreVisits } from "./StoreVisits";
import type { dashboardOverview } from "@/lib/dashboard/service";
type Overview = Awaited<ReturnType<typeof dashboardOverview>>;
export function RoleDashboard({ role }: { role: string }) {
  const [tab, setTab] = useState("Overview"), [data, setData] = useState<Overview | null>(null), [error, setError] = useState("");
  const associate = role === "store_associate";
  useEffect(() => { let live = true; fetch("/api/dashboard/overview").then(async r => { const d = await r.json(); if (!r.ok) throw Error(d.error); if (live) setData(d); }).catch(e => { if (live) setError(e.message); }); return () => { live = false; }; }, []);
  return <div className="space-y-5">
    {role === "b2b_head" && <Link href="/route-planner" prefetch={false} className="inline-flex rounded-lg bg-[#ff4500] text-white px-4 py-3 font-semibold">Open Route Builder</Link>}
    <nav className="flex gap-2 flex-wrap" aria-label="Dashboard views">{["Overview", "Warm Leads", ...(associate ? ["Cold Leads"] : []), "Visits Today"].map(t => <button key={t} onClick={() => setTab(t)} aria-current={tab === t ? "page" : undefined} className={`rounded-lg border px-4 py-2 text-sm font-semibold ${tab === t ? "bg-[#ff4500] text-white border-[#ff4500]" : "bg-white border-slate-200"}`}>{t}</button>)}</nav>
    {tab === "Warm Leads" ? <WarmLeads /> : tab === "Cold Leads" ? <ColdLeads /> : tab === "Visits Today" ? <StoreVisits today receiving={associate} /> : <>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {!data && !error && <p>Loading dashboard…</p>}
      {associate && <div className="flex flex-wrap gap-2"><Link href="/calling" className="rounded-lg bg-[#ff4500] px-3 py-1.5 text-xs font-semibold text-white">Open calling queue</Link><Link href="/leads/new?source=Walk-in" className="rounded-lg border border-[#ff4500] bg-white px-3 py-1.5 text-xs font-semibold text-[#ff4500]">Import walk-in lead</Link></div>}
      {data && <>
        <div className="grid gap-3 sm:grid-cols-3">{(associate ? [["Call leads", data.callLeads], ["Walk-in leads", data.walkInLeads], ["Warm leads", data.warmLeads]] : [["Leads in scope", data.totalLeads], ["Assigned to ground team", data.assigned], ["Warm leads", data.warmLeads]]).map(([label, count]) => <section className="workspace-card !p-4 border-t-2 border-t-[#ff4500]" key={label}><p className="text-sm text-slate-500">{label}</p><p className="text-2xl font-bold text-[#ff4500] mt-1">{count}</p></section>)}</div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{data.channels.filter(c => associate ? ["store", "caller"].includes(c.key) : c.key !== "head" || c.consults > 0 || c.onboarded > 0).map(c => <section key={c.key} className="workspace-card !p-4"><h2 className="font-semibold">{c.label}</h2><p className="mt-3"><strong className="text-xl text-[#ff4500]">{c.consults}</strong> Consults <span className="text-sm text-slate-600">({c.hot}H / {c.warm}W / {c.cold}C)</span></p>{c.unclassified > 0 && <p className="text-xs text-slate-500">{c.unclassified} without an interest rating</p>}<p className="mt-2"><strong className="text-[#ff4500]">{c.onboarded}</strong> Onboarded</p></section>)}</div>
        <section className="workspace-card !p-4 border-l-4 border-l-[#ff4500]"><p className="font-semibold">TOTAL: {data.consultedLeads} Consults → {data.onboarded} Onboarded</p><p className="mt-2">Groups created (Pipeline) → <strong className="text-[#ff4500]">{data.groups}</strong> Groups</p><p className="mt-3 text-xs text-slate-500">Consults count distinct leads using their latest consultation. H = Hot, W = Warm, C = Cold. {data.consultationRecords} consultation records, including {data.repeatConsultations} repeat entries, remain in history. Onboarded counts active partner codes.</p>{data.onboardedWithoutConsultations > 0 && <p className="mt-2 text-xs text-slate-500">{data.onboardedWithoutConsultations} onboarded partners have no consultation record in this scope. Onboardings use their recorded acquisition source.</p>}</section>
      </>}
      <StoreVisits today receiving={associate} />
    </>}
  </div>;
}
