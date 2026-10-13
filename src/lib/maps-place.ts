import { inIndia, type Coordinates } from "./location";
/** Only an explicit place marker is authoritative. @lat,lng is a camera centre. */
export function mapsPlaceCoordinates(
  value: string | null | undefined,
): Coordinates | null {
  if (!value) return null;
  const str = value.trim();
  if (!str) return null;

  // 1. Direct raw coordinate pair e.g. "12.9715987, 77.5945627"
  const rawPair = str.match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (rawPair) {
    const pt = { lat: Number(rawPair[1]), lng: Number(rawPair[2]) };
    if (inIndia(pt)) return pt;
  }

  try {
    const url = new URL(str);
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") || !["google.com", "www.google.com", "maps.google.com", "google.co.in", "www.google.co.in", "maps.app.goo.gl", "goo.gl"].includes(url.hostname)) return null;
    const decoded = decodeURIComponent(str);

    // 2. Explicit place marker: !3d12.9715987!4d77.5945627
    const placeMatch = decoded.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
    if (placeMatch) {
      const pt = { lat: Number(placeMatch[1]), lng: Number(placeMatch[2]) };
      if (inIndia(pt)) return pt;
    }

    // Directions destination stores longitude first, then latitude.
    const destination = decoded.match(/!1d(-?\d+(?:\.\d+)?)!2d(-?\d+(?:\.\d+)?)/);
    if (destination) {
      const pt = { lat: Number(destination[2]), lng: Number(destination[1]) };
      if (inIndia(pt)) return pt;
    }

    // 4. Query parameters: q=12.9715987,77.5945627 or query=12.9715987,77.5945627 or ll=12.9715987,77.5945627
    const queryMatch = decoded.match(/[?&](?:q|query)=(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
    if (queryMatch) {
      const pt = { lat: Number(queryMatch[1]), lng: Number(queryMatch[2]) };
      if (inIndia(pt)) return pt;
    }

    // 5. Path pattern: place/.../12.9715987,77.5945627 or /search/12.9715987,77.5945627
    const pathMatch = decoded.match(/(?:place|search|dir)\/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
    if (pathMatch) {
      const pt = { lat: Number(pathMatch[1]), lng: Number(pathMatch[2]) };
      if (inIndia(pt)) return pt;
    }
  } catch {
    // Ignore invalid URI format errors
  }

  return null;
}

/** Resolves shortlinks (e.g. maps.app.goo.gl) via HEAD fetch redirect follow if needed. */
export async function resolveGoogleMapsLink(
  value: string | null | undefined,
): Promise<Coordinates | null> {
  if (!value) return null;
  const str = value.trim();
  if (!str) return null;

  // 1. Check synchronous pattern matching first
  const direct = mapsPlaceCoordinates(str);
  if (direct) return direct;

  // Only follow allowlisted Google redirects; never fetch arbitrary pasted URLs.
  try {
    let url = new URL(str);
    if (!["maps.app.goo.gl", "goo.gl"].includes(url.hostname)) return null;
    for (let hop = 0; hop < 6; hop++) {
      if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") || !["google.com", "www.google.com", "maps.google.com", "google.co.in", "www.google.co.in", "maps.app.goo.gl", "goo.gl"].includes(url.hostname)) return null;
      const point = mapsPlaceCoordinates(url.toString());
      if (point) return point;
      const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(3500) });
      await response.body?.cancel();
      const location = response.headers.get("location");
      if (response.status < 300 || response.status >= 400 || !location) return null;
      url = new URL(location, url);
    }
  } catch { /* Invalid or unavailable shared link. */ }
  return null;
}
