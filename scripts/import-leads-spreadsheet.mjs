import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import Papa from "papaparse";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import {
  importDuplicateKey,
  prepareImportRow,
} from "../src/lib/leads/import-row.ts";

const db = new PrismaClient();
const file = process.argv.find((arg) => arg.endsWith(".csv"));
const apply = process.argv.includes("--apply");
if (!file) throw Error("Provide the CSV path; add --apply after reviewing the dry run.");

const mapping = {
  "Data Scraped Date": "scraped_date",
  "Lead Source": "lead_source",
  Category: "category",
  "Company Name": "company_name",
  "Contact Name": "contact_name",
  "Phone No.": "phone_no",
  Email: "email",
  Website: "website",
  "Pin Code": "pin_code",
  Address: "address",
  "Google Map Link": "google_map_link",
  Lat: "lat",
  Lng: "lng",
  Notes: "notes",
};

try {
  const parsed = Papa.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, ""), {
    header: true,
    skipEmptyLines: "greedy",
  });
  if (parsed.errors.length) throw Error(`CSV errors: ${JSON.stringify(parsed.errors)}`);
  const rows = parsed.data.map((source) =>
    Object.fromEntries(
      Object.entries(mapping).map(([header, field]) => [field, source[header] ?? ""]),
    ),
  );
  const prepared = rows.map(prepareImportRow);
  const existing = await db.lead.findMany({
    select: { company_name: true, phone_no: true, pin_code: true, lat: true, lng: true },
  });
  const seen = new Set(existing.map(importDuplicateKey));
  let duplicates = 0;
  const importable = [];
  for (const [index, row] of prepared.entries()) {
    const key = importDuplicateKey(row);
    if (seen.has(key)) duplicates++;
    else {
      seen.add(key);
      importable.push(rows[index]);
    }
  }
  const summary = {
    mode: apply ? "apply" : "dry-run",
    sourceRows: rows.length,
    importable: importable.length,
    duplicates,
    routeBuilder: prepared.filter((row) => row.intake_team === "ground").length,
    callingQueue: prepared.filter((row) => row.intake_team === "caller").length,
    sources: Object.fromEntries(
      [...new Set(prepared.map((row) => row.lead_source))]
        .sort()
        .map((source) => [source, prepared.filter((row) => row.lead_source === source).length]),
    ),
  };
  console.log(JSON.stringify(summary, null, 2));
  if (!apply) process.exit(0);

  const head = await db.user.findFirstOrThrow({
    where: { role: "b2b_head", active: true },
    select: { id: true },
  });
  const token = jwt.sign({ id: head.id }, process.env.JWT_SECRET, { expiresIn: "20m" });
  const response = await fetch("http://localhost:3000/api/leads/bulk-import", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ rows: importable, skipDuplicates: true }),
  });
  const result = await response.json();
  if (!response.ok) throw Error(result.error || `Import failed (${response.status})`);
  mkdirSync(".data/audits", { recursive: true });
  const audit = `.data/audits/lead-spreadsheet-import-${new Date().toISOString().replaceAll(":", "-")}.json`;
  writeFileSync(audit, JSON.stringify({ summary, result }, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ result, audit }, null, 2));
} finally {
  await db.$disconnect();
}
