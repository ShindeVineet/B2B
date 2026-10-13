import { distanceKm, inIndia, type Coordinates } from "./location";
import type { RoutePoint } from "./route-links";
// Deterministic nearest-neighbour ordering. Geographic distance, not traffic time.
export function proximityOrder<T extends RoutePoint>(
  points: T[],
  origin?: RoutePoint | null,
): T[] {
  const remaining = points
    .filter((p): p is T & Coordinates => inIndia(p))
    .slice()
    .sort(
      (a, b) =>
        a.lng! - b.lng! ||
        a.lat! - b.lat! ||
        String(a.id || "").localeCompare(String(b.id || "")),
    );
  const ordered: T[] = [];
  let current = origin && inIndia(origin) ? origin : remaining[0];
  while (remaining.length) {
    let nearest = 0;
    for (let i = 1; i < remaining.length; i++)
      if (
        distanceKm(current!, remaining[i]) <
        distanceKm(current!, remaining[nearest]) - 1e-9
      )
        nearest = i;
    const next = remaining.splice(nearest, 1)[0];
    ordered.push(next);
    current = next;
  }
  return [...ordered, ...points.filter((p) => !inIndia(p))];
}
