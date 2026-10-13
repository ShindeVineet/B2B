/** Named WGS84 coordinates at every application boundary. */
export type Coordinates = { lat: number; lng: number };
export function inIndia(point: {
  lat?: number | null;
  lng?: number | null;
}): point is Coordinates {
  return (
    typeof point.lat === "number" &&
    typeof point.lng === "number" &&
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    point.lat >= 6 &&
    point.lat <= 38 &&
    point.lng >= 68 &&
    point.lng <= 98
  );
}
export function geocodeMetadata(
  point: { lat: number | null; lng: number | null },
  provider?: string | null,
) {
  return {
    geocode_status: inIndia(point) ? ("ok" as const) : ("invalid" as const),
    geocode_source:
      provider === "LocalIndiaPINCache"
        ? ("pincode_dataset" as const)
        : provider === "OpenStreetMapNominatim"
          ? ("nominatim" as const)
          : provider === "manual"
            ? ("manual" as const)
            : null,
  };
}
export function distanceKm(a: Coordinates, b: Coordinates) {
  const rad = Math.PI / 180;
  const dlat = (b.lat - a.lat) * rad,
    dlng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dlng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
