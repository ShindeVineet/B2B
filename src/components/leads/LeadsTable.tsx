"use client";
import { isWonLead } from "@/lib/leads/interest-bucket";
import { ScheduleVisitButton } from "@/components/leads/ScheduleVisitButton";
import { RecheckAllotment } from "./RecheckAllotment";
import { LeadCall } from "@/components/leads/LeadCall";
import { useAuth } from "@/context/AuthContext";

import { fetchAllMapLeads } from "@/lib/map-leads";
import { SelectableRows } from "@/components/shared/SelectableRows";
import Link from "next/link";
import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Search,
  Download,
  Compass,
  UserCheck,
  CheckSquare,
  Square,
  Layers,
  Phone,
  MapPin,
  Plus,
  Sparkles,
} from "lucide-react";
import { STATUS_CONFIG } from "@/lib/lead-status";
import { formatDistance } from "@/lib/geo";
import { ConsultationModal } from "../rep/ConsultationModal";

interface Lead {
  pincode_area?: { primary_areas: string } | null;
  store_visits?: { scheduled_at: string; store: { name: string } }[];
  id: string;
  allotment_changed?: boolean;
  latest_consultation_outcome?: string | null;
  lead_code?: string;
  company_name: string;
  phone_no?: string | null;
  pin_code?: string | null;
  address?: string | null;
  status: string;
  funnel_status?: string;
  partners?: { partner_status: string }[];
  category?: string | null;
  region?: string | null;
  notes?: string | null;
  call_outcome?: string | null;
  assigned_store_id?: string | null;
  assigned_ground_rep_id?: string | null;
  store?: { id: string; name: string } | null;
  ground_rep?: { id: string; name: string } | null;
  store_match_kind?: string;
  store_match_candidates?: { id: string; name: string }[];
  nearestStoreSuggestion?: {
    source?: string;
    approximate?: boolean;
    store: { id: string; name: string };
    distanceKm: number | null;
    isWithinRadius: boolean;
  } | null;
  isWithinCatchment?: boolean;
}

interface StoreItem {
  id: string;
  name: string;
  region: string;
}

interface RepItem {
  id: string;
  name: string;
  store_id?: string | null;
}

export function LeadsTable() {
  const { user } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stores, setStores] = useState<StoreItem[]>([]);
  const [reps, setReps] = useState<RepItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [regionFilter, setRegionFilter] = useState("All");
  const [storeFilter, setStoreFilter] = useState("All");

  const [columnFilters, setColumnFilters] = useState<Record<string, string>>(
    {},
  );

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Bulk action states
  const [bulkStoreId, setBulkStoreId] = useState("");
  const [bulkRepId, setBulkRepId] = useState("");
  const [bulkStatus, setBulkStatus] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Modals
  const [consultationLead, setConsultationLead] = useState<Lead | null>(null);

  const fetchLeads = useCallback(
    () =>
      Promise.all([
        fetchAllMapLeads<Lead>().then(setLeads),
        fetch("/api/stores").then(async (response) => {
          if (!response.ok) throw new Error("Unable to load stores");
          const data = await response.json();
          setStores(data.stores || []);
        }),
        fetch("/api/users?assignable=true").then(async (response) => {
          if (!response.ok) throw new Error("Unable to load users");
          const data = await response.json();
          setReps(data.users || []);
        }),
      ])
        .catch(console.error)
        .finally(() => setLoading(false)),
    [],
  );

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  // Client-side filtering
  const filteredLeads = useMemo(() => leads.filter((lead) => {
    for (const [key, value] of Object.entries(columnFilters)) {
      if (!value) continue;
      const actual =
        key === "rep"
          ? lead.assigned_ground_rep_id || "unassigned"
          : String(lead[key as keyof Lead] ?? "");
      if (key === "rep" || key === "category") {
        if (actual !== value) return false;
      } else if (!actual.toLowerCase().includes(value.toLowerCase()))
        return false;
    }
    if (statusFilter !== "All" && lead.status !== statusFilter) return false;
    if (regionFilter !== "All" && lead.region !== regionFilter) return false;
    if (storeFilter !== "All") {
      if (storeFilter === "unassigned" && lead.assigned_store_id) return false;
      if (
        storeFilter !== "unassigned" &&
        lead.assigned_store_id !== storeFilter
      )
        return false;
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      const match =
        lead.lead_code?.toLowerCase().includes(q) ||
        lead.company_name?.toLowerCase().includes(q) ||
        lead.phone_no?.includes(q) ||
        lead.pin_code?.includes(q) ||
        lead.address?.toLowerCase().includes(q) ||
        lead.pincode_area?.primary_areas.toLowerCase().includes(q) ||
        lead.category?.toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  }), [leads, columnFilters, statusFilter, regionFilter, storeFilter, search]);
  const filterKey = JSON.stringify([columnFilters, statusFilter, regionFilter, storeFilter, search, pageSize]);
  const [previousFilterKey, setPreviousFilterKey] = useState(filterKey);
  if (previousFilterKey !== filterKey) {
    setPreviousFilterKey(filterKey);
    setPage(1);
  }
  const pageCount = Math.max(1, Math.ceil(filteredLeads.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageLeads = filteredLeads.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const allPageSelected = pageLeads.length > 0 && pageLeads.every(lead => selectedIds.has(lead.id));

  const toggleSelectAll = () => {
    setSelectedIds(previous => {
      const next = new Set(previous);
      for (const lead of pageLeads) {
        if (allPageSelected) next.delete(lead.id);
        else next.add(lead.id);
      }
      return next;
    });
  };

  const toggleSelectLead = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleBulkAssign = async (autoNearest = false) => {
    if (selectedIds.size === 0) return;
    try {
      setIsProcessing(true);
      setActionMessage(null);

      const res = await fetch("/api/leads/bulk-assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadIds: Array.from(selectedIds),
          storeId: bulkStoreId || undefined,
          repId: bulkRepId || undefined,
          status: bulkStatus || undefined,
          autoAssignToNearest: autoNearest,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setActionMessage(
          `Success: ${data.assignedCount} leads assigned. ${data.message || ""}`,
        );
        setSelectedIds(new Set());
        await fetchLeads();
      } else {
        const err = await res.json();
        setActionMessage(`Error: ${err.error}`);
      }
    } catch {
      setActionMessage("Bulk operation failed.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Single Lead Auto Assign
  const handleSingleAutoAssign = async (leadId: string) => {
    try {
      setIsProcessing(true);
      const res = await fetch("/api/leads/bulk-assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadIds: [leadId],
          storeId: leads.find((l) => l.id === leadId)?.nearestStoreSuggestion
            ?.store.id,
        }),
      });
      if (res.ok) {
        setActionMessage(`Assigned lead to the selected store.`);
        await fetchLeads();
      } else {
        const d = await res.json();
        setActionMessage(d.error || "Unable to assign store");
      }
    } catch {
      setActionMessage("Failed to auto-assign lead.");
    } finally {
      setIsProcessing(false);
    }
  };

  const exportFilteredCSV = () => {
    if (filteredLeads.length === 0) return;

    const headers = [
      "Company Name",
      "Phone",
      "PIN Code",
      "Address",
      "Status",
      "Category",
      "Region",
      "Assigned Store",
      "Assigned Ground Rep",
      "Call Outcome",
      "Notes",
    ];

    const rows = filteredLeads.map((l) => [
      `"${(l.company_name || "").replace(/"/g, '""')}"`,
      `"${l.phone_no || ""}"`,
      `"${l.pin_code || ""}"`,
      `"${(l.address || "").replace(/"/g, '""')}"`,
      `"${l.status || ""}"`,
      `"${l.category || ""}"`,
      `"${l.region || ""}"`,
      `"${l.store?.name || "Unassigned"}"`,
      `"${l.ground_rep?.name || "Unassigned"}"`,
      `"${l.call_outcome || ""}"`,
      `"${(l.notes || "").replace(/"/g, '""')}"`,
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((r) => r.join(",")),
    ].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `florzy_b2b_export_${new Date().toISOString().slice(0, 10)}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const regions = Array.from(
    new Set(leads.map((l) => l.region).filter(Boolean)),
  );

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6 bg-white min-h-screen text-slate-900">
      {loading && (
        <p role="status" className="p-3 text-xs">
          Loading…
        </p>
      )}
      {["b2b_head", "regional_manager"].includes(user?.role || "") && (
        <div className="space-y-3">
          
          <RecheckAllotment
            leadIds={
              selectedIds.size
                ? [...selectedIds]
                : filteredLeads.map((l) => l.id)
            }
            onSaved={() => void fetchLeads()}
          />
        </div>
      )}
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <Layers className="w-6 h-6 text-[#ff4500]" />
            FLORZY B2B Leads Pipeline & Funnel
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Browse, filter, search, and bulk-assign leads to stores and ground
            reps.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">

          <button
            onClick={exportFilteredCSV}
            className="px-3.5 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV ({filteredLeads.length})
          </button>

          <a
            href="/import"
            className="px-4 py-2 bg-[#ff4500] hover:bg-[#e03e00] text-white rounded-xl text-xs font-bold shadow-md shadow-[#ff4500]/25 flex items-center gap-1.5 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            Import Leads
          </a>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 rounded-xl border border-slate-200 bg-white p-3">
        {[
          ["company_name", "Company"],
          ["phone_no", "Contact / phone"],
          ["address", "Address"],
          ["pin_code", "PIN code"],
        ].map(([key, label]) => (
          <label key={key} className="text-xs">
            {label}
            <input
              value={columnFilters[key] || ""}
              onChange={(e) =>
                setColumnFilters({ ...columnFilters, [key]: e.target.value })
              }
              className="mt-1 w-full rounded border border-slate-200 p-2"
            />
          </label>
        ))}
        <label className="text-xs">
          Category
          <select
            value={columnFilters.category || ""}
            onChange={(e) =>
              setColumnFilters({ ...columnFilters, category: e.target.value })
            }
            className="mt-1 w-full rounded border p-2"
          >
            <option value="">All categories</option>
            {[...new Set(leads.map((l) => l.category).filter(Boolean))]
              .sort()
              .map((c) => (
                <option key={c} value={c!}>
                  {c}
                </option>
              ))}
          </select>
        </label>
        <label className="text-xs">
          Ground team member
          <select
            value={columnFilters.rep || ""}
            onChange={(e) =>
              setColumnFilters({ ...columnFilters, rep: e.target.value })
            }
            className="mt-1 w-full rounded border p-2"
          >
            <option value="">All members</option>
            <option value="unassigned">Unassigned</option>
            {reps.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={() => {
            setColumnFilters({});
            setSearch("");
            setStatusFilter("All");
            setRegionFilter("All");
            setStoreFilter("All");
          }}
          className="text-xs text-orange-700"
        >
          Clear all filters
        </button>
      </div>
      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
          {/* Search */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search company, phone, PIN, address..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#ff4500]"
            />
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-slate-700 focus:outline-none focus:border-[#ff4500]"
          >
            <option value="All">All Statuses</option>
            {Object.keys(STATUS_CONFIG).map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>

          {/* Store Filter */}
          <select
            value={storeFilter}
            onChange={(e) => setStoreFilter(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-slate-700 focus:outline-none focus:border-[#ff4500]"
          >
            <option value="All">All Stores</option>
            <option value="unassigned">⚠️ Unassigned to Store</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                🏬 {s.name}
              </option>
            ))}
          </select>

          {/* Region Filter */}
          <select
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-slate-700 focus:outline-none focus:border-[#ff4500]"
          >
            <option value="All">All Regions</option>
            {regions.map((r) => (
              <option key={r} value={r!}>
                {r}
              </option>
            ))}
          </select>
        </div>

        <div className="text-xs font-semibold text-slate-500">
          Showing{" "}
          <span className="text-[#ff4500] font-bold">
            {filteredLeads.length}
          </span>{" "}
          of <span className="text-slate-900 font-bold">{leads.length}</span>{" "}
          Leads
        </div>
      </div>

      {/* Floating Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="bg-white border border-[#ff4500]/60 rounded-2xl p-4 shadow-xl flex flex-wrap items-center justify-between gap-3 animate-in slide-in-from-top-2 duration-150">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#ff4500] animate-pulse" />
            <span className="text-xs font-extrabold text-slate-900">
              {selectedIds.size} Leads Selected
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              disabled={isProcessing}
              onClick={() => handleBulkAssign(true)}
              className="px-3 py-1.5 bg-[#ff4500] hover:bg-[#e03e00] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-[#ff4500]/25 cursor-pointer disabled:opacity-50"
            >
              <Compass className="w-3.5 h-3.5" />
              Allot Unassigned Leads
            </button>

            <select
              value={bulkStoreId}
              onChange={(e) => setBulkStoreId(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 text-slate-800 focus:outline-none"
            >
              <option value="">Choose Store...</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  🏬 {s.name}
                </option>
              ))}
            </select>

            <select
              value={bulkRepId}
              onChange={(e) => setBulkRepId(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 text-slate-800 focus:outline-none"
            >
              <option value="">Choose Ground Rep...</option>
              {reps
                .filter(
                  (r) =>
                    !bulkStoreId || !r.store_id || r.store_id === bulkStoreId,
                )
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    🚶 {r.name}
                  </option>
                ))}
            </select>

            <select
              value={bulkStatus}
              onChange={(e) => setBulkStatus(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 text-slate-800 focus:outline-none"
            >
              <option value="">Status...</option>
              {Object.keys(STATUS_CONFIG).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            {(bulkStoreId || bulkRepId || bulkStatus) && (
              <button
                disabled={isProcessing}
                onClick={() => handleBulkAssign(false)}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                <UserCheck className="w-3.5 h-3.5" />
                Apply Updates
              </button>
            )}

            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-xs text-slate-500 hover:text-slate-800 px-2 py-1 font-semibold"
            >
              Deselect All
            </button>
          </div>
        </div>
      )}

      {actionMessage && (
        <div className="p-3 bg-orange-50 border border-orange-200 text-[#ff4500] text-xs font-bold rounded-xl flex items-center justify-between shadow-2xs">
          <span>{actionMessage}</span>
          <button
            onClick={() => setActionMessage(null)}
            className="text-slate-500 hover:text-slate-900"
          >
            ✕
          </button>
        </div>
      )}

      <nav aria-label="Lead table pagination" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 text-sm">
        <span aria-live="polite">{filteredLeads.length ? (currentPage - 1) * pageSize + 1 : 0}–{Math.min(currentPage * pageSize, filteredLeads.length)} of {filteredLeads.length} leads</span>
        <div className="flex flex-wrap items-center gap-3">
          <label>Rows per page <select className="rounded-lg border p-2" value={pageSize} onChange={e => setPageSize(Number(e.target.value))}>{[25, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}</select></label>
          <button className="rounded-lg border px-3 py-2" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button>
          <span>Page {currentPage} of {pageCount}</span>
          <button className="rounded-lg border px-3 py-2" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Next</button>
        </div>
        <div className="w-full text-xs text-slate-600">The header checkbox selects this page. Selections carry across pages. <button className="underline px-2 py-1" disabled={!filteredLeads.length} onClick={() => setSelectedIds(new Set(filteredLeads.map(lead => lead.id)))}>Select all {filteredLeads.length} filtered leads</button></div>
      </nav>

      {/* Leads Table */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <SelectableRows
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
        >
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 w-10">
                  <button
                    aria-label="Select all leads on this page"
                    onClick={toggleSelectAll}
                    className="text-slate-400 hover:text-slate-900 cursor-pointer"
                  >
                    {allPageSelected ? (
                      <CheckSquare className="w-4 h-4 text-[#ff4500]" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                </th>
                <th className="px-4 py-3">Company & Category</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Location & PIN</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Store Assignment</th>
                <th className="px-4 py-3">Ground Rep</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {pageLeads.map((lead) => {
                const isSelected = selectedIds.has(lead.id);
                const config = STATUS_CONFIG[lead.status] || STATUS_CONFIG.New;

                return (
                  <tr
                    key={lead.id}
                    data-row-id={lead.id}
                    className={`hover:bg-slate-50/80 transition-colors ${
                      isSelected ? "bg-orange-50/50" : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleSelectLead(lead.id)}
                        className="text-slate-400 hover:text-slate-900 cursor-pointer"
                      >
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-[#ff4500]" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    </td>

                    {/* Company & Category */}
                    <td className="px-4 py-3">
                      <Link
                        href={`/leads/${lead.id}`}
                        className="font-bold text-slate-900 text-xs leading-snug underline"
                      >
                        {lead.lead_code} {lead.company_name}
                      </Link>
                      {lead.allotment_changed && (
                        <p className="text-xs text-amber-800">
                          Suggested store changed from{" "}
                          {lead.store?.name || "Unassigned"} to{" "}
                          {lead.nearestStoreSuggestion?.store.name}. Review
                          allotment.
                        </p>
                      )}
                      {lead.latest_consultation_outcome ===
                        "On-boarding Done" && (
                        <a
                          href={`/partners?lead_id=${lead.id}`}
                          className="ml-2 text-blue-700 underline text-xs"
                        >
                          Start Onboarding
                        </a>
                      )}
                      <span className="text-[10px] text-[#ff4500] font-bold">
                        {lead.category || "General"}
                      </span>
                    </td>

                    {/* Contact */}
                    <td className="px-4 py-3">
                      <ScheduleVisitButton leadId={lead.id} onSaved={() => void fetchLeads()} />
              {lead.store_visits?.[0] && <p className="text-xs text-orange-800 mt-2">Visit date: {new Date(lead.store_visits[0].scheduled_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST · {lead.store_visits[0].store.name}</p>}
                      {isWonLead(lead) ? <span className="text-xs">{lead.phone_no || "—"}</span> : lead.phone_no ? (
                        <LeadCall
                          leadId={lead.id}
                          className="text-slate-700 hover:text-[#ff4500] font-mono text-xs flex items-center gap-1 font-semibold"
                        >
                          <Phone className="w-3 h-3 text-slate-400" />
                          {lead.phone_no}
                        </LeadCall>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    {/* Location & PIN */}
                    <td className="px-4 py-3">
                      <p className="truncate max-w-xs text-slate-700 text-xs">
                        {lead.address || "—"}
                        {lead.pincode_area && <span className="block mt-1 text-orange-800">PIN area: {lead.pincode_area.primary_areas}</span>}
                      </p>
                      <span className="font-mono text-[11px] text-slate-500">
                        PIN: {lead.pin_code || "—"} (
                        {lead.region || "Unassigned"})
                      </span>
                    </td>

                    {/* Status Badge */}
                    <td className="px-4 py-3">
                      <span
                        className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${config.bg} ${config.text} ${config.border}`}
                      >
                        {config.icon} {lead.status}
                      </span>
                    </td>

                    {/* Store Assignment */}
                    <td className="px-4 py-3">
                      {lead.store ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-slate-900 font-bold flex items-center gap-1">
                            🏬 {lead.store.name}
                          </span>
                        </div>
                      ) : lead.nearestStoreSuggestion ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-slate-600 font-bold">
                              {lead.nearestStoreSuggestion.source ===
                              "service_pin"
                                ? "PIN match:"
                                : "Suggested:"}{" "}
                              {lead.nearestStoreSuggestion.store.name}
                            </span>
                            <button
                              onClick={() => handleSingleAutoAssign(lead.id)}
                              className="px-2 py-0.5 bg-[#ff4500] hover:bg-[#e03e00] text-white rounded text-[10px] font-bold shadow-2xs cursor-pointer"
                              title="Assign to this store"
                            >
                              Assign
                            </button>
                          </div>
                          <span className="text-[10px] text-slate-400 block font-mono">
                            {lead.nearestStoreSuggestion.approximate
                              ? "Approximate PIN area: "
                              : ""}
                            {formatDistance(
                              lead.nearestStoreSuggestion.distanceKm,
                            )}{" "}
                            {lead.nearestStoreSuggestion.isWithinRadius
                              ? "(Inside catchment)"
                              : "(Outside radius)"}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">
                          {lead.store_match_kind === "overlap"
                            ? `PIN overlaps: ${lead.store_match_candidates?.map((s) => s.name).join(", ")} — choose store`
                            : "Unassigned"}
                        </span>
                      )}
                    </td>

                    {/* Ground Rep */}
                    <td className="px-4 py-3">
                      {lead.ground_rep ? (
                        <span className="text-xs text-slate-800 font-bold">
                          🚶 {lead.ground_rep.name}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">
                          {lead.store_match_kind === "overlap"
                            ? `PIN overlaps: ${lead.store_match_candidates?.map((s) => s.name).join(", ")} — choose store`
                            : "Unassigned"}
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setConsultationLead(lead)}
                          className="text-xs text-slate-700 hover:text-[#ff4500] font-bold inline-flex items-center gap-1 cursor-pointer"
                          title="Log field consultation"
                        >
                          <Sparkles className="w-3 h-3 text-[#ff4500]" />
                          Log Visit
                        </button>
                        <a
                          href={`/map`}
                          className="text-[#ff4500] hover:text-[#e03e00] text-xs font-bold inline-flex items-center gap-1"
                        >
                          <MapPin className="w-3 h-3" />
                          Map
                        </a>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </SelectableRows>

        {filteredLeads.length === 0 && (
          <div className="p-8 text-center text-slate-500 text-xs">
            No leads match the specified filters. Try adjusting your search or
            filters.
          </div>
        )}
      </div>


      {/* Consultation Modal */}
      {consultationLead && (
        <ConsultationModal
          lead={consultationLead}
          isOpen={!!consultationLead}
          onClose={() => setConsultationLead(null)}
          onSuccess={() => {
            setActionMessage(
              `Consultation logged for ${consultationLead.lead_code} ${consultationLead.company_name}!`,
            );
            fetchLeads();
          }}
        />
      )}
    </div>
  );
}
