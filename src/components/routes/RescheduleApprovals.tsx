"use client";
import { useEffect, useState } from "react";
type Request = {
  id: string;
  visit_id: string;
  lead: { company_name: string; lead_code: string };
  requester: string;
  date: string;
  expected_date: string;
  reason: string;
  note: string | null;
};
export function RescheduleApprovals({ onSaved }: { onSaved: () => void }) {
  const [rows, setRows] = useState<Request[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    const r = await fetch("/api/reschedule-requests");
    const d = await r.json();
    if (!r.ok) throw Error(d.error);
    setRows(d.requests);
  }
  useEffect(() => {
    let live = true;
    fetch("/api/reschedule-requests")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        if (live) setRows(d.requests);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, []);
  return (
    <section className="workspace-card space-y-3">
      <h2 className="font-bold">Reschedule requests ({rows.length})</h2>
      {error && <p role="alert">{error}</p>}
      {!rows.length && (
        <p className="text-sm text-slate-500">No requests awaiting approval.</p>
      )}
      {rows.map((r) => (
        <article key={r.id} className="border rounded-xl p-4 space-y-2">
          <strong>
            {r.lead.lead_code} {r.lead.company_name}
          </strong>
          <p className="text-sm">
            {r.requester} · {r.expected_date} → {r.date} ·{" "}
            {r.reason.replaceAll("_", " ")}
          </p>
          {r.note && <p>{r.note}</p>}
          <div className="flex gap-2">
            {["approve", "reject"].map((decision) => (
              <button
                key={decision}
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    const response = await fetch(
                      `/api/visits/${r.visit_id}/reschedule`,
                      {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ request_id: r.id, decision }),
                      },
                    );
                    const d = await response.json();
                    if (!response.ok) throw Error(d.error);
                    await load();
                    onSaved();
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {decision === "approve" ? "Approve date change" : "Reject"}
              </button>
            ))}
          </div>
        </article>
      ))}
    </section>
  );
}
