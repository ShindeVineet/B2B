"use client";
import { DialogOverlay } from "@/components/shared/DialogOverlay";

import React, { useEffect, useState, useCallback } from "react";
import {
  Store,
  Plus,
  Edit2,
  Trash2,
  Compass,
  CheckCircle,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import {} from "@/lib/geo";

interface StoreData {
  id: string;
  name: string;
  address: string;
  pin_code: string;
  google_map_link?: string | null;
  service_pincodes?: { pin_code: string }[];
  lat: number;
  lng: number;
  radius_km: number;
  region: string;
  active: boolean;
  manager_id?: string | null;
  manager?: { id: string; name: string; email: string } | null;
  _count?: { leads: number; staff_users: number };
}

interface ManagerUser {
  id: string;
  name: string;
  email: string;
  region?: string | null;
}

export function StoreManagement() {
  const [stores, setStores] = useState<StoreData[]>([]);
  const [managers, setManagers] = useState<ManagerUser[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [editingStore, setEditingStore] = useState<StoreData | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    name: "",
    address: "",
    pin_code: "",
    google_map_link: "",
    service_pin_codes: "",
    region: "South",
    radius_km: 10,
    manager_id: "",
  });
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchStores = useCallback(
    () =>
      Promise.all([
        fetch("/api/stores").then(async (response) => {
          if (!response.ok) throw new Error("Unable to load stores");
          const data = await response.json();
          setStores(data.stores || []);
        }),
        fetch("/api/users?role=regional_manager").then(async (response) => {
          if (!response.ok) throw new Error("Unable to load users");
          const data = await response.json();
          setManagers(data.users || []);
        }),
      ])
        .catch(console.error)
        .finally(() => setLoading(false)),
    [],
  );

  useEffect(() => {
    fetchStores();
  }, [fetchStores]);

  const openAddModal = () => {
    setEditingStore(null);
    setFormData({
      name: "",
      address: "",
      pin_code: "",
      google_map_link: "",
      service_pin_codes: "",
      region: "South",
      radius_km: 10,
      manager_id: managers[0]?.id || "",
    });
    setErrorMsg(null);
    setSuccessMsg(null);
    setModalOpen(true);
  };

  const openEditModal = (store: StoreData) => {
    setEditingStore(store);
    setFormData({
      name: store.name,
      address: store.address,
      pin_code: store.pin_code,
      google_map_link: store.google_map_link || "",
      service_pin_codes: (store.service_pincodes || [])
        .map((p) => p.pin_code)
        .join(", "),
      region: store.region,
      radius_km: store.radius_km,
      manager_id: store.manager_id || "",
    });
    setErrorMsg(null);
    setSuccessMsg(null);
    setModalOpen(true);
  };

  const handleSaveStore = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      setErrorMsg(null);
      setSuccessMsg(null);

      const url = editingStore
        ? `/api/stores/${editingStore.id}`
        : "/api/stores";
      const method = editingStore ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        setSuccessMsg(
          `Store "${formData.name}" successfully ${editingStore ? "updated" : "created and geocoded"}!`,
        );
        setTimeout(() => {
          setModalOpen(false);
          fetchStores();
        }, 1200);
      } else {
        const err = await res.json();
        setErrorMsg(err.error || "Failed to save store.");
      }
    } catch {
      setErrorMsg("A network error occurred. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteStore = async (id: string, name: string) => {
    if (
      !confirm(
        `Are you sure you want to delete store "${name}"? Leads mapped to this store will become unassigned.`,
      )
    ) {
      return;
    }

    try {
      const res = await fetch(`/api/stores/${id}`, { method: "DELETE" });
      if (res.ok) {
        fetchStores();
      }
    } catch (err) {
      console.error("Failed to delete store", err);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6 bg-white min-h-screen text-slate-900">
      {loading && (
        <p role="status" className="p-3 text-xs">
          Loading…
        </p>
      )}
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <Store className="w-6 h-6 text-[#ff4500]" />
            FLORZY B2B Store Network & Catchment
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Define store locations, configure catchment radius (km), assign
            regional managers, and track mapped leads.
          </p>
        </div>

        <button
          onClick={openAddModal}
          className="px-4 py-2 bg-[#ff4500] hover:bg-[#e03e00] text-white rounded-xl text-xs font-bold shadow-md shadow-[#ff4500]/25 flex items-center gap-2 cursor-pointer transition-all"
        >
          <Plus className="w-4 h-4" />
          Add Store Location
        </button>
      </div>

      {/* Stores Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {stores.map((store) => (
          <div
            key={store.id}
            className="bg-white border border-slate-200 hover:border-[#ff4500]/40 rounded-3xl p-5 space-y-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-orange-50 text-[#ff4500] border border-orange-200 flex items-center justify-center font-bold text-lg">
                    🏬
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 leading-tight">
                      {store.name}
                    </h3>
                    <span className="text-[11px] font-bold text-[#ff4500]">
                      {store.region} Region
                    </span>
                  </div>
                </div>

                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    store.active
                      ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                      : "bg-slate-100 text-slate-500 border-slate-200"
                  }`}
                >
                  {store.active ? "Active" : "Inactive"}
                </span>
              </div>

              {/* Address & PIN */}
              <div className="text-xs text-slate-600 space-y-1">
                <p className="line-clamp-2 text-slate-600">{store.address}</p>
                <div className="flex items-center gap-2 font-mono text-[11px] text-slate-500">
                  <span>PIN: {store.pin_code}</span>
                  <span>
                    Service PINs:{" "}
                    {(store.service_pincodes || [])
                      .map((p) => p.pin_code)
                      .join(", ") || "Not configured"}
                  </span>
                  <span>•</span>
                  <span>
                    Lat: {store.lat.toFixed(3)}, Lng: {store.lng.toFixed(3)}
                  </span>
                </div>
              </div>

              {/* Catchment Radius Badge */}
              <div className="p-2.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-slate-700 font-medium">
                  <Compass className="w-4 h-4 text-[#ff4500]" />
                  <span>Catchment Radius:</span>
                </div>
                <span className="font-black text-[#ff4500] bg-orange-50 px-2 py-0.5 rounded-lg border border-orange-200">
                  {store.radius_km} km
                </span>
              </div>

              {/* Manager & Mapped Leads Count */}
              <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-500 block font-semibold">
                    Regional Manager
                  </span>
                  <span className="font-bold text-slate-800 truncate block">
                    {store.manager?.name || "Unassigned"}
                  </span>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-500 block font-semibold">
                    Mapped Leads
                  </span>
                  <span className="font-black text-[#ff4500] text-sm">
                    {store._count?.leads || 0}
                  </span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <a
                href={
                  store.google_map_link ||
                  `https://www.google.com/maps/search/?api=1&query=${store.lat},${store.lng}`
                }
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-slate-500 hover:text-slate-900 font-bold flex items-center gap-1"
              >
                <ExternalLink className="w-3.5 h-3.5 text-[#ff4500]" />
                {store.google_map_link ? "Google Maps Link" : "View Map"}
              </a>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => openEditModal(store)}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                  title="Edit Store"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDeleteStore(store.id, store.name)}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                  title="Delete Store"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal: Add / Edit Store */}
      {modalOpen && (
        <DialogOverlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-lg p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <Store className="w-5 h-5 text-[#ff4500]" />
                {editingStore ? "Edit Store Location" : "Add Store Location"}
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2 font-medium">
                <AlertCircle className="w-4 h-4 text-rose-600" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-xs flex items-center gap-2 font-medium">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                <span>{successMsg}</span>
              </div>
            )}

            <form onSubmit={handleSaveStore} className="space-y-3.5 text-xs">
              <label className="block font-semibold">
                Service PIN codes
                <textarea
                  aria-label="Service PIN codes"
                  className="block w-full border border-slate-300 rounded-xl p-3 mt-1 bg-slate-50"
                  placeholder="600001, 600002, 600003"
                  value={formData.service_pin_codes}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      service_pin_codes: e.target.value,
                    })
                  }
                />
                <span className="block text-slate-500 font-normal mt-1">
                  Leads with these PIN codes map to this store. Overlapping
                  coverage requires a manager’s choice.
                </span>
              </label>
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Store Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Indiranagar Flagship Store"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-[#ff4500]"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Address (Street & Area) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 100 Feet Rd, Indiranagar, Bengaluru, Karnataka"
                  value={formData.address}
                  onChange={(e) =>
                    setFormData({ ...formData, address: e.target.value })
                  }
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-[#ff4500]"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Google Maps Link / Location URL (Optional - For Perfect Location)
                </label>
                <input
                  type="text"
                  placeholder="e.g. https://maps.app.goo.gl/... or https://google.com/maps/place/..."
                  value={formData.google_map_link}
                  onChange={(e) =>
                    setFormData({ ...formData, google_map_link: e.target.value })
                  }
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-[#ff4500]"
                />
                <span className="block text-[11px] text-slate-500 font-normal mt-1">
                  Paste a Google Maps share link to set exact store pin. If blank, auto-mapped using Lead pipeline logic (Lead &gt; Pincode &gt; Name &gt; Map).
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    PIN Code * (Auto-Geocoded)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 560038"
                    value={formData.pin_code}
                    onChange={(e) =>
                      setFormData({ ...formData, pin_code: e.target.value })
                    }
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono focus:outline-none focus:border-[#ff4500]"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    Region
                  </label>
                  <select
                    value={formData.region}
                    onChange={(e) =>
                      setFormData({ ...formData, region: e.target.value })
                    }
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-[#ff4500]"
                  >
                    <option value="South">South</option>
                    <option value="West">West</option>
                    <option value="North">North</option>
                    <option value="East">East</option>
                    <option value="Central">Central</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    Catchment Radius (km)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={formData.radius_km}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        radius_km: parseFloat(e.target.value) || 10,
                      })
                    }
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono focus:outline-none focus:border-[#ff4500]"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    Store Manager
                  </label>
                  <select
                    value={formData.manager_id}
                    onChange={(e) =>
                      setFormData({ ...formData, manager_id: e.target.value })
                    }
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-[#ff4500]"
                  >
                    <option value="">No Manager Assigned</option>
                    {managers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.region || "All"})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-[#ff4500] hover:bg-[#e03e00] text-white rounded-xl font-bold shadow-md shadow-[#ff4500]/25 cursor-pointer disabled:opacity-50"
                >
                  {saving ? "Geocoding & Saving..." : "Save Store"}
                </button>
              </div>
            </form>
          </div>
        </DialogOverlay>
      )}
    </div>
  );
}
