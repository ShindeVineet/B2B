"use client";
import { DialogOverlay } from "@/components/shared/DialogOverlay";
import { useState } from "react";

import { canPlotLead } from "@/lib/mapping/visibility";
type Lead = {
  id: string;
  lead_code?: string; company_name: string;
  lat: number | null;
  lng: number | null;
  geocode_status?: string | null;
  assigned_ground_rep_id?: string | null;
};
export function EditVisit({
  visit,
  onSaved,
}: {
  visit: {
    id: string;
    scheduled_date: string;
    lead: { id: string; lead_code?: string; company_name: string };
    ground_rep_id?: string;
  };
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false),
    [date, setDate] = useState(visit.scheduled_date.slice(0, 10)),
    [leadId, setLeadId] = useState(visit.lead.id),
    [leads, setLeads] = useState<Lead[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function start() {
    setOpen(true);
    setError("");
    setDate(visit.scheduled_date.slice(0, 10));
    setLeadId(visit.lead.id);
    try {
      const response = await fetch("/api/route-plans?pool=true");
      const data = await response.json(); if (!response.ok) throw Error(data.error);
      setLeads(data.leads);
    } catch (e) {
      setError(String(e));
    }
  }
  return (
    <>
      <button
        type="button"
        className="border border-slate-400 bg-white rounded-lg px-3 py-2 text-sm font-semibold text-slate-800"
        onClick={() => void start()}
      >
        Edit visit / lead
      </button>
      {open && (
        <DialogOverlay
          role="dialog"
          aria-modal="true"
          aria-label="Edit scheduled visit"
          className="fixed inset-0 z-[120] bg-slate-950/60 flex items-center justify-center p-4"
        >
          <div className="workspace-card max-w-lg w-full space-y-4 text-slate-900">
            <h2 className="text-xl font-bold">Edit scheduled visit</h2>
            <p className="text-sm text-slate-600">
              Move this visit to another working day or replace the lead. This
              edit does not record a missed visit.
            </p>
            <label className="block text-sm font-semibold">
              Lead
              <select
                className="block w-full border rounded-lg p-3 mt-2"
                value={leadId}
                onChange={(e) => setLeadId(e.target.value)}
              >
                <option value={visit.lead.id}>{visit.lead.lead_code} {visit.lead.company_name}</option>
                {leads
                  .filter(
                    (l) =>
                      l.id !== visit.lead.id &&
                      canPlotLead(l) &&
                      (!visit.ground_rep_id ||
                        !l.assigned_ground_rep_id ||
                        l.assigned_ground_rep_id === visit.ground_rep_id),
                  )
                  .map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.lead_code} {l.company_name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="block text-sm font-semibold">
              Visit date
              <input
                className="block w-full border rounded-lg p-3 mt-2"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <p className="text-sm text-slate-600">
              The new date must fit this plan’s working days and capacity.
              Extend the plan first if needed.
            </p>
            {error && (
              <p role="alert" className="text-rose-700">
                {error}
              </p>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                disabled={busy || !date}
                className="rounded-lg bg-orange-600 text-white px-4 py-3 font-semibold"
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    if (!window.confirm("Save this visit change? A route-backed visit will be removed from its saved route and remain scheduled as a direct visit.")) return;
                    const r = await fetch(`/api/visits/${visit.id}/edit`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        date,
                        lead_id: leadId,
                        expected_date: visit.scheduled_date.slice(0, 10),
                        confirm: true,
                        expected_lead_id: visit.lead.id,
                      }),
                    });
                    const d = await r.json();
                    if (!r.ok) throw Error(d.error);
                    setOpen(false);
                    onSaved();
                  } catch (e) {
                    setError(String(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Save changes
              </button>
              <button
                type="button"
                disabled={busy}
                className="border rounded-lg px-4 py-3"
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </DialogOverlay>
      )}
    </>
  );
}
