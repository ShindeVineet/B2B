import type { Box, Candidate } from "./domain";
import type { PlaceSearchProvider } from "./provider";
import {
  cachedQuery,
  checkProviderResponse,
  geocodingAgent,
  normalizedQuery,
} from "./query-cache";
export class BoundedNominatim implements PlaceSearchProvider {
  async search(query: string, box?: Box): Promise<Candidate[]> {
    const params = new URLSearchParams({
      q: normalizedQuery(query),
      format: "jsonv2",
      limit: "8",
      countrycodes: "in",
      addressdetails: "1",
      namedetails: "1",
    });
    if (box) {
      params.set(
        "viewbox",
        `${box.west},${box.north},${box.east},${box.south}`,
      );
      params.set("bounded", "1");
    }
    const endpoint =
      process.env.NOMINATIM_SEARCH_URL ||
      "https://nominatim.openstreetmap.org/search";
    return cachedQuery("nominatim", `${endpoint}?${params}`, async () => {
      const response = await fetch(`${endpoint}?${params}`, {
        headers: { "User-Agent": geocodingAgent(), "Accept-Language": "en" },
        signal: AbortSignal.timeout(10000),
      });
      checkProviderResponse(response);
      const data: unknown = await response.json();
      if (!Array.isArray(data)) throw Error("Invalid geocoder response");
      return data
        .map((v: Record<string, unknown>) => ({
          lat: Number(v.lat),
          lng: Number(v.lon),
          name: String(v.name || String(v.display_name || "").split(",")[0]),
          displayName: String(v.display_name || ""),
          kind: String(v.addresstype || v.type || ""),
          rank: Number(v.place_rank || 0),
        }))
        .filter((v) => Number.isFinite(v.lat) && Number.isFinite(v.lng));
    });
  }
}
