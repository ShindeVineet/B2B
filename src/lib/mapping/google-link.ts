import type { Coordinates } from "../location";
function allowed(url: URL) {
  return (
    url.protocol === "https:" &&
    !url.username &&
    !url.password &&
    (!url.port || url.port === "443") &&
    (url.hostname === "maps.app.goo.gl" ||
      (url.hostname === "goo.gl" && url.pathname.startsWith("/maps")) ||
      [
        "google.com",
        "www.google.com",
        "maps.google.com",
        "google.co.in",
        "www.google.co.in",
      ].includes(url.hostname))
  );
}
export function extractGooglePoint(value: string): Coordinates | null {
  try {
    const url = new URL(value);
    if (!allowed(url)) return null;
    const text = decodeURIComponent(url.pathname + url.search);
    const place = text.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
    const query = (
      url.searchParams.get("q") ||
      url.searchParams.get("query") ||
      ""
    ).match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
    const camera = text.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    const pair = place || query || camera;
    return pair ? { lat: Number(pair[1]), lng: Number(pair[2]) } : null;
  } catch {
    return null;
  }
}
export async function resolveGooglePoint(
  value: string,
): Promise<Coordinates | null> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  for (let i = 0; i < 6; i++) {
    if (!allowed(url)) return null;
    const direct = extractGooglePoint(url.toString());
    if (direct) return direct;
    if (!["maps.app.goo.gl", "goo.gl"].includes(url.hostname) && i === 0)
      return null;
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
    });
    await response.body?.cancel();
    if (response.status < 300 || response.status >= 400) return null;
    const next = response.headers.get("location");
    if (!next) return null;
    url = new URL(next, url);
  }
  return null;
}
