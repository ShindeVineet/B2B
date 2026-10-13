import { LocalPoiProvider } from "./local-poi";
import { prisma } from "../prisma";
import { inIndia, type Coordinates } from "../location";
import { BoundedNominatim } from "./nominatim";
import { BoundedOverpass } from "./overpass";
import {
  areaBox,
  pointIssue,
  nameSimilarity,
  preciseAddress,
  uniqueCandidates,
  type MappingResult,
  type Candidate,
  type IssueReason,
} from "./domain";
import type { PlaceSearchProvider } from "./provider";
export type MappingInput = {
  company_name: string;
  pin_code?: string | null;
  address?: string | null;
  google_map_link?: string | null;
};
export type MappingDependencies = {
  local?: PlaceSearchProvider;
  provider: PlaceSearchProvider;
  overpass: PlaceSearchProvider;
  pin: (pin: string) => Promise<Coordinates | null>;
};
const deps: MappingDependencies = {
  local: new LocalPoiProvider(),
  provider: new BoundedNominatim(),
  overpass: new BoundedOverpass(),
  pin: async (pin) =>
    prisma.pincodeGeocache.findUnique({ where: { pin_code: pin } }),
};
export async function mapBusiness(
  input: MappingInput,
  d: MappingDependencies = deps,
  options: { localOnly?: boolean } = {},
): Promise<MappingResult> {
  const issue = (
    reason: IssueReason,
    candidates: Candidate[] = [],
  ): MappingResult => ({
    status: "mapping_issue",
    reason,
    candidates: uniqueCandidates(candidates).slice(0, 3),
  });
  // Only the local PIN dataset establishes the area. Imported links are retained as
  // source data; accepting one requires the existing manual-resolution action.
  const pin = input.pin_code?.trim();
  const area = pin && /^\d{6}$/.test(pin) ? await d.pin(pin) : null;
  if (!area || !inIndia(area)) return issue("no_area_identified");
  const box = areaBox(area),
    lowConfidence: Candidate[] = [];
  if (d.local && input.company_name.trim()) {
    // Index failures are infrastructure failures, never a miss or permission to call externally.
    const results = await d.local.search(input.company_name, box);
    const matches = uniqueCandidates(
      results.filter(
        (c) =>
          !pointIssue(c, area) &&
          preciseAddress(c) &&
          nameSimilarity(input.company_name, c.name) >= 0.65,
      ),
    );
    if (matches.length > 1) return issue("ambiguous_multiple_matches", matches);
    if (matches.length === 1)
      return {
        status: "ok",
        point: { lat: matches[0].lat, lng: matches[0].lng },
        source: "osm_local",
        confidence:
          nameSimilarity(input.company_name, matches[0].name) >= 0.85
            ? "high"
            : "medium",
      };
  }
  if (options.localOnly) return issue("not_found");
  const errors: unknown[] = [];
  for (const [provider, source] of [
    [d.provider, "nominatim"],
    [d.overpass, "overpass"],
  ] as const) {
    if (!input.company_name.trim()) break;
    let results: Candidate[];
    try {
      results = await provider.search(input.company_name, box);
    } catch (e) {
      errors.push(e);
      continue;
    }
    const local = results.filter((c) => !pointIssue(c, area));
    lowConfidence.push(...local);
    const matches = uniqueCandidates(
      local.filter(
        (c) =>
          preciseAddress(c) &&
          nameSimilarity(input.company_name, c.name) >= 0.65,
      ),
    );
    if (matches.length > 1) return issue("ambiguous_multiple_matches", matches);
    if (matches.length === 1)
      return {
        status: "ok",
        point: { lat: matches[0].lat, lng: matches[0].lng },
        source,
        confidence:
          nameSimilarity(input.company_name, matches[0].name) >= 0.85
            ? "high"
            : "medium",
      };
  }
  if (input.address?.trim()) {
    let results: Candidate[] = [];
    try {
      results = await d.provider.search(input.address, box);
    } catch (e) {
      errors.push(e);
    }
    const local = results.filter((c) => !pointIssue(c, area));
    lowConfidence.push(...local);
    const matches = uniqueCandidates(local.filter(preciseAddress));
    if (matches.length > 1) return issue("ambiguous_multiple_matches", matches);
    if (matches.length === 1)
      return {
        status: "ok",
        point: { lat: matches[0].lat, lng: matches[0].lng },
        source: "nominatim",
        confidence: matches[0].rank >= 30 ? "medium" : "low",
      };
  }
  if (errors.length) throw errors[0];
  return issue("not_found", lowConfidence);
}
export function mappingFields(result: MappingResult) {
  return result.status === "ok"
    ? {
        lat: result.point.lat,
        lng: result.point.lng,
        geocode_source: result.source,
        geocode_status: "ok" as const,
        geocode_confidence: result.confidence,
        geocode_issue_reason: null,
        geocode_candidates: [],
        geocode_flagged_at: null,
        cannot_locate: false,
        location_verified: false,
      }
    : {
        lat: null,
        lng: null,
        geocode_status: "mapping_issue" as const,
        geocode_source: null,
        geocode_confidence: null,
        geocode_issue_reason: result.reason,
        geocode_candidates: result.candidates.map((c) => ({ ...c })),
        geocode_flagged_at: new Date(),
        cannot_locate: false,
        location_verified: false,
      };
}
