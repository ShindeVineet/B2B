"use client";
import { ScheduleVisitButton } from "@/components/leads/ScheduleVisitButton";
import { DialogOverlay } from "@/components/shared/DialogOverlay";
import { LeadNavigate } from "@/components/leads/LeadNavigate";
import { LeadCall } from "@/components/leads/LeadCall";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  ConsultationCard,
  type ConsultationRow,
} from "@/components/consultations/ConsultationCard";
import { CallHistory } from "./CallHistory";
import { todayIndia } from "@/lib/phase5/calendar";
type Case = {
  id: string;
  interest_only?: boolean;
  lead_id: string;
  flagged_at: string;
  rules: string[];
  lead: {
    id: string;
    lat: number | null;
    lng: number | null;
    geocode_status: string | null;
    geocode_source: string | null;
    lead_code?: string;
    company_name: string;
    phone_no: string | null;
    region: string | null;
  };
  consultation: ConsultationRow;
};
export function ColdLeads({ compact = false }: { compact?: boolean }) {
  const { user } = useAuth();
  const [now, setNow] = useState(() => Date.now());
  const [cases, setCases] = useState<Case[]>([]),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<Case | null>(null),
    [outcome, setOutcome] = useState("Converted"),
    [notes, setNotes] = useState(""),
    [reason, setReason] = useState(""),
    [date, setDate] = useState(""),
    [busy, setBusy] = useState(false),
    [history, setHistory] = useState<string | null>(null),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(1);
  const manage = ["b2b_head", "regional_manager"].includes(user?.role || "");
  async function refresh() {
    const r = await fetch("/api/cold-leads");
    const d = await r.json();
    if (!r.ok) throw Error(d.error);
    setCases(d.cases);
    setNow(Date.now());
  }
  useEffect(() => {
    const load = () => refresh().catch((e) => setError(String(e)));
    void load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, []);
  const rows = cases.filter((c) =>
    (c.lead.company_name + " " + (c.lead.region || ""))
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">
          Cold Leads{" "}
          <span className="ml-2 rounded-full bg-orange-100 text-orange-700 px-2 py-1 text-xs">
            {cases.length}
          </span>
        </h2>
        {compact && (
          <a href="/cold-leads" className="text-sm underline text-orange-700">
            View full queue
          </a>
        )}
      </div>
      <p className="text-sm text-slate-500">
        Low-interest leads and open escalation cases. Review the latest
        consultation before calling.
      </p>
      {!compact && (
        <input
          className="w-full border rounded-lg p-3"
          placeholder="Search company or region"
          aria-label="Search cold leads"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
        />
      )}
      <p role="alert">{error}</p>
      <div className="grid gap-4 lg:grid-cols-2">
        {(compact
          ? rows.slice(0, 4)
          : rows.slice((page - 1) * 24, page * 24)
        ).map((c) => (
          <article className="workspace-card space-y-3" key={c.id}>
            <div className="flex justify-between gap-3">
              <div>
                <h3 className="font-semibold">
                  {c.lead.lead_code} {c.lead.company_name}
                </h3>
                <p className="text-xs text-slate-500">
                  {c.lead.region || "No region"} ·{" "}
                  {Math.max(
                    0,
                    Math.floor(
                      (now - new Date(c.flagged_at).getTime()) / 86400000,
                    ),
                  )}{" "}
                  days since flagged
                </p>
              </div>
              <span className="text-xs text-amber-800">
                {c.rules.join(" · ")}
              </span>
            </div>
            {c.consultation && (
              <ConsultationCard
                callAction={false}
                navigation={false}
                row={c.consultation}
              />
            )}
            <div className="flex flex-wrap gap-2">
              {(!manage || c.interest_only) && (
                <LeadCall
                  className="border rounded-lg p-3 text-sm"
                  leadId={c.lead_id}
                >
                  Call{" "}
                  {c.consultation?.decision_maker_phone ||
                    c.lead.phone_no ||
                    "—"}
                </LeadCall>
              )}
              <ScheduleVisitButton leadId={c.lead_id} />
              <LeadNavigate lead={c.lead} />
              {manage && !c.interest_only && (
                <button
                  className="bg-orange-600 text-white"
                  onClick={() => {
                    setSelected(c);
                    setOutcome("Converted");
                    setNotes("");
                    setReason("");
                    setDate("");
                    setError("");
                  }}
                >
                  Log Call
                </button>
              )}
              <button
                className="border"
                onClick={() =>
                  setHistory(history === c.lead_id ? null : c.lead_id)
                }
              >
                Call history
              </button>
            </div>
            {history === c.lead_id && <CallHistory leadId={c.lead_id} />}
          </article>
        ))}
      </div>
      {!compact && rows.length > 24 && (
        <div className="flex items-center gap-3">
          <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <span>
            Page {page} of {Math.ceil(rows.length / 24)} · {rows.length} leads
          </span>
          <button
            disabled={page * 24 >= rows.length}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}
      {!cases.length && !error && (
        <div className="empty-state">No cold leads awaiting a call.</div>
      )}
      {selected && (
        <DialogOverlay
          role="dialog"
          aria-modal="true"
          aria-label="Log manager call"
          className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4"
        >
          <form
            className="workspace-card max-w-lg w-full space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                const r = await fetch(
                  `/api/cold-leads/${selected.lead_id}/calls`,
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ outcome, notes, reason, date }),
                  },
                );
                const d = await r.json();
                if (!r.ok) throw Error(d.error);
                setSelected(null);
                await refresh();
              } catch (e) {
                setError(String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            <h2 className="text-lg font-bold">
              Log Call — {selected.lead.lead_code} {selected.lead.company_name}
            </h2>
            <label className="block">
              Outcome
              <select
                className="block w-full mt-2"
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
              >
                {[
                  "Converted",
                  "Reactivated",
                  "Call back later",
                  "Not interested",
                ].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label className="block">
              Notes *
              <textarea
                className="block w-full mt-2"
                required
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
            {outcome === "Not interested" && (
              <label className="block">
                Closed-lost reason *
                <input
                  className="block w-full mt-2"
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
            )}
            {["Reactivated", "Call back later"].includes(outcome) && (
              <label className="block">
                {outcome === "Reactivated"
                  ? "Next follow-up date"
                  : "Callback date"}{" "}
                *
                <input
                  className="block w-full mt-2"
                  type="date"
                  required
                  min={todayIndia()}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
            )}
            <p role="alert">{error}</p>
            <button disabled={busy} className="bg-orange-600 text-white">
              Save call
            </button>{" "}
            <button
              type="button"
              disabled={busy}
              onClick={() => setSelected(null)}
            >
              Cancel
            </button>
          </form>
        </DialogOverlay>
      )}
    </section>
  );
}
