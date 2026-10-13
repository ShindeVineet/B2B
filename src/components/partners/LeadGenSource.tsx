"use client";
import { LEAD_GEN_SOURCES } from "@/lib/partners/lead-gen-source";
export function LeadGenSource({
  value,
  other,
  onChange,
  onOther,
}: {
  value: string;
  other: string;
  onChange: (v: string) => void;
  onOther: (v: string) => void;
}) {
  return (
    <div className="space-y-3 w-full">
      <label className="block text-sm font-semibold">
        Lead Gen Source *
        <select
          required
          className="block border rounded-lg p-3 w-full mt-1"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Choose source</option>
          {LEAD_GEN_SOURCES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      {value === "Other" && (
        <label className="block text-sm font-semibold">
          Other source *
          <input
            required
            maxLength={1000}
            className="block border rounded-lg p-3 w-full mt-1"
            value={other}
            onChange={(e) => onOther(e.target.value)}
          />
        </label>
      )}
    </div>
  );
}
