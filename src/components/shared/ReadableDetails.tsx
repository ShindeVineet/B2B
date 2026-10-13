import React, { type ReactNode } from "react";
const labels: Record<string,string> = { owner_name: "Partner / contact name", phone_no: "Phone number", pin_code: "PIN code", gst_no: "GST number", whatsapp_group_created: "WhatsApp group created", intake_team: "Handling team", category: "Professional type", dashboard_reconciliation: "Imported workbook details", raw: "Source details", old_value: "Previous value", new_value: "Updated value" };
function display(value: unknown): ReactNode {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string") {
    if (/^\s*[\[{]/.test(value)) { try { return display(JSON.parse(value)); } catch {} }
    if (/^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value))) return new Date(value).toLocaleString("en-IN", {timeZone:"Asia/Kolkata"}) + " IST";
    return value;
  }
  if (Array.isArray(value)) return value.length ? <ul className="space-y-2 list-disc pl-4">{value.map((v,i)=><li key={i}>{display(v)}</li>)}</ul> : "None";
  if (typeof value === "object") return <ReadableDetails value={value as Record<string,unknown>} nested />;
  return String(value);
}
export function ReadableDetails({ value, nested = false }: { value: Record<string,unknown>; nested?: boolean }) {
  return <dl className={nested ? "space-y-2 border-l border-orange-200 pl-3" : "grid sm:grid-cols-2 gap-3 text-sm"}>{Object.entries(value).filter(([key,v])=>v != null && v !== "" && !["id","lead_id","rep_id","sha256","baseline"].includes(key)).map(([key,v])=><div key={key} className="min-w-0"><dt className="text-xs font-semibold text-slate-500 capitalize">{labels[key] || key.replaceAll("_"," ")}</dt><dd className="break-words whitespace-pre-wrap mt-1">{display(v)}</dd></div>)}</dl>;
}
