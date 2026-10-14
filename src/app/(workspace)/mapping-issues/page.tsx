"use client";
import {
  canConfirmImportedLocation,
  savedLocationLink,
} from "@/lib/mapping/saved-location";
import { DialogOverlay } from "@/components/shared/DialogOverlay";
import { inIndia } from "@/lib/location";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/workspace/PageHeader";
import { LeadHistory } from "@/components/leads/LeadHistory";
import { CorrectPin } from "@/components/leads/CorrectPin";
import { SelectableRows } from "@/components/shared/SelectableRows";
type Lead = {
  issue_reasons?: string[];
  id: string;
  google_map_link: string | null;
  updated_at: string;
  lead_code?: string;
  company_name: string;
  pin_code: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  geocode_status: string;
  geocode_issue_reason: string | null;
  geocode_flagged_at: string | null;
  cannot_locate: boolean;
  geocode_candidates:
    { lat: number; lng: number; displayName: string }[] | null;
};
export default function Page() {
  const { user } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]),
    [error, setError] = useState(""),
    [edit, setEdit] = useState<Lead | null>(null),
    [link, setLink] = useState(""),
    [address, setAddress] = useState(""),
    [pin, setPin] = useState(""),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState(new Set<string>());
  const [confirmation, setConfirmation] = useState<Lead[] | null>(null);
  const [notice, setNotice] = useState("");
  const manage = user?.role === "b2b_head" || user?.role === "regional_manager";
  async function refresh() {
    const r = await fetch("/api/mapping-issues");
    const d = await r.json();
    if (!r.ok) throw Error(d.error);
    setLeads(d.leads);
  }
  useEffect(() => {
    const load = () => refresh().catch((e) => setError(String(e)));
    void load();
  }, []);
  async function action(id: string, body: object) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/mapping-issues/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setEdit(null);
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function confirmSelected() {
    if (!confirmation) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/mapping-issues/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leads: confirmation.map((l) => ({
            id: l.id,
            lat: l.lat,
            lng: l.lng,
            updated_at: l.updated_at,
          })),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error);
      setNotice(
        `${result.confirmed} locations confirmed. ${result.skipped} excluded or changed leads were not approved.`,
      );
      setConfirmation(null);
      setSelected(new Set());
      await refresh();
    } catch (error) {
      setError(String(error));
    } finally {
      setBusy(false);
    }
  }
  const excluded =
    confirmation?.filter((l) => !canConfirmImportedLocation(l)) || [];
  const excludedReasons = [
    ...new Set(
      excluded.map((l) =>
        l.cannot_locate
          ? "Cannot locate"
          : l.geocode_issue_reason || l.geocode_status,
      ),
    ),
  ];
  return (
    <main className="workspace-page space-y-5">
      <PageHeader
        title="Mapping Issues"
        description="Resolve uncertain locations before planning visits. Store and rep assignment is managed separately in Unmapped Queue."
      />
      
      <p role="alert">{error}</p>
      <p role="status">{notice}</p>
      {manage && (
        <div className="flex flex-wrap items-center gap-3">
          <label>
            <input
              type="checkbox"
              aria-label="Select all mapping issues"
              checked={
                leads.length > 0 && leads.every((l) => selected.has(l.id))
              }
              onChange={(e) =>
                setSelected(
                  e.target.checked
                    ? new Set(leads.map((l) => l.id))
                    : new Set(),
                )
              }
            />{" "}
            Select all
          </label>
          <span>{leads.filter((l) => selected.has(l.id)).length} selected</span>
          <button
            disabled={
              busy ||
              !leads.some(
                (l) => selected.has(l.id) && canConfirmImportedLocation(l),
              )
            }
            onClick={() =>
              setConfirmation(leads.filter((l) => selected.has(l.id)))
            }
          >
            Confirm selected name-mismatch locations
          </button>
          <p className="text-sm">
            Only imported name mismatches with valid saved coordinates can be
            bulk confirmed.
          </p>
        </div>
      )}
      <SelectableRows selectedIds={selected} onSelectionChange={setSelected}>
        <table className="w-full text-left">
          <thead>
            <tr>
              {[
                "Select",
                "Company",
                "PIN / address",
                "Reason",
                "Candidates",
                "Flagged",
                "Action",
              ].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {leads.map((l) => (
              <tr key={l.id} data-row-id={l.id}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Select ${l.company_name}`}
                    checked={selected.has(l.id)}
                    onChange={(e) =>
                      setSelected((previous) => {
                        const next = new Set(previous);
                        if (e.target.checked) next.add(l.id);
                        else next.delete(l.id);
                        return next;
                      })
                    }
                  />
                </td>
                <td>
                  {l.lead_code} {l.company_name}<div className="mt-2"><LeadHistory leadId={l.id}/></div>
                </td>
                <td>
                  {l.pin_code}
                  <p>{l.address || "No address"}</p>
                </td>
                <td>
                  {(l.issue_reasons || [l.geocode_issue_reason || l.geocode_status || "Needs review"]).map(reason=><p key={reason}>{reason.replaceAll("_", " ")}</p>)}
                  {l.cannot_locate && <p>Cannot locate</p>}
                </td>
                <td>
                  {l.geocode_candidates?.map((c, i) => (
                    <div key={i} className="mb-2">
                      <p>{c.displayName}</p>
                      <a
                        className="underline text-orange-700"
                        target="_blank"
                        rel="noreferrer"
                        href={`https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}`}
                      >
                        Preview
                      </a>
                      {manage && (
                        <button
                          disabled={busy}
                          onClick={() =>
                            action(l.id, { action: "candidate", index: i })
                          }
                        >
                          Use this location
                        </button>
                      )}
                    </div>
                  ))}
                </td>
                <td>
                  {l.geocode_flagged_at
                    ? new Date(l.geocode_flagged_at).toLocaleDateString("en-IN")
                    : "Historical"}
                </td>
                <td>
                  {manage && (
                    <div className="flex flex-col gap-2 min-w-36">
                      {l.geocode_status === "mismatch_flagged" &&
                        inIndia(l) && (
                          <>
                            {savedLocationLink(l.google_map_link) ? (
                              <a
                                className="text-sm underline"
                                href={savedLocationLink(l.google_map_link)!}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Review saved location (Google Maps link)
                              </a>
                            ) : (
                              <span className="text-sm">
                                No saved Google Maps link
                              </span>
                            )}
                            <a
                              className="text-sm underline"
                              href={`https://www.google.com/maps/search/?api=1&query=${l.lat},${l.lng}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Compare saved coordinates
                            </a>
                            <button
                              disabled={busy}
                              className="bg-orange-600 px-3 py-2 rounded-lg"
                              onClick={() =>
                                action(l.id, {
                                  action: "confirm_location",
                                  lat: l.lat,
                                  lng: l.lng,
                                })
                              }
                            >
                              Confirm location
                            </button>
                          </>
                        )}
                      <CorrectPin lead={l} onSaved={() => void refresh()} />
                      <button
                        className="border"
                        onClick={() => {
                          setEdit(l);
                          setAddress(l.address || "");
                          setPin(l.pin_code || "");
                          setLink("");
                        }}
                      >
                        Link / address
                      </button>
                      <button
                        disabled={busy || l.cannot_locate}
                        onClick={() =>
                          action(l.id, { action: "cannot_locate" })
                        }
                      >
                        Cannot locate
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </SelectableRows>
      {!leads.length && !error && (
        <div className="empty-state">No mapping issues to review.</div>
      )}
      {confirmation && (
        <DialogOverlay
          aria-label="Confirm selected locations"
          className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4"
        >
          <div className="workspace-card max-w-lg w-full space-y-4">
            <h2 className="text-lg font-bold">
              Confirm name-mismatch locations?
            </h2>
            <p>
              {confirmation.length - excluded.length} imported name-mismatch
              locations will be approved using their saved coordinates. Confirm
              only after reviewing the Google Maps links and coordinates.
            </p>
            <p>{excluded.length} selected leads will not be approved.</p>
            {excludedReasons.length > 0 && (
              <ul className="list-disc pl-5">
                {excludedReasons.map((reason) => (
                  <li key={reason}>{reason.replaceAll("_", " ")}</li>
                ))}
              </ul>
            )}
            <p>
              Other cases—including not found, invalid or missing coordinates,
              ambiguous matches, and Cannot locate—are excluded. Leads changed
              since this review are also skipped. Do you want to proceed?
            </p>
            <p role="alert">{error}</p>
            <button disabled={busy} onClick={() => void confirmSelected()}>
              Proceed — confirm locations
            </button>
            <button disabled={busy} onClick={() => setConfirmation(null)}>
              Cancel
            </button>
          </div>
        </DialogOverlay>
      )}
      {edit && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Resolve mapping issue"
          className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4"
        >
          <div className="workspace-card max-w-lg w-full space-y-4">
            <h2 className="text-lg font-bold">
              {edit.lead_code} {edit.company_name}
            </h2>
            <label className="block">
              Google Maps link
              <input
                className="w-full mt-2"
                value={link}
                onChange={(e) => setLink(e.target.value)}
              />
            </label>
            <button
              disabled={busy || !link}
              className="bg-orange-600 text-white"
              onClick={() =>
                action(edit.id, { action: "link", google_map_link: link })
              }
            >
              Extract and save verified location
            </button>
            <hr />
            <label className="block">
              Address
              <input
                className="w-full mt-2"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </label>
            <label className="block">
              PIN code
              <input
                className="w-full mt-2"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
              />
            </label>
            <button
              disabled={busy}
              className="border"
              onClick={() =>
                action(edit.id, { action: "rerun", address, pin_code: pin })
              }
            >
              Update address & re-run
            </button>
            <p role="alert">{error}</p>
            <button disabled={busy} onClick={() => setEdit(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
