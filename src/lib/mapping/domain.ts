import { distanceKm, inIndia, type Coordinates } from "../location";
export type Box = { north: number; south: number; east: number; west: number };
export type Candidate = Coordinates & {
  name: string;
  displayName: string;
  kind: string;
  rank: number;
};
export type IssueReason =
  | "no_area_identified"
  | "not_found"
  | "ambiguous_multiple_matches"
  | "outside_area"
  | "invalid_coordinates";
export type MappingResult =
  | {
      status: "ok";
      point: Coordinates;
      source: "nominatim" | "overpass" | "osm_local" | "google_link";
      confidence: "high" | "medium" | "low";
    }
  | { status: "mapping_issue"; reason: IssueReason; candidates: Candidate[] };
export function areaBox(p: Coordinates): Box {
  const dy = 5 / 111.32,
    dx = 5 / (111.32 * Math.cos((p.lat * Math.PI) / 180));
  return {
    north: p.lat + dy,
    south: p.lat - dy,
    east: p.lng + dx,
    west: p.lng - dx,
  };
}
export function within(p: Coordinates, b: Box) {
  return (
    p.lat >= b.south && p.lat <= b.north && p.lng >= b.west && p.lng <= b.east
  );
}
export function pointIssue(
  p: Coordinates,
  area?: Coordinates | null,
): IssueReason | null {
  if (!inIndia(p)) return "invalid_coordinates";
  if (area && (!within(p, areaBox(area)) || distanceKm(p, area) > 10))
    return "outside_area";
  return null;
}
const common = new Set(["pvt", "private", "ltd", "limited", "the", "and"]);
export function normalizedName(s: string) {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w && !common.has(w));
}
export function nameSimilarity(a: string, b: string) {
  const x = new Set(normalizedName(a)),
    y = new Set(normalizedName(b));
  if (!x.size || !y.size) return 0;
  const shared = [...x].filter((w) => y.has(w)).length;
  return (2 * shared) / (x.size + y.size);
}
export function preciseAddress(c: Candidate) {
  return (
    c.rank >= 26 &&
    ![
      "postcode",
      "city",
      "town",
      "village",
      "state",
      "administrative",
      "county",
      "suburb",
      "neighbourhood",
    ].includes(c.kind)
  );
}
export function uniqueCandidates(rows: Candidate[]) {
  return rows.filter(
    (c, i) => rows.findIndex((v) => distanceKm(c, v) < 0.05) === i,
  );
}
