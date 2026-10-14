"use client";
import { useEffect, useState } from 'react';

export function GroupCreatedToggle({ leadId }: { leadId: string }) {
  const [saved, setSaved] = useState<boolean | null>(null);
  const [value, setValue] = useState(false);
  const [editable, setEditable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const r = await fetch(`/api/leads/${leadId}/group`), d = await r.json();
        if (!r.ok) throw Error(d.error);
        if (live) { setSaved(d.whatsapp_group_created); setValue(d.whatsapp_group_created); setEditable(d.editable); }
      } catch (e) { if (live) setError((e as Error).message); }
    };
    void load();
    const refresh = (event: Event) => { if ((event as CustomEvent).detail?.leadId === leadId) void load(); };
    window.addEventListener('lead-group-updated', refresh);
    return () => { live = false; window.removeEventListener('lead-group-updated', refresh); };
  }, [leadId]);
  return <div className="text-sm space-y-1" onClick={e => e.stopPropagation()}>
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-2"><input type="checkbox" checked={value} disabled={saved === null || !editable || busy} onChange={e => { setValue(e.target.checked); setError(''); }} />Group Created</label>
      {saved !== null && value !== saved && <button type="button" disabled={busy} className="rounded border border-orange-600 px-2 py-1 text-xs text-orange-700" onClick={async () => {
        setBusy(true); setError('');
        try {
          const r = await fetch(`/api/leads/${leadId}/group`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ whatsapp_group_created: value, previous: saved }) });
          const d = await r.json(); if (!r.ok) throw Error(d.error);
          setSaved(d.whatsapp_group_created);
          window.dispatchEvent(new CustomEvent('lead-group-updated', { detail: { leadId } }));
        } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
      }}>{busy ? 'Applying…' : 'Apply'}</button>}
    </div>
    {error && <p role="alert" className="text-red-700">{error}</p>}
  </div>;
}
