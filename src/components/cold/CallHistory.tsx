"use client";
import { useEffect, useState } from "react";
export function CallHistory({ leadId }: { leadId: string }) {
  const [calls, setCalls] = useState<
      {
        id: string;
        outcome: string;
        notes: string;
        reason: string | null;
        created_at: string;
        callback_date: string | null;
        next_follow_up_date: string | null;
        actor: { name: string };
      }[]
    >([]),
    [error, setError] = useState("");
  useEffect(() => {
    const load = () =>
      fetch(`/api/leads/${leadId}/calls`)
        .then(async (r) => {
          const d = await r.json();
          if (!r.ok) throw Error(d.error);
          setCalls(d.calls);
        })
        .catch((e) => setError(String(e)));
    void load();
    window.addEventListener("followups-updated", load);
    return () => window.removeEventListener("followups-updated", load);
  }, [leadId]);
  return (
    <section className="space-y-3">
      <h3 className="font-semibold">Call history</h3>
      {error && <p role="alert">{error}</p>}
      {calls.map((c) => (
        <article key={c.id} className="border rounded-xl p-3 text-sm">
          <p className="font-semibold">
            {c.outcome} · {c.actor.name}
          </p>
          <p className="text-xs text-slate-500">
            {new Date(c.created_at).toLocaleString("en-IN")}
          </p>
          <p className="mt-2 whitespace-pre-wrap">{c.notes}</p>
          {c.reason && <p>Reason: {c.reason}</p>}
          {c.callback_date && <p>Callback: {c.callback_date.slice(0, 10)}</p>}
          {c.next_follow_up_date && (
            <p>Follow-up: {c.next_follow_up_date.slice(0, 10)}</p>
          )}
        </article>
      ))}
      {!calls.length && !error && (
        <p className="text-sm text-slate-500">No calls logged yet.</p>
      )}
    </section>
  );
}
