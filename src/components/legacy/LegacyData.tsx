"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ClipboardCheck, Users } from "lucide-react";
import { PageHeader } from "@/components/workspace/PageHeader";
type Row = {
  id: string;
  lead_code: string;
  company_name: string;
  phone_no: string | null;
  pin_code: string | null;
  address: string | null;
  interest: string;
  executive: string;
  assignee: string;
  outcome: string;
  onboarding: string;
  partners: { id: string; partner_code: string }[];
  issues: string[];
  sourceRows: number[];
  consultationCount: number;
  claim: boolean;
};
type Data = {
  rows: Row[];
  total: number;
  counts: {
    leads: number;
    consultations: number;
    onboarded: number;
    pending: number;
    notOnboarded: number;
    issues: number;
  };
};
export function LegacyData() {
  const [tab, setTab] = useState("issues"),
    [q, setQ] = useState(""),
    [page, setPage] = useState(1),
    [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    fetch(
      "/api/legacy-data?" + new URLSearchParams({ tab, q, page: String(page) }),
      { signal: controller.signal },
    )
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        setData(d);
        setError("");
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [tab, q, page]);
  return (
    <main className="workspace-page space-y-5">
      <PageHeader
        title="Data issues & onboarding"
        description="Current lead data, consultation-reported issues and retained import warnings. Confirmed onboarding requires an active linked partner."
      />
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            ["Leads", data.counts.leads],
            ["Consultations", data.counts.consultations],
            ["Confirmed onboarded", data.counts.onboarded],
            [
              "Not yet confirmed",
              data.counts.notOnboarded + data.counts.pending,
            ],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border bg-white p-4">
              <p className="text-xs text-slate-500">{label}</p>
              <p className="text-2xl font-bold text-orange-700">{value}</p>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {[
          ["issues", "Data issues", AlertTriangle],
          ["not_onboarded", "Not yet onboarded", ClipboardCheck],
          ["onboarded", "Onboarded", ClipboardCheck],
          ["all", "All leads", Users],
        ].map(([value, label, Icon]) => {
          const I = Icon as typeof Users;
          return (
            <button
              key={String(value)}
              onClick={() => {
                setBusy(true);
                setTab(String(value));
                setPage(1);
              }}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm border ${tab === value ? "bg-orange-600 text-white" : "bg-white text-slate-700"}`}
            >
              <I size={16} />
              {String(label)}
            </button>
          );
        })}
        <input
          aria-label="Search historical data"
          placeholder="Company, executive, interest or issue…"
          className="min-w-0 border rounded-lg p-2 flex-1"
          value={q}
          onChange={(e) => {
            setBusy(true);
            setQ(e.target.value);
            setPage(1);
          }}
        />
      </div>
      <p className="text-sm text-slate-500">
        {busy ? "Loading…" : `${data?.total || 0} leads · 24 per page`}. Missing
        optional text is shown as NA. Original source values remain in
        consultation history.
      </p>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
        {!busy &&
          data?.rows.map((r) => (
            <article
              key={r.id}
              className="rounded-2xl border bg-white p-4 space-y-3 min-w-0"
            >
              <div className="flex justify-between gap-2 text-xs">
                <Link
                  className="text-orange-700 underline"
                  href={`/leads/${r.id}`}
                >
                  {r.lead_code}
                </Link>
                <span className="rounded bg-slate-100 px-2 py-1">
                  {r.onboarding}
                </span>
              </div>
              <h2 className="font-bold break-words">{r.company_name}</h2>
              <p className="text-sm">
                <b>Interest:</b> {r.interest} · <b>Executive:</b> {r.executive}
              </p>
              <p className="text-xs text-slate-500">
                Assigned to {r.assignee} · {r.consultationCount} consultation(s)
              </p>
              <p className="text-sm">
                {r.phone_no || "NA"} · PIN {r.pin_code || "NA"}
              </p>
              <p className="text-xs text-slate-600 break-words">
                {r.address || "Address: NA"}
              </p>
              {r.claim && (
                <p className="text-xs text-amber-800">
                  Source file contains an onboarding claim.
                </p>
              )}
              {r.issues.length > 0 && (
                <details open={tab === "issues"}>
                  <summary className="text-sm text-amber-800 cursor-pointer">
                    {r.issues.length} data issue(s)
                  </summary>
                  <ul className="text-xs list-disc pl-4 mt-2 space-y-1">
                    {r.issues.map((i) => (
                      <li key={i}>{i}</li>
                    ))}
                  </ul>
                </details>
              )}
              <p className="text-xs text-slate-400">
                Source rows: {r.sourceRows.join(", ")}
              </p>
              <div className="flex flex-wrap gap-3 text-sm">
                <Link
                  className="text-orange-700 underline"
                  href={`/consultations?lead_id=${r.id}`}
                >
                  Consultations
                </Link>
                {r.partners.map((p) => (
                  <Link
                    key={p.id}
                    className="text-orange-700 underline"
                    href={`/partners?partner_id=${p.id}`}
                  >
                    {p.partner_code}
                  </Link>
                ))}
                {!r.partners.length && (
                  <Link
                    className="text-orange-700 underline"
                    href={`/partners?lead_id=${r.id}`}
                  >
                    Start onboarding
                  </Link>
                )}
              </div>
            </article>
          ))}
      </div>
      {!busy && data?.total === 0 && (
        <p className="rounded-xl border bg-white p-6 text-slate-500">
          No records in this view.
        </p>
      )}
      <div className="flex items-center gap-3">
        <button
          disabled={busy || page === 1}
          onClick={() => {
            setBusy(true);
            setPage((p) => p - 1);
          }}
          className="border rounded px-3 py-2 disabled:opacity-40"
        >
          Previous
        </button>
        <span className="text-sm">
          Page {page} of {Math.max(1, Math.ceil((data?.total || 0) / 24))}
        </span>
        <button
          disabled={busy || page * 24 >= (data?.total || 0)}
          onClick={() => {
            setBusy(true);
            setPage((p) => p + 1);
          }}
          className="border rounded px-3 py-2 disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </main>
  );
}
