"use client";
import { RevisitHistory } from '@/components/consultations/RevisitHistory';
import type { RevisitEntry } from '@/lib/consultations/revisit-history';
import { ConsultationCallHistory } from './ConsultationCallHistory';
import type { ConsultationCall } from '@/lib/consultations/call-history';
import { GroupCreatedToggle } from "@/components/leads/GroupCreatedToggle";
import { isWonLead } from "@/lib/leads/interest-bucket";
import { DialogOverlay } from "@/components/shared/DialogOverlay";
import { LeadCall } from "@/components/leads/LeadCall";
import { useAuth } from "@/context/AuthContext";
import { LogRevisit } from "@/components/rep/LogRevisit";
import { useState } from "react";
import Image from "next/image";
import { ReadableDetails } from "@/components/shared/ReadableDetails";
import { LeadHistory } from "@/components/leads/LeadHistory";
import { ScheduleVisitButton } from "@/components/leads/ScheduleVisitButton";
import { canPlotLead } from "@/lib/mapping/visibility";
import { LeadNavigate } from "@/components/leads/LeadNavigate";
import dynamic from "next/dynamic";
const LocationThumbnail = dynamic(
  () => import("@/components/map/LocationThumbnail"),
  { ssr: false },
);
export type ConsultationRow = {
  store_visit?: { scheduled_at: string; status: string; store: { name: string } } | null;
  id: string;
  responses?: {
    kind?: string;
    follow_up_calls?: ConsultationCall[]; revisits?: RevisitEntry[];
    legacy_batch?: string;
    source_row?: number;
    raw?: Record<string, string>;
    issues?: string[];
  } | null;
  visit_date: string;
  decision_maker_name: string | null;
  decision_maker_phone: string | null;
  alternate_mobile_number?: string | null;
  designation: string | null;
  email: string | null;
  lead_type: string | null;
  interest_level: string | null;
  outcome: string;
  current_lead_status: string | null;
  next_follow_up_date: string | null;
  primary_pain_point: string | null;
  competitor_involved: string | null;
  site_photos: unknown;
  checklist?: unknown;
  notes?: string | null;
  visiting_card_photos?: unknown;
  ground_staff_name?: string | null;
  company_name?: string | null;
  lead: {
    partners?: { partner_status: string }[];
    id: string;
    lead_code?: string;
    company_name: string;
    phone_no: string | null;
    geocode_status?: string | null;
    geocode_source?: string | null;
    lat: number | null;
    lng: number | null;
    status: string;
    region: string | null;
    assigned_store_id: string | null;
    assigned_ground_rep_id?: string | null;
    calling_associate_id?: string | null;
    lead_source?: string | null;
    intake_team?: string;
  };
  rep: { id: string; name: string };
};
const outcomeColors: Record<string, string> = {
  "On-boarding Done": "bg-green-100 text-green-800",
  "Visit scheduled": "bg-blue-100 text-blue-800",
  "Nurturing required": "bg-amber-100 text-amber-800",
  "Dont want commission": "bg-purple-100 text-purple-800",
  "Lost Lead - (does not do tiles business)": "bg-gray-200 text-gray-800",
  "Wrong location": "bg-red-100 text-red-800",
  "Office closed": "bg-slate-100 text-slate-800",
  "Wrong Location/Office closed": "bg-red-100 text-red-800",
};
export function ConsultationCard({
  row,
  navigation = true,
  callAction = true,
  onSaved,
}: {
  row: ConsultationRow;
  navigation?: boolean;
  callAction?: boolean;
  onSaved?: () => void;
}) {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const canRevisit =
    !isWonLead(row.lead) && user &&
    ((row.lead.assigned_ground_rep_id === user.id &&
      ["ground_rep", "regional_manager", "b2b_head"].includes(user.role)) ||
      (["store", "head", "caller"].includes(row.lead.intake_team || "") &&
        row.lead.calling_associate_id === user.id &&
        ["store_associate", "regional_manager", "b2b_head"].includes(
          user.role,
        )));
  return (
    <article className="min-w-0 self-start rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
      <GroupCreatedToggle leadId={row.lead.id} />
      <div className="text-xs font-semibold text-slate-500">
        {row.lead.lead_code} ·{" "}
        {row.responses?.kind === "revisit" ? "Revisit" : "Consultation"}
      </div>
      <h2 className="font-semibold text-slate-900 break-words">
        {row.company_name || row.lead.company_name}
      </h2>
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-lg bg-orange-50 text-orange-800 px-2 py-1">
          {row.outcome}
        </span>
        {row.interest_level && (
          <span className="rounded-lg bg-slate-100 px-2 py-1">
            {row.interest_level} interest
          </span>
        )}
      </div>
      <p className="text-xs text-slate-500">
        {new Date(row.visit_date).toLocaleDateString("en-IN", {
          timeZone: "Asia/Kolkata",
        })}{" "}
        · {row.ground_staff_name || row.rep.name}
      </p>
      {row.store_visit && <p className="rounded-lg border border-orange-200 bg-orange-50 p-2 text-xs text-orange-900">Store visit · {row.store_visit.store.name}<br />{new Date(row.store_visit.scheduled_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST · {row.store_visit.status}</p>}
      {row.next_follow_up_date && (
        <p className="text-xs font-medium text-orange-800">
          Follow-up: {row.next_follow_up_date.slice(0, 10)}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button
          className="rounded-lg border px-3 py-2"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Hide details" : "View details"}
        </button>
        <ScheduleVisitButton leadId={row.lead.id} onSaved={onSaved} />
        {callAction && !isWonLead(row.lead) && <LeadCall leadId={row.lead.id} onSuccess={onSaved} />}
        {canRevisit && (
          <LogRevisit leadId={row.lead.id} onSaved={() => onSaved?.()} />
        )}
      </div>
      {expanded && <RevisitHistory revisits={row.responses?.revisits} />}
      {expanded && <ConsultationCallHistory calls={row.responses?.follow_up_calls} />}
      {expanded && (
        <ConsultationDetails
          row={row}
          navigation={navigation}
          callAction={false}
        />
      )}
    </article>
  );
}
function ConsultationDetails({
  row: c,
  navigation = true,
  callAction = true,
}: {
  row: ConsultationRow;
  navigation?: boolean;
  callAction?: boolean;
}) {
  const [photo, setPhoto] = useState<string | null>(null);
  if (c.responses?.kind === "calling") return <article className="border rounded-xl p-4 bg-white space-y-3">
    <h2 className="font-bold">Calling consultation · {c.company_name || c.lead.company_name}</h2>
    <p className="whitespace-pre-wrap">{c.notes}</p>
    <p>Call Picked: Yes</p><p>Level of interest: {c.interest_level}</p>
    <p>{new Date(c.visit_date).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} · {c.rep.name}</p>
    <p>Follow-up: {c.next_follow_up_date?.slice(0, 10) || "Not required"}</p>
    <GroupCreatedToggle leadId={c.lead.id} />
    {callAction && !isWonLead(c.lead) && <LeadCall leadId={c.lead.id} />}
  </article>;
  if (c.responses?.kind === "revisit")
    return (
      <article className="border rounded-xl p-4 bg-white space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-bold">
            {c.lead.lead_code} · {c.company_name || c.lead.company_name}
          </h2>
          <span className="rounded bg-orange-50 px-2 py-1 text-xs text-orange-700">
            Revisit update
          </span>
        </div>
        <p className="font-semibold">{c.outcome}</p>
        <p className="text-sm text-slate-600">
          {new Date(c.visit_date).toLocaleDateString("en-IN", {
            timeZone: "Asia/Kolkata",
          })}{" "}
          · {c.rep.name}
        </p>
        {c.notes && <p className="whitespace-pre-wrap">{c.notes}</p>}
        {c.next_follow_up_date && (
          <p>Next follow-up: {c.next_follow_up_date.slice(0, 10)}</p>
        )}
        {callAction && !isWonLead(c.lead) && <LeadCall leadId={c.lead.id} />}
      </article>
    );
  const photos = Array.isArray(c.site_photos)
    ? c.site_photos
        .filter(
          (v): v is string =>
            typeof v === "string" &&
            (v.startsWith("https://") ||
              /^\/api\/photos\/[a-zA-Z0-9-]+$/.test(v)),
        )
        .slice(0, 5)
    : [];
  return (
    <article className="border rounded-xl p-4 bg-white space-y-3">
      <h2 className="font-bold">
        {c.lead.lead_code} · {c.company_name || c.lead.company_name}
      </h2>
      {callAction && !isWonLead(c.lead) && <LeadCall leadId={c.lead.id} />}
      <div className="flex flex-wrap gap-2 text-xs">
        <span>{c.lead_type || "Lead type not recorded"}</span>
        <span
          className={`rounded px-2 ${c.interest_level === "High" ? "bg-green-100 text-green-800" : c.interest_level === "Medium" ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-700"}`}
        >
          {c.interest_level || "Interest not recorded"}
        </span>
        <span
          className={`rounded px-2 ${outcomeColors[c.outcome] || "bg-gray-100"}`}
        >
          {c.outcome}
        </span>
      </div>
      <p>
        {c.decision_maker_name || "Decision maker not recorded"} •{" "}
        {c.designation || "Designation not recorded"}
      </p>
      <p>
        {c.decision_maker_phone || c.lead.phone_no || "No mobile"} •{" "}
        {c.email || "No email"}
      </p>
      <p>
        {c.alternate_mobile_number && (
          <span className="block">
            Alternate mobile: {c.alternate_mobile_number}
          </span>
        )}
        Consultation date:{" "}
        {new Date(c.visit_date).toLocaleDateString("en-IN", {
          timeZone: "Asia/Kolkata",
        })}{" "}
        • {c.ground_staff_name || c.rep.name}
      </p>
      {canPlotLead(c.lead) && (
        <LocationThumbnail
          lat={c.lead.lat!}
          lng={c.lead.lng!}
          label={`${c.lead.lead_code || ""} ${c.lead.company_name}`}
        />
      )}
      {navigation && <LeadNavigate lead={c.lead} />}
      <div className="flex gap-2">
        {[c.primary_pain_point, c.competitor_involved]
          .filter(Boolean)
          .map((t) => (
            <span className="text-xs rounded bg-orange-50 p-1" key={t}>
              {t}
            </span>
          ))}
      </div>
      <div className="flex gap-2">
        {photos.map((p, i) => (
          <button key={p} onClick={() => setPhoto(p)}>
            <Image
              unoptimized
              width={56}
              height={56}
              src={p}
              alt={`Site photo ${i + 1}`}
              className="w-14 h-14 object-cover"
            />
          </button>
        ))}
      </div>
      {Array.isArray(c.checklist) && (
        <section>
          <h3 className="font-semibold">Checklist</h3>
          <ul className="list-disc pl-5">
            {c.checklist
              .filter((v): v is string => typeof v === "string")
              .map((v) => (
                <li key={v}>{v}</li>
              ))}
          </ul>
        </section>
      )}
      {c.notes && (
        <section>
          <h3 className="font-semibold">Notes</h3>
          <p className="whitespace-pre-wrap break-words">{c.notes}</p>
        </section>
      )}
      {Array.isArray(c.visiting_card_photos) &&
        c.visiting_card_photos.length > 0 && (
          <section>
            <h3 className="font-semibold">Visiting card</h3>
            <div className="flex gap-3">
              {c.visiting_card_photos
                .filter(
                  (v): v is string =>
                    typeof v === "string" &&
                    /^\/api\/photos\/[a-zA-Z0-9-]+$/.test(v),
                )
                .map((p, i) => (
                  <button key={p} onClick={() => setPhoto(p)}>
                    <Image
                      unoptimized
                      src={p}
                      width={120}
                      height={80}
                      alt={`Visiting card ${i === 0 ? "front" : "back"}`}
                      className="h-20 w-30 object-cover rounded"
                    />
                  </button>
                ))}
            </div>
          </section>
        )}
      {c.responses?.legacy_batch && (
        <details className="text-xs border-t pt-3">
          <summary className="font-semibold cursor-pointer">
            Original old_data record · row {c.responses.source_row}
          </summary>
          <ReadableDetails value={c.responses.raw || {}} />
        </details>
      )}
      <footer>
        {c.current_lead_status || c.lead.status}
        {c.next_follow_up_date && (
          <p>Next follow-up: {c.next_follow_up_date.slice(0, 10)}</p>
        )}
        <LeadHistory leadId={c.lead.id} />
      </footer>
      {photo && (
        <DialogOverlay
          role="dialog"
          aria-modal="true"
          aria-label="Site photo"
          className="fixed inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center"
          onClick={() => setPhoto(null)}
        >
          <button className="text-white p-4" onClick={() => setPhoto(null)}>
            Close photo
          </button>
          <Image
            unoptimized
            width={1200}
            height={900}
            src={photo}
            alt="Enlarged site photo"
            className="max-h-[80vh] max-w-[95vw]"
          />
        </DialogOverlay>
      )}
    </article>
  );
}
