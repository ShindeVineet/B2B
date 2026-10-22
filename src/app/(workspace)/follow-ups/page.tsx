"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { PageHeader } from '@/components/workspace/PageHeader';
import { LeadCall } from '@/components/leads/LeadCall';
import { LeadHistory } from '@/components/leads/LeadHistory';
import { LogRevisit } from '@/components/rep/LogRevisit';
import { todayIndia } from '@/lib/phase5/calendar';
type Row = { id: string; due_date: string; rep: { id: string; name: string }; lead: { id: string; lead_code: string; company_name: string; phone_no: string | null; call_date: string | null; assigned_ground_rep_id: string | null; calling_associate_id: string | null; intake_team: string; consultations: { id: string }[] } };
const tabs = [['pending', 'Today & overdue'], ['today', 'Today'], ['overdue', 'Overdue'], ['upcoming', 'Upcoming']];
export default function FollowUpsPage() {
  const { user } = useAuth();
  const [view, setView] = useState('pending'), [page, setPage] = useState(1), [revision, setRevision] = useState(0);
  const [rows, setRows] = useState<Row[]>([]), [total, setTotal] = useState(0), [pages, setPages] = useState(1);
  const [busy, setBusy] = useState(true), [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/follow-ups?view=${view}&page=${page}`, { signal: controller.signal }).then(async r => {
      const data = await r.json(); if (!r.ok) throw Error(data.error || 'Unable to load follow-ups');
      setRows(data.followups); setTotal(data.total); setPages(data.totalPages); setError('');
      if (page > data.totalPages) setPage(data.totalPages);
    }).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [view, page, revision]);
  useEffect(() => {
    const refresh = () => { setBusy(true); setRevision(n => n + 1); };
    window.addEventListener('followups-updated', refresh);
    return () => window.removeEventListener('followups-updated', refresh);
  }, []);
  const refresh = () => { setBusy(true); setRevision(n => n + 1); };
  return <div className="space-y-5">
    <PageHeader title="Follow Up" description="Today’s follow-ups and unfinished reminders from earlier days. Dates use India Standard Time." />
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Follow-up dates">{tabs.map(([key, label]) => <button key={key} role="tab" aria-selected={view === key} className={`rounded-lg border px-4 py-2 text-sm ${view === key ? 'bg-orange-600 text-white' : 'bg-white text-slate-700'}`} onClick={() => { setView(key); setPage(1); setBusy(true); }}>{label}</button>)}<button className="border rounded-lg px-4 py-2 text-sm" onClick={refresh}>Refresh</button></div>
    <p className="text-sm text-slate-600">Reminders stay pending until contact is logged on or after the due date, or a new follow-up date is set. Unsuccessful visits remain pending.</p>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {busy ? <p role="status">Loading follow-ups…</p> : <><p className="text-sm font-semibold">{total} follow-ups</p>
      {rows.length === 0 && <div className="workspace-card text-slate-500">No follow-ups in this view.</div>}
      <div className="space-y-3">{rows.map(row => {
        const canRevisit = !!row.lead.consultations.length && (row.lead.assigned_ground_rep_id === user?.id || (['store','head','caller'].includes(row.lead.intake_team) && row.lead.calling_associate_id === user?.id));
        const overdue = row.due_date.slice(0,10) < todayIndia();
        return <article key={row.id} className="workspace-card flex flex-wrap items-start justify-between gap-4">
          <div><Link className="font-semibold underline" href={`/leads/${row.lead.id}`}>{row.lead.lead_code} · {row.lead.company_name}</Link><p className="text-sm mt-1">{row.lead.phone_no || 'No phone number'}</p><p className="text-sm text-slate-600">Assigned to {row.rep.name}</p>{row.lead.call_date && <p className="text-xs text-slate-500">Last contact: {new Date(row.lead.call_date).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</p>}<p className={`text-sm font-semibold mt-2 ${overdue ? 'text-red-700' : 'text-orange-700'}`}>{overdue ? 'Overdue' : 'Due'} · {row.due_date.slice(0,10)}</p></div>
          <div className="flex flex-wrap gap-2 items-start"><LeadHistory leadId={row.lead.id} />{user?.role !== 'analyst' && <LeadCall leadId={row.lead.id} className="border rounded-lg px-3 py-2 text-sm" />}{canRevisit && <LogRevisit leadId={row.lead.id} onSaved={() => {}} />}</div>
        </article>;
      })}</div>
      <div className="flex gap-4 items-center"><button disabled={page <= 1} onClick={() => { setPage(p => p - 1); setBusy(true); }} className="border rounded-lg p-2 disabled:opacity-40">Previous</button><span className="text-sm">Page {page} of {pages}</span><button disabled={page >= pages} onClick={() => { setPage(p => p + 1); setBusy(true); }} className="border rounded-lg p-2 disabled:opacity-40">Next</button></div>
    </>}
  </div>;
}
