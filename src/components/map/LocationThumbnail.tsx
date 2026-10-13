"use client";
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
export default function LocationThumbnail({
  lat,
  lng,
  label,
}: {
  lat: number;
  lng: number;
  label: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!root.current) return;
    const map = L.map(root.current, { scrollWheelZoom: false }).setView(
      [lat, lng],
      16,
    );
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);
    L.circleMarker([lat, lng], {
      radius: 7,
      color: "#1d4ed8",
      fillOpacity: 1,
    }).addTo(map);
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(root.current);
    return () => {
      observer.disconnect();
      map.remove();
    };
  }, [lat, lng]);
  return (
    <div
      ref={root}
      aria-label={`Location of ${label}`}
      className="h-36 w-full rounded-lg"
    />
  );
}
