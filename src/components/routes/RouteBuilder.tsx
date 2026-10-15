"use client";
import { RescheduleApprovals } from "./RescheduleApprovals";
import styles from "./RouteBuilder.module.css";
import { DAYS, todayIndia } from "@/lib/phase5/calendar";
import { RescheduleVisit } from "@/components/rep/RescheduleVisit";
import { RoutePreviewCard } from "./RoutePreviewCard";
import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { PageHeader } from "@/components/workspace/PageHeader";
import { DialogOverlay } from "@/components/shared/DialogOverlay";
import { Plus, Route as RouteIcon, Unlink, Trash2 } from "lucide-react";
import { routeLegs, cheapestInsertion } from "@/lib/routes/geometry";
import { orderDay, routeDistance } from "@/lib/clustering/cluster-leads";
import type { ClusterLead } from "@/lib/clustering/cluster-leads";
const Map = dynamic(() => import("./SnapshotMap"), { ssr: false });
type Lead = ClusterLead & {
  company_name: string;
  lead_code: string;
  pin_code: string | null;
  lead_source?: string | null;
  assigned_ground_rep_id?: string | null;
};
type SavedRoute = {
  id: string;
  name: string;
  status: string;
  updated_at: string;
  batch_id: string;
  remainder_lead_ids: string[] | null;
  total_distance_km: number;
  ground_rep_id: string | null;
  route_date: string | null;
  leads: { lead: Lead; lead_id: string; sequence_order: number }[];
  visits: {
    id: string;
    lead_id: string;
    status: string;
    completed: boolean;
    scheduled_date: string;
    trip: { ground_rep_id: string; end_date: string; leads_per_day: number };
    consultation: { visit_date: string; rep: { name: string } } | null;
  }[];
};
type Preview = {
  routes: ClusterLead[][];
  remainder: string[];
  improvement_percent: number;
  before: number;
  after: number;
};
async function api(url: string, body?: object, method = "POST") {
  const r = await fetch(
    url,
    body
      ? {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  const d = await r.json();
  if (!r.ok) throw Error(d.error);
  return d;
}
export function RouteBuilder() {
  const [routeTab, setRouteTab] = useState("planning");
  const [filterPairs, setFilterPairs] = useState<
    { pin_code: string | null; region: string | null; area: string }[]
  >([]);
  const [excluded, setExcluded] = useState<
    { id: string; company_name: string; reason: string }[]
  >([]);
  const [poolGroup, setPoolGroup] = useState("available");
  const [routes, setRoutes] = useState<SavedRoute[]>([]),
    [pool, setPool] = useState<Lead[]>([]),
    [stores, setStores] = useState<{ id: string; name: string }[]>([]),
    [reps, setReps] = useState<
      { id: string; name: string; assigned_store?: { name: string } | null }[]
    >([]);
  const [pins, setPins] = useState<string[]>([]),
    [pinSearch, setPinSearch] = useState(""),
    [region, setRegion] = useState(""),
    [store, setStore] = useState(""),
    [n, setN] = useState(10),
    [k, setK] = useState(""),
    [batch, setBatch] = useState(false);
  const [bounds, setBounds] = useState<{
    south: number;
    north: number;
    west: number;
    east: number;
  } | null>(null);
  const [areaMessage, setAreaMessage] = useState("");
  const [generationError, setGenerationError] = useState("");
  const [showAssignedOnMap, setShowAssignedOnMap] = useState(false);
  const [remainderLeads, setRemainderLeads] = useState<Lead[]>([]);
  const [selectedRouteIds, setSelectedRouteIds] = useState<Set<string>>(
    new Set(),
  );
  const [preview, setPreview] = useState<Preview | null>(null),
    [previewIndex, setPreviewIndex] = useState(0),
    [selection, setSelection] = useState<Set<string>>(new Set()),
    [active, setActive] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [status, setStatus] = useState("");
  const [addId, setAddId] = useState(""),
    [leadSearch, setLeadSearch] = useState(""),
    [searchResults, setSearchResults] = useState<Lead[]>([]),
    [repId, setRepId] = useState(""),
    [date, setDate] = useState(todayIndia()),
    [target, setTarget] = useState("");
  const [confirm, setConfirm] = useState<{
    route: SavedRoute;
    body: Record<string, unknown>;
    message: string;
  } | null>(null);
  const visiblePool = pool.filter(
    (l) =>
      Boolean(
        (l as Lead & { assigned_ground_rep_id?: string })
          .assigned_ground_rep_id,
      ) ===
      (poolGroup === "assigned"),
  );
  const mapPool = pool.filter(
    (lead) => showAssignedOnMap || !lead.assigned_ground_rep_id,
  );
  const current = routes.find((r) => r.id === active);
  async function refresh() {
    const d = await api("/api/route-plans");
    setRoutes(d.routes);
  }
  async function loadPool() {
    setAreaMessage("");
    setShowAssignedOnMap(false);
    const params = new URLSearchParams({ pool: "true", store, region });
    for (const pincode of pins) params.append("pincode", pincode);
    const d = await api("/api/route-plans?" + params);
    setPool(d.leads);
    setExcluded(d.excluded_leads || []);
    setSelection(
      new Set(
        d.leads
          .filter(
            (l: Lead & { assigned_ground_rep_id?: string }) =>
              !l.assigned_ground_rep_id,
          )
          .map((l: Lead) => l.id),
      ),
    );
    setPreview(null);
    const calling = (d.calling_queue || []) as { pin_code: string | null; count: number }[];
    const callingText = calling.length
      ? ` Calling Queue: ${calling.map((row) => `${row.pin_code || "no PIN"} has ${row.count}`).join(", ")}. These leads are not shown in Route Builder until their location is completed.`
      : "";
    setNotice(
      `${d.total} leads match these filters: ${d.leads.filter((l: Lead & { assigned_ground_rep_id?: string }) => !l.assigned_ground_rep_id).length} available, ${d.leads.filter((l: Lead & { assigned_ground_rep_id?: string }) => l.assigned_ground_rep_id).length} assigned to a person but eligible for scheduling, ${d.excluded} unavailable.${callingText} Only selected eligible leads are used to build routes.`,
    );
  }

  async function searchAndAddLead() {
    const query = leadSearch.trim();
    if (!query) return;
    const params = new URLSearchParams({ pool: "true", search: query });
    const d = await api("/api/route-plans?" + params);
    setSearchResults(d.leads || []);
    if (!(d.leads || []).length)
      setNotice(
        d.calling_queue?.length
          ? "This lead is in Calling Queue and cannot be added until its location is completed."
          : "No route-eligible lead matched that search.",
      );
  }
  useEffect(() => {
    Promise.all([
      api("/api/route-plans"),
      api("/api/stores"),
      api("/api/users?assignable=true"),
      api("/api/route-plans?filters=true"),
    ])
      .then(([r, s, p, f]) => {
        setFilterPairs(f.pairs || []);
        setRoutes(r.routes);
        setActive(
          r.routes.find((r: SavedRoute) =>
            ["draft", "ready"].includes(r.status),
          )?.id || "",
        );
        setStores(s.stores || []);
        setReps(p.users || []);
      })
      .catch((e) => setError(String(e)));
  }, []);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  const area = {
    pincodes: pins,
    store,
    region,
    bounds,
    label:
      (pins.length ? pins.join(", ") : "") ||
      stores.find((s) => s.id === store)?.name ||
      region ||
      "Selected area",
  };
  async function generate(save = false) {
    const routesRequested = batch
      ? k === ""
        ? Math.floor(selection.size / n)
        : Number(k)
      : 1;
    const needed = routesRequested * n;
    if (!Number.isInteger(n) || n < 1 || n > 100) {
      setGenerationError("Leads per route must be a whole number from 1 to 100.");
      return;
    }
    if (!Number.isInteger(routesRequested) || routesRequested < 1) {
      setGenerationError("There are not enough selected leads to create a complete route. Select more leads or reduce leads per route.");
      return;
    }
    if (routesRequested > 1000) {
      setGenerationError("Route count cannot exceed 1,000 routes in one batch.");
      return;
    }
    if (needed > selection.size) {
      setGenerationError(`This setup needs ${needed} leads (${routesRequested} routes × ${n} leads), but only ${selection.size} are selected. Reduce the route count or leads per route, or select ${needed - selection.size} more leads.`);
      return;
    }
    setGenerationError("");
    await run(async () => {
      const d = await api("/api/route-plans", {
        lead_ids: [...selection],
        leads_per_route: n,
        ...(k !== "" ? { route_count: Number(k) } : {}),
        single: !batch,
        area_filter: area,
        preview: !save,
        ...(save && preview
          ? {
              expected_routes: preview.routes,
              expected_remainder: preview.remainder,
            }
          : {}),
      });
      setPreview(d);
      setPreviewIndex(0);
      if (save) {
        await refresh();
        setActive(d.ids[0]);
        setPreview(null);
        setNotice(
          "Route saved. Leads outside the saved route remain unassigned and available for another route.",
        );
      }
    });
  }
  async function action(r: SavedRoute, body: Record<string, unknown>) {
    await run(async () => {
      await api(
        `/api/route-plans/${r.id}`,
        { ...body, updated_at: r.updated_at },
        "PATCH",
      );
      setConfirm(null);
      if (["assign", "unassign", "completed"].includes(String(body.action)))
        setStatus("");
      if (body.action === "assign") setRouteTab("assigned");
      if (body.action === "unassign") setRouteTab("planning");
      if (body.action === "completed") setRouteTab("completed");
      await refresh();
      setNotice(
        "Route updated. Completed visits and consultations are preserved.",
      );
    });
  }
  function request(
    r: SavedRoute,
    body: Record<string, unknown>,
    message: string,
  ) {
    setConfirm({ route: r, body, message });
  }
  async function deleteSelectedRoutes() {
    if (!selectedRouteIds.size) return;
    if (
      !window.confirm(
        `Delete ${selectedRouteIds.size} selected route map${selectedRouteIds.size === 1 ? "" : "s"} and release their reserved leads?`,
      )
    )
      return;
    await run(async () => {
      const deleted = selectedRouteIds.size;
      await api(
        "/api/route-plans",
        { ids: [...selectedRouteIds] },
        "DELETE",
      );
      setSelectedRouteIds(new Set());
      if (selectedRouteIds.has(active)) setActive("");
      await refresh();
      setNotice(`${deleted} route map${deleted === 1 ? "" : "s"} deleted.`);
    });
  }
  useEffect(() => {
    if (!current?.remainder_lead_ids?.length) {
      return;
    }
    let live = true;
    api(`/api/route-plans/${current.id}?remainder=true`)
      .then((d) => {
        if (live) setRemainderLeads(d.leads);
      })
      .catch((e) => setError(String(e)));
    return () => {
      live = false;
    };
  }, [current]);
  const points = current
    ? current.leads.map((m) => ({
        id: m.lead_id,
        lat: m.lead.lat,
        lng: m.lead.lng,
      }))
    : preview?.routes[previewIndex] || [];
  const labels = points.map(
    (p) =>
      current?.leads.find((m) => m.lead_id === p.id)?.lead.company_name ||
      pool.find((l) => l.id === p.id)?.company_name ||
      p.id,
  );
  const legs = routeLegs(points);
  function editPreview(id: string, remove: boolean) {
    if (!preview) return;
    const groups = preview.routes.map((r) => [...r]);
    if (remove)
      groups[previewIndex] = orderDay(
        groups[previewIndex].filter((p) => p.id !== id),
        null,
      );
    else {
      const lead = pool.find((l) => l.id === id);
      if (!lead) return;
      groups[previewIndex] = cheapestInsertion(groups[previewIndex], {
        id: lead.id,
        lat: lead.lat,
        lng: lead.lng,
      }).stops;
    }
    const used = new Set(groups.flat().map((p) => p.id));
    setPreview({
      ...preview,
      routes: groups,
      remainder: batch ? [...selection].filter((id) => !used.has(id)) : [],
      after: groups.reduce((sum, r) => sum + routeDistance(r), 0),
      improvement_percent: 0,
    });
  }

  return (
    <main className="workspace-page space-y-5">
      <PageHeader
        title="Route Builder"
        description="Choose leads, preview your route, then select a team member and visit date—all here."
      />
      <nav aria-label="Route workspace" className="flex gap-2 border-b pb-3">
        {[
          ["planning", "Create & draft routes"],
          ["assigned", "Assigned routes"],
          ["completed", "Completed routes"],
        ].map(([key, label]) => (
          <button
            key={key}
            aria-pressed={routeTab === key}
            onClick={() => {
              setRouteTab(key);
              setStatus("");
              setPreview(null);
              setActive(
                routes.find((r) =>
                  key === "planning"
                    ? ["draft", "ready"].includes(r.status)
                    : r.status === key,
                )?.id || "",
              );
            }}
          >
            {label} (
            {
              routes.filter((r) =>
                key === "planning"
                  ? ["draft", "ready"].includes(r.status)
                  : r.status === key,
              ).length
            }
            )
          </button>
        ))}
      </nav>
      <p role="alert" className="text-red-700">
        {error}
      </p>
      <p role="status">{notice}</p>
      {routeTab === "planning" && (
        <section className="workspace-card space-y-4">
          <h2 className="text-lg font-bold flex gap-2">
            <RouteIcon /> Create Route Map
          </h2>
          <div className="grid gap-3 md:grid-cols-3">
            <details className="relative rounded-lg border p-3">
              <summary className="cursor-pointer font-semibold">
                PIN / area · {pins.length ? `${pins.length} selected` : "All PINs"}
              </summary>
              <div className="mt-3 space-y-2">
                <input
                  aria-label="Search PIN or area"
                  className="w-full"
                  placeholder="Search PIN or area"
                  value={pinSearch}
                  onChange={(e) => setPinSearch(e.target.value)}
                />
                <div className="flex gap-2">
                  <button type="button" onClick={() => setPins([
                    ...new Set(filterPairs.filter((p) => !region || p.region === region).map((p) => p.pin_code).filter((p): p is string => !!p)),
                  ])}>Select all</button>
                  <button type="button" onClick={() => setPins([])}>Clear</button>
                </div>
                <div className="max-h-48 overflow-auto">
              {[
                ...new Set(
                  filterPairs
                    .filter((p) => !region || p.region === region)
                    .map((p) => p.pin_code)
                    .filter((p): p is string => !!p),
                ),
              ].filter((pincode) => {
                const area = filterPairs.find((pair) => pair.pin_code === pincode)?.area || "";
                return `${pincode} ${area}`.toLowerCase().includes(pinSearch.trim().toLowerCase());
              }).map((pincode) => (
                <label className="block py-1 text-sm" key={pincode}>
                  <input
                    type="checkbox"
                    checked={pins.includes(pincode)}
                    onChange={(e) => {
                      setPins((current) =>
                        e.target.checked
                          ? [...current, pincode]
                          : current.filter((value) => value !== pincode),
                      );
                      setPool([]);
                      setBounds(null);
                      setExcluded([]);
                      setNotice("");
                      setSelection(new Set());
                      setPreview(null);
                    }}
                  />{" "}
                  {pincode} · {filterPairs.find((f) => f.pin_code === pincode)?.area || "Area not specified"}
                </label>
              ))}
                </div>
              </div>
            </details>
            <label>
              Store
              <select
                className="w-full"
                value={store}
                onChange={(e) => {
                  setStore(e.target.value);
                  setPool([]);
                  setSelection(new Set());
                  setPreview(null);
                  setBounds(null);
                  setExcluded([]);
                  setNotice("");
                }}
              >
                <option value="">All stores</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Region
              <select
                className="w-full"
                value={region}
                onChange={(e) => {
                  const value = e.target.value;
                  setRegion(value);
                  const regionPins = [
                    ...new Set(
                      filterPairs
                        .filter((p) => p.region === value && p.pin_code)
                        .map((p) => p.pin_code!),
                    ),
                  ];
                  setPins((current) => current.filter((pin) => regionPins.includes(pin)));
                  setPool([]);
                  setBounds(null);
                  setExcluded([]);
                  setNotice("");
                  setSelection(new Set());
                  setPreview(null);
                }}
              >
                <option value="">All regions</option>
                {[
                  ...new Set(filterPairs.map((p) => p.region).filter(Boolean)),
                ].map((r) => (
                  <option key={r} value={r!}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button disabled={busy} onClick={() => void run(loadPool)}>
            Load eligible leads
          </button>
          <div className="rounded-xl border p-3 space-y-2">
            <label className="block font-semibold">
              Search and add a lead manually
              <input
                className="mt-1 w-full"
                placeholder="Lead ID, company, contact, or phone"
                value={leadSearch}
                onChange={(e) => setLeadSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void run(searchAndAddLead);
                  }
                }}
              />
            </label>
            <button disabled={busy || !leadSearch.trim()} onClick={() => void run(searchAndAddLead)}>
              Search eligible leads
            </button>
            {!!searchResults.length && (
              <div className="max-h-40 overflow-auto divide-y">
                {searchResults.map((lead) => (
                  <div className="flex items-center justify-between gap-3 py-2" key={lead.id}>
                    <span className="text-sm">
                      {lead.lead_code} · {lead.company_name} · {lead.pin_code || "no PIN"} · {lead.lead_source || "source unknown"}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setPool((current) =>
                          current.some((row) => row.id === lead.id) ? current : [...current, lead],
                        );
                        setSelection((current) => new Set(current).add(lead.id));
                        setNotice(`${lead.lead_code} was added to the selected route pool.`);
                      }}
                    >
                      Add
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-4 flex-wrap items-end">
            <label>
              Leads per route
              <input
                type="number"
                min={1}
                max={100}
                value={n}
                onChange={(e) => setN(Number(e.target.value))}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={batch}
                onChange={(e) => {
                  setBatch(e.target.checked);
                  setPreview(null);
                }}
              />{" "}
              Multi-route batch
            </label>
            {batch && (
              <label>
                Route count (optional)
                <input
                  type="number"
                  min={1}
                  value={k}
                  placeholder={`Auto: ${Math.floor(selection.size / n) || 0}`}
                  onChange={(e) => setK(e.target.value)}
                />
              </label>
            )}
            <button
              disabled={busy || !selection.size}
              onClick={() => {
                setActive("");
                void generate();
              }}
            >
              Generate / Regenerate preview
            </button>
          </div>
          {generationError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{generationError}</p>}
          {pool.length > 0 && (
            <details>
              <summary>Select leads on the map</summary>
              <div className="flex flex-wrap items-center justify-between gap-3 py-3">
                <p className="text-sm font-semibold" role="status">
                  {selection.size} leads selected · {mapPool.length} eligible leads shown
                </p>
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <input
                    type="checkbox"
                    checked={showAssignedOnMap}
                    onChange={(event) => {
                      const show = event.target.checked;
                      setShowAssignedOnMap(show);
                      setAreaMessage(
                        show
                          ? "Assigned eligible leads are now visible and can be included by rectangle selection."
                          : "Showing only eligible leads that are not assigned to anyone.",
                      );
                      if (!show)
                        setSelection((current) =>
                          new Set(
                            [...current].filter(
                              (id) => !pool.find((lead) => lead.id === id)?.assigned_ground_rep_id,
                            ),
                          ),
                        );
                      setPreview(null);
                    }}
                  />
                  Show assigned leads
                </label>
              </div>
              {areaMessage && (
                <p
                  role={selection.size ? "status" : "alert"}
                  className={`mb-3 rounded-lg border p-3 text-sm ${selection.size ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-300 bg-amber-50 text-amber-900"}`}
                >
                  {areaMessage}
                </p>
              )}
              <Map
                points={mapPool}
                statuses={mapPool.map(() => "pending")}
                labels={mapPool.map((l) => l.company_name)}
                onAreaSelect={(area) => {
                  setBounds(area);
                  const selected = mapPool.filter(
                    (p) =>
                      p.lat >= area.south &&
                      p.lat <= area.north &&
                      p.lng >= area.west &&
                      p.lng <= area.east,
                  );
                  setSelection(new Set(selected.map((p) => p.id)));
                  setAreaMessage(
                    selected.length
                      ? `${selected.length} ${showAssignedOnMap ? "eligible" : "unassigned eligible"} lead${selected.length === 1 ? "" : "s"} selected inside the rectangle.`
                      : `No ${showAssignedOnMap ? "eligible" : "unassigned eligible"} leads were found inside that rectangle. Draw a larger area or select leads from the list below.`,
                  );
                  setPreview(null);
                }}
              />
            </details>
          )}
          {pool.length > 0 && (
            <details>
              <summary>Select pool leads ({selection.size} selected)</summary>
              <div className="flex gap-2 py-3">
                {["available", "assigned"].map((group) => (
                  <button
                    key={group}
                    type="button"
                    aria-pressed={poolGroup === group}
                    onClick={() => setPoolGroup(group)}
                  >
                    {group === "available"
                      ? "Available / no person assigned"
                      : "Assigned to a person"}{" "}
                    (
                    {
                      pool.filter(
                        (l) =>
                          Boolean(
                            (l as Lead & { assigned_ground_rep_id?: string })
                              .assigned_ground_rep_id,
                          ) ===
                          (group === "assigned"),
                      ).length
                    }
                    )
                  </button>
                ))}
              </div>
              <label>
                <input
                  type="checkbox"
                  checked={
                    visiblePool.length > 0 &&
                    visiblePool.every((l) => selection.has(l.id))
                  }
                  onChange={(e) =>
                    setSelection((prev) => {
                      const next = new Set(prev);
                      for (const l of visiblePool) {
                        if (e.target.checked) next.add(l.id);
                        else next.delete(l.id);
                      }
                      return next;
                    })
                  }
                />{" "}
                Select all in this group
              </label>
              <div className="max-h-60 overflow-auto">
                {pool
                  .filter(
                    (l) =>
                      Boolean(
                        (l as Lead & { assigned_ground_rep_id?: string })
                          .assigned_ground_rep_id,
                      ) ===
                      (poolGroup === "assigned"),
                  )
                  .map((l) => (
                    <label className="block p-2" key={l.id}>
                      <input
                        type="checkbox"
                        checked={selection.has(l.id)}
                        onChange={(e) =>
                          setSelection((prev) => {
                            const s = new Set(prev);
                            if (e.target.checked) s.add(l.id);
                            else s.delete(l.id);
                            return s;
                          })
                        }
                      />{" "}
                      {l.lead_code} {l.company_name} · {l.pin_code}
                    </label>
                  ))}
              </div>
            </details>
          )}
          {!!excluded.length && (
            <details className="rounded-xl border p-4">
              <summary>
                Unavailable leads ({excluded.length}) — view reasons
              </summary>
              <div className="max-h-64 overflow-auto divide-y">
                {excluded.map((l) => (
                  <p className="py-2 text-sm" key={l.id}>
                    <strong>{l.company_name}</strong> · {l.reason}
                  </p>
                ))}
              </div>
            </details>
          )}
          {preview && !current && (
            <div className="space-y-3">
              <p>
                {preview.routes.length} routes · {preview.remainder.length}{" "}
                selected-pool leads outside this preview. The shortest compact
                complete {preview.routes.length === 1 ? "route was" : "routes were"}{" "}
                chosen from the full selection.
              </p>
              {preview.improvement_percent >= 1 && (
                <p>
                  Refinement reduced total travel distance by{" "}
                  {preview.improvement_percent.toFixed(1)}% (
                  {preview.before.toFixed(2)} → {preview.after.toFixed(2)} km).
                </p>
              )}
              {!!preview.remainder.length && (
                <label className="block text-sm font-semibold">
                  Unassigned leads ({preview.remainder.length})
                  <textarea
                    className="mt-1 block h-20 w-full resize-y rounded-lg border bg-slate-50 p-2 text-xs font-normal"
                    readOnly
                    value={preview.remainder
                      .map((id) => {
                        const lead = pool.find((row) => row.id === id);
                        return lead
                          ? `${lead.lead_code} · ${lead.company_name}`
                          : id;
                      })
                      .join("\n")}
                  />
                  <span className="mt-1 block font-normal text-slate-500">
                    These leads stay unassigned by default and remain available for future routes.
                  </span>
                </label>
              )}
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 max-h-[440px] overflow-y-auto p-1">
                {preview.routes.map((r, i) => (
                  <RoutePreviewCard
                    key={i}
                    name={`${area.label} Route ${i + 1}`}
                    status="Preview"
                    points={r}
                    distance={routeDistance(r)}
                    selected={previewIndex === i}
                    onSelect={() => {
                      setPreviewIndex(i);
                      document
                        .getElementById("route-map-review")
                        ?.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        });
                    }}
                  />
                ))}
              </div>
              <button disabled={busy} onClick={() => void generate(true)}>
                <Plus className="inline w-4" /> Save batch as Draft
              </button>
            </div>
          )}
        </section>
      )}
      {routeTab === "assigned" && (
        <RescheduleApprovals onSaved={() => void refresh()} />
      )}
      <section className="workspace-card space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-lg font-bold">
            {routeTab === "planning"
              ? "Draft routes"
              : routeTab === "assigned"
                ? "Assigned routes"
                : "Completed routes"}
          </h2>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {(routeTab === "planning" ? ["draft", "ready"] : [routeTab]).map(
              (s) => (
                <option key={s}>{s}</option>
              ),
            )}
          </select>
          <button onClick={() => void run(refresh)}>Refresh</button>
          {routeTab === "planning" && selectedRouteIds.size > 0 && (
            <button
              className="border-red-300 text-red-700"
              disabled={busy}
              onClick={() => void deleteSelectedRoutes()}
            >
              <Trash2 className="inline w-4" /> Delete selected ({selectedRouteIds.size})
            </button>
          )}
        </div>
        <p className="text-sm text-slate-500">
          Select a card to review its stops on the map. Distances are
          straight-line estimates.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 max-h-[440px] overflow-y-auto p-1">
          {routes
            .filter((r) =>
              routeTab === "planning"
                ? ["draft", "ready"].includes(r.status)
                : r.status === routeTab,
            )
            .filter((r) => !status || r.status === status)
            .map((r) => (
              <div className="relative" key={r.id}>
                {routeTab === "planning" && (
                  <label className="absolute left-2 top-2 z-10 flex items-center gap-1 rounded-md border bg-white px-2 py-1 text-xs font-semibold shadow-sm">
                    <input
                      aria-label={`Select ${r.name} for deletion`}
                      type="checkbox"
                      checked={selectedRouteIds.has(r.id)}
                      onChange={(event) =>
                        setSelectedRouteIds((currentIds) => {
                          const next = new Set(currentIds);
                          if (event.target.checked) next.add(r.id);
                          else next.delete(r.id);
                          return next;
                        })
                      }
                    />
                    Select
                  </label>
                )}
                <RoutePreviewCard
                  name={r.name}
                  status={r.status}
                  points={r.leads.map((m) => ({
                    lat: m.lead.lat,
                    lng: m.lead.lng,
                  }))}
                  distance={r.total_distance_km}
                  remainder={r.remainder_lead_ids?.length || 0}
                  selected={active === r.id}
                  onSelect={() => {
                    setActive(r.id);
                    setPreview(null);
                    setTarget("");
                    setRepId("");

                    requestAnimationFrame(() =>
                      document
                        .getElementById("route-map-review")
                        ?.scrollIntoView({ behavior: "smooth", block: "start" }),
                    );
                  }}
                />
              </div>
            ))}
        </div>
        {!routes.some((r) => !status || r.status === status) && (
          <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">
            No saved routes{status ? ` with status ${status}` : " yet"}.
            Generate a preview above to get started.
          </p>
        )}
      </section>
      {(current || preview) && (
        <section
          id="route-map-review"
          className={`workspace-card space-y-4 scroll-mt-24 ${styles.review}`}
        >
          <h2 className="text-xl font-bold">
            {current?.name || `Route ${previewIndex + 1} — map preview`}
          </h2>
          <div className={styles.summary}>
            <span>
              <strong>{points.length}</strong> stops
            </span>
            <span>
              <strong>
                {legs.reduce((sum, leg) => sum + leg.km, 0).toFixed(2)} km
              </strong>{" "}
              between stops
            </span>
            <span className={styles.status}>
              {current?.status || "Preview"}
            </span>
          </div>
          <p className={styles.note}>
            Straight-line estimates · Actual driving distance and traffic may
            vary.
          </p>
          <div className={styles.reviewGrid}>
            <Map
              points={points}
              statuses={points.map((p) =>
                current?.visits.some(
                  (v) =>
                    v.lead_id === p.id &&
                    (v.status === "visited" || v.completed),
                )
                  ? "visited"
                  : "pending",
              )}
              labels={labels}
            />
            <aside className={styles.itinerary}>
              <div className={styles.itineraryHeader}>
                <h3>Route stops</h3>
                <span>{points.length} locations</span>
              </div>
              <details className={styles.distances}>
                <summary>
                  Travel distance ·{" "}
                  {legs.reduce((sum, leg) => sum + leg.km, 0).toFixed(2)} km
                </summary>
                {legs.map((l) => (
                  <div key={l.from}>
                    <span>
                      Stop {l.from} → {l.to}
                    </span>
                    <strong>{l.km.toFixed(2)} km</strong>
                  </div>
                ))}
              </details>
              <ol className={styles.stopList}>
                {points.map((p, i) => (
                  <li key={p.id} className={styles.stopCard}>
                    <div className={styles.stopHeading}>
                      <span className={styles.stopNumber}>{i + 1}</span>
                      <div>
                        <h4>{labels[i]}</h4>
                        <p>
                          {i === 0
                            ? "Starting stop"
                            : `${legs[i - 1]?.km.toFixed(2) || "0.00"} km from previous stop`}
                        </p>
                      </div>
                    </div>
                    <div className={styles.stopActions}>
                      {!current && preview && (
                        <button
                          className="ml-2"
                          onClick={() => editPreview(p.id, true)}
                        >
                          Remove from preview
                        </button>
                      )}
                      {current && (
                        <button
                          className="ml-2"
                          disabled={busy}
                          onClick={() =>
                            request(
                              current,
                              { action: "remove", lead_id: p.id },
                              "Remove this stop? Pending visits will disappear from the rep’s dashboard; visited records and consultations will remain untouched.",
                            )
                          }
                        >
                          Remove
                        </button>
                      )}
                      {current?.visits
                        .filter(
                          (v) =>
                            v.lead_id === p.id &&
                            !v.completed &&
                            ["pending", "rescheduled"].includes(v.status),
                        )
                        .map((v) => (
                          <div key={v.id} className={styles.visitActions}>
                            <RescheduleVisit
                              id={v.id}
                              onSaved={() => void refresh()}
                            />
                          </div>
                        ))}
                    </div>
                    {current?.visits
                      .filter(
                        (v) =>
                          v.lead_id === p.id &&
                          (v.status === "visited" || v.completed),
                      )
                      .map((v, j) => (
                        <p className="text-sm text-green-800" key={j}>
                          Already visited — consultation filed by{" "}
                          {v.consultation?.rep.name || "the assigned rep"} on{" "}
                          {(
                            v.consultation?.visit_date || v.scheduled_date
                          ).slice(0, 10)}
                          . Read-only.
                        </p>
                      ))}
                  </li>
                ))}
              </ol>
            </aside>
          </div>
          {!current && preview && preview.routes.length > 0 && (
            <div className="flex gap-3">
              <select value={addId} onChange={(e) => setAddId(e.target.value)}>
                <option value="">Add / swap a preview stop</option>
                {pool
                  .filter(
                    (l) =>
                      selection.has(l.id) &&
                      !preview.routes.flat().some((p) => p.id === l.id),
                  )
                  .map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.company_name}
                    </option>
                  ))}
              </select>
              <button
                disabled={!addId}
                onClick={() => {
                  editPreview(addId, false);
                  setAddId("");
                }}
              >
                Insert into preview
              </button>
            </div>
          )}
          {current && (
            <>
              <div className="flex gap-3 flex-wrap">
                <button disabled={busy} onClick={() => void run(loadPool)}>
                  Load eligible leads to add
                </button>
                <select
                  value={addId}
                  onChange={(e) => setAddId(e.target.value)}
                >
                  <option value="">Choose a lead</option>
                  {pool
                    .filter((l) => !points.some((p) => p.id === l.id))
                    .map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.company_name}
                      </option>
                    ))}
                </select>
                <button
                  disabled={!addId || busy}
                  onClick={() =>
                    request(
                      current,
                      { action: "add", lead_id: addId },
                      `Add this lead using the shortest insertion? ${current.status === "assigned" ? "It will be scheduled for this route’s rep/date with the updated route size." : ""}`,
                    )
                  }
                >
                  Add stop
                </button>
              </div>
              {!!current.remainder_lead_ids?.length && (
                <div className="p-4 rounded-xl border border-amber-400 bg-amber-50 space-y-3">
                  <h3 className="font-bold">
                    {current.remainder_lead_ids.length} unassigned leads
                  </h3>
                  <textarea
                    aria-label="Unassigned leads"
                    className="block h-20 w-full resize-y rounded-lg border bg-white p-2 text-xs"
                    readOnly
                    value={current.remainder_lead_ids
                      .map((id) => {
                        const lead = remainderLeads.find((row) => row.id === id);
                        return lead ? `${lead.lead_code} · ${lead.company_name}` : id;
                      })
                      .join("\n")}
                  />
                  <p className="text-sm text-slate-700">
                    They will stay unassigned by default when this route is assigned.
                  </p>
                  <select
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                  >
                    <option value="">Choose a batch route</option>
                    {routes
                      .filter(
                        (r) =>
                          r.batch_id === current.batch_id &&
                          r.status === "draft",
                      )
                      .map((r) => {
                        let ordered = r.leads.map((m) => ({
                          id: m.lead_id,
                          lat: m.lead.lat,
                          lng: m.lead.lng,
                        }));
                        let impact = 0;
                        let known = true;
                        for (const id of current.remainder_lead_ids || []) {
                          const l = remainderLeads.find((p) => p.id === id);
                          if (!l) {
                            known = false;
                            break;
                          }
                          const inserted = cheapestInsertion(ordered, l);
                          ordered = inserted.stops;
                          impact += inserted.impact;
                        }
                        return (
                          <option key={r.id} value={r.id}>
                            {r.name}
                            {known
                              ? ` (+${impact.toFixed(2)} km)`
                              : " (load remainder details for distance)"}
                          </option>
                        );
                      })}
                  </select>
                  <button
                    disabled={!target || busy}
                    onClick={() =>
                      void action(current, {
                        action: "remainder",
                        choice: "add",
                        target_route_id: target,
                      })
                    }
                  >
                    Add remainder to route
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void action(current, {
                        action: "remainder",
                        choice: "new",
                      })
                    }
                  >
                    Create partial route
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      request(
                        current,
                        { action: "remainder", choice: "defer" },
                        "Leave these remainder leads unassigned and explicitly defer placement?",
                      )
                    }
                  >
                    Leave unassigned
                  </button>
                </div>
              )}
              <div className="flex gap-3 flex-wrap">
                {current.status === "assigned" && (
                  <>
                    <button
                      disabled={busy}
                      onClick={() =>
                        request(
                          current,
                          { action: "unassign" },
                          "Move to Unassigned? Pending visits will be removed; completed visits and consultations stay under the original rep.",
                        )
                      }
                    >
                      <Unlink className="inline w-4" /> Move to Unassigned
                    </button>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void action(current, { action: "completed" })
                      }
                    >
                      Mark completed
                    </button>
                  </>
                )}
                {["draft", "ready"].includes(current.status) && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      request(
                        current,
                        { action: "delete" },
                        "Delete this route and release its reserved leads?",
                      )
                    }
                  >
                    <Trash2 className="inline w-4" /> Delete route
                  </button>
                )}
              </div>
              {["draft", "ready"].includes(current.status) && (
                <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 space-y-4">
                  <h3 className="font-bold text-lg">Assign this route</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label>
                      Team member
                      <select
                        className="w-full"
                        value={repId}
                        onChange={(e) => {
                          setRepId(e.target.value);
                        }}
                      >
                        <option value="">Choose a team member</option>
                        {reps.map((rep) => (
                          <option key={rep.id} value={rep.id}>
                            {rep.name}
                            {rep.assigned_store
                              ? ` · ${rep.assigned_store.name}`
                              : " · Store required"}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Visit date
                      <input
                        className="w-full"
                        type="date"
                        value={date}
                        onChange={(e) => {
                          setDate(e.target.value);
                        }}
                      />
                    </label>
                  </div>
                  <p className="text-sm text-slate-600">
                    {current.leads.length} route stops will be assigned. Reps
                    can request another date for manager approval.
                  </p>
                  <button
                    disabled={busy || !repId || !date}
                    onClick={() =>
                      request(
                        current,
                        {
                          action: "assign",
                          rep_id: repId,
                          date,
                          working_days: [...DAYS],
                        },
                        "Assign this route to the selected team member and date?",
                      )
                    }
                  >
                    Assign route
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      )}
      {confirm && (
        <DialogOverlay
          aria-label="Confirm route change"
          className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4"
        >
          <div className="workspace-card max-w-lg w-full space-y-4">
            <h2 className="font-bold">Confirm route change</h2>
            <p>{confirm.message}</p>
            <p role="alert">{error}</p>
            <button
              disabled={busy}
              onClick={() =>
                void action(confirm.route, { ...confirm.body, confirm: true })
              }
            >
              Confirm
            </button>
            <button disabled={busy} onClick={() => setConfirm(null)}>
              Cancel
            </button>
          </div>
        </DialogOverlay>
      )}
    </main>
  );
}
