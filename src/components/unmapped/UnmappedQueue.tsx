"use client";
import { isWonLead } from "@/lib/leads/interest-bucket";
import { ScheduleVisitButton } from "@/components/leads/ScheduleVisitButton";
import { LeadCall } from "@/components/leads/LeadCall";

import React, { useState, useEffect, useCallback } from "react";
import {
  AlertTriangle,
  CheckCircle,
  Phone,
  CheckSquare,
  Square,
} from "lucide-react";
import { formatDistance } from "@/lib/geo";

interface UnmappedLead {
  id: string;
  lead_code?: string;
  company_name: string;
  phone_no?: string | null;
  pin_code?: string | null;
  address?: string | null;
  lat: number | null;
  lng: number | null;
  region?: string | null;
  status: string;
  funnel_status?: string;
  partners?: { partner_status: string }[];
  category?: string | null;
  store_match_kind?: string;
  store_match_candidates?: { id: string; name: string }[];
  nearestStoreSuggestion?: {
    source?: string;
    approximate?: boolean;
    store: { id: string; name: string; radius_km: number };
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

export function UnmappedQueue() {
  const [unmappedLeads, setUnmappedLeads] = useState<UnmappedLead[]>([]);
  const [stores, setStores] = useState<StoreItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStoreId, setBulkStoreId] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const fetchUnmapped = useCallback(
    () =>
      Promise.all([
        fetch("/api/leads?unmapped_only=true").then(async (response) => {
          if (!response.ok) throw new Error("Unable to load leads");
          const data = await response.json();
          setUnmappedLeads(data.leads || []);
        }),
        fetch("/api/stores").then(async (response) => {
          if (!response.ok) throw new Error("Unable to load stores");
          const data = await response.json();
          setStores(data.stores || []);
        }),
      ])
        .catch(console.error)
        .finally(() => setLoading(false)),
    [],
  );

  useEffect(() => {
    fetchUnmapped();
  }, [fetchUnmapped]);

  const handleAssignSingle = async (leadId: string, storeId: string) => {
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assigned_store_id: storeId,
          status: "Assigned",
        }),
      });
      if (res.ok) {
        setUnmappedLeads((prev) => prev.filter((l) => l.id !== leadId));
        setFeedback("Lead store assignment accepted!");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleBulkAssignStore = async () => {
    if (selectedIds.size === 0 || !bulkStoreId) return;
    try {
      setIsProcessing(true);
      const res = await fetch("/api/leads/bulk-assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadIds: Array.from(selectedIds),
          storeId: bulkStoreId,
          status: "Assigned",
        }),
      });

      if (res.ok) {
        setSelectedIds(new Set());
        setFeedback("Selected leads successfully assigned to store!");
        await fetchUnmapped();
      }
    } catch {
      setFeedback("Failed to perform bulk assignment.");
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === unmappedLeads.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(unmappedLeads.map((l) => l.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6 bg-white min-h-screen text-slate-900">
      <p className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-slate-800">
        These leads have no store assigned yet. A valid PIN may already have a
        store suggestion below — accept it to complete assignment. PIN-area
        coverage does not confirm the exact business location.
      </p>
      {loading && (
        <p role="status" className="p-3 text-xs">
          Loading…
        </p>
      )}
      {/* Header */}
      <div className="border-b border-slate-200 pb-5">
        <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
          <AlertTriangle className="w-6 h-6 text-[#ff4500]" />
          FLORZY B2B Unmapped & Catchment Review Queue
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Leads located outside active store catchment radiuses or missing store
          mapping. Review proximity suggestions or override manually.
        </p>
      </div>

      {/* Floating feedback */}
      {feedback && (
        <div className="p-3 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-2xl text-xs font-bold flex items-center justify-between shadow-2xs">
          <span>{feedback}</span>
          <button
            onClick={() => setFeedback(null)}
            className="text-slate-500 hover:text-slate-800"
          >
            ✕
          </button>
        </div>
      )}

      {/* Bulk Action Controls */}
      {selectedIds.size > 0 && (
        <div className="bg-white border border-[#ff4500]/60 rounded-3xl p-4 shadow-xl flex flex-wrap items-center justify-between gap-3 animate-in slide-in-from-top-2">
          <span className="text-xs font-extrabold text-slate-900 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#ff4500]" />
            {selectedIds.size} Leads Selected for Manual Override
          </span>

          <div className="flex items-center gap-2">
            <select
              value={bulkStoreId}
              onChange={(e) => setBulkStoreId(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 text-slate-900 focus:outline-none"
            >
              <option value="">Select Target Store...</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  🏬 {s.name} ({s.region})
                </option>
              ))}
            </select>

            <button
              disabled={isProcessing || !bulkStoreId}
              onClick={handleBulkAssignStore}
              className="px-4 py-1.5 bg-[#ff4500] hover:bg-[#e03e00] text-white rounded-xl text-xs font-bold shadow-md shadow-[#ff4500]/25 cursor-pointer disabled:opacity-50"
            >
              Assign Selected to Store
            </button>
          </div>
        </div>
      )}

      {/* Queue Cards */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-2 text-xs font-bold text-slate-500">
          <div className="flex items-center gap-2">
            <button onClick={toggleSelectAll} className="hover:text-slate-900">
              {selectedIds.size === unmappedLeads.length &&
              unmappedLeads.length > 0 ? (
                <CheckSquare className="w-4 h-4 text-[#ff4500]" />
              ) : (
                <Square className="w-4 h-4 text-slate-400" />
              )}
            </button>
            <span>Select All Unmapped</span>
          </div>
          <span>{unmappedLeads.length} Leads Requiring Review</span>
        </div>

        {unmappedLeads.map((lead) => {
          const isSelected = selectedIds.has(lead.id);

          return (
            <div
              key={lead.id}
              className={`p-4 rounded-3xl bg-white border transition-all ${
                isSelected
                  ? "border-[#ff4500] bg-orange-50/30 shadow-md"
                  : "border-slate-200 hover:border-slate-300 shadow-2xs"
              } flex flex-col md:flex-row md:items-center justify-between gap-4`}
            >
              <div className="flex items-start gap-3 flex-1">
                <button
                  onClick={() => toggleSelect(lead.id)}
                  className="mt-1 text-slate-400 hover:text-slate-900"
                >
                  {isSelected ? (
                    <CheckSquare className="w-4 h-4 text-[#ff4500]" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-300" />
                  )}
                </button>

                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900">
                      {lead.lead_code} {lead.company_name}
                    </h3>
                    <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full border border-slate-200 font-semibold">
                      {lead.category || "General"}
                    </span>
                    <span className="text-[10px] bg-orange-50 text-[#ff4500] font-bold px-2 py-0.5 rounded-full border border-orange-200">
                      Outside All Radii
                    </span>
                  </div>

                  <p className="text-xs text-slate-600">
                    {lead.address || "No street address"}
                  </p>

                  <div className="flex items-center gap-3 text-[11px] text-slate-500 font-mono">
              <ScheduleVisitButton leadId={lead.id} />
                    <span>PIN: {lead.pin_code || "—"}</span>
                    <span>•</span>
                    <span>Region: {lead.region || "Unassigned"}</span>
                    {lead.phone_no && !isWonLead(lead) && (
                      <>
                        <span>•</span>
                        <LeadCall
                          leadId={lead.id}
                          className="text-slate-700 hover:text-[#ff4500] font-semibold flex items-center gap-1"
                        >
                          <Phone className="w-3 h-3 text-slate-400" />
                          {lead.phone_no}
                        </LeadCall>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Nearest store suggestion and quick actions */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 border-t md:border-t-0 md:border-l border-slate-100 pt-3 md:pt-0 md:pl-4">
                {lead.nearestStoreSuggestion ? (
                  <div className="text-left md:text-right text-xs">
                    <span className="text-[10px] text-slate-400 block font-bold uppercase tracking-wider">
                      {lead.nearestStoreSuggestion.source === "service_pin"
                        ? "Service PIN match"
                        : "Nearest Store Suggestion"}
                    </span>
                    <p className="font-bold text-slate-900">
                      🏬 {lead.nearestStoreSuggestion.store.name}
                    </p>
                    <p className="text-[#ff4500] font-mono text-[11px] font-bold">
                      {lead.nearestStoreSuggestion.approximate
                        ? "Approximate PIN area: "
                        : ""}
                      {formatDistance(lead.nearestStoreSuggestion.distanceKm)}{" "}
                      away (Radius:{" "}
                      {lead.nearestStoreSuggestion.store.radius_km} km)
                    </p>
                  </div>
                ) : (
                  <div className="text-xs text-amber-800">
                    {lead.store_match_kind === "overlap"
                      ? `PIN overlaps: ${lead.store_match_candidates?.map((s) => s.name).join(", ")}. Choose store.`
                      : "No location available for a store suggestion"}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  {lead.nearestStoreSuggestion && (
                    <button
                      onClick={() =>
                        handleAssignSingle(
                          lead.id,
                          lead.nearestStoreSuggestion!.store.id,
                        )
                      }
                      className="px-3 py-1.5 bg-[#ff4500] hover:bg-[#e03e00] text-white rounded-xl text-xs font-bold shadow-md shadow-[#ff4500]/25 flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      Accept Nearest
                    </button>
                  )}

                  {/* Manual Store Override Picker */}
                  <select
                    onChange={(e) => {
                      if (e.target.value) {
                        handleAssignSingle(lead.id, e.target.value);
                      }
                    }}
                    className="text-xs bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 text-slate-800 focus:outline-none"
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Manual Override...
                    </option>
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>
                        🏬 {s.name} ({s.region})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          );
        })}

        {unmappedLeads.length === 0 && (
          <div className="p-12 text-center bg-white border border-slate-200 rounded-3xl space-y-2 shadow-sm">
            <CheckCircle className="w-8 h-8 text-emerald-600 mx-auto" />
            <h3 className="text-sm font-bold text-slate-900">Queue Clear!</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              All leads have been successfully mapped to store catchment areas
              or manually assigned.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
