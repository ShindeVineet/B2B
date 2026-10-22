"use client";
import { useState } from "react";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { todayIndia, addDays } from "@/lib/phase5/calendar";
import { DialogOverlay } from "@/components/shared/DialogOverlay";
export function LogRevisit({
  leadId,
  onSaved,
}: {
  leadId: string;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [ready, setReady] = useState(false);
  const [future, setFuture] = useState(false),
    [date, setDate] = useState(addDays(todayIndia(), 1)),
    [outcome, setOutcome] = useState(""),
    [notes, setNotes] = useState(""),
    [followDate, setFollowDate] = useState("");
  return (
    <span className="inline-flex flex-col gap-2">
      <button
        className="inline-flex items-center gap-1 border border-orange-200 rounded-lg p-2 text-orange-800"
        onClick={() => {
          setOpen(true);
          setError("");
          setOutcome("");
          setNotes("");
          setFollowDate("");
        }}
      >
        <RotateCcw size={14} />
        Log revisit
      </button>
      {message && (
        <span role="status" className="text-xs text-green-800">
          {message}
        </span>
      )}
      {ready && (
        <Link
          className="text-orange-700 underline text-sm"
          href={`/partners?lead_id=${leadId}`}
        >
          Fill onboarding form for approval
        </Link>
      )}
      {open && (
        <DialogOverlay
          aria-label="Log revisit"
          className="fixed inset-0 bg-black/50 flex items-center justify-center p-4"
        >
          <form
            className="bg-white rounded-2xl border p-6 w-full max-w-md space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                const r = await fetch(`/api/leads/${leadId}/revisit`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(
                    future
                      ? { date }
                      : {
                          date: todayIndia(),
                          outcome,
                          notes,
                          next_follow_up_date: followDate || null,
                        },
                  ),
                });
                const d = await r.json();
                if (!r.ok) throw Error(d.error);
                setReady(!future && outcome === "Ready for onboarding");
                setMessage(
                  future
                    ? `Revisit scheduled for ${date}`
                    : "Revisit update saved",
                );
                setOpen(false);
                window.dispatchEvent(new Event("onboarding-updated"));
                window.dispatchEvent(new Event("followups-updated"));
                if (!future)
                  window.dispatchEvent(
                    new CustomEvent("lead-contact-updated", {
                      detail: { leadId, date: new Date().toISOString() },
                    }),
                  );
                onSaved();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <h2 className="text-xl font-bold">Revisit update</h2>
            <p className="text-sm text-slate-600">
              Record what changed since the last visit.
            </p>
            <label className="block">
              When
              <select
                className="block border rounded p-2 w-full"
                value={future ? "future" : "today"}
                onChange={(e) => setFuture(e.target.value === "future")}
              >
                <option value="today">Visited today</option>
                <option value="future">Schedule a future revisit</option>
              </select>
            </label>
            {future ? (
              <label className="block">
                Visit date
                <input
                  required
                  className="block border rounded p-2 w-full"
                  type="date"
                  min={addDays(todayIndia(), 1)}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
            ) : (
              <>
                <label className="block">
                  Outcome
                  <select
                    required
                    className="block border rounded p-2 w-full"
                    value={outcome}
                    onChange={(e) => {
                      setOutcome(e.target.value);
                      setFollowDate("");
                    }}
                  >
                    <option value="">Choose an update</option>
                    {[
                      "Ready for onboarding",
                      "Follow-up needed",
                      "Not interested",
                      "Couldn't meet",
                    ].map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                </label>
                {(outcome === "Follow-up needed" ||
                  outcome === "Couldn't meet") && (
                  <label className="block">
                    Next follow-up date
                    {outcome === "Couldn't meet" ? " (optional)" : ""}
                    <input
                      className="block border rounded p-2 w-full"
                      required={outcome === "Follow-up needed"}
                      type="date"
                      min={todayIndia()}
                      value={followDate}
                      onChange={(e) => setFollowDate(e.target.value)}
                    />
                  </label>
                )}
                <label className="block">
                  Notes (optional)
                  <textarea
                    className="block border rounded p-2 w-full"
                    maxLength={2000}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </label>
                {outcome === "Ready for onboarding" && (
                  <p className="text-sm text-slate-600">
                    A dashboard reminder will be saved. Collect documents and
                    complete onboarding whenever ready; Manager/Head approval is
                    still required.
                  </p>
                )}
              </>
            )}
            {error && (
              <p role="alert" className="text-red-700">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <button
                disabled={busy}
                className="bg-orange-600 text-white rounded px-4 py-2"
              >
                {busy
                  ? "Saving…"
                  : future
                    ? "Schedule revisit"
                    : "Save revisit"}
              </button>
              <button
                type="button"
                disabled={busy}
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
