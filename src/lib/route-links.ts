import { canPlotLead } from "./mapping/visibility";
export interface RoutePoint {
  geocode_status?: string | null;
  id?: string;
  lat?: number | null;
  lng?: number | null;
}
export const validRoutePoint = canPlotLead;
// Three intermediate waypoints are supported by Google Maps mobile browsers.
// Split long routes into explicit connected legs instead of silently losing stops.
export function routeLinks(stops: RoutePoint[], origin?: RoutePoint) {
  if (!stops.length || stops.some((stop) => !validRoutePoint(stop)))
    throw new Error("Every selected lead needs a valid location.");
  const links: string[] = [];
  let start: RoutePoint | undefined =
    origin && validRoutePoint(origin) ? origin : undefined;
  for (let i = 0; i < stops.length; i += 4) {
    const batch = stops.slice(i, i + 4);
    const url = new URL("https://www.google.com/maps/dir/");
    url.searchParams.set("api", "1");
    url.searchParams.set("travelmode", "driving");
    if (start) url.searchParams.set("origin", `${start.lat},${start.lng}`);
    const end = batch[batch.length - 1];
    url.searchParams.set("destination", `${end.lat},${end.lng}`);
    if (batch.length > 1)
      url.searchParams.set(
        "waypoints",
        batch
          .slice(0, -1)
          .map((p) => `${p.lat},${p.lng}`)
          .join("|"),
      );
    links.push(url.toString());
    start = end;
  }
  return links;
}

/** Combine connected mobile-safe sections when the complete route fits Maps' nine-waypoint limit. */
export function fullRouteLink(links: string[]): string | null {
  if (!links.length) return null;
  const parts = links.map((link) => new URL(link));
  const stops = parts
    .flatMap((url) => [
      ...(url.searchParams.get("waypoints")?.split("|").filter(Boolean) || []),
      url.searchParams.get("destination") || "",
    ])
    .filter(Boolean);
  if (!stops.length || stops.length > 10) return null;
  const url = new URL(parts[0].toString());
  url.searchParams.set("destination", stops[stops.length - 1]);
  url.searchParams.delete("waypoints");
  if (stops.length > 1)
    url.searchParams.set("waypoints", stops.slice(0, -1).join("|"));
  return url.toString().length <= 2048 ? url.toString() : null;
}
