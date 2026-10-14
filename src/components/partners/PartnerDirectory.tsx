"use client";
import { WorkspaceDialog } from "@/components/shared/WorkspaceDialog";
import { partnerEmailName } from "@/lib/partners/identity";
import { LeadGenSource } from "./LeadGenSource";
import {
  Handshake,
  UserPlus,
  UploadCloud,
  ArrowLeft,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { PartnerForm } from "./PartnerForm";
import { PartnerImport } from "./PartnerImport";
import {
  ConsultationCard,
  type ConsultationRow,
} from "@/components/consultations/ConsultationCard";
import { PARTNER_FIELDS } from "@/lib/partners/fields";
import { todayIndia } from "@/lib/phase5/calendar";
type Partner = Record<string, unknown> & {
  id: string;
  partner_code: string;
  company_firm_name: string;
  partner_status: string;
  matched_region: string | null;
};
type Detail = {
  partner: Partner;
  activity: {
    id: string;
    action: string;
    created_at: string;
    actor: { name: string };
    new_value?: { notes?: string; walk_in_date?: string } | null;
  }[];
  lead: null | {
    id: string;
    lead_code: string;
    created_at: string;
    scraped_date: string | null;
    consultations: ConsultationRow[];
    trip_leads: {
      id: string;
      scheduled_date: string;
      trip: { name: string };
    }[];
    activity_logs: { id: string; action: string; created_at: string }[];
  };
  routes: { id: string; route_date: string; version: number }[];
};
const columns = [
  ["partner_code", "Partner Code"],
  ["company_firm_name", "Company"],
  ["contact_person_name", "Contact"],
  ["designation", "Designation"],
  ["mobile_number", "Mobile"],
  ["city", "City"],
  ["state", "State"],
  ["type_of_professional", "Professional type"],
  ["gst_registered", "GST registered"],
  ["onboarded_at", "Onboarded date"],
  ["partner_status", "Status"],
] as const;
async function api(url: string, options?: RequestInit) {
  const r = await fetch(url, options),
    d = await r.json();
  if (!r.ok) throw new Error(d.error || "Request failed");
  return d;
}
export function PartnerDirectory({ role }: { role: string }) {
  const [page, setPage] = useState(1);
  const [leadGen, setLeadGen] = useState(""),
    [leadGenOther, setLeadGenOther] = useState("");
  const review = role === "b2b_head" || role === "regional_manager";
  const [rows, setRows] = useState<Partner[]>([]),
    [detail, setDetail] = useState<Detail | null>(null),
    [form, setForm] = useState<Record<string, unknown> | null>(null),
    [editing, setEditing] = useState(false),
    [importing, setImporting] = useState(false),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [filters, setFilters] = useState<Record<string, string>>({
      partner_status: "active",
    }),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [unassigned, setUnassigned] = useState(false),
    [city, setCity] = useState(""),
    [region, setRegion] = useState("");
  const [walkInPartner, setWalkInPartner] = useState<Partner | null>(null),
    [walkInNotes, setWalkInNotes] = useState(""),
    [walkInBusy, setWalkInBusy] = useState(false);
  const load = () => api("/api/partners").then((d) => setRows(d.partners));
  useEffect(() => {
    let live = true;
    api("/api/partners")
      .then((d) => {
        if (live) setRows(d.partners);
      })
      .catch((e) => setError(e.message));
    const partnerId = new URLSearchParams(location.search).get("partner_id");
    if (partnerId)
      api("/api/partners/" + encodeURIComponent(partnerId))
        .then((d) => {
          if (live) setDetail(d);
        })
        .catch((e) => setError(e.message));
    const leadId = new URLSearchParams(location.search).get("lead_id");
    if (leadId)
      api("/api/partners/prefill?lead_id=" + encodeURIComponent(leadId))
        .then((d) => {
          if (live) setForm({ ...d.fields, source_lead_id: leadId });
        })
        .catch((e) => setError(e.message));
    return () => {
      live = false;
    };
  }, []);
  async function open(id: string) {
    setError("");
    try {
      setDetail(await api("/api/partners/" + id));
      setForm(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function action(action: string) {
    if (!detail) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/partners/" + detail.partner.id, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          rejection_reason: reason,
          lead_gen_source: leadGen,
          lead_gen_source_other: leadGenOther,
        }),
      });
      await open(detail.partner.id);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function logWalkIn() {
    if (!walkInPartner || !walkInNotes.trim()) return;
    setWalkInBusy(true);
    setError("");
    try {
      await api(`/api/partners/${walkInPartner.id}/walk-ins`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: walkInNotes }),
      });
      setWalkInPartner(null);
      setWalkInNotes("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWalkInBusy(false);
    }
  }
  const filtered = rows.filter(
    (p) =>
      (!unassigned || !p.matched_region) &&
      Object.entries(filters).every(
        ([k, v]) =>
          !v ||
          String(p[k] ?? "")
            .toLowerCase()
            .includes(v.toLowerCase()),
      ) &&
      [
        "company_firm_name",
        "contact_person_name",
        "designation",
        "mobile_number",
        "gst_no",
        "partner_code",
      ].some((k) =>
        String(p[k] ?? "")
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
  );
  const visiblePage = Math.min(
    page,
    Math.max(1, Math.ceil(filtered.length / 24)),
  );
  return (
    <div className="p-4 md:p-6 space-y-5 text-slate-900 max-w-[1600px] mx-auto">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <span className="page-icon">
              <Handshake aria-hidden="true" size={24} />
            </span>
            Partners
          </h1>
          <p className="text-slate-600">
            Onboarding, review and partner profiles
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-lg bg-blue-700 text-white px-4 py-2"
            onClick={() => {
              setForm({});
              setEditing(false);
              setDetail(null);
            }}
          >
            <UserPlus size={17} aria-hidden="true" /> New onboarding
          </button>
          {review && (
            <button
              className="border rounded-lg px-4 py-2 bg-white"
              onClick={() => setImporting(!importing)}
            >
              <UploadCloud size={17} aria-hidden="true" /> Import historical
              partners
            </button>
          )}
        </div>
      </header>
      {error && (
        <p
          role="alert"
          className="bg-red-50 border border-red-200 p-3 text-red-800 rounded-lg"
        >
          {error}
        </p>
      )}
      {walkInPartner && (
        <WorkspaceDialog
          title={`Log a walk-in · ${walkInPartner.partner_code}`}
          onClose={() => {
            if (!walkInBusy) {
              setWalkInPartner(null);
              setWalkInNotes("");
            }
          }}
        >
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void logWalkIn(); }}>
            <p className="text-sm font-semibold">{walkInPartner.company_firm_name}</p>
            <label className="block text-sm">Walk-in date<input className="mt-1 block w-full rounded-lg border bg-slate-50 p-2" value={todayIndia()} readOnly /></label>
            <label className="block text-sm">Notes<textarea autoFocus required maxLength={2000} rows={5} className="mt-1 block w-full rounded-lg border p-2" value={walkInNotes} onChange={(event) => setWalkInNotes(event.target.value)} placeholder="Reason for visit, discussion and next action" /></label>
            <button disabled={walkInBusy || !walkInNotes.trim()} className="rounded-lg bg-[#ff4500] px-4 py-2 text-sm font-bold text-white">{walkInBusy ? "Saving…" : "Submit walk-in"}</button>
          </form>
        </WorkspaceDialog>
      )}
      {importing && <PartnerImport onDone={() => void load()} />}
      {form ? (
        <PartnerForm
          initial={form}
          editing={editing}
          onCancel={() => setForm(null)}
          onSave={async (data) => {
            await api(
              editing && detail
                ? "/api/partners/" + detail.partner.id
                : "/api/partners",
              {
                method: editing ? "PATCH" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  ...data,
                  ...(editing && detail?.partner.partner_status === "rejected"
                    ? { action: "resubmit" }
                    : {}),
                }),
              },
            );
            setForm(null);
            await load();
            if (editing && detail) await open(detail.partner.id);
            else
              setFilters({
                partner_status:
                  role === "ground_rep" ? "pending_review" : "active",
              });
          }}
        />
      ) : null}
      {detail && !form && (
        <WorkspaceDialog title={`Partner details · ${detail.partner.partner_code}`} onClose={() => setDetail(null)}>
        <section className="bg-white border rounded-xl p-5 space-y-5">
          <div className="flex flex-wrap gap-3 items-center">
            <button
              className="underline text-blue-700"
              onClick={() => setDetail(null)}
            >
              <ArrowLeft size={16} aria-hidden="true" /> Back to directory
            </button>
            <h2 className="text-xl font-bold">
              {detail.partner.partner_code} · {detail.partner.company_firm_name}
            </h2>
            <span>{detail.partner.partner_status}</span>
            {!!detail.partner.business_email_id && <a className="border border-[#ff4500] text-[#ff4500] rounded-lg px-3 py-1 text-sm" href={`mailto:${encodeURIComponent(String(detail.partner.business_email_id))}?subject=${encodeURIComponent(`Welcome to Florzy — ${partnerEmailName(detail.partner)}`)}&body=${encodeURIComponent(`Hello ${partnerEmailName(detail.partner)},\n\nWelcome to Florzy. Your partner code is ${detail.partner.partner_code}.\n\nRegards,\nFlorzy Team`)}`}>Draft onboarding email</a>}
            {((review && detail.partner.partner_status === "active") ||
              detail.partner.partner_status === "rejected") && (
              <button
                className="border rounded px-3 py-1"
                onClick={() => {
                  setForm({
                    ...detail.partner,
                    additional_phones: (
                      (detail.partner.phones || []) as {
                        phone_number: string;
                      }[]
                    )
                      .map((p) => p.phone_number)
                      .join("; "),
                  });
                  setEditing(true);
                }}
              >
                Edit profile
              </button>
            )}
          </div>
          {!!detail.partner.source_lead_code && (
            <p className="text-sm text-slate-600">
              Onboarded from Lead {String(detail.partner.source_lead_code)}
            </p>
          )}
          <div className="workspace-card text-sm space-y-2">
            <p>WhatsApp group: {detail.partner.whatsapp_group_created ? "Created" : "Not created"}</p>
            {!!detail.partner.referred_by && <p>Referred by {String((detail.partner.referred_by as Record<string, unknown>).partner_code)} · {String((detail.partner.referred_by as Record<string, unknown>).company_firm_name)} · {String((detail.partner.referred_by as Record<string, unknown>).contact_person_name)}</p>}
            <p className="text-xs text-slate-500">Permanent partner code: {detail.partner.partner_code}. Name and phone changes retain this identity and its audit history.</p>
          </div>
          <div className="grid sm:grid-cols-3 gap-3 rounded-xl bg-slate-50 p-4 text-sm">
            <p>
              <span className="block text-xs text-slate-500">
                Primary contact
              </span>
              {String(detail.partner.contact_person_name || "—")}
            </p>
            <p>
              <span className="block text-xs text-slate-500">Mobile</span>
              {String(detail.partner.mobile_number || "—")}
            </p>
            <p>
              <span className="block text-xs text-slate-500">
                City / region
              </span>
              {String(detail.partner.city || "—")} ·{" "}
              {String(detail.partner.matched_region || "—")}
            </p>
          </div>
          <details className="rounded-xl border p-4">
            <summary className="cursor-pointer font-semibold text-sm">
              Registration, bank details & documents
            </summary>
            <dl className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
              {PARTNER_FIELDS.map(([key, label, type]) => (
                <div key={key}>
                  <dt className="text-sm text-slate-600">{label}</dt>
                  <dd className="break-words font-medium">
                    {type === "file" && detail.partner[key] ? (
                      <a
                        className="text-blue-700 underline"
                        href={String(detail.partner[key])}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View document
                      </a>
                    ) : (
                      String(detail.partner[key] ?? "—")
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </details>
          <p>
            Additional numbers:{" "}
            {((detail.partner.phones || []) as { phone_number: string }[])
              .map((p) => p.phone_number)
              .join(", ") || "—"}
          </p>
          {Array.isArray(detail.partner.additional_contacts) &&
            detail.partner.additional_contacts.length > 0 && (
              <section className="rounded-xl border p-3">
                <h3 className="font-semibold text-sm">Additional contacts</h3>
                {(
                  detail.partner.additional_contacts as {
                    name: string;
                    phone: string;
                  }[]
                ).map((c, i) => (
                  <p key={i} className="text-sm mt-2">
                    {c.name} · {c.phone || "No phone recorded"}
                  </p>
                ))}
              </section>
            )}
          {review && detail.partner.partner_status === "pending_review" && (
            <div className="p-4 bg-blue-50 border rounded-lg flex flex-wrap gap-3">
              <LeadGenSource
                value={leadGen}
                other={leadGenOther}
                onChange={setLeadGen}
                onOther={setLeadGenOther}
              />
              <button
                disabled={busy}
                className="bg-green-700 text-white rounded px-3 py-2"
                onClick={() => void action("activate")}
              >
                <CheckCircle2 size={17} aria-hidden="true" /> Activate
              </button>
              <input
                aria-label="Rejection reason"
                className="border rounded p-2"
                placeholder="Reason for rejection"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <button
                disabled={busy || !reason.trim()}
                className="bg-red-700 text-white rounded px-3 py-2"
                onClick={() => void action("reject")}
              >
                <XCircle size={17} aria-hidden="true" /> Reject
              </button>
            </div>
          )}
          {!!detail.partner.rejection_reason && (
            <p className="text-red-700">
              Rejection reason: {String(detail.partner.rejection_reason)}
            </p>
          )}
          {detail.lead && (
            <section className="space-y-3">
              <h3 className="font-bold text-lg">
                Originating Lead {detail.lead.lead_code}
              </h3>
              <p>
                Imported: {detail.lead.scraped_date || detail.lead.created_at}
              </p>
              {detail.lead.consultations.map((c) => (
                <ConsultationCard key={c.id} row={c} />
              ))}
              <h4 className="font-bold">Visit history</h4>
              {detail.lead.trip_leads.map((v) => (
                <p key={v.id}>
                  {v.trip.name} · {v.scheduled_date.slice(0, 10)}
                </p>
              ))}
              <h4 className="font-bold">Lead activity</h4>
              {detail.lead.activity_logs.map((a) => (
                <p key={a.id}>
                  {a.created_at} · {a.action}
                </p>
              ))}
            </section>
          )}
          <h3 className="font-bold">Partner activity</h3>
          {detail.activity.map((a) => (
            <p key={a.id}>
              {a.created_at} · {a.actor.name} · {a.action}
              {a.action === "PARTNER_WALK_IN" && a.new_value && <> · {a.new_value.walk_in_date} · {a.new_value.notes}</>}
            </p>
          ))}
        </section>
        </WorkspaceDialog>
      )}
      {!form && (
        <>
          <div className="bg-white border rounded-xl p-4 flex flex-wrap gap-3">
            <input
              aria-label="Search partners"
              className="border rounded-lg px-3 py-2 flex-1 min-w-48"
              placeholder="Search company, mobile, GST No. or partner code"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {review && (
              <>
                <button
                  className="border rounded-lg px-3"
                  onClick={() =>
                    setFilters({ partner_status: "pending_review" })
                  }
                >
                  Pending Review
                </button>
                <label className="flex gap-2 items-center">
                  <input
                    type="checkbox"
                    checked={unassigned}
                    onChange={(e) => setUnassigned(e.target.checked)}
                  />
                  Unassigned Region
                </label>
              </>
            )}
            <button
              className="border rounded px-3"
              onClick={() => {
                setFilters({});
                setSearch("");
                setUnassigned(false);
              }}
            >
              Clear filters
            </button>
          </div>
          <details className="rounded-xl border bg-white p-3">
            <summary className="text-sm font-semibold cursor-pointer">
              More filters
            </summary>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
              {columns.map(([k, label]) => (
                <label key={k} className="text-xs text-slate-600">
                  {label}
                  <input
                    className="block w-full mt-1 border rounded-lg p-2"
                    value={filters[k] || ""}
                    onChange={(e) => {
                      setPage(1);
                      setFilters({ ...filters, [k]: e.target.value });
                    }}
                  />
                </label>
              ))}
            </div>
          </details>
          <p className="text-sm text-slate-500">
            {filtered.length} partners · select a card to view full details
          </p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered
              .slice(
                (Math.min(page, Math.max(1, Math.ceil(filtered.length / 24))) -
                  1) *
                  24,
                Math.min(page, Math.max(1, Math.ceil(filtered.length / 24))) *
                  24,
              )
              .map((p) => (
                <article
                  key={p.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3 min-w-0"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-orange-700">
                      {p.partner_code}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px]">
                      {String(p.partner_status).replaceAll("_", " ")}
                    </span>
                  </div>
                  <h2 className="font-semibold text-slate-900 break-words">
                    {String(p.company_firm_name)}
                  </h2>
                  <p className="text-sm text-slate-700">
                    {String(p.contact_person_name || "—")}{" "}
                    <span className="text-slate-400">·</span>{" "}
                    {String(p.designation || "—")}
                  </p>
                  <p className="text-sm text-slate-600">
                    {String(p.mobile_number || "—")}
                  </p>
                  <p className="text-xs text-slate-500">
                    {String(p.city || "—")} ·{" "}
                    {String(p.matched_region || "Unassigned region")}
                  </p>
                  <div className="flex gap-2">
                    {role === "store_associate" && <button className="flex-1 rounded-lg bg-[#ff4500] px-3 py-2 text-sm font-semibold text-white" onClick={() => { setWalkInPartner(p); setWalkInNotes(""); }}>Log a walk-in</button>}
                    <button
                      className="flex-1 border rounded-lg text-sm"
                      onClick={() => void open(p.id)}
                    >
                      View partner
                    </button>
                  </div>
                </article>
              ))}
          </div>
          {!filtered.length && (
            <p className="rounded-xl border bg-white p-5 text-slate-500">
              No partners match these filters.
            </p>
          )}
          {filtered.length > 24 && (
            <div className="flex items-center gap-3">
              <button
                disabled={visiblePage <= 1}
                onClick={() => setPage(visiblePage - 1)}
              >
                Previous
              </button>
              <span className="text-sm">
                Page {Math.min(page, Math.ceil(filtered.length / 24))} of{" "}
                {Math.ceil(filtered.length / 24)}
              </span>
              <button
                disabled={visiblePage * 24 >= filtered.length}
                onClick={() => setPage(visiblePage + 1)}
              >
                Next
              </button>
            </div>
          )}
          {review && (
            <details className="bg-white border rounded-xl p-4">
              <summary className="font-semibold cursor-pointer">
                City-to-region mappings
              </summary>
              <p className="text-sm my-2">
                Exact store pincode takes priority. These mappings cover
                historical partners without a matching pincode.
              </p>
              <div className="flex flex-wrap gap-2">
                <input
                  aria-label="City"
                  className="border p-2 rounded"
                  placeholder="City"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
                <input
                  aria-label="Region"
                  className="border p-2 rounded"
                  placeholder="Known store region"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                />
                <button
                  className="bg-blue-700 text-white px-3 rounded"
                  onClick={async () => {
                    try {
                      await api("/api/partners/regions", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ city, region }),
                      });
                      await load();
                      setCity("");
                      setRegion("");
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  Save mapping
                </button>
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}
