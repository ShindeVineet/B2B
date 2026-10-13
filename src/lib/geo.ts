/**
 * Earth's radius in kilometers
 */
const EARTH_RADIUS_KM = 6371;

/**
 * Convert degrees to radians
 */
function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Calculate Haversine distance between two coordinates in kilometers
 */
export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = EARTH_RADIUS_KM * c;

  return Math.round(distance * 100) / 100; // Round to 2 decimal places
}

export function formatDistance(distanceKm: number | null): string {
  if (distanceKm == null) return "Distance unavailable";
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)} m`;
  }
  return `${distanceKm.toFixed(1)} km`;
}

export interface StoreLocation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radius_km: number;
  region?: string | null;
}

export interface ProximityResult {
  nearestStore: StoreLocation | null;
  distanceKm: number | null;
  isWithinRadius: boolean;
  storesRanked: Array<{
    store: StoreLocation;
    distanceKm: number;
    isWithinRadius: boolean;
  }>;
}

/**
 * Finds the nearest store to a given lead coordinate and ranks all stores by proximity
 */
export function findNearestStore(
  leadLat: number | null | undefined,
  leadLng: number | null | undefined,
  stores: StoreLocation[],
): ProximityResult {
  if (
    leadLat == null ||
    leadLng == null ||
    isNaN(leadLat) ||
    isNaN(leadLng) ||
    !stores.length
  ) {
    return {
      nearestStore: null,
      distanceKm: null,
      isWithinRadius: false,
      storesRanked: [],
    };
  }

  const storesRanked = stores
    .map((store) => {
      const distanceKm = calculateHaversineDistance(
        leadLat,
        leadLng,
        store.lat,
        store.lng,
      );
      const isWithinRadius = distanceKm <= store.radius_km;
      return { store, distanceKm, isWithinRadius };
    })
    .sort((a, b) => a.distanceKm - b.distanceKm);

  const nearest =
    storesRanked.find((entry) => entry.isWithinRadius) ?? storesRanked[0];

  return {
    nearestStore: nearest ? nearest.store : null,
    distanceKm: nearest ? nearest.distanceKm : null,
    isWithinRadius: nearest ? nearest.isWithinRadius : false,
    storesRanked,
  };
}

/**
 * Point in polygon check using ray-casting algorithm
 */
export function isPointInPolygon(
  point: { lat: number; lng: number },
  polygon: { lat: number; lng: number }[],
): boolean {
  const { lat, lng } = point;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const { lat: latI, lng: lngI } = polygon[i];
    const { lat: latJ, lng: lngJ } = polygon[j];

    const intersect =
      lngI > lng !== lngJ > lng &&
      lat < ((latJ - latI) * (lng - lngI)) / (lngJ - lngI) + latI;

    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Point in bounding box check
 */
export function isPointInBoundingBox(
  point: { lat: number; lng: number },
  bounds: { north: number; south: number; east: number; west: number },
): boolean {
  const { lat, lng } = point;
  return (
    lat >= bounds.south &&
    lat <= bounds.north &&
    lng >= bounds.west &&
    lng <= bounds.east
  );
}
