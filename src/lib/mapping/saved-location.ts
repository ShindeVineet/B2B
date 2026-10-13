import { inIndia } from "../location";
export const IMPORTED_NAME_MISMATCH =
  "Imported matched name differs from firm; confirm location";
export function canConfirmImportedLocation(lead: {
  geocode_status: string | null;
  geocode_issue_reason: string | null;
  lat: number | null;
  lng: number | null;
  cannot_locate?: boolean;
}) {
  return (
    lead.geocode_status === "mismatch_flagged" &&
    lead.geocode_issue_reason === IMPORTED_NAME_MISMATCH &&
    !lead.cannot_locate &&
    inIndia(lead)
  );
}
export function savedLocationLink(link: string | null): string | null {
  if (!link) return null;
  try {
    const url = new URL(link);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
