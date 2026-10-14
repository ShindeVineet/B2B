"use client";
import { ScheduleVisitButton } from "@/components/leads/ScheduleVisitButton";
import { OnboardingReminders } from "@/components/partners/OnboardingReminders";
import { LeadCall } from "@/components/leads/LeadCall";
import { useEffect, useState } from "react";
import Link from "next/link";
export function WorkflowInbox({
  followups = false,
  team = false,
  canLog = true,
}: {
  followups?: boolean;
  team?: boolean;
  canLog?: boolean;
}) {
  const [notices, setNotices] = useState<
      {
        id: string;
        message: string;
        lead_id?: string;
        partner_id?: string;
        lead?: { lead_code: string };
      }[]
    >([]),
    [rows, setRows] = useState<
      {
        id: string;
        due_date: string;
        rep?: { id: string; name: string };
        lead: {
          lat: number | null;
          lng: number | null;
          geocode_status: string | null;
          geocode_source: string | null;
          id: string;
          lead_code?: string;
          company_name: string;
          phone_no: string | null;
        };
      }[]
    >([]);
  useEffect(() => {
    let active = true;
    const load = async () => {
      const r = await fetch("/api/notifications");
      if (r.ok && active) {
        const d = await r.json();
        setNotices([
          ...(d.workflow_notifications || []),
          ...(d.partner_notifications || []),
        ]);
      }
      if (followups) {
        const f = await fetch(
          team ? "/api/follow-ups" : "/api/follow-ups?mine=true",
        );
        if (f.ok && active) setRows((await f.json()).followups || []);
      }
    };
    const reload = () => void load().catch(() => {});
    window.addEventListener("followups-updated", reload);
    reload();
    return () => {
      window.removeEventListener("followups-updated", reload);
      active = false;
    };
  }, [followups, team]);
  return (
    <div className="space-y-4">
      <OnboardingReminders />
      {followups && (
        <section className="workspace-card">
          <h2 className="text-lg font-semibold">
            {team ? "Team follow-ups" : "My follow-ups"}{" "}
            <span className="text-sm text-slate-500">({rows.length})</span>
          </h2>
          <div className="max-h-80 overflow-y-auto mt-3">
            {rows.map((f) => (
              <div
                key={f.id}
                className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 border-b border-slate-200 py-3 text-sm"
              >
                <Link className="underline" href={`/leads/${f.lead.id}`}>
                  {f.lead.lead_code} {f.lead.company_name}
                </Link>
                <span className="text-slate-600">
                  {team && (
                    <span className="block font-semibold">
                      {f.rep?.name || "Unassigned"}
                    </span>
                  )}
                  Due {f.due_date.slice(0, 10)}
                </span>
              <ScheduleVisitButton leadId={f.lead.id} />
                {canLog && <LeadCall leadId={f.lead.id} />}
              </div>
            ))}
          </div>
          {!rows.length && (
            <p className="text-sm text-slate-500 mt-2">
              No follow-ups scheduled.
            </p>
          )}
        </section>
      )}
      {notices.length > 0 && (
        <section className="workspace-card">
          <h2 className="text-lg font-semibold">Reminders & alerts</h2>
          {notices.map((n) => (
            <Link
              key={n.id}
              className="block border-b py-3 text-sm"
              href={
                n.partner_id
                  ? `/partners?partner_id=${n.partner_id}`
                  : `/leads/${n.lead_id}`
              }
            >
              {n.lead?.lead_code} {n.message}
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
