export function manualCoordinates(body: { lat?: unknown; lng?: unknown }) {
  const hasLat = body.lat !== undefined && body.lat !== null && body.lat !== "";
  const hasLng = body.lng !== undefined && body.lng !== null && body.lng !== "";
  if (!hasLat && !hasLng) return null;
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!hasLat || !hasLng || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new Error("Enter both valid latitude (-90 to 90) and longitude (-180 to 180).");
  }
  return { lat, lng };
}

export function storeMapsUrl(store: { address: string; pin_code: string }) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${store.address}, ${store.pin_code}, India`)}`;
}
