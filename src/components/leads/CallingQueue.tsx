"use client";
import { GroupCreatedToggle } from "./GroupCreatedToggle";
import { isWonLead } from "@/lib/leads/interest-bucket";
import { ScheduleVisitButton } from "@/components/leads/ScheduleVisitButton";
import { OriginalLead } from "@/components/leads/OriginalLead";
import { LastContact } from "./LastContact";
import { callingPriority } from "@/lib/last-contact";
import { todayIndia } from "@/lib/phase5/calendar";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { fetchAllMapLeads } from "@/lib/map-leads";
import { LeadCall } from "./LeadCall";
import { PageHeader } from "@/components/workspace/PageHeader";

type Lead = {
  id: string; lead_code: string; company_name: string; owner_name?: string | null;
  phone_no: string | null; website?: string | null;
  address: string | null; pin_code: string | null; region?: string | null;
  category?: string | null; notes?: string | null; extra_notes?: string | null;
  lead_source: string | null; intake_team?: string | null; status?: string;
  funnel_status?: string; partners?: { partner_status: string }[];
  last_contact_at?: string | null; next_follow_up_date?: string | null;
  google_map_link: string | null; geocode_issue_reason: string | null;
  location_verified: boolean; calling_associate_id: string | null;
  linkedin_data?: Record<string, string> | null; linkedin_lead_id?: string | null;
  store_visits?: { scheduled_at: string; store: { name: string } }[];
  latest_interest_level: string | null;
  calling_associate?: { id: string; name: string } | null;
  ground_rep?: { id: string; name: string } | null;
  store?: { id: string; name: string } | null;
};
const PAGE_SIZE = 30;
const tabs = ["All Leads", "Priority Queue", "Location", "Warm", "Cold", "Phone", "CDT", "LinkedIn", "Walk-in"];

export function CallingQueue() {
  const { user } = useAuth();
  const [revision, setRevision] = useState(0), [rows, setRows] = useState<Lead[]>([]);
  const [tab, setTab] = useState("All Leads"), [error, setError] = useState("");
  const [edit, setEdit] = useState<Lead | null>(null), [page, setPage] = useState(1), [busy, setBusy] = useState(false);
  const [locationRows, setLocationRows] = useState<Lead[]>([]), [locationTotal, setLocationTotal] = useState(0);
  const [allRows, setAllRows] = useState<Lead[]>([]), [allTotal, setAllTotal] = useState(0), [allPages, setAllPages] = useState(1);
  const [allSearch, setAllSearch] = useState(""), [appliedSearch, setAppliedSearch] = useState("");
  const loadLegacyQueues = useCallback(() => fetchAllMapLeads<Lead>().then(setRows), []);

  useEffect(() => {
    const locationTimer = window.setTimeout(() => {
      if (new URLSearchParams(window.location.search).get("tab") === "Location") setTab("Location");
    }, 0);
    const refresh = () => setRevision(value => value + 1);
    window.addEventListener("followups-updated", refresh); window.addEventListener("store-visits-updated", refresh);
    return () => { window.clearTimeout(locationTimer); window.removeEventListener("followups-updated", refresh); window.removeEventListener("store-visits-updated", refresh); };
  }, []);
  useEffect(() => {
    if (["All Leads", "Location"].includes(tab) || rows.length) return;
    void loadLegacyQueues().catch(cause => setError(cause.message));
  }, [tab, rows.length, loadLegacyQueues]);
  useEffect(() => {
    if (tab !== "All Leads") return;
    let live = true; const params = new URLSearchParams({ page: String(page) });
    if (appliedSearch) params.set("search", appliedSearch);
    fetch(`/api/calling-leads?${params}`).then(async response => { const data = await response.json(); if (!response.ok) throw Error(data.error); if (live) { setAllRows(data.leads); setAllTotal(data.total); setAllPages(data.totalPages); } }).catch(cause => setError(cause.message));
    return () => { live = false; };
  }, [tab, page, appliedSearch, revision]);
  useEffect(() => {
    if (tab !== "Location") return;
    let live = true;
    fetch(`/api/calling-locations?page=${page}`).then(async response => { const data = await response.json(); if (!response.ok) throw Error(data.error); if (live) { setLocationRows(data.leads); setLocationTotal(data.total); } }).catch(cause => setError(cause.message));
    return () => { live = false; };
  }, [tab, page, revision]);
  useEffect(() => {
    if (!rows.length || ["All Leads", "Location"].includes(tab)) return;
    void loadLegacyQueues().catch(cause => setError(cause.message));
  }, [revision, tab, rows.length, loadLegacyQueues]);

  const filtered = rows.filter(lead => !isWonLead(lead)).filter(lead => tab === "Priority Queue"
    ? lead.latest_interest_level === "Medium" || lead.latest_interest_level === "Low" || lead.intake_team === "caller" || ["Phone", "CDT", "LinkedIn", "Walk-in"].includes(lead.lead_source || "") || (lead.geocode_issue_reason === "not_found" && !lead.location_verified && !!user && (user.role === "b2b_head" || user.role === "regional_manager" || (user.role === "store_associate" && lead.calling_associate_id === user.id)))
    : ["CDT", "Phone", "LinkedIn", "Walk-in"].includes(tab) ? lead.lead_source === tab : lead.latest_interest_level === (tab === "Warm" ? "Medium" : "Low"));
  filtered.sort((a, b) => callingPriority(a, b, todayIndia()));
  const displayedRows = tab === "All Leads" ? allRows : tab === "Location" ? locationRows : filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const total = tab === "All Leads" ? allTotal : tab === "Location" ? locationTotal : filtered.length;
  const totalPages = tab === "All Leads" ? allPages : Math.max(1, Math.ceil(total / PAGE_SIZE));

  return <main className="workspace-page space-y-4">
    <PageHeader title="Calling Queue" actions={<Link href="/leads/new?source=Walk-in" className="btn">Import walk-in lead</Link>} description="Review every lead without downloading the full database, then record calls with the standard Call Picked workflow." />
    <p className="rounded-xl border border-orange-100 bg-orange-50 p-3 text-sm text-orange-900">Call priority: due follow-ups → no recorded contact → oldest contact. Future follow-ups come last. Use Log a call to record whether the call was picked.</p>
    <div className="flex flex-wrap gap-3">{tabs.map(name => <button key={name} className={name === tab ? "bg-orange-600 px-4 py-2" : "border px-4 py-2"} onClick={() => { setTab(name); setPage(1); }}>{name}</button>)}</div>
    {tab === "All Leads" && <form className="flex max-w-2xl gap-2" onSubmit={event => { event.preventDefault(); setPage(1); setAppliedSearch(allSearch.trim()); }}>
      <input className="min-w-0 flex-1 rounded-lg border p-2" aria-label="Search all leads" placeholder="Search lead ID, company, contact, phone or PIN" value={allSearch} onChange={event => setAllSearch(event.target.value)} />
      <button type="submit">Search</button>
      {appliedSearch && <button type="button" onClick={() => { setAllSearch(""); setAppliedSearch(""); setPage(1); }}>Clear</button>}
    </form>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {edit && <form className="workspace-card space-y-3" onSubmit={async event => { event.preventDefault(); setBusy(true); setError(""); try { const response = await fetch(`/api/leads/${edit.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ company_name: edit.company_name, address: edit.address, pin_code: edit.pin_code, phone_no: edit.phone_no, google_map_link: edit.google_map_link }) }); const data = await response.json(); if (!response.ok) throw Error(data.error); setEdit(null); setRevision(value => value + 1); } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); } }}>
      <OriginalLead leadId={edit.id} /><h2>Complete alternate / verified details</h2>
      {(["company_name", "phone_no", "address", "pin_code", "google_map_link"] as const).map(key => <label key={key} className="block">Alternate / verified {key.replaceAll("_", " ")}<input className="block w-full border p-2" value={edit[key] || ""} onChange={event => setEdit({ ...edit, [key]: event.target.value })} /></label>)}
      <button disabled={busy} className="bg-orange-600 p-2">Save details</button><button type="button" onClick={() => setEdit(null)}>Cancel</button>
    </form>}
    {tab === "Location" && <p className="rounded-xl bg-orange-50 p-3 text-sm">These locations were not found. Call to confirm the address or Google Maps link, then update the lead.</p>}
    <div className="space-y-3">{displayedRows.map(lead => <article key={lead.id} className="workspace-card flex flex-wrap justify-between gap-3">
      <div className="min-w-0 flex-1"><LastContact leadId={lead.id} value={lead.last_contact_at} />
        {lead.next_follow_up_date && <p className="text-xs font-semibold text-orange-700">Follow-up: {lead.next_follow_up_date.slice(0, 10)}</p>}
        <Link className="font-semibold underline" href={`/leads/${lead.id}?context=calling`}>{lead.lead_code} {lead.company_name}</Link><p>{lead.phone_no || "Phone not provided"}</p><p className="text-xs text-slate-500">Source: {lead.lead_source || "Not recorded"}</p>
        {tab === "All Leads" && <><p className="mt-1 text-sm font-semibold text-orange-800">Funnel: {lead.funnel_status || lead.status || "New"}</p><p className="text-xs text-slate-600">Assigned to: {[lead.calling_associate?.name && `Caller: ${lead.calling_associate.name}`, lead.ground_rep?.name && `Ground: ${lead.ground_rep.name}`, lead.store?.name && `Store: ${lead.store.name}`].filter(Boolean).join(" · ") || "Unassigned"}</p>
          <details className="mt-2 rounded-lg border bg-slate-50 p-2 text-sm"><summary className="cursor-pointer font-semibold">Full lead details</summary><dl className="mt-2 grid gap-2 sm:grid-cols-2">{[["Contact", lead.owner_name], ["Phone", lead.phone_no], ["Website", lead.website], ["Google Maps", lead.google_map_link], ["Category", lead.category], ["Region", lead.region], ["PIN", lead.pin_code], ["Address", lead.address], ["Notes", lead.notes], ["Additional notes", lead.extra_notes]].map(([label, value]) => <div key={label}><dt className="text-xs font-semibold text-slate-500">{label}</dt><dd className="break-words">{value || "Not provided"}</dd></div>)}</dl></details></>}
        {lead.store_visits?.[0] && <p className="mt-2 text-xs text-orange-800">Visit date: {new Date(lead.store_visits[0].scheduled_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST · {lead.store_visits[0].store.name}</p>}
        {tab !== "All Leads" && <p>{lead.address || "Location details pending"}</p>}{lead.linkedin_data && <p className="text-sm text-slate-600">{[lead.linkedin_data["Email address"], lead.linkedin_data.City, lead.linkedin_lead_id ? `LinkedIn ID: ${lead.linkedin_lead_id}` : ""].filter(Boolean).join(" · ")}</p>}
      </div>
      <div className="flex flex-wrap gap-2"><GroupCreatedToggle leadId={lead.id} /><ScheduleVisitButton leadId={lead.id} />
        {!isWonLead(lead) && !["Lost", "Converted"].includes(lead.funnel_status || "") ? <LeadCall showHistory className="bg-orange-600 px-4 py-2 text-white" leadId={lead.id} onSuccess={() => setRevision(value => value + 1)} /> : <span className="text-xs text-slate-500">Calling closed</span>}
        <button onClick={() => setEdit(lead)}>Complete details</button><Link className="underline" href={`/partners?lead_id=${lead.id}`}>Onboard partner</Link>
      </div>
    </article>)}</div>
    {!total && <p>No leads in this queue.</p>}
    <div className="flex items-center gap-3"><button disabled={page === 1} onClick={() => setPage(value => value - 1)}>Previous</button><span>Page {page} of {totalPages} · {total} leads</span><button disabled={page >= totalPages} onClick={() => setPage(value => value + 1)}>Next</button></div>
  </main>;
}
