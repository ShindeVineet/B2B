"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function TeamStoreAssignment({
  memberId,
  storeId,
  stores,
}: {
  memberId: string;
  storeId: string | null;
  stores: { id: string; name: string }[];
}) {
  const [selected, setSelected] = useState(storeId || ""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const router = useRouter();
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <select
          aria-label="Base store"
          disabled={busy}
          className="max-w-48 border rounded-lg p-2 bg-white"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">Choose base store</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={busy || !selected || selected === storeId}
          className="bg-blue-700 text-white rounded-lg px-3 disabled:opacity-50"
          onClick={async () => {
            setBusy(true);
            setMessage("");
            try {
              const r = await fetch("/api/users", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ id: memberId, store_id: selected }),
                }),
                d = await r.json();
              if (!r.ok) throw new Error(d.error);
              setMessage(
                d.leads_needing_store_review
                  ? `Saved. ${d.leads_needing_store_review} assigned leads need store review.`
                  : "Base store saved.",
              );
              router.refresh();
            } catch (e) {
              setMessage((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
      {message && (
        <p role="status" className="text-xs text-slate-700">
          {message}
        </p>
      )}
    </div>
  );
}
