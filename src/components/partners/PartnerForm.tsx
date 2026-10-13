"use client";
import { useAuth } from "@/context/AuthContext";
import { LeadGenSource } from "./LeadGenSource";
import {
  Building2,
  Users,
  BriefcaseBusiness,
  Landmark,
  FileCheck2,
  Send,
  Save,
  X,
} from "lucide-react";
import { PhotoFilePicker } from "@/components/shared/PhotoFilePicker";
import { useState, useEffect } from "react";
import { OriginalLead } from "@/components/leads/OriginalLead";
import { PARTNER_FIELDS } from "@/lib/partners/fields";
import {
  PROFESSIONAL_TYPES,
  ONBOARDING_SOURCES,
  validateGstFields,
} from "@/lib/partners/validation";
import { compressPhoto } from "@/lib/consultations/compress";
const FIELD_GROUPS = [
  {
    title: "Company & record",
    description: "Identify the firm and the onboarding record.",
    icon: Building2,
    keys: [
      "onboarded_at",
      "form_submitter_email",
      "company_firm_name",
      "company_legal_name",
      "partner_type",
      "onboarded_from",
    ],
  },
  {
    title: "Contact & location",
    description: "The same firm can have multiple contacts or designations.",
    icon: Users,
    keys: [
      "contact_person_name",
      "designation",
      "mobile_number",
      "business_email_id",
      "office_address",
      "pincode",
      "city",
      "state",
    ],
  },
  {
    title: "Business profile",
    description: "Capture the partner’s work and expected order volume.",
    icon: BriefcaseBusiness,
    keys: [
      "type_of_professional",
      "years_operating",
      "specialized_in",
      "expected_monthly_order_value",
    ],
  },
  {
    title: "Tax & documents",
    description: "Add the registration details and supporting documents.",
    icon: FileCheck2,
    keys: [
      "gst_registered",
      "gst_no",
      "gst_certificate_url",
      "pan_no",
      "pan_card_url",
    ],
  },
  {
    title: "Bank details",
    description: "Use the account details provided by the partner.",
    icon: Landmark,
    keys: [
      "bank_document_url",
      "bank_account_name",
      "bank_name",
      "branch",
      "account_no",
      "ifsc_code",
    ],
  },
];
export function PartnerForm({
  initial = {},
  onSave,
  onCancel,
  editing = false,
}: {
  initial?: Record<string, unknown>;
  onSave: (data: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
  editing?: boolean;
}) {
  const { user } = useAuth();
  const [values, setValues] = useState<Record<string, unknown>>(() => ({
    ...initial,
    partner_type: initial.partner_type || (initial.gst_no ? "Company" : "Individual"),
    partner_type_override: !!initial.id || (!!initial.partner_type && initial.partner_type !== (initial.gst_no ? "Company" : "Individual")),
    is_referral: !!initial.referred_by_partner_id,
    whatsapp_group_created: initial.whatsapp_group_created ?? false,
    gst_registered: initial.gst_registered ?? false,
    onboarded_at: initial.onboarded_at
      ? new Date(
          new Date(String(initial.onboarded_at)).getTime() -
            new Date(String(initial.onboarded_at)).getTimezoneOffset() * 60000,
        )
          .toISOString()
          .slice(0, 16)
      : new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 16),
  }));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [referrers, setReferrers] = useState<{ id: string; partner_code: string; company_firm_name: string; contact_person_name: string }[]>([]);
  useEffect(() => {
    let active = true;
    fetch("/api/intake-options").then(async r => { const d = await r.json(); if (!r.ok) throw Error(d.error); if (active) setReferrers(d.partners.filter((p: { id: string }) => p.id !== initial.id)); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [initial.id]);
  const set = (key: string, value: unknown) =>
    setValues((v) => ({ ...v, [key]: value, ...(key === "gst_no" && !v.partner_type_override ? { partner_type: String(value || "").trim() ? "Company" : "Individual" } : {}), ...(key === "partner_type" ? { partner_type_override: true } : {}) }));
  async function upload(key: string, file?: File) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.set(
        "file",
        file.type === "application/pdf" ? file : await compressPhoto(file),
      );
      const res = await fetch("/api/partner-documents", {
        method: "POST",
        body: form,
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      set(key, d.url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="partner-form rounded-2xl border border-slate-300 bg-white p-4 sm:p-6 space-y-6"
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        setBusy(true);
        try {
          validateGstFields(values as { gst_registered: unknown });
          await onSave({
            ...values,
            onboarded_at: values.onboarded_at
              ? new Date(String(values.onboarded_at)).toISOString()
              : undefined,
          });
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 className="text-xl font-bold flex items-center gap-2">
        <Building2 size={22} className="text-[#ff4500]" aria-hidden="true" />
        {editing ? "Edit partner" : "Partner onboarding"}
      </h2>
      {!!initial.source_lead_id && <OriginalLead leadId={String(initial.source_lead_id)} />}
      <p className="text-sm text-slate-600">Each onboarded person receives a permanent partner code. Two project managers at the same company have separate records. Company or phone changes keep the same code and are restricted to managers.</p>
      <datalist id="professional-options">
        {PROFESSIONAL_TYPES.map((value) => (
          <option key={value} value={value.replaceAll("_", " ")} />
        ))}
      </datalist>
      <fieldset disabled={busy} className="space-y-5">
        {user?.role !== "ground_rep" && (
          <LeadGenSource
            value={String(values.lead_gen_source || "")}
            other={String(values.lead_gen_source_other || "")}
            onChange={(v) => set("lead_gen_source", v)}
            onOther={(v) => set("lead_gen_source_other", v)}
          />
        )}
        <section className="workspace-card space-y-3">
          <label className="flex gap-2 items-center text-sm font-semibold"><input type="checkbox" checked={values.is_referral === true} onChange={e => setValues(v => ({ ...v, is_referral: e.target.checked, referred_by_partner_id: e.target.checked ? v.referred_by_partner_id : null }))} />Partner referral</label>
          {values.is_referral === true && <label className="block text-sm">Referred by *<select required className="block w-full border rounded-lg p-2 mt-1" value={String(values.referred_by_partner_id || "")} onChange={e => set("referred_by_partner_id", e.target.value)}><option value="">Select existing partner</option>{referrers.map(p => <option key={p.id} value={p.id}>{p.partner_code} · {p.company_firm_name} · {p.contact_person_name}</option>)}</select></label>}
          <label className="flex gap-2 items-center text-sm font-semibold"><input type="checkbox" checked={values.whatsapp_group_created === true} onChange={e => set("whatsapp_group_created", e.target.checked)} />WhatsApp group created</label>
        </section>
        {FIELD_GROUPS.map((group) => {
          const Icon = group.icon;
          return (
            <section key={group.title} className="partner-form-section">
              <header className="flex items-start gap-3 mb-5">
                <span className="page-icon">
                  <Icon size={20} aria-hidden="true" />
                </span>
                <div>
                  <h3 className="font-bold">{group.title}</h3>
                  <p className="text-sm text-slate-600 mt-1">
                    {group.description}
                  </p>
                </div>
              </header>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
                {PARTNER_FIELDS.filter(([key]) => group.keys.includes(key)).map(
                  ([key, label, type, required]) => {
                    const conditional =
                      key === "gst_no" && values.gst_registered === true;
                    const options =
                      key === "type_of_professional"
                        ? PROFESSIONAL_TYPES
                        : key === "onboarded_from"
                          ? ONBOARDING_SOURCES
                          : key === "partner_type" ? ["Company", "Individual"] : ["true", "false"];
                    return (
                      <div key={key}>
                        <label
                          htmlFor={`partner-${key}`}
                          className="block text-sm font-semibold mb-1"
                        >
                          {label}
                          {required || conditional ? " *" : ""}
                        </label>
                        {type === "file" ? (
                          <div className="space-y-2">
                            <PhotoFilePicker
                              id={`partner-${key}`}
                              label={label}
                              multiple={false}
                              allowPdf
                              onFiles={(files) => void upload(key, files?.[0])}
                            />
                            {!!values[key] && (
                              <a
                                className="block text-blue-700 underline"
                                href={String(values[key])}
                                target="_blank"
                                rel="noreferrer"
                              >
                                View uploaded document
                              </a>
                            )}
                          </div>
                        ) : type === "select" ? (
                          <select
                            id={`partner-${key}`}
                            required={required}
                            className="w-full border rounded-lg p-2 bg-slate-50"
                            value={
                              values[key] == null ? "" : String(values[key])
                            }
                            onChange={(e) =>
                              set(
                                key,
                                key === "gst_registered"
                                  ? e.target.value === ""
                                    ? undefined
                                    : e.target.value === "true"
                                  : e.target.value,
                              )
                            }
                          >
                            <option value="">Select…</option>
                            {options.map((o) => (
                              <option key={o} value={o}>
                                {o === "true"
                                  ? "Yes"
                                  : o === "false"
                                    ? "No"
                                    : o.replaceAll("_", " ")}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            id={`partner-${key}`}
                            required={required || conditional}
                            type={type}
                            list={
                              key === "type_of_professional"
                                ? "professional-options"
                                : undefined
                            }
                            min={type === "number" ? 0 : undefined}
                            step={
                              key === "expected_monthly_order_value"
                                ? "0.01"
                                : undefined
                            }
                            className="w-full border rounded-lg p-2 bg-slate-50"
                            value={String(values[key] ?? "")}
                            onChange={(e) => set(key, e.target.value)}
                          />
                        )}
                      </div>
                    );
                  },
                )}
              </div>
            </section>
          );
        })}
        <section className="rounded-xl border bg-white p-4 space-y-3">
          <h3 className="font-semibold">Additional contacts</h3>
          <p className="text-xs text-slate-500">
            The primary contact above is editable. Add another person here
            without changing the original lead.
          </p>
          {(
            (values.additional_contacts || []) as {
              name: string;
              phone: string;
            }[]
          ).map((contact, index) => (
            <div key={index} className="flex flex-wrap gap-2">
              <input
                aria-label={`Additional contact ${index + 1} name`}
                placeholder="Contact name"
                required
                maxLength={200}
                className="min-w-0 flex-1 border rounded-lg p-2"
                value={contact.name}
                onChange={(e) =>
                  set(
                    "additional_contacts",
                    (
                      values.additional_contacts as {
                        name: string;
                        phone: string;
                      }[]
                    ).map((c, i) =>
                      i === index ? { ...c, name: e.target.value } : c,
                    ),
                  )
                }
              />
              <input
                aria-label={`Additional contact ${index + 1} phone`}
                placeholder="Phone (optional)"
                type="tel"
                maxLength={40}
                className="min-w-0 flex-1 border rounded-lg p-2"
                value={contact.phone}
                onChange={(e) =>
                  set(
                    "additional_contacts",
                    (
                      values.additional_contacts as {
                        name: string;
                        phone: string;
                      }[]
                    ).map((c, i) =>
                      i === index ? { ...c, phone: e.target.value } : c,
                    ),
                  )
                }
              />
              <button
                type="button"
                onClick={() =>
                  set(
                    "additional_contacts",
                    (values.additional_contacts as unknown[]).filter(
                      (_, i) => i !== index,
                    ),
                  )
                }
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              set("additional_contacts", [
                ...((values.additional_contacts || []) as unknown[]),
                { name: "", phone: "" },
              ])
            }
          >
            Add another contact
          </button>
        </section>
        <label className="text-sm font-semibold">
          Additional mobile numbers
          <input
            className="block w-full border rounded-lg p-2"
            placeholder="Separate numbers with commas or semicolons"
            value={String(values.additional_phones || "")}
            onChange={(e) => set("additional_phones", e.target.value)}
          />
        </label>
        {editing && !initial.source_lead_id && (
          <label className="text-sm font-semibold">
            Region override
            <input
              className="block w-full border rounded-lg p-2"
              value={String(values.region_override || "")}
              onChange={(e) => set("region_override", e.target.value)}
            />
          </label>
        )}
      </fieldset>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      <div className="partner-form-actions flex flex-wrap gap-3">
        <button
          disabled={busy}
          className="bg-blue-700 text-white px-4 py-2 rounded-lg"
        >
          {editing ? (
            <Save size={17} aria-hidden="true" />
          ) : (
            <Send size={17} aria-hidden="true" />
          )}
          {busy
            ? "Saving…"
            : editing
              ? "Save changes"
              : user?.role === "ground_rep"
                ? "Submit for review"
                : "Onboard partner"}
        </button>
        <button
          type="button"
          className="border px-4 py-2 rounded-lg"
          onClick={onCancel}
        >
          <X size={17} aria-hidden="true" /> Cancel
        </button>
      </div>
    </form>
  );
}
