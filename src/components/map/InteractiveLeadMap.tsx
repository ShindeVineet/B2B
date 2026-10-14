"use client";
import { MapLeadSummary } from "./MapLeadSummary";
import { RecheckAllotment } from "@/components/leads/RecheckAllotment";
import { LeadNavigate } from "@/components/leads/LeadNavigate";
import { useAuth } from "@/context/AuthContext";
import { canPlotLead } from "@/lib/mapping/visibility";
import { inIndia } from "@/lib/location";
import { CorrectPin } from "@/components/leads/CorrectPin";

import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import L from "leaflet";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { fetchAllMapLeads } from "@/lib/map-leads";
import {
  Compass,
  Square,
  X,
  Search,
  UserCheck,
  Eye,
  EyeOff,
  Navigation,
} from "lucide-react";
import { formatDistance, isPointInBoundingBox } from "@/lib/geo";
import { FUNNEL_STATUS_CONFIG } from "@/lib/leads/funnel-status";
const STATUS_CONFIG: Record<string, typeof FUNNEL_STATUS_CONFIG.New> = FUNNEL_STATUS_CONFIG;

interface LeadItem {
  id: string;
  pincode_area?: {
    primary_areas: string;
    ground_team_status: string;
    priority: string;
    store_target: string;
  } | null;
  approximate_pin_area?: { lat: number; lng: number } | null;
  approximate_display?: boolean;
  latest_consultation_outcome?: string | null;
  lead_code?: string;
  company_name: string;
  phone_no?: string | null;
  pin_code?: string | null;
  address?: string | null;
  lat: number | null;
  lng: number | null;
  status: string;
  funnel_status?: string;
  location_verified?: boolean;
  geocode_source?: string | null;
  geocode_status?: string | null;
  category?: string | null;
  lead_source?: string | null;
  region?: string | null;
  website?: string | null;
  google_map_link?: string | null;
  notes?: string | null;
  call_outcome?: string | null;
  assigned_store_id?: string | null;
  assigned_ground_rep_id?: string | null;
  store?: {
    id: string;
    name: string;
    region: string;
    radius_km: number;
  } | null;
  ground_rep?: {
    id: string;
    name: string;
    email: string;
    phone?: string | null;
  } | null;
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
  address: string;
  pin_code: string;
  google_map_link?: string | null;
  lat: number;
  lng: number;
  radius_km: number;
  region: string;
  manager?: { id: string; name: string } | null;
  _count?: { leads: number };
}

interface RepItem {
  id: string;
  name: string;
  region?: string | null;
  store_id?: string | null;
}

export function InteractiveLeadMap() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const storeCirclesLayerRef = useRef<L.LayerGroup | null>(null);
  const storeMarkersLayerRef = useRef<L.LayerGroup | null>(null);
  const selectionBoxLayerRef = useRef<L.Rectangle | null>(null);

  const { user } = useAuth();
  // Data states
  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [stores, setStores] = useState<StoreItem[]>([]);
  const [reps, setReps] = useState<RepItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filter states
  const [selectedRegion, setSelectedRegion] = useState("All");
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedStore, setSelectedStore] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [showLeadPins, setShowLeadPins] = useState(true);
  const [hideAssigned, setHideAssigned] = useState(false);
  const [showCatchmentCircles, setShowCatchmentCircles] = useState(true);

  // Selection states
  const [selectedLead, setSelectedLead] = useState<LeadItem | null>(null);
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(
    new Set(),
  );
  const [isDrawMode, setIsDrawMode] = useState(false);

  // Bulk action states
  const [bulkStoreId, setBulkStoreId] = useState("");
  const [bulkRepId, setBulkRepId] = useState("");
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const [bulkFeedback, setBulkFeedback] = useState<string | null>(null);

  // Fetch data
  const fetchData = useCallback(
    () =>
      Promise.all([
        fetchAllMapLeads<LeadItem>((input, init) =>
          fetch(`${input}&pin_areas=true&compact=true`, init),
        ).then(data => { const rows = data.map(lead => ({ ...lead, status: lead.funnel_status || lead.status })); setLeads(rows); setSelectedLead(current => current ? rows.find(row => row.id === current.id) || current : null); }),
        fetch("/api/stores").then(async (res) => {
          if (!res.ok) throw new Error("Unable to load stores");
          setStores((await res.json()).stores || []);
        }),
        fetch("/api/users?assignable=true").then(async (res) => {
          if (!res.ok) throw new Error("Unable to load reps");
          setReps((await res.json()).users || []);
        }),
      ])
        .catch((error) => setBulkFeedback(error.message))
        .finally(() => setLoading(false)),
    [],
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Initialize Map with 100% Free OpenStreetMap Tiles (NO API Key required)
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: { lat: 12.9716, lng: 77.5946 },
      zoom: 11,
      zoomControl: false,
    });

    L.control.zoom({ position: "bottomright" }).addTo(map);

    // Free standard OpenStreetMap tiles - guaranteed 100% free, no API key needed
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    const storeCircles = L.layerGroup().addTo(map);
    const storeMarkers = L.layerGroup().addTo(map);
    const markers = L.markerClusterGroup({
      maxClusterRadius: 45,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
    }).addTo(map);

    storeCirclesLayerRef.current = storeCircles;
    storeMarkersLayerRef.current = storeMarkers;
    markersLayerRef.current = markers;
    mapInstanceRef.current = map;

    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(mapContainerRef.current);
    return () => {
      observer.disconnect();
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Filter leads with valid coordinates
  const validLocationLeads = useMemo(() => {
    return leads.flatMap((lead) => {
      if (canPlotLead(lead)) return [lead];
      const area = lead.approximate_pin_area;
      if (!area || !canPlotLead(area)) return [];
      return [
        {
          ...lead,
          lat: area.lat,
          lng: area.lng,
          geocode_source: "pincode_dataset",
          approximate_display: true,
        },
      ];
    });
  }, [leads]);

  const filteredLeads = useMemo(() => {
    return validLocationLeads.filter((lead) => {
      if (
        hideAssigned &&
        (lead.assigned_store_id || lead.assigned_ground_rep_id)
      )
        return false;
      if (selectedRegion !== "All" && lead.region !== selectedRegion)
        return false;
      if (selectedStatus !== "All" && lead.status !== selectedStatus)
        return false;
      if (selectedCategory !== "All" && lead.category !== selectedCategory)
        return false;
      if (selectedStore !== "All") {
        if (selectedStore === "unassigned" && lead.assigned_store_id)
          return false;
        if (
          selectedStore !== "unassigned" &&
          lead.assigned_store_id !== selectedStore
        )
          return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          lead.lead_code?.toLowerCase().includes(q) ||
          lead.company_name?.toLowerCase().includes(q) ||
          lead.phone_no?.includes(q) ||
          lead.pin_code?.includes(q) ||
          lead.address?.toLowerCase().includes(q) ||
          lead.category?.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [
    validLocationLeads,
    selectedRegion,
    selectedStatus,
    selectedCategory,
    selectedStore,
    searchQuery,
    hideAssigned,
  ]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !validLocationLeads.length) return;
    map.invalidateSize();
    map.fitBounds(
      L.latLngBounds(
        validLocationLeads.map((lead) => ({ lat: lead.lat!, lng: lead.lng! })),
      ),
      { padding: [45, 45], maxZoom: 14 },
    );
  }, [validLocationLeads]);

  // Counts by status for HUD pills
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { All: validLocationLeads.length };
    Object.keys(STATUS_CONFIG).forEach((st) => (counts[st] = 0));
    validLocationLeads.forEach((l) => {
      if (counts[l.status] !== undefined) counts[l.status]++;
    });
    return counts;
  }, [validLocationLeads]);

  // Render Stores & Catchment Radii with #ff4500 branding
  useEffect(() => {
    if (
      !mapInstanceRef.current ||
      !storeCirclesLayerRef.current ||
      !storeMarkersLayerRef.current
    )
      return;

    storeCirclesLayerRef.current.clearLayers();
    storeMarkersLayerRef.current.clearLayers();

    stores.forEach((store) => {
      if (store.lat == null || store.lng == null) return;

      // 1. Catchment Circle with Florzy orange-red accent
      if (showCatchmentCircles) {
        const circle = L.circle(
          { lat: store.lat, lng: store.lng },
          {
            radius: store.radius_km * 1000,
            color: "#ff4500",
            fillColor: "#ff4500",
            fillOpacity: 0.08,
            weight: 2,
            dashArray: "6, 6",
          },
        );

        circle.bindTooltip(
          `<div class="px-2 py-1 text-xs font-sans">
            <p class="font-bold text-[#ff4500]">🏬 ${store.name}</p>
            <p class="text-slate-700 text-[11px]">Catchment Zone: <b>${store.radius_km} km</b> radius</p>
          </div>`,
          { sticky: true, className: "custom-store-tooltip" },
        );
        storeCirclesLayerRef.current?.addLayer(circle);
      }

      // 2. Distinct Store Icon Marker
      const storeIcon = L.divIcon({
        className: "custom-store-pin",
        html: `
          <div class="relative flex items-center justify-center cursor-pointer group">
            <div class="w-10 h-10 rounded-2xl bg-[#ff4500] text-white shadow-xl shadow-[#ff4500]/40 border-2 border-white flex items-center justify-center transform group-hover:scale-115 transition-all duration-200">
              <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path>
              </svg>
            </div>
            <div class="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap bg-white text-slate-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full border border-slate-200 shadow-md pointer-events-none">
              ${store.name.split(" ")[0]} Hub
            </div>
          </div>
        `,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      });

      const storeMarker = L.marker(
        { lat: store.lat, lng: store.lng },
        { icon: storeIcon, zIndexOffset: 500 },
      );

      // Rich Store Tooltip on Hover
      storeMarker.bindTooltip(
        `
        <div class="p-3 space-y-1.5 font-sans min-w-[220px]">
          <div class="flex items-center justify-between gap-2 border-b border-slate-100 pb-1.5">
            <span class="text-[10px] font-bold uppercase tracking-wider text-[#ff4500] bg-orange-50 px-2 py-0.5 rounded border border-orange-200">
              🏬 Flagship Store
            </span>
            <span class="text-[10px] font-bold text-emerald-600">
              ${store._count?.leads || 0} Leads Mapped
            </span>
          </div>
          <h4 class="font-bold text-slate-900 text-sm leading-tight">${store.name}</h4>
          <p class="text-xs text-slate-600">${store.address}</p>
          <div class="flex items-center justify-between text-[11px] pt-1 text-slate-500 font-mono">
            <span>PIN: ${store.pin_code}</span>
            <span class="text-[#ff4500] font-bold">Catchment: ${store.radius_km} km</span>
          </div>
        </div>
        `,
        {
          direction: "top",
          offset: [0, -22],
          opacity: 1,
          className: "custom-glass-tooltip",
        },
      );

      storeMarkersLayerRef.current?.addLayer(storeMarker);
    });
  }, [stores, showCatchmentCircles]);

  // Render Leads Pins with Rich Hover Tooltips & Animations
  useEffect(() => {
    if (!mapInstanceRef.current || !markersLayerRef.current) return;

    markersLayerRef.current.clearLayers();
    if (!showLeadPins) return;

    filteredLeads.forEach((lead) => {
      if (lead.lat == null || lead.lng == null) return;

      const isSelected = selectedLeadIds.has(lead.id);
      const isCurrent = selectedLead?.id === lead.id;
      const config = STATUS_CONFIG[lead.status] || STATUS_CONFIG.New;

      const markerHtml = `
        <div class="relative group cursor-pointer transform hover:-translate-y-1 transition-all duration-150">
          <div class="w-7 h-7 rounded-full flex items-center justify-center text-white shadow-md transition-all ${
            isSelected
              ? "ring-4 ring-[#ff4500] scale-125 z-40"
              : isCurrent
                ? "ring-4 ring-slate-900 scale-125 z-30"
                : "ring-2 ring-white group-hover:scale-120"
          }" style="${lead.approximate_display ? "border: 2px dashed #92400e;" : ""} background: ${lead.approximate_display ? "#f59e0b" : config.hex}; box-shadow: 0 4px 10px ${config.glow};">
            <span class="text-[11px] font-black leading-none">${lead.approximate_display ? "≈" : config.icon}</span>
          </div>
          ${
            isSelected
              ? `<div class="absolute -top-1 -right-1 w-3.5 h-3.5 bg-[#ff4500] text-white font-black text-[9px] rounded-full flex items-center justify-center shadow">✓</div>`
              : ""
          }
        </div>
      `;

      const icon = L.divIcon({
        className: "custom-lead-pin",
        html: markerHtml,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const marker = L.marker(
        { lat: lead.lat!, lng: lead.lng! },
        {
          icon,
          zIndexOffset: isSelected || isCurrent ? 400 : 100,
        },
      );

      // Rich Hover Tooltip Card
      const storeInfo = lead.store
        ? `<div class="flex items-center gap-1.5 text-xs text-[#ff4500] font-semibold">
             <span>🏬</span>
             <span>Assigned: <b>${lead.store.name}</b></span>
           </div>`
        : lead.nearestStoreSuggestion
          ? `<div class="flex items-center justify-between text-[11px] pt-1">
             <span class="text-slate-500">Nearest Hub:</span>
             <span class="font-bold ${
               lead.nearestStoreSuggestion.isWithinRadius
                 ? "text-emerald-600"
                 : "text-[#ff4500]"
             }">
               ${lead.nearestStoreSuggestion.store.name} (${formatDistance(
                 lead.nearestStoreSuggestion.distanceKm,
               )})
             </span>
           </div>`
          : "";

      const repInfo = lead.ground_rep
        ? `<div class="flex items-center gap-1.5 text-[11px] text-slate-700">
             <span>🚶</span>
             <span>Rep: <b>${lead.ground_rep.name}</b></span>
           </div>`
        : "";

      const tooltipContent = `
        <div class="p-3.5 space-y-2 font-sans min-w-[240px] max-w-[300px]">
          <!-- Header -->
          <div class="flex items-start justify-between gap-2">
            <div class="space-y-0.5 flex-1">
              <h4 class="font-extrabold text-slate-900 text-sm leading-snug truncate">${lead.lead_code} ${lead.company_name}</h4>
              <span class="text-[10px] text-[#ff4500] font-bold block">${lead.category || "General B2B"}</span>
            </div>
            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full border ${config.bg} ${config.text} ${config.border} flex-shrink-0">
              ${config.icon} ${lead.status}
            </span>
          </div>

          ${lead.approximate_display ? '<p class="text-xs font-bold text-amber-800">Approximate PIN area — exact location pending</p>' : ""}
          <!-- Location & Contact -->
          <div class="text-[11px] text-slate-600 space-y-1 bg-slate-50 p-2 rounded-xl border border-slate-200">
            ${lead.address ? `<p class="truncate text-slate-600 leading-tight">${lead.address}</p>` : ""}
            <div class="flex items-center justify-between text-slate-500 font-mono text-[10px]">
              <span>PIN: ${lead.pin_code || "N/A"}</span>
              ${lead.phone_no ? `<span class="text-emerald-700 font-bold">📞 ${lead.phone_no}</span>` : ""}
            </div>
          </div>

          <!-- Proximity & Store Matching -->
          <div class="space-y-1">
            ${storeInfo}
            ${repInfo}
          </div>

          <!-- Click Prompt -->
          <div class="pt-1.5 border-t border-slate-100 text-[10px] text-[#ff4500] font-bold flex items-center justify-between">
            <span>Click to inspect & assign</span>
            <span>→</span>
          </div>
        </div>
      `;

      marker.bindTooltip(tooltipContent, {
        direction: "top",
        offset: [0, -16],
        opacity: 1,
        className: "custom-glass-tooltip",
      });

      marker.on("click", () => {
        setSelectedLead(lead);
      });

      markersLayerRef.current?.addLayer(marker);
    });
  }, [filteredLeads, selectedLeadIds, selectedLead, showLeadPins]);

  // Spatial Draw Selection Tool
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (!isDrawMode) {
      map.dragging.enable();
      if (selectionBoxLayerRef.current) {
        selectionBoxLayerRef.current.remove();
        selectionBoxLayerRef.current = null;
      }
      return;
    }

    map.dragging.disable();

    let startPoint: L.LatLng | null = null;
    let tempRect: L.Rectangle | null = null;

    const onMouseDown = (e: L.LeafletMouseEvent) => {
      startPoint = e.latlng;
      if (tempRect) tempRect.remove();
      const bounds = L.latLngBounds(startPoint, startPoint);
      tempRect = L.rectangle(bounds, {
        color: "#ff4500",
        weight: 2,
        fillColor: "#ff4500",
        fillOpacity: 0.15,
        dashArray: "6, 6",
      }).addTo(map);
      selectionBoxLayerRef.current = tempRect;
    };

    const onMouseMove = (e: L.LeafletMouseEvent) => {
      if (!startPoint || !tempRect) return;
      tempRect.setBounds(L.latLngBounds(startPoint, e.latlng));
    };

    const onMouseUp = () => {
      if (!startPoint || !tempRect) return;
      const bounds = tempRect.getBounds();
      const southWest = bounds.getSouthWest();
      const northEast = bounds.getNorthEast();

      const box = {
        south: southWest.lat,
        north: northEast.lat,
        west: southWest.lng,
        east: northEast.lng,
      };

      const selected = new Set<string>();
      filteredLeads.forEach((lead) => {
        if (lead.lat != null && lead.lng != null) {
          if (isPointInBoundingBox({ lat: lead.lat!, lng: lead.lng! }, box)) {
            selected.add(lead.id);
          }
        }
      });

      setSelectedLeadIds(selected);
      startPoint = null;
    };

    map.on("mousedown", onMouseDown);
    map.on("mousemove", onMouseMove);
    map.on("mouseup", onMouseUp);

    return () => {
      map.off("mousedown", onMouseDown);
      map.off("mousemove", onMouseMove);
      map.off("mouseup", onMouseUp);
      map.dragging.enable();
    };
  }, [isDrawMode, filteredLeads]);

  // Bulk Actions
  const handleBulkAssign = async (autoNearest = false) => {
    if (selectedLeadIds.size === 0) return;
    try {
      setIsBulkProcessing(true);
      setBulkFeedback(null);

      const res = await fetch("/api/leads/bulk-assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadIds: Array.from(selectedLeadIds),
          storeId: bulkStoreId || undefined,
          repId: bulkRepId || undefined,
          autoAssignToNearest: autoNearest,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setBulkFeedback(
          `Success: ${data.assignedCount} leads assigned${
            data.unmappedCount > 0
              ? ` (${data.unmappedCount} need store review)`
              : ""
          }!`,
        );
        setSelectedLeadIds(new Set());
        if (selectionBoxLayerRef.current) {
          selectionBoxLayerRef.current.remove();
        }
        setIsDrawMode(false);
        await fetchData();
      } else {
        const err = await res.json();
        setBulkFeedback(`Error: ${err.error || "Bulk action failed"}`);
      }
    } catch {
      setBulkFeedback("An error occurred during bulk assignment.");
    } finally {
      setIsBulkProcessing(false);
    }
  };

  // Quick Zoom Preset Handler
  const handleZoomPreset = (region: string) => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (region === "India") {
      map.setView({ lat: 21.7679, lng: 78.8718 }, 5);
    } else if (region === "Bangalore") {
      map.setView({ lat: 12.9716, lng: 77.5946 }, 12);
    } else if (region === "Mumbai") {
      map.setView({ lat: 19.076, lng: 72.8777 }, 12);
    } else if (region === "Delhi") {
      map.setView({ lat: 28.6139, lng: 77.209 }, 12);
    } else if (region === "Hyderabad") {
      map.setView({ lat: 17.385, lng: 78.4867 }, 12);
    } else if (region === "Fit") {
      const points = filteredLeads
        .filter(canPlotLead)
        .map((l) => ({ lat: l.lat!, lng: l.lng! }));
      if (points.length > 0) {
        map.fitBounds(L.latLngBounds(points), {
          padding: [50, 50],
          maxZoom: 15,
        });
      }
    }
  };

  // Unique categories & regions
  const categories = Array.from(
    new Set(leads.map((l) => l.category).filter(Boolean)),
  ) as string[];
  const regions = Array.from(
    new Set(
      stores
        .map((s) => s.region)
        .concat(leads.map((l) => l.region || "").filter(Boolean)),
    ),
  );

  return (
    <div className="relative w-full h-[calc(100vh-64px)] flex overflow-hidden bg-white font-sans text-slate-900">
      {/* 1. TOP FLOATING CONTROL HUD */}
      <div className="absolute top-3 left-4 right-4 z-30 pointer-events-none flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3 pointer-events-auto">
          {/* Search & Main Filter Capsule */}
          <div className="flex flex-wrap items-center gap-2 bg-white/95 backdrop-blur-md p-1.5 rounded-2xl border border-slate-200 shadow-xl">
            {/* Search Input */}
            <div className="relative w-56 sm:w-72">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search company, phone, PIN, area..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#ff4500] transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-700"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Store Catchment Filter Dropdown */}
            <select
              value={selectedStore}
              onChange={(e) => setSelectedStore(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-slate-700 focus:outline-none focus:border-[#ff4500]"
            >
              <option value="All">🏬 All Stores ({stores.length})</option>
              <option value="unassigned">⚠️ Unassigned to Store</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  🏬 {s.name} ({s.radius_km} km)
                </option>
              ))}
            </select>

            <button
              type="button"
              disabled={refreshing || loading}
              className="rounded-xl border px-3 py-2 text-sm font-semibold"
              onClick={async () => {
                setRefreshing(true);
                try { await fetchData(); } finally { setRefreshing(false); }
              }}
            >
              {refreshing ? "Refreshing…" : "Refresh map"}
            </button>

            <details className="relative">
              <summary
                aria-label="Advanced map actions"
                className="cursor-pointer list-none rounded-xl border px-3 py-2 text-sm font-bold"
              >
                … Actions
              </summary>
              <div
                style={{
                  width: "min(360px, calc(100vw - 32px))",
                  maxHeight: "65vh",
                  zIndex: 60,
                }}
                className="absolute right-0 top-full mt-2 overflow-y-auto rounded-2xl border bg-white p-4 shadow-xl flex flex-col gap-3"
              >
                <select
                  aria-label="Category"
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="max-w-40 rounded border p-2 text-xs"
                >
                  <option value="All">All categories</option>
                  {categories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                <label className="text-xs whitespace-nowrap">
                  <input
                    type="checkbox"
                    role="switch"
                    checked={showLeadPins}
                    onChange={(e) => setShowLeadPins(e.target.checked)}
                  />{" "}
                  Show leads
                </label>
                <label className="text-xs whitespace-nowrap">
                  <input
                    type="checkbox"
                    role="switch"
                    checked={hideAssigned}
                    onChange={(e) => setHideAssigned(e.target.checked)}
                  />{" "}
                  Hide assigned
                </label>
                {loading && (
                  <span role="status" className="text-xs">
                    Loading…
                  </span>
                )}
                {/* Region Filter */}
                <select
                  value={selectedRegion}
                  onChange={(e) => setSelectedRegion(e.target.value)}
                  className="block text-xs bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-slate-700 focus:outline-none focus:border-[#ff4500]"
                >
                  <option value="All">🌐 All Regions</option>
                  {regions.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>

                {["b2b_head", "regional_manager"].includes(
                  user?.role || "",
                ) && (
                  <RecheckAllotment
                    leadIds={
                      selectedLeadIds.size
                        ? [...selectedLeadIds]
                        : filteredLeads.map((l) => l.id)
                    }
                    onSaved={() => void fetchData()}
                  />
                )}
                {/* Catchment Radius Toggle */}
                <button
                  onClick={() => setShowCatchmentCircles(!showCatchmentCircles)}
                  className={`p-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                    showCatchmentCircles
                      ? "bg-orange-50 text-[#ff4500] border-orange-200"
                      : "bg-slate-100 text-slate-500 border-slate-200"
                  }`}
                  title="Toggle Store Catchment Radii Circles"
                >
                  {showCatchmentCircles ? (
                    <Eye className="w-3.5 h-3.5 text-[#ff4500]" />
                  ) : (
                    <EyeOff className="w-3.5 h-3.5" />
                  )}
                  <span className="hidden md:inline">Catchment</span>
                </button>


                <label className="text-xs">
                  Jump to city
                  <select
                    defaultValue=""
                    onChange={(e) => handleZoomPreset(e.target.value)}
                    className="w-full rounded-lg border p-2"
                  >
                    <option value="" disabled>
                      Choose view
                    </option>
                    {["Bangalore", "Mumbai", "Delhi", "Hyderabad", "India"].map(
                      (city) => (
                        <option key={city}>{city}</option>
                      ),
                    )}
                  </select>
                </label>
              </div>
            </details>

            {/* Area Lasso/Box Select Button */}
            <button
              onClick={() => {
                setIsDrawMode(!isDrawMode);
                if (isDrawMode && selectionBoxLayerRef.current) {
                  selectionBoxLayerRef.current.remove();
                  selectionBoxLayerRef.current = null;
                }
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition-all cursor-pointer ${
                isDrawMode
                  ? "bg-[#ff4500] text-white border-[#ff4500] shadow-md shadow-[#ff4500]/30"
                  : "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200"
              }`}
              title="Click and drag on map to select area of leads"
            >
              <Square className="w-3.5 h-3.5 text-current" />
              <span>{isDrawMode ? "Drawing Active" : "Area Select"}</span>
            </button>
          </div>

          {/* Quick Hub Jump Presets & Total Plotted Pill */}
          <div className="flex flex-wrap items-center gap-2 bg-white/95 backdrop-blur-md p-1.5 rounded-2xl border border-slate-200 shadow-xl">
            <div className="flex items-center gap-1 text-xs">
              <button
                onClick={() => handleZoomPreset("Fit")}
                className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-[#ff4500]/10 text-[#ff4500] hover:bg-[#ff4500]/20 border border-[#ff4500]/30 transition-colors cursor-pointer"
              >
                🎯 Fit Leads
              </button>
            </div>

            <div className="pl-2 border-l border-slate-200 flex items-center gap-1.5 text-xs font-extrabold text-[#ff4500]">
              <span className="w-2 h-2 rounded-full bg-[#ff4500] animate-pulse" />
              <span>
                {filteredLeads.length} Leads ·{" "}
                {
                  filteredLeads.filter((lead) => lead.approximate_display)
                    .length
                }{" "}
                approximate PIN areas
              </span>
            </div>
          </div>
        </div>

        {/* Status Filter Ribbon with Live Counters */}
        <div className="flex flex-wrap items-center gap-1.5 pointer-events-auto bg-white/90 backdrop-blur-md p-1 rounded-xl border border-slate-200 shadow-md w-fit">
          <button
            onClick={() => setSelectedStatus("All")}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
              selectedStatus === "All"
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            All ({statusCounts.All || 0})
          </button>
          {Object.entries(STATUS_CONFIG).map(([st, cfg]) => {
            const count = statusCounts[st] || 0;
            const isSelected = selectedStatus === st;
            return (
              <button
                key={st}
                onClick={() => setSelectedStatus(st)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer border ${
                  isSelected
                    ? `${cfg.bg} ${cfg.text} ${cfg.border} shadow-xs font-black`
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                }`}
              >
                <span>{cfg.icon}</span>
                <span>{st}</span>
                <span className="opacity-80 font-mono">({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. MAIN MAP CANVAS */}
      <div className="relative flex-1 h-full w-full">
        <div ref={mapContainerRef} className="w-full h-full" />

        {/* Floating Bulk Action Bar when leads are selected */}
        {selectedLeadIds.size > 0 && (
          <div className="absolute top-28 left-1/2 -translate-x-1/2 bg-white/95 border border-[#ff4500]/60 shadow-2xl rounded-2xl p-3 z-30 flex flex-wrap items-center gap-3 backdrop-blur-md animate-in slide-in-from-top-4 duration-200">
            <div className="flex items-center gap-2 border-r border-slate-200 pr-3">
              <span className="w-2.5 h-2.5 rounded-full bg-[#ff4500] animate-pulse" />
              <span className="text-xs font-extrabold text-slate-900">
                {selectedLeadIds.size} Leads Selected in Area
              </span>
            </div>

            <button
              disabled={isBulkProcessing}
              onClick={() => handleBulkAssign(true)}
              className="px-3 py-1.5 bg-[#ff4500] hover:bg-[#e03e00] text-white rounded-xl text-xs font-bold shadow-md shadow-[#ff4500]/30 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
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

            {(bulkStoreId || bulkRepId) && (
              <button
                disabled={isBulkProcessing}
                onClick={() => handleBulkAssign(false)}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                <UserCheck className="w-3.5 h-3.5" />
                Apply Assignment
              </button>
            )}

            <button
              onClick={() => {
                setSelectedLeadIds(new Set());
                if (selectionBoxLayerRef.current) {
                  selectionBoxLayerRef.current.remove();
                }
              }}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
              title="Clear Selection"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Bulk Action Toast Feedback */}
        {bulkFeedback && (
          <div className="absolute top-44 left-1/2 -translate-x-1/2 bg-white border border-[#ff4500]/50 text-slate-900 text-xs px-4 py-2.5 rounded-xl shadow-2xl z-30 flex items-center gap-2">
            <span className="font-semibold text-[#ff4500]">{bulkFeedback}</span>
            <button
              onClick={() => setBulkFeedback(null)}
              className="text-slate-400 hover:text-slate-700"
            >
              ✕
            </button>
          </div>
        )}

        {/* Bottom Legend Pill */}
        <div className="absolute bottom-4 left-4 z-20 bg-white/95 backdrop-blur-md border border-slate-200 px-3 py-2 rounded-xl shadow-lg hidden sm:flex items-center gap-3 text-[11px] text-slate-700">
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded-lg bg-[#ff4500] text-white flex items-center justify-center text-[9px] font-bold">
              🏬
            </span>
            <span className="font-bold text-slate-900">Stores</span>
          </div>
          <div className="h-3 w-px bg-slate-200" />
          <div className="flex items-center gap-2">
            {Object.entries(STATUS_CONFIG).map(([st, cfg]) => (
              <div key={st} className="flex items-center gap-1">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: cfg.hex }}
                />
                <span className="text-slate-600 font-medium">{st}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {selectedLead && (
        <aside aria-label="Lead details" className="w-96 max-w-full flex-shrink-0 bg-white border-l border-orange-200 p-4 overflow-y-auto z-40 shadow-xl space-y-4">
          <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-[#ff4500]">{selectedLead.lead_code}</p><h3 className="text-base font-bold">{selectedLead.company_name || "Company details pending"}</h3></div><button aria-label="Close lead details" onClick={()=>setSelectedLead(null)} className="p-1 rounded-lg text-slate-500"><X className="w-4 h-4"/></button></div>
          <MapLeadSummary key={selectedLead.id} leadId={selectedLead.id} status={selectedLead.funnel_status || selectedLead.status}/>
          {selectedLead.approximate_display&&<p className="text-xs text-amber-800">Approximate PIN area. Confirm the business location before navigating.</p>}
          <div className="flex flex-wrap gap-2 border-t pt-3">
            {(user?.role === "b2b_head" || user?.role === "regional_manager")&&<CorrectPin lead={selectedLead} onSaved={(updated)=>{if(updated)setSelectedLead(current=>current?{...current,...updated,approximate_display:false,approximate_pin_area:null}:null);void fetchData();}}/>}
            {inIndia(selectedLead)&&<LeadNavigate lead={selectedLead} className="text-xs rounded-lg border px-3 py-2"><Navigation className="w-3 h-3 inline mr-1"/>Navigate</LeadNavigate>}
          </div>
        </aside>
      )}
    </div>
  );
}
