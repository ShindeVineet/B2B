import { calculateHaversineDistance, type StoreLocation } from "../geo";
import { canPlotLead } from "../mapping/visibility";
import { inIndia, type Coordinates } from "../location";
export type ServiceStore = StoreLocation & {
  service_pincodes: readonly { pin_code: string }[];
};
export function parseServicePins(raw: unknown): string[] {
  if (raw == null || raw === "") return [];
  if (typeof raw !== "string" && !Array.isArray(raw))
    throw new RangeError("Service PIN codes must be a list");
  const pins = (Array.isArray(raw) ? raw.join(",") : raw)
    .split(/[\s,;]+/)
    .filter(Boolean);
  if (pins.some((p) => !/^\d{6}$/.test(p)))
    throw new RangeError("Each service PIN code must contain six digits");
  return [...new Set(pins)].sort();
}
/** PIN centroids may suggest store coverage but must never become a business pin. */
export function matchLeadStore(
  lead: {
    pin_code?: string | null;
    lat?: number | null;
    lng?: number | null;
    geocode_status?: string | null;
    geocode_source?: string | null;
  },
  stores: readonly ServiceStore[],
  pincodePoint?: Coordinates | null,
) {
  const exact = stores.filter((s) =>
    s.service_pincodes.some((p) => p.pin_code === lead.pin_code),
  );
  const exactPoint =
    lead.geocode_source !== "pincode_dataset" && canPlotLead(lead);
  const point = exactPoint
    ? { lat: lead.lat!, lng: lead.lng! }
    : pincodePoint && inIndia(pincodePoint)
      ? pincodePoint
      : null;
  const distance = (s: StoreLocation) =>
    point
      ? calculateHaversineDistance(point.lat, point.lng, s.lat, s.lng)
      : null;
  if (exact.length > 1)
    return {
      kind: "overlap" as const,
      store: null,
      distanceKm: null,
      isWithinRadius: false,
      candidates: exact,
    };
  if (exact.length === 1)
    return {
      kind: "service_pin" as const,
      store: exact[0],
      distanceKm: distance(exact[0]),
      isWithinRadius: true,
      candidates: exact,
    };
  const ranked = point
    ? stores
        .filter(inIndia)
        .map((s) => ({ store: s, d: distance(s)! }))
        .sort((a, b) => a.d - b.d || a.store.id.localeCompare(b.store.id))
    : [];
  if (!ranked.length)
    return {
      kind: "none" as const,
      store: null,
      distanceKm: null,
      isWithinRadius: false,
      candidates: [],
    };
  const first = ranked.find(r=>r.d<=r.store.radius_km) || ranked[0];
  return {
    kind: "nearest" as const,
    store: first.store,
    distanceKm: first.d,
    isWithinRadius: first.d <= first.store.radius_km,
    candidates: [],
    approximate: !exactPoint,
  };
}
