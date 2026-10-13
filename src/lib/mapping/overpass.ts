import type { Box, Candidate } from "./domain";
import { normalizedName } from "./domain";
import type { PlaceSearchProvider } from "./provider";
import {
  cachedQuery,
  checkProviderResponse,
  geocodingAgent,
  normalizedQuery,
} from "./query-cache";
export function overpassQuery(company: string, box: Box) {
  // Token alternatives tolerate punctuation/spacing. Final fuzzy-name validation
  // runs in the pipeline. JSON quoting prevents Overpass QL injection.
  const tokens = [...new Set(normalizedName(company))];
  if (!tokens.length) return null;
  const pattern = tokens
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  return `[out:json][timeout:15][maxsize:8388608];nwr["name"~${JSON.stringify(pattern)},i](${box.south},${box.west},${box.north},${box.east});out center tags 50;`;
}
export function overpassCandidates(data: unknown): Candidate[] {
  if (
    !data ||
    typeof data !== "object" ||
    !("elements" in data) ||
    !Array.isArray(data.elements) ||
    ("remark" in data && data.remark)
  )
    throw Error("Invalid or incomplete Overpass response");
  return data.elements.flatMap((v) => {
    const lat = v.lat ?? v.center?.lat,
      lng = v.lon ?? v.center?.lon;
    const tags = v.tags || {};
    if (
      typeof lat !== "number" ||
      typeof lng !== "number" ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      typeof tags.name !== "string"
    )
      return [];
    // Named administrative areas/buildings without POI tags aren't company hits.
    const kind =
      tags.shop || tags.office || tags.amenity || tags.craft || tags.tourism;
    if (!kind) return [];
    return [
      {
        lat,
        lng,
        name: tags.name,
        displayName: [tags.name, tags["addr:street"], tags["addr:city"]]
          .filter(Boolean)
          .join(", "),
        kind: String(kind),
        rank: 30,
      },
    ];
  });
}
export class BoundedOverpass implements PlaceSearchProvider {
  async search(company: string, box?: Box): Promise<Candidate[]> {
    if (!box) throw Error("Overpass requires an area boundary");
    const query = overpassQuery(company, box);
    if (!query) return [];
    const endpoint =
      process.env.OVERPASS_API_URL || "https://overpass-api.de/api/interpreter";
    return cachedQuery(
      "overpass",
      JSON.stringify([endpoint, normalizedQuery(company), box]),
      async () => {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "User-Agent": geocodingAgent(),
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ data: query }),
          signal: AbortSignal.timeout(20000),
        });
        checkProviderResponse(response);
        return overpassCandidates(await response.json());
      },
    );
  }
}
