import { createSpatialLookup } from "./spatial-lookup";
import { distanceKm, type Coordinates } from "../location";
export type ClusteringMode = "compact_sequential" | "spread_coverage";
export type ClusterLead = Coordinates & { id: string };
export type ClusterDay = {
  day_index: number;
  lead_ids: string[];
  cluster_span_km: number;
};
export type DistanceLookup = (
  point: Coordinates,
  pool: readonly ClusterLead[],
  count: number,
) => ClusterLead[];
const stable = (a: ClusterLead, b: ClusterLead) =>
  b.lat - a.lat || a.lng - b.lng || a.id.localeCompare(b.id);
function valid(p: Coordinates) {
  return (
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lng) <= 180
  );
}
// Replace this isolated lookup with a spatial index for larger pools.
export const nearestLeads: DistanceLookup = (point, pool, count) =>
  pool
    .map((lead) => ({ lead, distance: distanceKm(point, lead) }))
    .sort((a, b) => a.distance - b.distance || stable(a.lead, b.lead))
    .slice(0, count)
    .map((row) => row.lead);
export function farthestLead(point: Coordinates, pool: readonly ClusterLead[]) {
  let selected: ClusterLead | undefined,
    longest = -Infinity;
  for (const lead of pool) {
    const distance = distanceKm(point, lead);
    if (
      distance > longest ||
      (distance === longest && selected && stable(lead, selected) < 0)
    ) {
      selected = lead;
      longest = distance;
    }
  }
  if (!selected)
    throw new RangeError("Cannot choose a seed from an empty pool");
  return selected;
}
export function routeDistance(
  stops: readonly Coordinates[],
  start: Coordinates | null = null,
) {
  return stops.reduce(
    (sum, stop, i) =>
      sum +
      (i
        ? distanceKm(stops[i - 1], stop)
        : start
          ? distanceKm(start, stop)
          : 0),
    0,
  );
}
export function clusterSpan(stops: readonly Coordinates[]) {
  let span = 0;
  for (let i = 0; i < stops.length; i++)
    for (let j = i + 1; j < stops.length; j++)
      span = Math.max(span, distanceKm(stops[i], stops[j]));
  return span;
}
export function orderDay(
  batch: readonly ClusterLead[],
  start: Coordinates | null,
  twoOptPasses = 2,
  lookup: DistanceLookup = nearestLeads,
) {
  let remaining = [...batch],
    current = start,
    ordered: ClusterLead[] = [];
  while (remaining.length) {
    const next = current
      ? lookup(current, remaining, 1)[0]
      : [...remaining].sort(stable)[0];
    ordered.push(next);
    remaining = remaining.filter((p) => p.id !== next.id);
    current = next;
  }
  // Open route: no artificial return-to-store leg. At most two improvement passes.
  for (let pass = 0; pass < Math.min(2, Math.max(0, twoOptPasses)); pass++) {
    let improved = false;
    for (let i = 0; i < ordered.length - 1; i++)
      for (let j = i + 1; j < ordered.length; j++) {
        const before = i ? ordered[i - 1] : start,
          after = ordered[j + 1];
        const oldEdge =
          (before ? distanceKm(before, ordered[i]) : 0) +
          (after ? distanceKm(ordered[j], after) : 0);
        const newEdge =
          (before ? distanceKm(before, ordered[j]) : 0) +
          (after ? distanceKm(ordered[i], after) : 0);
        if (newEdge + 1e-9 < oldEdge) {
          ordered = [
            ...ordered.slice(0, i),
            ...ordered.slice(i, j + 1).reverse(),
            ...ordered.slice(j + 1),
          ];
          improved = true;
        }
      }
    if (!improved) break;
  }
  return ordered;
}
export function clusterLeadsIntoDays(
  leads: readonly ClusterLead[],
  dayCapacities: readonly number[],
  startPoint: Coordinates | null,
  mode: ClusteringMode = "compact_sequential",
  options: { twoOptPasses?: number; lookup?: DistanceLookup } = {},
) {
  if (!["compact_sequential", "spread_coverage"].includes(mode))
    throw new RangeError("Invalid clustering mode");
  if (
    leads.some((l) => !l.id || !valid(l)) ||
    new Set(leads.map((l) => l.id)).size !== leads.length
  )
    throw new RangeError("Leads require unique IDs and valid coordinates");
  if (startPoint && !valid(startPoint))
    throw new RangeError("Invalid start point");
  if (dayCapacities.some((c) => !Number.isInteger(c) || c < 0))
    throw new RangeError("Day capacities must be non-negative integers");
  const lookup =
      options.lookup ||
      (leads.length >= 300 ? createSpatialLookup(leads) : nearestLeads),
    days: ClusterDay[] = [],
    clustered: ClusterLead[] = [];
  let remaining = [...leads].sort(stable),
    previous: Coordinates | null = null;
  for (
    let index = 0;
    index < dayCapacities.length && remaining.length;
    index++
  ) {
    const capacity = dayCapacities[index];
    if (!capacity) {
      days.push({ day_index: index, lead_ids: [], cluster_span_km: 0 });
      continue;
    }
    // Store-based daily work: each day takes the closest remaining capacity,
    // and its route starts again at the member's base store.
    if (mode === "compact_sequential" && startPoint) {
      const batch = lookup(startPoint, remaining, capacity);
      const ordered = orderDay(
        batch,
        startPoint,
        options.twoOptPasses ?? 2,
        lookup,
      );
      days.push({
        day_index: index,
        lead_ids: ordered.map((p) => p.id),
        cluster_span_km: clusterSpan(batch),
      });
      clustered.push(...batch);
      previous = ordered.at(-1)!;
      const used = new Set(batch.map((p) => p.id));
      remaining = remaining.filter((p) => !used.has(p.id));
      continue;
    }
    let seed: ClusterLead;
    if (!clustered.length)
      seed = startPoint ? farthestLead(startPoint, remaining) : remaining[0];
    else if (mode === "compact_sequential")
      seed = lookup(previous!, remaining, 1)[0];
    else {
      const centroid = {
        lat: clustered.reduce((sum, p) => sum + p.lat, 0) / clustered.length,
        lng: clustered.reduce((sum, p) => sum + p.lng, 0) / clustered.length,
      };
      seed = farthestLead(centroid, remaining);
    }
    const batch = [
      seed,
      ...lookup(
        seed,
        remaining.filter((p) => p.id !== seed.id),
        capacity - 1,
      ),
    ];
    const ordered = orderDay(
      batch,
      mode === "compact_sequential" ? previous || startPoint : startPoint,
      options.twoOptPasses ?? 2,
      lookup,
    );
    days.push({
      day_index: index,
      lead_ids: ordered.map((p) => p.id),
      cluster_span_km: clusterSpan(batch),
    });
    clustered.push(...batch);
    previous = ordered.at(-1)!;
    const used = new Set(batch.map((p) => p.id));
    remaining = remaining.filter((p) => !used.has(p.id));
  }
  return { days, unscheduled_lead_ids: remaining.map((p) => p.id) };
}
