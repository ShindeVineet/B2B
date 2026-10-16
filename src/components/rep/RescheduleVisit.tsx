"use client";
import { DialogOverlay } from "@/components/shared/DialogOverlay";
import { useState } from "react";
const reasons = [
  ["personal", "Personal reason"],
  ["traffic_weather", "Traffic or weather"],
  ["office_closed", "Office closed"],
  ["unreachable", "Lead unreachable"],
  ["other", "Other"],
];
export function RescheduleVisit({
  id,
  onSaved,
}: {
  id: string;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false),
    [approval, setApproval] = useState(false),
    [message, setMessage] = useState(""),
    [date, setDate] = useState(""),
    [expected, setExpected] = useState(""),
    [end, setEnd] = useState(""),
    [reason, setReason] = useState(""),
    [note, setNote] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function show(initial: string) {
    setOpen(true);
    setReason(initial);
    setNote("");
    setError("");
    setDate("");
    setExpected("");
    setBusy(true);
    try {
      const r = await fetch(`/api/visits/${id}/reschedule`);
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setDate(d.suggested_date || "");
      setExpected(d.scheduled_date);
      setEnd(d.end_date || "");
      setApproval(!!d.requires_approval);
      setError(d.message || "");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button className="border rounded p-2 text-xs" onClick={() => show("")}>
        Reschedule
      </button>
      {message && (
        <span role="status" className="text-xs text-slate-600">
          {message}
        </span>
      )}
      {open && (
        <DialogOverlay
          role="dialog"
          aria-modal="true"
          aria-label="Reschedule visit"
          className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center"
        >
          <form
            className="bg-white p-6 rounded-xl space-y-4 max-w-md"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                const r = await fetch(`/api/visits/${id}/reschedule`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    date,
                    expected_date: expected,
                    reason,
                    note,
                  }),
                });
                const d = await r.json();
                if (!r.ok) throw Error(d.error);
                setOpen(false);
                setMessage(
                  d.pending_approval
                    ? "Request sent — awaiting manager approval"
                    : "Visit rescheduled",
                );
                onSaved();
              } catch (e) {
                setError(String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            <h2>Missed visit / reschedule</h2>
            <p>
              {approval
                ? "Choose a new date. Your visit stays on its current date until Head or Store Lead approves."
                : "Choose a new date. Saving approves and updates the visit."}
            </p>
            <label className="block">
              Reason
              <select
                className="border p-2 w-full"
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              >
                <option value="">Choose a reason</option>
                {reasons.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              Note
              <textarea
                className="border w-full"
                maxLength={2000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <label className="block">
              Suggested date (editable)
              <input
                className="border p-2 w-full"
                type="date"
                required
                max={end || undefined}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <p role="alert">{error}</p>
            <button
              disabled={busy || !expected}
              className="bg-orange-600 text-white p-2 rounded"
            >
              {approval ? "Request reschedule" : "Approve reschedule"}
            </button>{" "}
            <button
              type="button"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
          </form>
        </DialogOverlay>
      )}
    </>
  );
}
