"use client";
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { inIndia, type Coordinates } from "@/lib/location";
export default function PinPicker({
  point,
  onChange,
}: {
  point: Coordinates;
  onChange: (p: Coordinates) => void;
}) {
  const root = useRef<HTMLDivElement>(null),
    map = useRef<L.Map | null>(null),
    marker = useRef<L.Marker | null>(null),
    callback = useRef(onChange);
  useEffect(() => {
    callback.current = onChange;
  }, [onChange]);
  useEffect(() => {
    if (!root.current) return;
    const m = L.map(root.current).setView({ lat: 12.97, lng: 77.59 }, 12);
    map.current = m;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
    }).addTo(m);
    const pin = L.marker(
      { lat: 12.97, lng: 77.59 },
      {
        draggable: true,
        icon: L.divIcon({
          className: "",
          html: '<div style="background:#ea580c;border:3px solid white;border-radius:50%;height:26px;width:26px;box-shadow:0 2px 8px #0006"></div>',
          iconAnchor: [13, 13],
        }),
      },
    ).addTo(m);
    marker.current = pin;
    const choose = (p: Coordinates) => {
      if (inIndia(p)) {
        pin.setLatLng(p);
        callback.current({ lat: p.lat, lng: p.lng });
      }
    };
    pin.on("dragend", () => choose(pin.getLatLng()));
    m.on("click", (e: L.LeafletMouseEvent) => choose(e.latlng));
    const resize = new ResizeObserver(() => m.invalidateSize());
    resize.observe(root.current);
    return () => {
      resize.disconnect();
      m.remove();
      map.current = null;
      marker.current = null;
    };
  }, []);
  useEffect(() => {
    if (inIndia(point)) {
      marker.current?.setLatLng(point);
      if (!map.current?.getBounds().contains(point))
        map.current?.setView(point, 15);
    }
  }, [point]);
  return (
    <div
      ref={root}
      aria-label="Location pin map"
      style={{ height: 256, minHeight: 256 }}
      className="h-64 w-full rounded-xl border border-slate-200"
    />
  );
}
