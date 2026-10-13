"use client";
import { PageHeader } from "@/components/workspace/PageHeader";
import { useEffect, useState } from "react";
import {
  ConsultationCard,
  type ConsultationRow,
} from "@/components/consultations/ConsultationCard";
import { SelectableRows } from "@/components/shared/SelectableRows";
export default function Page() {
  const [page, setPage] = useState(1),
    [total, setTotal] = useState(0);
  const [revision, setRevision] = useState(0);
  const [rows, setRows] = useState<ConsultationRow[]>([]),
    [filters, setFilters] = useState<Record<string, string>>({}),
    [grid, setGrid] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true),
    [expanded, setExpanded] = useState<string | null>(null),
    [stores, setStores] = useState<{ id: string; name: string }[]>([]),
    [reps, setReps] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    Promise.all([
      fetch("/api/stores").then((r) => r.json()),
      fetch("/api/users?assignable=true").then((r) => r.json()),
    ])
      .then(([s, r]) => {
        setStores(s.stores || []);
        setReps(r.users || []);
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch(
      "/api/consultations?" +
        new URLSearchParams({
          ...Object.fromEntries(new URLSearchParams(window.location.search)),
          ...filters,
          page: String(page),
        }),
      {
        signal: controller.signal,
      },
    )
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        setRows(d.consultations);
        setTotal(d.totalCount);
        setError("");
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(String(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [filters, revision, page]);
  function change(k: string, v: string) {
    setPage(1);
    setBusy(true);
    setFilters((f) => ({ ...f, [k]: v }));
  }
  async function csv() {
    let exportRows = rows;
    try {
      const query = new URLSearchParams({
        ...Object.fromEntries(new URLSearchParams(window.location.search)),
        ...filters,
      });
      query.delete("page");
      const response = await fetch("/api/consultations?" + query);
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      exportRows = data.consultations;
    } catch (e) {
      setError((e as Error).message);
      return;
    }

    const fields = [
      "Company",
      "Mobile",
      "Rep",
      "Visit date",
      "Outcome",
      "Interest",
      "Lead type",
      "Designation",
      "Email",
      "Status",
      "Next follow-up",
    ];
    const data = exportRows.map((c) => [
      c.lead.company_name,
      c.decision_maker_phone || c.lead.phone_no,
      c.rep.name,
      c.visit_date,
      c.outcome,
      c.interest_level,
      c.lead_type,
      c.designation,
      c.email,
      c.current_lead_status || c.lead.status,
      c.next_follow_up_date,
    ]);
    const content = [fields, ...data]
      .map((row) =>
        row
          .map(
            (v) =>
              '"' +
              String(v ?? "")
                .replace(/^[=+@-]/, "'$&")
                .replaceAll('"', '""') +
              '"',
          )
          .join(","),
      )
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "consultations.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <main className="workspace-page space-y-5">
      <PageHeader
        title="Consultations"
        description="Complete consultation history, including repeat entries. Dashboard totals count distinct consulted leads."
      />
      <nav aria-label="Consultation scope" className="flex flex-wrap gap-2">
        {[
          ["", "All visible consultations"],
          ["true", "My consultations"],
        ].map(([value, label]) => (
          <button
            key={label}
            aria-pressed={(filters.mine || "") === value}
            onClick={() => {
              setPage(1);
              setBusy(true);
              setFilters((f) => ({ ...f, mine: value, rep_id: "" }));
            }}
            className="border rounded-lg px-3 py-2"
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="filter-panel">
        {[
          ["q", "Company / mobile"],
          ["from", "From date"],
          ["to", "To date"],
          ["region", "Region"],
          ["outcome", "Outcome"],
          ["interest_level", "Interest level"],
          ["lead_type", "Lead type"],
        ].map(([k, label]) => (
          <label key={k}>
            {label}
            <input
              className="block border p-2 rounded"
              type={["from", "to"].includes(k) ? "date" : "text"}
              value={filters[k] || ""}
              onChange={(e) => change(k, e.target.value)}
            />
          </label>
        ))}
        {[
          ["store", stores],
          ["rep_id", reps],
        ].map(([k, list]) => (
          <label key={String(k)}>
            {k === "store" ? "Store" : "Rep"}
            <select
              className="block border p-2"
              disabled={k === "rep_id" && filters.mine === "true"}
              value={filters[String(k)] || ""}
              onChange={(e) => change(String(k), e.target.value)}
            >
              <option value="">All</option>
              {(list as { id: string; name: string }[]).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label>
          Sort
          <select
            className="block border p-2"
            value={filters.sort || "newest"}
            onChange={(e) => change("sort", e.target.value)}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="company">Company A–Z</option>
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="mr-auto text-sm text-slate-500">
          {total} consultation records
        </span>
        <button
          className="border bg-white"
          onClick={() => {
            setBusy(true);
            setFilters({});
          }}
        >
          Clear filters
        </button>
        <button
          className="border rounded p-2 bg-white"
          onClick={() => setGrid(!grid)}
        >
          {grid ? "Table view" : "Card grid"}
        </button>{" "}
        <button
          className="border rounded p-2"
          disabled={busy || !!error}
          onClick={csv}
        >
          Export filtered CSV
        </button>
      </div>
      <p role="alert">{error}</p>
      {busy && <p>Loading…</p>}
      {grid ? (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {rows.map((c) => (
            <ConsultationCard
              key={c.id}
              row={c}
              onSaved={() => setRevision((v) => v + 1)}
            />
          ))}
        </div>
      ) : (
        <SelectableRows>
          <table className="w-full text-left">
            <thead>
              <tr>
                {[
                  "Company",
                  "Mobile",
                  "Rep",
                  "Visit",
                  "Outcome",
                  "Interest",
                  "Details",
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} data-row-id={c.id} className="border-b">
                  <td>
                    {c.lead.lead_code} {c.lead.company_name}
                  </td>
                  <td>{c.decision_maker_phone || c.lead.phone_no}</td>
                  <td>{c.rep.name}</td>
                  <td>{c.visit_date.slice(0, 10)}</td>
                  <td>{c.outcome}</td>
                  <td>{c.interest_level}</td>
                  <td>
                    <button
                      onClick={() =>
                        setExpanded(expanded === c.id ? null : c.id)
                      }
                    >
                      View consultation
                    </button>
                    {expanded === c.id && (
                      <ConsultationCard
                        row={c}
                        onSaved={() => setRevision((v) => v + 1)}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </SelectableRows>
      )}
      <div className="flex items-center gap-3">
        <button
          className="border rounded px-3 py-2 disabled:opacity-40"
          disabled={busy || page === 1}
          onClick={() => {
            setBusy(true);
            setPage((p) => p - 1);
          }}
        >
          Previous
        </button>
        <span className="text-sm">
          Page {page} of {Math.max(1, Math.ceil(total / 24))}
        </span>
        <button
          className="border rounded px-3 py-2 disabled:opacity-40"
          disabled={busy || page * 24 >= total}
          onClick={() => {
            setBusy(true);
            setPage((p) => p + 1);
          }}
        >
          Next
        </button>
      </div>
      {!busy && !rows.length && !error && (
        <div className="empty-state">
          <h2 className="font-semibold text-slate-700 mb-2">
            No consultations match these filters
          </h2>
          <p>
            Try a wider date range or clear your filters. New visits appear here
            after the team submits them.
          </p>
        </div>
      )}
    </main>
  );
}
