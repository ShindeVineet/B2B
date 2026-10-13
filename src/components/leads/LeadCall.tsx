"use client";
import { CallHistory } from "@/components/cold/CallHistory";
import { useState } from "react";
import { DialogOverlay } from "@/components/shared/DialogOverlay";
type Phone = {
  id: string;
  phone_number: string;
  label: string;
  is_primary: boolean;
};
export function LeadCall({
  leadId,
  className,
  showHistory = false,
}: {
  leadId: string;
  className?: string;
  showHistory?: boolean;
  children?: React.ReactNode;
}) {
  const [history, setHistory] = useState(false);
  const [open, setOpen] = useState(false),
    [notes, setNotes] = useState(""),
    [date, setDate] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false);
  return (
    <span
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className={className}
        onClick={() => {
          setOpen(true);
          setSaved(false);
          setError("");
        }}
      >
        Log a call
      </button>
      {showHistory && (
        <button
          type="button"
          className="ml-2 text-xs"
          onClick={() => setHistory(true)}
        >
          Call log
        </button>
      )}
      {history && (
        <DialogOverlay
          aria-label="Call log"
          className="fixed inset-0 bg-black/50 flex items-center justify-center p-4"
        >
          <section className="bg-white border rounded-xl p-5 w-full max-w-lg space-y-3">
            <div className="flex justify-between items-center">
              <h2 className="font-bold">Call log</h2>
              <button type="button" onClick={() => setHistory(false)}>
                Close
              </button>
            </div>
            <CallHistory leadId={leadId} />
          </section>
        </DialogOverlay>
      )}
      {saved && (
        <span role="status" className="text-sm text-green-800 ml-2">
          Call saved
        </span>
      )}
      {open && (
        <DialogOverlay
          aria-label="Log office-phone call"
          className="fixed inset-0 bg-black/50 flex items-center justify-center p-4"
        >
          <form
            className="bg-white rounded-xl border border-slate-300 p-5 w-full max-w-lg space-y-4 text-slate-900"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                const r = await fetch(`/api/leads/${leadId}/calls`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    notes,
                    next_follow_up_date: date || null,
                  }),
                });
                const d = await r.json();
                if (!r.ok) throw Error(d.error);
                setOpen(false);
                setNotes("");
                setDate("");
                setSaved(true);
                window.dispatchEvent(
                  new CustomEvent("lead-contact-updated", {
                    detail: { leadId, date: d.call.created_at },
                  }),
                );
                window.dispatchEvent(new Event("followups-updated"));
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <h2 className="text-lg font-bold">Log office-phone call</h2>
            <p className="text-sm text-slate-600">
              Record the call made using your office phone.
            </p>
            <LeadPhones leadId={leadId} />
            <label className="block text-sm font-semibold">
              Call notes
              <textarea
                required
                maxLength={10000}
                rows={5}
                className="block w-full border border-slate-300 rounded-lg p-3 mt-1"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
            <label className="block text-sm font-semibold">
              Next follow-up date (optional)
              <input
                type="date"
                className="block w-full border border-slate-300 rounded-lg p-3 mt-1"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            {error && (
              <p role="alert" className="text-red-700">
                {error}
              </p>
            )}
            <div className="flex gap-3">
              <button
                disabled={busy}
                type="submit"
                className="bg-orange-600 px-4 py-2 rounded-lg"
              >
                {busy ? "Saving…" : "Save call"}
              </button>
              <button
                disabled={busy}
                type="button"
                className="px-4 py-2 border rounded-lg"
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        </DialogOverlay>
      )}
    </span>
  );
}
export function LeadPhones({ leadId }: { leadId: string }) {
  const [phones, setPhones] = useState<Phone[]>([]),
    [open, setOpen] = useState(false),
    [canEdit, setCanEdit] = useState(false),
    [number, setNumber] = useState(""),
    [label, setLabel] = useState("alternate"),
    [primary, setPrimary] = useState(false),
    [error, setError] = useState("");
  async function load() {
    const r = await fetch(`/api/leads/${leadId}/phones`),
      d = await r.json();
    if (!r.ok) throw new Error(d.error);
    setPhones(d.phones);
    setCanEdit(d.can_edit);
  }
  async function save(
    phone_number: string,
    label: string,
    is_primary: boolean,
  ) {
    try {
      const r = await fetch(`/api/leads/${leadId}/phones`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone_number, label, is_primary }),
        }),
        d = await r.json();
      if (!r.ok) throw new Error(d.error);
      await load();
      setNumber("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="text-sm">
      <button
        type="button"
        className="text-blue-700 underline"
        onClick={async () => {
          setOpen(!open);
          try {
            await load();
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        Phone numbers / Add number
      </button>
      {open && (
        <div className="bg-white border rounded-lg p-3 space-y-2">
          {phones.map((p) => (
            <div key={p.id} className="flex flex-wrap gap-2">
              <span>
                {p.phone_number} · {p.is_primary ? "Primary" : p.label}
              </span>
              {canEdit && (
                <>
                  <select
                    aria-label="Phone label"
                    value={p.label}
                    onChange={(e) =>
                      void save(p.phone_number, e.target.value, p.is_primary)
                    }
                  >
                    {["primary", "alternate", "whatsapp"].map((l) => (
                      <option key={l}>{l}</option>
                    ))}
                  </select>
                  {!p.is_primary && (
                    <button
                      type="button"
                      className="underline"
                      onClick={() => void save(p.phone_number, p.label, true)}
                    >
                      Make primary
                    </button>
                  )}
                </>
              )}
            </div>
          ))}
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <input
                aria-label="New phone number"
                className="border rounded p-2"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
              />
              <select
                aria-label="New number label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              >
                {["primary", "alternate", "whatsapp"].map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
              <label>
                <input
                  type="checkbox"
                  checked={primary}
                  onChange={(e) => setPrimary(e.target.checked)}
                />
                Primary
              </label>
              <button
                type="button"
                className="border rounded p-2"
                onClick={() => void save(number, label, primary)}
              >
                Add number
              </button>
            </div>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
