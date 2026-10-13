"use client";
import { useState } from "react";
import Link from "next/link";
import { PartnerForm } from "@/components/partners/PartnerForm";
export function RepOnboarding({
  leads,
}: {
  leads: { id: string; company_name: string; lead_code?: string }[];
}) {
  const [form, setForm] = useState<Record<string, unknown> | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <section className="workspace-card space-y-4">
      <h2 className="text-xl font-bold">Partner onboarding</h2>
      <p className="text-sm text-slate-600">
        Choose an assigned lead for onboarding. Submit the form for manager or
        Head approval; it stays pending until approved.
      </p>
      <Link href="/partners" className="underline">
        View all onboarded partners and my submissions
      </Link>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-green-800">
          {message}
        </p>
      )}
      {!form && (
        <label className="block font-semibold">
          Lead
          <select
            disabled={busy}
            value=""
            className="block w-full border rounded-lg p-3 mt-2"
            onChange={async (e) => {
              const id = e.target.value;
              if (!id) return;
              setBusy(true);
              setError("");
              setMessage("");
              try {
                const r = await fetch(
                  `/api/partners/prefill?lead_id=${encodeURIComponent(id)}`,
                );
                const d = await r.json();
                if (!r.ok) throw Error(d.error);
                setForm({ ...d.fields, source_lead_id: id });
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <option value="">{busy ? "Loading…" : "Select lead"}</option>
            {leads.map((l) => (
              <option key={l.id} value={l.id}>
                {l.lead_code} {l.company_name}
              </option>
            ))}
          </select>
        </label>
      )}
      {form && (
        <PartnerForm
          initial={form}
          onCancel={() => setForm(null)}
          onSave={async (data) => {
            const r = await fetch("/api/partners", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ...data,
                source_lead_id: form.source_lead_id,
              }),
            });
            const d = await r.json();
            if (!r.ok) throw Error(d.error);
            setForm(null);
            setMessage(
              `Submitted ${d.partner.partner_code} — pending manager/Head approval.`,
            );
          }}
        />
      )}
    </section>
  );
}
