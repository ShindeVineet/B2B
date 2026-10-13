import { inIndia } from "./location";
import { nameSimilarity } from "./mapping/domain";
export function importLocation(raw: Record<string, unknown>) {
  const present = (v: unknown) => v != null && String(v).trim() !== "";
  if (!present(raw.lat) && !present(raw.lng)) return null;
  const point = { lat: Number(raw.lat), lng: Number(raw.lng) };
  if (!present(raw.lat) || !present(raw.lng) || !inIndia(point))
    return { valid: false as const, reason: "Invalid or incomplete imported coordinates" };
  const mismatch = present(raw.matched_name) && nameSimilarity(String(raw.company_name || ""), String(raw.matched_name)) < 0.65;
  return { valid: true as const, ...point, mismatch };
}
