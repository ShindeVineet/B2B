"use client";
import { DialogOverlay } from "@/components/shared/DialogOverlay";
import { useState } from "react";
type Row = {
  id: string;
  lead_code: string;
  company_name: string;
  current_store: string;
  suggested_store: { id: string; name: string } | null;
  updated_at: string;
  changed: boolean;
  blocked: string | null;
};
export function RecheckAllotment({
  leadIds,
  onSaved,
}: {
  leadIds: string[];
  onSaved?: () => void;
}) {
  const [rows, setRows] = useState<Row[] | null>(null),
    [selected, setSelected] = useState<Set<string>>(new Set()),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function run(action: "preview" | "confirm", ids: string[]) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/leads/allotment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          leadIds: ids,
          expected: Object.fromEntries(
            (rows || []).map((r) => [
              r.id,
              { store_id: r.suggested_store?.id, updated_at: r.updated_at },
            ]),
          ),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw Error(data.error);
      if (action === "preview") setRows(data.rows);
      else {
        setRows((prev) =>
          (prev || []).map(
            (r) => data.rows.find((v: Row) => v.id === r.id) || r,
          ),
        );
        onSaved?.();
      }
      if (action === "preview") onSaved?.();
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to check allotment");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        type="button"
        disabled={busy || !leadIds.length}
        className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-900 disabled:opacity-50"
        onClick={() => void run("preview", leadIds)}
      >
        Re-check Allotment
      </button>
      {(rows || error) && (
        <DialogOverlay
          role="dialog"
          aria-modal="true"
          aria-label="Allotment review"
          className="fixed inset-0 z-[3000] bg-slate-950/50 flex items-center justify-center p-4"
        >
          <section className="bg-white text-slate-900 rounded-xl shadow-xl p-5 w-full max-w-3xl max-h-[85vh] overflow-auto">
            <div className="flex justify-between gap-4">
              <h2 className="text-xl font-bold">Allotment review</h2>
              <button
                disabled={busy}
                onClick={() => {
                  setRows(null);
                  setError("");
                }}
              >
                Close
              </button>
            </div>
            <p className="text-sm my-3">
              Service PIN coverage takes priority, then nearest store.
              Unassigned, resolved leads are allotted automatically. Existing
              assignments require confirmation; published routes stay unchanged.
            </p>
            {error && (
              <p role="alert" className="text-red-700">
                {error}
              </p>
            )}
            <button
              disabled={busy || !selected.size}
              className="bg-blue-700 text-white rounded px-3 py-2 disabled:opacity-50"
              onClick={() => void run("confirm", [...selected])}
            >
              Confirm selected ({selected.size})
            </button>
            <button
              className="ml-3 underline"
              onClick={() =>
                setSelected(
                  new Set(
                    (rows || [])
                      .filter((r) => r.changed && !r.blocked)
                      .map((r) => r.id),
                  ),
                )
              }
            >
              Select all changes
            </button>
            {rows?.map((r) => (
              <div key={r.id} className="border-b py-3">
                <label className="flex gap-2">
                  <input
                    type="checkbox"
                    disabled={busy || !r.changed || !!r.blocked}
                    checked={selected.has(r.id)}
                    onChange={(e) =>
                      setSelected((old) => {
                        const n = new Set(old);
                        if (e.target.checked) n.add(r.id);
                        else n.delete(r.id);
                        return n;
                      })
                    }
                  />
                  <span>
                    <b>
                      {r.lead_code} · {r.company_name}
                    </b>
                    <br />
                    {r.changed
                      ? `Suggested store changed from ${r.current_store} to ${r.suggested_store?.name}`
                      : `${r.current_store} · ${r.blocked || "Allotment up to date"}`}
                  </span>
                </label>
                {r.blocked && r.changed && (
                  <p className="text-amber-800 text-sm">{r.blocked}</p>
                )}
                {r.changed && !r.blocked && (
                  <button
                    disabled={busy}
                    className="underline text-blue-800 mt-2"
                    onClick={() => void run("confirm", [r.id])}
                  >
                    Confirm this change
                  </button>
                )}
              </div>
            ))}
          </section>
        </DialogOverlay>
      )}
    </>
  );
}
