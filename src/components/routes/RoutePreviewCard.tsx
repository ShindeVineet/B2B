"use client";
import { ArrowUpRight, MapPin, Route } from "lucide-react";
import type { Coordinates } from "@/lib/location";
import styles from "./RoutePreviewCard.module.css";
export function RoutePreviewCard({
  name,
  status,
  points,
  distance,
  selected,
  onSelect,
  remainder = 0,
}: {
  name: string;
  status: string;
  points: Coordinates[];
  distance: number;
  selected: boolean;
  onSelect: () => void;
  remainder?: number;
}) {
  const valid = points.filter(
    (p) => Number.isFinite(p.lat) && Number.isFinite(p.lng),
  );
  const minLat = Math.min(...valid.map((p) => p.lat)),
    maxLat = Math.max(...valid.map((p) => p.lat));
  const minLng = Math.min(...valid.map((p) => p.lng)),
    maxLng = Math.max(...valid.map((p) => p.lng));
  const scale = valid.length
    ? Math.min(
        160 / Math.max(maxLng - minLng, 0.0001),
        60 / Math.max(maxLat - minLat, 0.0001),
      )
    : 1;
  const plotted = valid.map((p) => ({
    x: 100 + (p.lng - (minLng + maxLng) / 2) * scale,
    y: 40 - (p.lat - (minLat + maxLat) / 2) * scale,
  }));
  return (
    <button
      type="button"
      className={`${styles.card} ${selected ? styles.selected : ""}`}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className={styles.header}>
        <strong>{name}</strong>
        <span className={styles.badge}>{status}</span>
      </span>
      <span className={styles.outline} aria-hidden="true">
        <svg viewBox="0 0 200 80">
          <polyline
            points={plotted.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke="#ff4500"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          {plotted.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={i === 0 || i === plotted.length - 1 ? 4 : 2.5}
              fill={i === 0 ? "#172033" : "#ff4500"}
              stroke="white"
              strokeWidth="1.5"
            />
          ))}
        </svg>
        <span>Route outline</span>
      </span>
      <span className={styles.footer}>
        <span>
          <MapPin size={14} />
          {points.length} stops
        </span>
        <span>
          <Route size={14} />
          {distance.toFixed(1)} km
        </span>
        <ArrowUpRight size={16} />
      </span>
      {remainder > 0 && (
        <span className={styles.warning}>
          {remainder} remainder leads to review
        </span>
      )}
      <span className={styles.link}>
        {selected ? "Viewing on map" : "View route on map"}
      </span>
    </button>
  );
}
