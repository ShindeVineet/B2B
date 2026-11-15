"use client";
import { useState } from "react";
import Link from "next/link";

type Match = { id: string; lead_code: string; company_name: string; phone_no: string | null; funnel_status?: string };
export function DashboardSearch() {
  const [query, setQuery] = useState(""), [rows, setRows] = useState<Match[]>([]), [open, setOpen] = useState(false), [error, setError] = useState("");
  async function search(value: string) {
    setQuery(value); setError("");
    if (value.trim().length < 2) { setRows([]); setOpen(false); return; }
    try { const response = await fetch(`/api/leads?compact=true&limit=6&search=${encodeURIComponent(value.trim())}`); const data = await response.json(); if (!response.ok) throw Error(data.error); setRows(data.leads); setOpen(true); } catch (cause) { setError((cause as Error).message); }
  }
  return <div className="relative w-full max-w-md"><label className="sr-only" htmlFor="dashboard-search">Search leads</label><input id="dashboard-search" value={query} onChange={event => void search(event.target.value)} onFocus={() => rows.length && setOpen(true)} placeholder="Search leads, company or phone…" className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm shadow-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100" />{error && <p className="mt-1 text-xs text-red-700">{error}</p>}{open && <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border bg-white shadow-lg">{rows.length ? rows.map(row => <Link key={row.id} href={`/leads/${row.id}`} onClick={() => setOpen(false)} className="block border-b px-4 py-3 last:border-0 hover:bg-orange-50"><strong className="block text-sm">{row.lead_code} · {row.company_name}</strong><span className="text-xs text-slate-500">{row.phone_no || "No phone"} · {row.funnel_status || "New"}</span></Link>) : <p className="px-4 py-3 text-sm text-slate-500">No matching leads.</p>}</div>}</div>;
}
