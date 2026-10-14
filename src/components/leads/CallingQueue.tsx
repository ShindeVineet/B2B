"use client";
import { GroupCreatedToggle } from "./GroupCreatedToggle";
import { isWonLead } from "@/lib/leads/interest-bucket";
import { ScheduleVisitButton } from "@/components/leads/ScheduleVisitButton";
import { OriginalLead } from "@/components/leads/OriginalLead";
import { LastContact } from "./LastContact";
import { callingPriority } from "@/lib/last-contact";
import { todayIndia } from "@/lib/phase5/calendar";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { fetchAllMapLeads } from "@/lib/map-leads";
import { LeadCall } from "./LeadCall";
import { PageHeader } from "@/components/workspace/PageHeader";
type Lead = {
  status?: string;
  funnel_status?: string;
  partners?: { partner_status: string }[];
  last_contact_at?: string | null;
  next_follow_up_date?: string | null;
  google_map_link: string | null;
  geocode_issue_reason: string | null;
  location_verified: boolean;
  calling_associate_id: string | null;
  linkedin_data?: Record<string, string> | null;
  linkedin_lead_id?: string | null;
  store_visits?: { scheduled_at: string; store: { name: string } }[];
  id: string;
  lead_code: string;
  company_name: string;
  address: string | null;
  pin_code: string | null;
  phone_no: string | null;
  lead_source: string | null;
  intake_team?: string | null;
  latest_interest_level: string | null;
};
export function CallingQueue() {
  const { user } = useAuth();
  const [revision, setRevision] = useState(0);
  const [rows, setRows] = useState<Lead[]>([]),
    [tab, setTab] = useState("All"),
    [error, setError] = useState(""),
    [edit, setEdit] = useState<Lead | null>(null),
    [page, setPage] = useState(1),
    [busy, setBusy] = useState(false);
  const [locationRows, setLocationRows] = useState<Lead[]>([]),
    [locationTotal, setLocationTotal] = useState(0);
  const load = () => fetchAllMapLeads<Lead>().then(setRows);
  useEffect(() => {
    void load()
      .then(() => {
        if (
          new URLSearchParams(window.location.search).get("tab") === "Location"
        )
          setTab("Location");
      })
      .catch((e) => setError(e.message));
    const refresh = () => {
      setRevision((v) => v + 1);
      void load().catch((e) => setError(e.message));
    };
    window.addEventListener("followups-updated", refresh);
    window.addEventListener("store-visits-updated", refresh);
    return () => {
      window.removeEventListener("followups-updated", refresh);
      window.removeEventListener("store-visits-updated", refresh);
    };
  }, []);
  useEffect(() => {
    if (tab !== "Location") return;
    let live = true;
    fetch("/api/calling-locations?page=" + page)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        if (live) {
          setLocationRows(d.leads);
          setLocationTotal(d.total);
        }
      })
      .catch((e) => setError(e.message));
    return () => {
      live = false;
    };
  }, [tab, page, revision]);
  const filtered = rows.filter(l => !isWonLead(l)).filter((l) =>
    tab === "All"
      ? l.latest_interest_level === "Medium" ||
        l.latest_interest_level === "Low" ||
        l.intake_team === "caller" ||
        l.lead_source === "Phone" ||
        l.lead_source === "CDT" ||
        l.lead_source === "LinkedIn" ||
        l.lead_source === "Walk-in" ||
        (l.geocode_issue_reason === "not_found" &&
          !l.location_verified &&
          !!user &&
          (user.role === "b2b_head" ||
            user.role === "regional_manager" ||
            (user.role === "store_associate" &&
              l.calling_associate_id === user.id)))
      : tab === "CDT" || tab === "Phone" || tab === "LinkedIn" || tab === "Walk-in"
        ? l.lead_source === tab
        : l.latest_interest_level === (tab === "Warm" ? "Medium" : "Low"),
  );
  filtered.sort((a, b) => callingPriority(a, b, todayIndia()));
  return (
    <main className="workspace-page space-y-4">
      <PageHeader
        title="Calling Queue"
        actions={
          <Link href="/walk-in" className="btn">
            Import walk-in lead
          </Link>
        }
        description="Office-phone follow-ups, missing-location calls, CDT and LinkedIn intake. Record calls, complete missing details and submit partner onboarding."
      />
      <p className="rounded-xl border border-orange-100 bg-orange-50 p-3 text-sm text-orange-900">
        Call priority: due follow-ups → no recorded contact → oldest contact.
        Future follow-ups come last. Use Log a call to record whether the call was picked.
      </p>
      <div className="flex flex-wrap gap-3">
        {["All", "Location", "Warm", "Cold", "Phone", "CDT", "LinkedIn", "Walk-in"].map(
          (t) => (
            <button
              key={t}
              className={
                t === tab ? "bg-orange-600 px-4 py-2" : "border px-4 py-2"
              }
              onClick={() => {
                setTab(t);
                setPage(1);
              }}
            >
              {t}
            </button>
          ),
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      {edit && (
        <form
          className="workspace-card space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const r = await fetch(`/api/leads/${edit.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  company_name: edit.company_name,
                  address: edit.address,
                  pin_code: edit.pin_code,
                  phone_no: edit.phone_no,
                  google_map_link: edit.google_map_link,
                }),
              });
              const d = await r.json();
              if (!r.ok) throw Error(d.error);
              setEdit(null);
              await load();
              if (tab === "Location") {
                const response = await fetch(
                  "/api/calling-locations?page=" + page,
                );
                const data = await response.json();
                if (response.ok) {
                  setLocationRows(data.leads);
                  setLocationTotal(data.total);
                }
              }
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <OriginalLead leadId={edit.id} /><h2>Complete alternate / verified details</h2>
          {(
            [
              "company_name",
              "phone_no",
              "address",
              "pin_code",
              "google_map_link",
            ] as const
          ).map((k) => (
            <label key={k} className="block">
              Alternate / verified {k.replaceAll("_", " ")}
              <input
                className="block border p-2 w-full"
                value={edit[k] || ""}
                onChange={(e) => setEdit({ ...edit, [k]: e.target.value })}
              />
            </label>
          ))}
          <button disabled={busy} className="bg-orange-600 p-2">
            Save details
          </button>
          <button type="button" onClick={() => setEdit(null)}>
            Cancel
          </button>
        </form>
      )}
      {tab === "Location" && (
        <p className="rounded-xl bg-orange-50 p-3 text-sm">
          These locations were not found. Call to confirm the address or Google
          Maps link, then update the lead. Confirmed locations leave this queue
          automatically.
        </p>
      )}
      <div className="space-y-3">
        {(tab === "Location"
          ? locationRows
          : filtered.slice((page - 1) * 30, page * 30)
        ).map((l) => (
          <article
            key={l.id}
            className="workspace-card flex flex-wrap justify-between gap-3"
          >
            <div className="min-w-0 flex-1">
              <LastContact leadId={l.id} value={l.last_contact_at} />
              {l.next_follow_up_date && (
                <p className="text-xs font-semibold text-orange-700">
                  Follow-up: {l.next_follow_up_date.slice(0, 10)}
                </p>
              )}
              <Link className="font-semibold underline" href={`/leads/${l.id}`}>
                {l.lead_code} {l.company_name}
              </Link>
              <p>{l.phone_no || "Phone not provided"}</p>
              <p className="text-xs text-slate-500">
                Source: {l.lead_source || "Not recorded"}
              </p>
              {l.store_visits?.[0] && <p className="text-xs text-orange-800 mt-2">Visit date: {new Date(l.store_visits[0].scheduled_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST · {l.store_visits[0].store.name}</p>}
              <p>{l.address || "Location details pending"}</p>
              {l.linkedin_data && (
                <p className="text-sm text-slate-600">
                  {[
                    l.linkedin_data["Email address"],
                    l.linkedin_data.City,
                    l.linkedin_lead_id
                      ? `LinkedIn ID: ${l.linkedin_lead_id}`
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <GroupCreatedToggle leadId={l.id} />
              <ScheduleVisitButton leadId={l.id} />
              <LeadCall
                showHistory
                className="bg-orange-600 text-white px-4 py-2"
                leadId={l.id}
              />
              <button onClick={() => setEdit(l)}>Complete details</button>
              <Link className="underline" href={`/partners?lead_id=${l.id}`}>
                Onboard partner
              </Link>
            </div>
          </article>
        ))}
      </div>
      {!(tab === "Location" ? locationTotal : filtered.length) && (
        <p>No leads in this queue.</p>
      )}
      <div className="flex gap-3">
        <button disabled={page === 1} onClick={() => setPage(page - 1)}>
          Previous
        </button>
        <span>
          {page} /{" "}
          {Math.max(
            1,
            Math.ceil(
              (tab === "Location" ? locationTotal : filtered.length) / 30,
            ),
          )}
        </span>
        <button
          disabled={
            page * 30 >= (tab === "Location" ? locationTotal : filtered.length)
          }
          onClick={() => setPage(page + 1)}
        >
          Next
        </button>
      </div>
    </main>
  );
}
