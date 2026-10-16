"use client";
import { ScheduleVisitButton } from "@/components/leads/ScheduleVisitButton";
import { ConsultationModal } from "@/components/rep/ConsultationModal";
import { OriginalLead } from "@/components/leads/OriginalLead";
import { AlternateLeadDetails } from "@/components/leads/AlternateLeadDetails";
import { LeadNavigate } from "@/components/leads/LeadNavigate";
import { LeadCall, LeadPhones } from "@/components/leads/LeadCall";
import Link from "next/link";
import { CallHistory } from "@/components/cold/CallHistory";
import { use, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { CorrectPin } from "@/components/leads/CorrectPin";
import {
  ConsultationCard,
  type ConsultationRow,
} from "@/components/consultations/ConsultationCard";
type Lead = {
  id: string;
  lead_code?: string;
  company_name: string;
  lat: number | null;
  lng: number | null;
  address: string | null;
  geocode_source: string | null;
  geocode_status?: string | null;
  location_verified: boolean;
  activity_logs: {
    id: string;
    action: string;
    old_value: string | null;
    new_value: string | null;
    created_at: string;
    actor: { name: string } | null;
  }[];
};
export default function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ context?: string }>;
}) {
  const { id } = use(params),
    { context } = use(searchParams),
    { user } = useAuth();
  const [consulting, setConsulting] = useState(false);
  const [lead, setLead] = useState<Lead | null>(null),
    [rows, setRows] = useState<ConsultationRow[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    Promise.all([
      fetch(`/api/leads/${id}/history`).then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        setLead(d.lead);
      }),
      fetch("/api/consultations?lead_id=" + id).then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        setRows(d.consultations);
      }),
    ]).catch((e) => setError(String(e)));
  }, [id]);
  return (
    <main className="min-w-0 max-w-full overflow-x-hidden p-6 space-y-4">
      <p role="alert">{error}</p>
      {lead && (
        <>
          <ScheduleVisitButton leadId={lead.id} />
          <OriginalLead leadId={id} />
          <AlternateLeadDetails leadId={id} />
          <h1 className="text-2xl font-bold">
            {lead.lead_code} {lead.company_name}
          </h1>
          <p>{lead.address}</p>
          {user?.role !== "analyst" && <button className="bg-orange-600 text-white rounded px-3 py-2" onClick={() => setConsulting(true)}>Add consultation</button>}
          <ConsultationModal lead={lead} context={context === "calling" ? "calling" : undefined} isOpen={consulting} onClose={() => setConsulting(false)} onSuccess={() => location.reload()} />
          <LeadCall leadId={id} />
          <LeadNavigate lead={lead} />
          <LeadPhones leadId={id} />
          {rows[0]?.outcome === "On-boarding Done" && (
            <Link
              className="inline-block bg-blue-700 text-white rounded px-4 py-2"
              href={`/partners?lead_id=${id}`}
            >
              Start Onboarding
            </Link>
          )}
          <p>
            Location:{" "}
            {lead.location_verified
              ? "Verified"
              : lead.geocode_source === "pincode_dataset"
                ? "Approximate PIN location"
                : "Unverified"}
          </p>
          {["b2b_head", "regional_manager", "store_associate"].includes(user?.role || "") && (
            <CorrectPin lead={lead} onSaved={() => location.reload()} />
          )}
          <h2 className="text-xl">Consultations</h2>
          <div className="grid md:grid-cols-2 gap-3">
            {rows.map((row) => (
              <ConsultationCard key={row.id} row={row} navigation={false} />
            ))}
          </div>
          <h2 className="text-xl">Manager call history</h2>
          <CallHistory leadId={id} />
          <h2 className="text-xl">Full activity history</h2>
          {lead.activity_logs.map((a) => (
            <article key={a.id} className="border p-3 break-words">
              <p>
                {lead.lead_code} · {a.action} • {a.actor?.name || "System"} •{" "}
                {new Date(a.created_at).toLocaleString()}
              </p>
              <p>
                {a.old_value} → {a.new_value}
              </p>
            </article>
          ))}
        </>
      )}
    </main>
  );
}
