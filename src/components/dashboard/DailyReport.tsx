"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { todayIndia } from "@/lib/phase5/calendar";

type Summary = {
  date: string;
  totals: { leads: number; consultations: number; calls: number; callsPicked: number; groups: number; onboarded: number };
  sources: { source: string; count: number }[];
  channels: { key: string; label: string; total: number; hot: number; warm: number; cold: number; unclassified: number }[];
  staff: { id: string; name: string; total: number; hot: number; warm: number; cold: number; unclassified: number }[];
  callStaff: { id: string; name: string; called: number; picked: number }[];
  callerInterest: { hot: number; warm: number; cold: number; unclassified: number };
  rates: { picked: number; consultationToOnboarded: number };
};
type Detail = { section: string; rows: Record<string, unknown>[]; total: number; page: number; totalPages: number };
const sectionLabel: Record<string, string> = { leads: "Leads created", consultations: "Consultations", calls: "Calls logged", groups: "Groups created", onboarded: "Partners onboarded" };
const shown = (value: unknown) => value == null || value === "" ? "—" : value instanceof Object ? "" : String(value);

export function DailyReport() {
  const [date, setDate] = useState(todayIndia());
  const [summary, setSummary] = useState<Summary | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    fetch(`/api/dashboard/daily-report?date=${date}`).then(async response => { const data = await response.json(); if (!response.ok) throw Error(data.error); if (live) setSummary(data); }).catch(cause => { if (live) setError(cause.message); });
    return () => { live = false; };
  }, [date]);
  const loading = !summary || summary.date !== date;
  async function open(section: string, page = 1) {
    setError("");
    try {
      const response = await fetch(`/api/dashboard/daily-report?date=${date}&section=${section}&page=${page}`), data = await response.json();
      if (!response.ok) throw Error(data.error); setDetail(data);
    } catch (cause) { setError((cause as Error).message); }
  }
  const cards = summary ? [
    ["leads", "Total leads", summary.totals.leads, "All sources"],
    ["consultations", "Consultations", summary.totals.consultations, "Ground, walk-in and calling"],
    ["groups", "Groups created", summary.totals.groups, "New groups on this date"],
    ["onboarded", "Onboarded", summary.totals.onboarded, "Active partner records"],
  ] as const : [];
  return <section className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border bg-white p-4">
      <div><h2 className="text-lg font-bold">Daily funnel report</h2><p className="text-sm text-slate-500">Activity is grouped by India Standard Time.</p></div>
      <label className="text-sm font-semibold">Report date<input className="ml-2 rounded-lg border p-2" type="date" max={todayIndia()} value={date} onChange={event => { setError(""); setDetail(null); setDate(event.target.value); }} /></label>
    </div>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
    {loading && <p role="status">Loading daily report…</p>}
    {summary && summary.date === date && <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([section, label, count, note]) => <button key={section} onClick={() => void open(section)} className="workspace-card text-left border-t-4 border-t-[#ff4500] hover:border-orange-400"><span className="text-sm font-semibold text-slate-600">{label}</span><strong className="mt-2 block text-3xl text-[#ff4500]">{count}</strong><span className="text-xs text-slate-500">{note} · View records</span></button>)}</div>
      <div className="grid gap-4 xl:grid-cols-2">
        <section className="workspace-card space-y-3"><h3 className="font-bold">Lead sources</h3><div className="flex flex-wrap gap-2">{summary.sources.length ? summary.sources.map(source => <button key={source.source} onClick={() => void open("leads")} className="rounded-full border bg-slate-50 px-3 py-2 text-sm"><strong>{source.count}</strong> {source.source}</button>) : <p className="text-sm text-slate-500">No leads created.</p>}</div></section>
        <section className="workspace-card space-y-3"><h3 className="font-bold">Daily conversion indicators</h3><div className="grid grid-cols-2 gap-3"><div className="rounded-lg bg-orange-50 p-3"><strong className="text-2xl text-orange-700">{summary.rates.picked}%</strong><p className="text-xs">Calls picked</p></div><div className="rounded-lg bg-emerald-50 p-3"><strong className="text-2xl text-emerald-700">{summary.rates.consultationToOnboarded}%</strong><p className="text-xs">Consultation-to-onboarding</p></div></div></section>
      </div>
      <section className="workspace-card space-y-3"><h3 className="font-bold">Consultations by funnel channel</h3><div className="grid gap-3 md:grid-cols-3">{summary.channels.map(channel => <button key={channel.key} onClick={() => void open("consultations")} className="rounded-xl border p-4 text-left"><span className="font-semibold">{channel.label}</span><strong className="mt-1 block text-2xl text-[#ff4500]">{channel.total}</strong><span className="text-xs text-slate-600">{channel.hot} H · {channel.warm} W · {channel.cold} C{channel.unclassified ? ` · ${channel.unclassified} unclassified` : ""}</span></button>)}</div></section>
      <section className="workspace-card space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">Calling activity</h3><button onClick={() => void open("calls")} className="text-sm underline">View all calls</button></div><p><strong>{summary.totals.calls}</strong> called · <strong>{summary.totals.callsPicked}</strong> picked · Picked interest: {summary.callerInterest.hot} H / {summary.callerInterest.warm} W / {summary.callerInterest.cold} C</p><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{summary.callStaff.map(person => <button key={person.id} onClick={() => void open("calls")} className="rounded-lg border p-3 text-left text-sm"><strong>{person.name}</strong><p>{person.called} called · {person.picked} picked</p></button>)}</div></section>
      <section className="workspace-card space-y-3"><div className="flex items-center justify-between"><h3 className="font-bold">Staff consultation metrics</h3><button onClick={() => void open("consultations")} className="text-sm underline">View consultations</button></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Staff</th><th>Total</th><th>Hot</th><th>Warm</th><th>Cold</th></tr></thead><tbody>{summary.staff.map(person => <tr key={person.id} className="border-b"><td className="p-2"><button className="font-semibold underline" onClick={() => void open("consultations")}>{person.name}</button></td><td>{person.total}</td><td>{person.hot}</td><td>{person.warm}</td><td>{person.cold}</td></tr>)}</tbody></table></div></section>
    </>}
    {detail && <section className="workspace-card space-y-3"><div className="flex items-center justify-between gap-3"><h3 className="font-bold">{sectionLabel[detail.section]} ({detail.total})</h3><button onClick={() => setDetail(null)}>Close</button></div><div className="overflow-x-auto"><table className="w-full min-w-[700px] text-sm"><thead><tr className="border-b text-left"><th className="p-2">Record</th><th>Company / contact</th><th>Source / channel</th><th>Staff / assignment</th><th>Result</th><th>Time</th></tr></thead><tbody>{detail.rows.map((row, index) => <tr className="border-b align-top" key={String(row.id || index)}><td className="p-2">{row.lead_id ? <Link className="underline" href={`/leads/${row.lead_id}`}>{shown(row.lead_code) || "Open lead"}</Link> : shown(row.partner_code || row.lead_code || row.id)}</td><td>{shown(row.company_name || row.company_firm_name)}<small className="block text-slate-500">{shown(row.owner_name || row.contact_person_name || row.phone_no)}</small></td><td>{shown(row.lead_source || row.channel || row.intake_team)}</td><td>{shown(row.staff || (row.submitter as { name?: string })?.name || (row.reviewer as { name?: string })?.name)}</td><td>{shown(row.interest_level || row.outcome || row.status)}</td><td>{row.created_at ? new Date(String(row.created_at)).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "—"}</td></tr>)}</tbody></table></div><div className="flex items-center gap-3"><button disabled={detail.page <= 1} onClick={() => void open(detail.section, detail.page - 1)}>Previous</button><span>Page {detail.page} of {detail.totalPages}</span><button disabled={detail.page >= detail.totalPages} onClick={() => void open(detail.section, detail.page + 1)}>Next</button></div></section>}
  </section>;
}
