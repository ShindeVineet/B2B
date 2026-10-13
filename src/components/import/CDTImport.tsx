"use client";
import { useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
const cdtFields = [
  ["date", "Date"],
  ["phone_no", "Phone Number"],
  ["name", "Name"],
  ["business_type", "Business type"],
  ["preferred_store", "Preferred Store"],
];
const linkedinFields = [
  "lead_id",
  "created_time",
  "created_date",
  "ad_id",
  "campaign_id",
  "account_id",
  "form_id",
  "form_name",
  "test_lead",
  "First name",
  "Last name",
  "Email address",
  "Phone number",
  "City",
  "lead_type",
].map((key) => [key, key]);
export function CDTImport({ source = "CDT" }: { source?: "CDT" | "LinkedIn" }) {
  const fields = source === "LinkedIn" ? linkedinFields : cdtFields;
  const [rows, setRows] = useState<Record<string, unknown>[]>([]),
    [headers, setHeaders] = useState<string[]>([]),
    [mapping, setMapping] = useState<Record<string, string>>({}),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <section className="workspace-card space-y-4">
      <h2 className="text-xl font-bold">Import {source} Leads</h2>
      <p>
        All fields are optional. Leads remain unassigned to ground staff until
        store staff complete their details and assign a visit. Entirely empty
        spreadsheet rows are ignored.
      </p>
      <input
        aria-label={`${source} spreadsheet`}
        type="file"
        accept=".csv,.xlsx,.xls"
        disabled={busy}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setMessage("");
          try {
            const data = file.name.toLowerCase().endsWith(".csv")
              ? Papa.parse<Record<string, unknown>>(await file.text(), {
                  header: true,
                  skipEmptyLines: "greedy",
                }).data
              : XLSX.utils.sheet_to_json<Record<string, unknown>>(
                  XLSX.read(await file.arrayBuffer()).Sheets[
                    XLSX.read(await file.arrayBuffer()).SheetNames[0]
                  ],
                  { defval: "" },
                );
            const hs = Object.keys(data[0] || {});
            setRows(data);
            setHeaders(hs);
            setMapping(
              Object.fromEntries(
                fields.map(([key, label]) => [
                  key,
                  hs.find(
                    (h) =>
                      h.toLowerCase().replace(/[^a-z]/g, "") ===
                      label.toLowerCase().replace(/[^a-z]/g, ""),
                  ) || "",
                ]),
              ),
            );
          } catch (e) {
            setMessage(String(e));
          }
        }}
      />
      {!!rows.length && (
        <>
          <p>{rows.length} rows. Confirm the column mapping:</p>
          <div className="grid sm:grid-cols-2 gap-3">
            {fields.map(([key, label]) => (
              <label key={key}>
                {label}
                <select
                  className="block border rounded p-2 w-full"
                  value={mapping[key] || ""}
                  onChange={(e) =>
                    setMapping({ ...mapping, [key]: e.target.value })
                  }
                >
                  <option value="">Not provided</option>
                  {headers.map((h) => (
                    <option key={h}>{h}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <button
            disabled={busy}
            className="bg-orange-600 rounded px-4 py-2"
            onClick={async () => {
              setBusy(true);
              try {
                const r = await fetch(
                  source === "LinkedIn"
                    ? "/api/leads/linkedin-import"
                    : "/api/leads/cdt-import",
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      rows: rows.map((row) =>
                        Object.fromEntries(
                          fields.map(([key]) => [key, row[mapping[key]] ?? ""]),
                        ),
                      ),
                    }),
                  },
                );
                const d = await r.json();
                if (!r.ok) throw Error(d.error);
                setMessage(
                  `Imported ${d.imported} ${source} leads for calling. ${d.skipped || 0} duplicate source IDs skipped.`,
                );
                setRows([]);
              } catch (e) {
                setMessage((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Importing…" : `Import ${source} Leads`}
          </button>
        </>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
