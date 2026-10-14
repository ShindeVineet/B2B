"use client";
import { useEffect, useState } from 'react';
import { DialogOverlay } from '@/components/shared/DialogOverlay';
import { addDays, todayIndia } from '@/lib/phase5/calendar';

export function CallingConsultationModal({ leadId, onClose, onSuccess }: { leadId: string; onClose: () => void; onSuccess?: () => void }) {
  const [picked, setPicked] = useState<boolean | null>(null);
  const [interest, setInterest] = useState('');
  const [date, setDate] = useState('');
  const [follow, setFollow] = useState(false);
  const [group, setGroup] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    fetch(`/api/leads/${leadId}/group`).then(async r => {
      const d = await r.json(); if (!r.ok) throw Error(d.error);
      if (!d.editable) throw Error('You cannot record calls for this lead');
      if (live) { setGroup(d.whatsapp_group_created); setReady(true); }
    }).catch(e => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [leadId]);
  return <DialogOverlay role="dialog" aria-modal="true" aria-label="Calling consultation" className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4">
    <form className="bg-white text-slate-900 rounded-xl p-5 w-full max-w-lg space-y-5 max-h-[92dvh] overflow-y-auto" onSubmit={async e => {
      e.preventDefault(); if (picked === null) return;
      setBusy(true); setError('');
      try {
        const r = await fetch(`/api/leads/${leadId}/calling-consultation`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ call_picked: picked, ...(picked ? { interest_level: interest, next_follow_up_date: follow ? date : null, whatsapp_group_created: group } : {}) }) });
        const d = await r.json(); if (!r.ok) throw Error(d.error);
        window.dispatchEvent(new CustomEvent('lead-contact-updated', { detail: { leadId, date: d.call.created_at } }));
        window.dispatchEvent(new CustomEvent('lead-group-updated', { detail: { leadId } }));
        window.dispatchEvent(new Event('followups-updated'));
        onSuccess?.(); onClose();
      } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
    }}>
      <h2 className="text-lg font-bold">Calling consultation</h2>
      <fieldset disabled={busy || !ready} className="space-y-4">
        <legend className="font-semibold mb-2">Call Picked</legend>
        <div className="flex gap-6">{[true, false].map(v => <label key={String(v)} className="flex gap-2 items-center"><input type="radio" name="call-picked" required checked={picked === v} onChange={() => setPicked(v)} />{v ? 'Yes' : 'No'}</label>)}</div>
        {picked === true && <>
          <label className="block text-sm font-semibold">Level of interest<select required value={interest} onChange={e => setInterest(e.target.value)} className="block w-full border rounded-lg p-3 mt-1"><option value="">Select…</option>{['High', 'Medium', 'Low'].map(v => <option key={v}>{v}</option>)}</select></label>
          <label className="flex gap-2 items-center text-sm"><input type="checkbox" checked={follow} onChange={e => setFollow(e.target.checked)} />Follow-up required</label>
          {follow && <label className="block text-sm font-semibold">Follow-up date<input required type="date" min={todayIndia()} value={date} onChange={e => setDate(e.target.value)} className="block w-full border rounded-lg p-3 mt-1" /></label>}
          <label className="flex gap-2 items-center text-sm"><input type="checkbox" checked={group} onChange={e => setGroup(e.target.checked)} />Group Created</label>
        </>}
        {picked === false && <p role="status" className="text-sm rounded-lg bg-orange-50 p-3">A follow-up will be scheduled automatically for tomorrow, {addDays(todayIndia(), 1)} (IST), when you save.</p>}
      </fieldset>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {!ready && !error && <p>Loading…</p>}
      <div className="flex gap-3"><button disabled={busy || !ready || picked === null} className="bg-orange-600 text-white rounded-lg px-4 py-2 disabled:opacity-50">{busy ? 'Saving…' : picked === false ? 'Save call attempt' : 'Save consultation'}</button><button type="button" disabled={busy} onClick={onClose} className="border rounded-lg px-4 py-2">Cancel</button></div>
    </form>
  </DialogOverlay>;
}
