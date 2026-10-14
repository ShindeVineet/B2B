"use client";
import { LeadIntakeForm } from "@/components/leads/LeadIntakeForm";
import { CDTImport } from "./CDTImport";

import { SelectableRows } from "@/components/shared/SelectableRows";
import React, { useState, useRef } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  RefreshCw,
  Database,
} from "lucide-react";

const TARGET_FIELDS = [
  ...[
    ["lat", "Latitude"],
    ["lng", "Longitude"],
    ["matched_name", "Matched place name"],
    ["place_id", "Google Place ID"],
    ["formatted_address", "Geocoded address"],
    ["email", "Email"],
    ["contact_name", "Contact name"],
    ["import_geocode_status", "Source geocoding status"],
  ].map(([key, label]) => ({ key, label, required: false })),
  { key: "company_name", label: "Company Name (required for Maps / Directory)", required: false },
  { key: "phone_no", label: "Phone Number", required: false },
  { key: "pin_code", label: "Pin Code", required: false },
  { key: "address", label: "Address", required: false },
  { key: "category", label: "Category / Industry", required: false },
  { key: "lead_source", label: "Lead Source *", required: true },
  { key: "region", label: "Region", required: false },
  { key: "status", label: "Status (Default: New)", required: false },
  { key: "website", label: "Website", required: false },
  { key: "google_map_link", label: "Google Map Link", required: false },
  { key: "notes", label: "Notes", required: false },
  { key: "extra_notes", label: "Extra Notes", required: false },
  { key: "reviews_count", label: "Reviews Count", required: false },
  { key: "scraped_date", label: "Scraped Date", required: false },
];

export function LeadImportWizard() {
  const [activeTab, setActiveTab] = useState<
    "bulk" | "manual" | "cdt" | "linkedin"
  >("bulk");

  // File parsing states
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string | number>[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>(
    {},
  );
  const [previewRows, setPreviewRows] = useState<
    Record<string, string | number>[]
  >([]);

  // Import options
  const [skipDuplicates, setSkipDuplicates] = useState(true);

  // Progress & Status
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressText, setProgressText] = useState("");
  const [importResult, setImportResult] = useState<{
    geocodeJobId?: string | null;
    queuedCount: number;
    invalidRowsSkipped: number;
    totalProcessed: number;
    totalImported: number;
    duplicatesSkipped: number;
    geocodedCount: number;
    autoAssignedCount: number;
    unmappedCount: number;
    callingQueueCount?: number;
    routeBuilderCount?: number;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [extraPhoneColumns, setExtraPhoneColumns] = useState<string[]>([]);


  const fileInputRef = useRef<HTMLInputElement>(null);

  // Smart guess column mappings
  const guessMapping = (detectedHeaders: string[]) => {
    const mapping: Record<string, string> = {};

    const findMatch = (candidates: string[]) => {
      const exact = detectedHeaders.find((h) =>
        candidates.includes(h.toLowerCase().replace(/[^a-z0-9]/g, "")),
      );
      if (exact) return exact;
      for (const h of detectedHeaders) {
        const clean = h.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (candidates.some((c) => clean.includes(c))) {
          return h;
        }
      }
      return "";
    };

    mapping.company_name = findMatch([
      "firmname",
      "company",
      "business",
      "client",
      "org",
      "title",
      "name",
    ]);
    mapping.phone_no = findMatch([
      "phonenumbers",
      "phoneno",
      "phone",
      "mobile",
      "tel",
      "cell",
    ]);
    mapping.pin_code = findMatch(["pincode", "pin", "postal", "zip"]);
    mapping.address = findMatch(["address", "location", "street", "addr"]);
    mapping.category = findMatch([
      "professionaltype",
      "category",
      "industry",
      "sector",
      "type",
    ]);
    mapping.lead_source = findMatch(["source", "channel", "origin"]);
    mapping.region = findMatch(["region", "zone", "state", "city"]);
    mapping.status =
      detectedHeaders.find((h) =>
        ["status", "leadstatus", "stage"].includes(
          h.toLowerCase().replace(/[^a-z0-9]/g, ""),
        ),
      ) || "";
    mapping.website = findMatch(["website", "web", "site", "url"]);
    mapping.google_map_link = findMatch(["googlemap", "maplink", "map"]);
    mapping.lat = findMatch(["lat", "latitude"]);
    mapping.lng = findMatch(["lng", "lon", "longitude"]);
    mapping.matched_name = findMatch(["matchedname"]);
    mapping.place_id = findMatch(["placeid"]);
    mapping.formatted_address = findMatch(["formattedaddress"]);
    mapping.email = findMatch(["email"]);
    mapping.contact_name = findMatch(["contactname"]);
    mapping.import_geocode_status = findMatch(["geocodestatus"]);
    mapping.notes = findMatch(["notes", "remark", "comment"]);
    mapping.reviews_count = findMatch(["review", "rating"]);
    mapping.scraped_date = findMatch(["scrapeddate", "scraped", "date"]);

    return mapping;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    setFile(uploadedFile);
    setErrorMessage(null);
    setImportResult(null);

    const fileName = uploadedFile.name.toLowerCase();

    if (fileName.endsWith(".csv")) {
      Papa.parse(uploadedFile, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (results.data.length === 0) {
            setErrorMessage("The uploaded CSV file is empty.");
            return;
          }
          const detectedHeaders = results.meta.fields || [];
          setHeaders(detectedHeaders);
          setExtraPhoneColumns([]);
          setRawRows(results.data as Record<string, string | number>[]);
          setPreviewRows(
            (results.data as Record<string, string | number>[]).slice(0, 5),
          );
          setColumnMapping(guessMapping(detectedHeaders));
        },
        error: (err) => {
          setErrorMessage(
            `Failed to parse CSV: ${err instanceof Error ? err.message : "Unexpected error"}`,
          );
        },
      });
    } else if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const data = evt.target?.result;
          const workbook = XLSX.read(data, { type: "binary" });
          const firstSheet = workbook.SheetNames[0];
          const sheet = workbook.Sheets[firstSheet];
          const json = XLSX.utils.sheet_to_json<
            Record<string, string | number>
          >(sheet, { defval: "" });

          if (json.length === 0) {
            setErrorMessage("The Excel sheet is empty.");
            return;
          }

          const detectedHeaders = Object.keys(json[0] || {});
          setHeaders(detectedHeaders);
          setExtraPhoneColumns([]);
          setRawRows(json);
          setPreviewRows(json.slice(0, 5));
          setColumnMapping(guessMapping(detectedHeaders));
        } catch (err: unknown) {
          setErrorMessage(
            `Failed to parse Excel file: ${err instanceof Error ? err.message : "Unexpected error"}`,
          );
        }
      };
      reader.readAsBinaryString(uploadedFile);
    } else {
      setErrorMessage("Please upload a .csv or .xlsx / .xls file.");
    }
  };

  const handleMappingChange = (targetKey: string, sourceHeader: string) => {
    setColumnMapping((prev) => ({
      ...prev,
      [targetKey]: sourceHeader,
    }));
  };

  const handleStartImport = async () => {
    if (!columnMapping.lead_source) {
      setErrorMessage("Map Lead Source. Rows with coordinates go to Route Builder; rows without coordinates go to Calling Queue.");
      return;
    }

    try {
      setIsProcessing(true);
      setErrorMessage(null);
      setProgressText("Transforming rows and validating fields...");

      const mappedRows = rawRows.map((row) => {
        const transformed: Record<string, string | number> = {};
        for (const target of TARGET_FIELDS) {
          const sourceCol = columnMapping[target.key];
          if (sourceCol && row[sourceCol] !== undefined) {
            transformed[target.key] = row[sourceCol];
          }
        }
        transformed.phone_no = [
          transformed.phone_no,
          ...extraPhoneColumns
            .filter((h) => h !== columnMapping.phone_no)
            .map((h) => row[h]),
        ]
          .filter(Boolean)
          .join(";");
        return transformed;
      });

      setProgressText(
        `Validating and saving ${mappedRows.length} rows. Geocoding will continue in the background...`,
      );

      const res = await fetch("/api/leads/bulk-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: mappedRows,
          skipDuplicates,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setImportResult(data);
        setProgressText("");
      } else {
        const err = await res.json();
        setErrorMessage(err.error || "Bulk import failed.");
      }
    } catch (err: unknown) {
      setErrorMessage(
        `Error: ${err instanceof Error ? err.message : "Failed to process import"}`,
      );
    } finally {
      setProgressText("");
      setIsProcessing(false);
    }
  };


  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6 bg-white min-h-screen text-slate-900">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <UploadCloud className="w-6 h-6 text-[#ff4500]" />
            FLORZY B2B Lead Ingestion & Geocoding Wizard
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Import raw scraped sheets with column-mapping, 2-tier IndiaPIN
            geocoding, deduplication, and proximity auto-match.
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-2xl border border-slate-200">
          <button
            onClick={() => setActiveTab("bulk")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === "bulk"
                ? "bg-[#ff4500] text-white shadow-md shadow-[#ff4500]/25"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Bulk CSV/XLSX Import
          </button>
          <button
            onClick={() => setActiveTab("manual")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === "manual"
                ? "bg-[#ff4500] text-white shadow-md shadow-[#ff4500]/25"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Add lead
          </button>
        </div>
      </div>

      <button
        className="border rounded-lg px-4 py-2 mb-4"
        onClick={() => setActiveTab("cdt")}
      >
        Import CDT Leads
      </button>
      {activeTab === "cdt" && <CDTImport />}
      <button
        className="border rounded-lg px-4 py-2 mb-4"
        onClick={() => setActiveTab("linkedin")}
      >
        Import LinkedIn Leads
      </button>
      {activeTab === "linkedin" && (
        <CDTImport key="linkedin" source="LinkedIn" />
      )}
      {activeTab === "bulk" && (
        <div className="space-y-6">
          {/* Step 1: File Upload Box */}
          {!file && (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 hover:border-[#ff4500] bg-slate-50/70 rounded-3xl p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-all hover:bg-orange-50/20 group"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv, .xlsx, .xls"
                onChange={handleFileUpload}
                className="hidden"
              />
              <div className="w-14 h-14 rounded-2xl bg-orange-50 text-[#ff4500] border border-orange-200 flex items-center justify-center group-hover:scale-110 transition-transform mb-4 shadow-sm">
                <FileSpreadsheet className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-1">
                Drop your leads spreadsheet here or click to browse
              </h3>
              <p className="text-xs text-slate-500 max-w-md">
                Supports CSV, Excel (.xlsx, .xls) files. Headers do not need to
                be rigid — our column mapping wizard will let you map fields
                easily.
              </p>
            </div>
          )}

          

          {/* Error display */}
          {errorMessage && (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2.5 font-medium">
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Success summary modal / alert */}
          {importResult && (
            <div className="p-5 rounded-3xl bg-white border border-emerald-300 shadow-xl space-y-4">
              <div className="flex items-center gap-2.5 text-emerald-600">
                <CheckCircle className="w-5 h-5" />
                <h3 className="text-base font-extrabold text-slate-900">
                  Leads saved
                </h3>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200">
                  <span className="text-[11px] text-slate-500 block font-semibold">
                    Total Imported
                  </span>
                  <span className="text-xl font-black text-slate-900">
                    {importResult.totalImported}
                  </span>
                </div>
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200">
                  <span className="text-[11px] text-slate-500 block font-semibold">
                    Calling Queue
                  </span>
                  <span className="text-xl font-black text-[#ff4500]">
                    {importResult.callingQueueCount ?? importResult.unmappedCount}
                  </span>
                </div>
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200">
                  <span className="text-[11px] text-slate-500 block font-semibold">
                    Duplicates Skipped
                  </span>
                  <span className="text-xl font-black text-amber-600">
                    {importResult.duplicatesSkipped}
                  </span>
                </div>
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200">
                  <span className="text-[11px] text-slate-500 block font-semibold">
                    Route Builder
                  </span>
                  <span className="text-xl font-black text-emerald-600">
                    {importResult.routeBuilderCount ?? importResult.geocodedCount}
                  </span>
                </div>
              </div>

              <p className="text-sm text-slate-600">
                Your leads are saved. Coordinates and store matching run in the
                background; you can leave this page. Leads appear on the map
                once their locations are validated.
              </p>

              <div className="flex items-center gap-3 pt-2">
                <a
                  href="/map"
                  className="px-4 py-2 bg-[#ff4500] hover:bg-[#e03e00] text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-[#ff4500]/25"
                >
                  View on Interactive Map →
                </a>
                <button
                  onClick={() => {
                    setFile(null);
                    setHeaders([]);
                    setRawRows([]);
                    setImportResult(null);
                  }}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
                >
                  Upload Another File
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Column Mapping Wizard */}
          {file && !importResult && (
            <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-6 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-orange-50 text-[#ff4500] border border-orange-200 rounded-xl">
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      {file.name}
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      {rawRows.length} rows detected • Map your source columns
                      below
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setFile(null);
                    setHeaders([]);
                    setRawRows([]);
                  }}
                  className="text-xs text-slate-500 hover:text-slate-900 font-semibold underline"
                >
                  Change file
                </button>
              </div>

              <fieldset className="border rounded-xl p-3">
                <legend>Additional phone columns</legend>
                <p className="text-xs text-slate-600">
                  The main phone column is primary. Numbers separated by commas
                  or semicolons are also supported.
                </p>
                <div className="flex flex-wrap gap-3">
                  {headers
                    .filter((h) => h !== columnMapping.phone_no)
                    .map((h) => (
                      <label key={h} className="text-sm">
                        <input
                          type="checkbox"
                          checked={extraPhoneColumns.includes(h)}
                          onChange={(e) =>
                            setExtraPhoneColumns(
                              e.target.checked
                                ? [...extraPhoneColumns, h]
                                : extraPhoneColumns.filter((c) => c !== h),
                            )
                          }
                        />
                        {h}
                      </label>
                    ))}
                </div>
              </fieldset>
              {/* Column Mapping Grid */}
              <div className="space-y-3">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                  Target Field Mapping
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {TARGET_FIELDS.map((target) => {
                    const mappedSource = columnMapping[target.key] || "";
                    return (
                      <div
                        key={target.key}
                        className="flex items-center justify-between p-2.5 rounded-2xl bg-slate-50 border border-slate-200 gap-3"
                      >
                        <div className="min-w-[140px]">
                          <span className="text-xs font-bold text-slate-800">
                            {target.label}
                          </span>
                        </div>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                        <select
                          value={mappedSource}
                          onChange={(e) =>
                            handleMappingChange(target.key, e.target.value)
                          }
                          className="flex-1 text-xs bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-slate-900 focus:outline-none focus:border-[#ff4500]"
                        >
                          <option value="">-- Ignore / Unmapped --</option>
                          {headers.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Preview of first 3-5 rows */}
              {previewRows.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                    Preview Sample (First {previewRows.length} Rows)
                  </h4>
                  <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                    <SelectableRows>
                      <table className="w-full text-[11px] text-left">
                        <thead className="bg-slate-50 text-slate-600 uppercase font-bold">
                          <tr>
                            <th className="px-3 py-2">Company</th>
                            <th className="px-3 py-2">Phone</th>
                            <th className="px-3 py-2">PIN Code</th>
                            <th className="px-3 py-2">Address</th>
                            <th className="px-3 py-2">Category</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700">
                          {previewRows.map((r, i) => (
                            <tr key={i} className="hover:bg-slate-50">
                              <td className="px-3 py-2 font-bold text-slate-900">
                                {r[columnMapping.company_name] || "—"}
                              </td>
                              <td className="px-3 py-2 font-mono">
                                {r[columnMapping.phone_no] || "—"}
                              </td>
                              <td className="px-3 py-2 font-mono font-bold text-[#ff4500]">
                                {r[columnMapping.pin_code] || "—"}
                              </td>
                              <td className="px-3 py-2 truncate max-w-xs text-slate-600">
                                {r[columnMapping.address] || "—"}
                              </td>
                              <td className="px-3 py-2">
                                {r[columnMapping.category] || "General"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </SelectableRows>
                  </div>
                </div>
              )}

              {/* Import Options Checkboxes */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
                <label className="flex items-center gap-2.5 cursor-pointer text-xs text-slate-700 font-medium">
                  <input
                    type="checkbox"
                    checked={skipDuplicates}
                    onChange={(e) => setSkipDuplicates(e.target.checked)}
                    className="w-4 h-4 rounded text-[#ff4500] border-slate-300 focus:ring-[#ff4500]"
                  />
                  <span>
                    <b>Deduplicate:</b> Skip records where both phone number and
                    pin code already exist
                  </span>
                </label>

                <p className="text-xs text-slate-700">
                  <b>Automatic allotment:</b> Resolved leads use service PIN
                  coverage first, then the nearest store. Overlapping coverage
                  needs review; Mapping Issues stay unassigned.
                </p>
              </div>

              {/* Progress indicator */}
              {isProcessing && (
                <div className="p-4 rounded-2xl bg-orange-50 border border-orange-200 space-y-2">
                  <div className="flex items-center justify-between text-xs text-[#ff4500] font-bold">
                    <span className="flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-[#ff4500]" />
                      {progressText || "Processing geocoding & bulk ingest..."}
                    </span>
                  </div>
                  <div className="w-full bg-orange-100 h-2 rounded-full overflow-hidden">
                    <div className="h-full bg-[#ff4500] rounded-full animate-pulse w-3/4" />
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  disabled={isProcessing}
                  onClick={handleStartImport}
                  className="px-5 py-2.5 bg-[#ff4500] hover:bg-[#e03e00] text-white rounded-xl text-xs font-bold shadow-md shadow-[#ff4500]/25 flex items-center gap-2 cursor-pointer disabled:opacity-50 transition-all"
                >
                  <Database className="w-4 h-4" />
                  Start Ingestion & Geocoding ({rawRows.length} Rows)
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "manual" && <LeadIntakeForm initialSource="Manual" />}
    </div>
  );
}
