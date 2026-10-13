import {
  clusterLeadsIntoDays,
  orderDay,
  routeDistance,
  type ClusterLead,
} from "../clustering/cluster-leads";
import { distanceKm, type Coordinates } from "../location";
export function cheapestInsertion<T extends ClusterLead>(stops: T[], lead: T) {
  let best = [...stops, lead],
    distance = routeDistance(best);
  for (let i = 0; i <= stops.length; i++) {
    const candidate = [...stops.slice(0, i), lead, ...stops.slice(i)];
    const cost = routeDistance(candidate);
    if (cost < distance) {
      best = candidate;
      distance = cost;
    }
  }
  return { stops: best, distance, impact: distance - routeDistance(stops) };
}
const centroid = (points: Coordinates[]) => ({
  lat: points.reduce((s, p) => s + p.lat, 0) / points.length,
  lng: points.reduce((s, p) => s + p.lng, 0) / points.length,
});
export function refineRoutes(input: ClusterLead[][], maxPasses = 5) {
  const routes = input.map((r) => [...r]);
  const before = routes.reduce((s, r) => s + routeDistance(r), 0);
  for (let pass = 0; pass < Math.min(5, maxPasses); pass++) {
    let changed = false;
    const centers = routes.map(centroid);
    const pairs = new Set<string>();
    for (let i = 0; i < routes.length; i++) {
      // Three nearest neighboring clusters, not all pairs in the batch.
      const neighbors = centers
        .map((c, j) => ({ j, d: distanceKm(centers[i], c) }))
        .filter((p) => p.j !== i)
        .sort((a, b) => a.d - b.d || a.j - b.j)
        .slice(0, 3);
      for (const { j } of neighbors)
        pairs.add([Math.min(i, j), Math.max(i, j)].join(":"));
    }
    for (const pair of pairs) {
      const [i, j] = pair.split(":").map(Number);
      const a = routes[i],
        b = routes[j];
      if (!a.length || !b.length) continue;
      // Boundary candidates are the stops nearest the other cluster's center.
      const boundary = (r: ClusterLead[], c: Coordinates) =>
        r
          .map((p, k) => ({ k, d: distanceKm(p, c) }))
          .sort((x, y) => x.d - y.d)
          .slice(0, 6)
          .map((x) => x.k);
      let cost = routeDistance(a) + routeDistance(b),
        best: [ClusterLead[], ClusterLead[]] | null = null;
      for (const ai of boundary(a, centroid(b)))
        for (const bi of boundary(b, centroid(a))) {
          const aa = [...a],
            bb = [...b];
          [aa[ai], bb[bi]] = [bb[bi], aa[ai]];
          const ao = orderDay(aa, null),
            bo = orderDay(bb, null),
            next = routeDistance(ao) + routeDistance(bo);
          if (next + 1e-7 < cost) {
            cost = next;
            best = [ao, bo];
          }
        }
      if (best) {
        routes[i] = best[0];
        routes[j] = best[1];
        changed = true;
      }
    }
    if (!changed) break;
  }
  const after = routes.reduce((s, r) => s + routeDistance(r), 0);
  return {
    routes,
    before,
    after,
    improvement_percent: before ? (100 * (before - after)) / before : 0,
  };
}
export function buildRouteBatch(
  pool: ClusterLead[],
  n: number,
  requestedK?: number,
  refine = true,
) {
  if (!Number.isInteger(n) || n < 1 || n > 100)
    throw new RangeError("Use 1–100 leads per route");
  const k = requestedK ?? Math.floor(pool.length / n);
  if (!Number.isInteger(k) || k < 0 || k > 1000 || k * n > pool.length)
    throw new RangeError("Route count exceeds the available complete batches");
  const grouped = clusterLeadsIntoDays(pool, Array(k).fill(n), null);
  const byId = new Map(pool.map((p) => [p.id, p]));
  const initial = grouped.days.map((d) =>
    d.lead_ids.map((id) => byId.get(id)!),
  );
  const result =
    refine && k >= 10
      ? refineRoutes(initial)
      : {
          routes: initial,
          before: initial.reduce((s, r) => s + routeDistance(r), 0),
          after: initial.reduce((s, r) => s + routeDistance(r), 0),
          improvement_percent: 0,
        };
  return { ...result, remainder: grouped.unscheduled_lead_ids };
}
export function routeLegs(points: Coordinates[]) {
  return points.slice(1).map((point, i) => ({
    from: i + 1,
    to: i + 2,
    km: distanceKm(points[i], point),
    midpoint: {
      lat: (points[i].lat + point.lat) / 2,
      lng: (points[i].lng + point.lng) / 2,
    },
  }));
}
export function routeLetter(index: number): string {
  return index < 26
    ? String.fromCharCode(65 + index)
    : routeLetter(Math.floor(index / 26) - 1) +
        String.fromCharCode(65 + (index % 26));
}
