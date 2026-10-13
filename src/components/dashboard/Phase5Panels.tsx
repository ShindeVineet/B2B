"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { SelectableRows } from "@/components/shared/SelectableRows";
type Miss = {
  id: string;
  reason: string;
  note: string | null;
  created_at: string;
  original_date: string;
  new_date: string;
  trip_lead: {
    lead: { lead_code?: string; company_name: string };
    trip: { ground_rep: { id: string; name: string } };
  };
};
type Risk = {
  id: string;
  lead_code?: string; company_name: string;
  status: string;
  region: string | null;
  status_entered_at: string | null;
  store: {
    region: string;
    manager: { id: string; name: string } | null;
  } | null;
};
type Notice = {
  id: string;
  type: string;
  created_at: string;
  missed_visit: {
    trip_lead: {
      lead: { lead_code?: string; company_name: string };
      trip: { ground_rep: { name: string } };
    };
  };
};
export function Phase5Panels({ role }: { role: string }) {
  const [misses, setMisses] = useState<Miss[]>([]),
    [risks, setRisks] = useState<Risk[]>([]),
    [notices, setNotices] = useState<Notice[]>([]),
    [filters, setFilters] = useState({ rep: "", from: "", to: "" }),
    [reps, setReps] = useState<{ id: string; name: string }[]>([]),
    [error, setError] = useState("");
  const manage = ["b2b_head", "regional_manager"].includes(role),
    risk = ["b2b_head", "analyst"].includes(role);
  useEffect(() => {
    if (manage)
      fetch("/api/users?assignable=true")
        .then((r) => r.json())
        .then((d) => setReps(d.users || []))
        .catch(() => {});
  }, [manage]);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const requests = [];
        if (manage)
          requests.push(
            fetch("/api/missed-visits?" + new URLSearchParams(filters)).then(
              async (r) => {
                const d = await r.json();
                if (!r.ok) throw Error(d.error);
                if (active) setMisses(d.events);
              },
            ),
          );
        if (risk)
          requests.push(
            fetch("/api/at-risk").then(async (r) => {
              const d = await r.json();
              if (!r.ok) throw Error(d.error);
              if (active) setRisks(d.leads);
            }),
          );
        if (manage)
          requests.push(
            fetch("/api/notifications").then(async (r) => {
              const d = await r.json();
              if (!r.ok) throw Error(d.error);
              if (active) setNotices(d.notifications);
            }),
          );
        await Promise.all(requests);
        if (active) setError("");
      } catch (e) {
        if (active) setError(String(e));
      }
    }
    void load();
    const timer = setInterval(load, 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [manage, risk, filters]);
  const groups = Object.groupBy(
    risks,
    (l) =>
      `${l.region || l.store?.region || "Unassigned region"} / ${l.store?.manager?.name || "Unassigned manager"}`,
  );
  return (
    <div className="space-y-6">
      <p role="alert">{error}</p>
      {risk && (
        <section className="workspace-card space-y-4">
          <h2 className="text-lg font-bold">At-Risk Leads</h2>
          <p>All leads awaiting manager review or data correction.</p>
          {Object.entries(groups).map(([group, leads]) => (
            <div key={group}>
              <h3 className="font-semibold">{group}</h3>
              <SelectableRows>
                <table className="w-full text-left">
                  <thead>
                    <tr>
                      <th>Lead</th>
                      <th>Status</th>
                      <th>Time in status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads?.map((l) => (
                      <tr key={l.id} data-row-id={l.id}>
                        <td>
                          <Link href={`/leads/${l.id}`}>{l.lead_code} {l.company_name}</Link>
                        </td>
                        <td>{l.status}</td>
                        <td>
                          {l.status_entered_at
                            ? `${Math.max(0, Math.floor((Date.now() - new Date(l.status_entered_at).getTime()) / 3600000))} hours`
                            : "Unknown (historical)"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </SelectableRows>
            </div>
          ))}
          {!risks.length && <p>No at-risk leads.</p>}
        </section>
      )}
      {manage && (
        <>
          <section className="workspace-card space-y-4">
            <h2 className="text-lg font-bold">Missed/Rescheduled Visits</h2>
            <div className="flex flex-wrap gap-3">
              <label>
                Rep
                <select
                  value={filters.rep}
                  onChange={(e) =>
                    setFilters({ ...filters, rep: e.target.value })
                  }
                >
                  <option value="">All</option>
                  {reps.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
              {(["from", "to"] as const).map((k) => (
                <label key={k}>
                  {k}
                  <input
                    type="date"
                    value={filters[k]}
                    onChange={(e) =>
                      setFilters({ ...filters, [k]: e.target.value })
                    }
                  />
                </label>
              ))}
            </div>
            <p>{misses.length} missed visits in the selected range</p>
            <SelectableRows>
              <table className="w-full text-left">
                <thead>
                  <tr>
                    {[
                      "Rep",
                      "Lead",
                      "Reason",
                      "Note",
                      "Logged",
                      "Original date",
                      "New date",
                    ].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {misses.map((m) => (
                    <tr key={m.id} data-row-id={m.id}>
                      <td>{m.trip_lead.trip.ground_rep.name}</td>
                      <td>{m.trip_lead.lead.lead_code} {m.trip_lead.lead.company_name}</td>
                      <td>{m.reason.replaceAll("_", " ")}</td>
                      <td>{m.note}</td>
                      <td>
                        {new Date(m.created_at).toLocaleDateString("en-IN", {
                          timeZone: "Asia/Kolkata",
                        })}
                      </td>
                      <td>{m.original_date.slice(0, 10)}</td>
                      <td>{m.new_date.slice(0, 10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </SelectableRows>
          </section>
          <section className="workspace-card">
            <h2 className="text-lg font-bold">Visit notifications</h2>
            {notices.map((n) => (
              <p key={n.id}>
                {n.type === "rep_missed_pattern"
                  ? "Three missed visits in seven days"
                  : "Visit missed"}{" "}
                • {n.missed_visit.trip_lead.trip.ground_rep.name} •{" "}
                {n.missed_visit.trip_lead.lead.lead_code} {n.missed_visit.trip_lead.lead.company_name} •{" "}
                {new Date(n.created_at).toLocaleString()}
              </p>
            ))}
            {!notices.length && <p>No visit notifications.</p>}
          </section>
        </>
      )}
    </div>
  );
}
