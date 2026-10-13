"use client";
import { UploadCloud, ScanSearch, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { PARTNER_FIELDS } from "@/lib/partners/fields";
type Review = {
  index: number;
  error?: string;
  partner_code?: string;
  matches?: {
    id: string;
    partner_code: string;
    company_firm_name: string;
    contact_person_name: string;
    designation: string;
  }[];
  merge_preview?: Record<string, unknown>;
};
export function PartnerImport({ onDone }: { onDone: () => void }) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]),
    [mapping, setMapping] = useState<Record<string, string>>({}),
    [review, setReview] = useState<Review[]>([]),
    [decisions, setDecisions] = useState<
      Record<number, { decision: string; merge_id?: string }>
    >({}),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const headers = Object.keys(rows[0] || {});
  const mapped = () =>
    rows.map((row) =>
      Object.fromEntries(
        PARTNER_FIELDS.map(([key]) => [key, row[mapping[key]] ?? ""]),
      ),
    );
  async function send(commit: boolean) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/partners/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commit,
          rows: mapped().map((fields, index) => ({
            fields,
            ...decisions[index],
          })),
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      if (commit) {
        setMessage(
          "Import complete: " +
            d.rows.map((r: { status: string }) => r.status).join(", "),
        );
        setReview([]);
        setRows([]);
        onDone();
      } else setReview(d.rows);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="bg-white border rounded-xl p-5 space-y-4">
      <h2 className="font-bold text-lg flex items-center gap-2">
        <UploadCloud size={21} className="text-[#ff4500]" aria-hidden="true" />
        Import historical partners
      </h2>
      <p className="text-sm text-slate-600">
        Imported partners are active. Review duplicate matches before saving.
        Merge fills empty fields only and preserves the existing partner code.
        The same company can have separate partners when either contact person
        or designation differs. Each partner code must remain unique.
      </p>
      <input
        aria-label="Partner import file"
        type="file"
        accept=".csv,.xlsx,.xls"
        disabled={busy}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          try {
            let data: Record<string, unknown>[];
            if (file.name.toLowerCase().endsWith(".csv"))
              data = Papa.parse<Record<string, unknown>>(await file.text(), {
                header: true,
                skipEmptyLines: true,
              }).data;
            else {
              const book = XLSX.read(await file.arrayBuffer());
              data = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], {
                defval: "",
              });
            }
            setRows(data);
            setReview([]);
            setDecisions({});
            setMessage("");
            const keys = Object.keys(data[0] || {});
            setMapping(
              Object.fromEntries(
                PARTNER_FIELDS.map(([key, label]) => [
                  key,
                  keys.find(
                    (k) => k.trim().toLowerCase() === label.toLowerCase(),
                  ) || "",
                ]),
              ),
            );
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      />
      {rows.length > 0 && (
        <>
          <p>{rows.length} rows</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {PARTNER_FIELDS.map(([key, label]) => (
              <label key={key} className="text-sm">
                {label}
                <select
                  className="block w-full border p-2 rounded"
                  value={mapping[key] || ""}
                  onChange={(e) => {
                    setMapping({ ...mapping, [key]: e.target.value });
                    setReview([]);
                  }}
                >
                  <option value="">Not mapped</option>
                  {headers.map((h) => (
                    <option key={h}>{h}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <button
            disabled={busy}
            className="bg-blue-700 text-white rounded px-4 py-2"
            onClick={() => void send(false)}
          >
            <ScanSearch size={17} aria-hidden="true" /> Preview import
          </button>
        </>
      )}
      {review.map((r) => (
        <div key={r.index} className="border rounded p-3">
          <b>
            Row {r.index + 1} · {r.partner_code || "Generate code"}
          </b>
          {r.error ? (
            <p className="text-red-700">{r.error}</p>
          ) : r.matches?.length ? (
            <>
              <p>
                Matches:{" "}
                {r.matches
                  .map(
                    (m) =>
                      `${m.partner_code} (${m.company_firm_name} · ${m.contact_person_name} · ${m.designation})`,
                  )
                  .join(", ")}
              </p>
              <select
                aria-label={`Decision for row ${r.index + 1}`}
                className="border p-2 rounded"
                value={decisions[r.index]?.decision || ""}
                onChange={(e) =>
                  setDecisions({
                    ...decisions,
                    [r.index]: {
                      decision: e.target.value,
                      merge_id: r.matches?.[0]?.id,
                    },
                  })
                }
              >
                <option value="">Choose an action</option>
                <option value="skip">Skip</option>
                <option value="import_anyway">Import anyway</option>
                <option value="merge">Merge</option>
              </select>
              {decisions[r.index]?.decision === "merge" && (
                <>
                  <select
                    aria-label="Merge target"
                    className="border p-2"
                    value={decisions[r.index].merge_id}
                    onChange={(e) => {
                      setDecisions({
                        ...decisions,
                        [r.index]: {
                          decision: "merge",
                          merge_id: e.target.value,
                        },
                      });
                      setReview([]);
                    }}
                  >
                    {r.matches.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.partner_code}
                      </option>
                    ))}
                  </select>
                  <p>Fields to fill: {JSON.stringify(r.merge_preview)}</p>
                </>
              )}
            </>
          ) : (
            <p>Ready to import</p>
          )}
        </div>
      ))}
      {!!review.length && (
        <button
          disabled={
            busy ||
            review.some(
              (r) =>
                r.error || (r.matches?.length && !decisions[r.index]?.decision),
            )
          }
          className="bg-green-700 text-white rounded px-4 py-2"
          onClick={() => void send(true)}
        >
          <CheckCircle2 size={17} aria-hidden="true" /> Confirm import
        </button>
      )}
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {message && <p>{message}</p>}
    </section>
  );
}
