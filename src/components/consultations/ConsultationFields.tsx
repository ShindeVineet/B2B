"use client";
import Image from "next/image";
import { Trash2 } from "lucide-react";
import { PhotoFilePicker } from "@/components/shared/PhotoFilePicker";
import { StoreVisitFields } from "@/components/consultations/StoreVisitFields";
import type { FieldDefinition } from "@/lib/consultations/fields";
export type ConsultationValues = Record<string, string | string[]>;
export function ConsultationFields({ fields, values, set, staff, admin, disabled = false, context = "ground", upload }: {
  fields: FieldDefinition[]; values: ConsultationValues;
  set: (key: string, value: string | string[]) => void;
  staff: string; admin: boolean; disabled?: boolean; context?: "ground" | "calling";
  upload: (field: FieldDefinition, files: FileList | File[] | null) => Promise<void>;
}) {
  return <fieldset disabled={disabled} className="space-y-5">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              role="switch"
              checked={values.direct_store_meeting === "true"}
              onChange={(e) =>
                set("direct_store_meeting", String(e.target.checked))
              }
            />
            {context === "ground"
              ? "Direct meeting with decision maker at site/offsite"
              : "Direct meeting with partner in store"}
          </label>
          <StoreVisitFields values={values} onChange={set} force={values.outcome === "Visit scheduled"} />
          {fields.map((f) => {
            const required =
              f.required ||
              !!(
                f.required_when &&
                f.required_when.values.includes(
                  String(values[f.required_when.field] || ""),
                )
              );
            const selected = Array.isArray(values[f.key])
              ? (values[f.key] as string[])
              : [];
            const inputStyle =
              "mt-2 w-full rounded-xl border border-slate-300 p-3 min-h-12 text-sm focus:outline-orange-500";
            return (
              <fieldset key={f.key} disabled={disabled}>
                <legend className="text-sm font-semibold text-slate-700">
                  {["company_name", "decision_maker_name", "decision_maker_phone"].includes(f.key) ? `Verified / alternate ${f.label.toLowerCase()}` : f.label}
                  {required && <span className="text-orange-600"> *</span>}
                </legend>
                {f.type === "photo" ? (
                  <>
                    <p className="text-xs text-slate-500 mt-1">
                      Up to {f.max_files} photos · 10 MB each after compression
                    </p>
                    <PhotoFilePicker
                      label={f.label}
                      onFiles={(files) => void upload(f, files)}
                    />
                    <div className="flex gap-3 flex-wrap mt-3">
                      {selected.map((url) => (
                        <div key={url} className="relative">
                          <Image
                            unoptimized
                            src={url}
                            width={80}
                            height={80}
                            alt={f.label}
                            className="rounded-lg h-20 w-20 object-cover"
                          />
                          <button
                            type="button"
                            aria-label={`Remove ${f.label}`}
                            onClick={() =>
                              set(
                                f.key,
                                selected.filter((v) => v !== url),
                              )
                            }
                            className="absolute -right-2 -top-2 bg-white border shadow rounded-full p-2"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                ) : f.type === "multi_select" ? (
                  <div className="space-y-2 mt-3">
                    {f.options?.map((option) => (
                      <label
                        key={option}
                        className="flex items-start gap-3 border rounded-xl p-3 min-h-12 text-sm"
                      >
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4 accent-orange-600"
                          checked={selected.includes(option)}
                          onChange={(e) =>
                            set(
                              f.key,
                              e.target.checked
                                ? [...selected, option]
                                : selected.filter((v) => v !== option),
                            )
                          }
                        />
                        {option}
                      </label>
                    ))}
                  </div>
                ) : f.type === "select" ? (
                  <select
                    aria-label={f.label}
                    className={inputStyle}
                    required={required}
                    disabled={f.key === "ground_staff_name" && !admin}
                    value={String(values[f.key] || "")}
                    onChange={(e) => set(f.key, e.target.value)}
                  >
                    <option value="">Select…</option>
                    {[
                      ...new Set([
                        ...(f.options || []),
                        ...(f.key === "ground_staff_name" ? [staff] : []),
                      ]),
                    ].map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                ) : f.type === "long_text" ? (
                  <textarea
                    aria-label={f.label}
                    className={inputStyle}
                    rows={4}
                    required={required}
                    value={String(values[f.key] || "")}
                    onChange={(e) => set(f.key, e.target.value)}
                  />
                ) : (
                  <input
                    aria-label={f.label}
                    className={inputStyle}
                    type={
                      f.type === "date"
                        ? "date"
                        : f.key === "email"
                          ? "email"
                          : [
                                "decision_maker_phone",
                                "alternate_mobile_number",
                              ].includes(f.key)
                            ? "tel"
                            : "text"
                    }
                    required={required}
                    value={String(values[f.key] || "")}
                    onChange={(e) => set(f.key, e.target.value)}
                  />
                )}
              </fieldset>
            );
          })}

  </fieldset>;
}
