"use client";
import { useEffect, useState } from "react";
export function GeocodeProgress({
  selectedIds,
  jobId,
}: {
  selectedIds?: string[];
  jobId?: string;
}) {
  const [indexReady, setIndexReady] = useState<boolean | null>(null);
  const [job, setJob] = useState<{
      id: string;
      status: string;
      total: number;
      processed: number;
      accepted: number;
      issues: number;
      errors: string[];
      retrying: number;
      pending: number;
      localPending?: number;
      externalPending?: number;
      exhausted: number;
      nextRetryAt?: string | null;
    } | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const load = () =>
      fetch(
        jobId
          ? `/api/geocoding/jobs?id=${encodeURIComponent(jobId)}`
          : "/api/geocoding/jobs",
        { cache: "no-store" },
      )
        .then((r) => r.json())
        .then((d) => {
          if (active) {
            if (d.error) throw Error(d.error);
            setJob(d.jobs?.[0] || null);
            setIndexReady(d.indexReady ?? null);
            setError("");
          }
        })
        .catch(() => {
          if (active)
            setError(
              "Progress unavailable. Retrying automatically; your saved leads are safe.",
            );
        });
    void load();
    const timer = setInterval(load, 3000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [jobId]);
  async function start(selected: boolean) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/geocoding/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(selected ? { lead_ids: selectedIds } : {}),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setJob({
        ...d.job,
        total: 0,
        processed: 0,
        accepted: 0,
        issues: 0,
        errors: [],
        retrying: 0,
        pending: 0,
        exhausted: 0,
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="rounded-xl border bg-white p-4 space-y-3">
      {!jobId && (
        <div className="grid gap-3">
          <button
            disabled={
              busy || (!!job && ["queued", "running"].includes(job.status))
            }
            className="border rounded-lg px-3 py-2"
            onClick={() => start(false)}
          >
            Re-run geocoding — all unverified leads
          </button>
          {!!selectedIds?.length && (
            <button
              disabled={
                busy ||
                !selectedIds?.length ||
                (!!job && ["queued", "running"].includes(job.status))
              }
              className="border rounded-lg px-3 py-2"
              onClick={() => start(true)}
            >
              Re-run selected ({selectedIds?.length})
            </button>
          )}
        </div>
      )}
      <p className="text-xs text-slate-500">
        Verified manual locations are preserved. Imported Google Maps links are used
        to locate leads. Leads without a usable link remain available for manager
        calling and location updates. Use Refresh map to display new locations.
      </p>
      {indexReady === false && (
        <p
          role="status"
          className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900"
        >
          Preparing the local POI index. Your leads are saved and queued;
          processing will begin when the index is ready. No need to re-run.
        </p>
      )}
      {job && (
        <div role="status">
          <p className="text-sm">
            {job.status}: {job.processed} / {job.total} processed ·{" "}
            {job.accepted} Mapped · {job.issues} Needs Review ·{" "}
            {job.retrying || 0} Retrying · {job.pending || 0} queued
          </p>
          {job.localPending !== undefined && (
            <p className="text-xs text-slate-600">
              Remaining: {job.localPending} local lookups ·{" "}
              {job.externalPending || 0} external lookups
            </p>
          )}
          <progress
            className="w-full accent-orange-600"
            max={job.total || 1}
            value={job.processed}
          />
          {!!job.retrying && (
            <p className="text-sm text-amber-800">
              Temporarily unavailable — will retry automatically
              {job.nextRetryAt
                ? ` after ${new Date(job.nextRetryAt).toLocaleString()}`
                : ""}
              . Your leads are saved.
            </p>
          )}
          {!!job.exhausted && (
            <p className="text-xs text-slate-600">
              {job.exhausted} lookups reached the retry limit and are scheduled
              for a recovery retry.
            </p>
          )}
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
