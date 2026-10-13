import { canPlotLead } from "./mapping/visibility";
export type NavigableLead = {
  id: string;
  lat?: number | null;
  lng?: number | null;
  geocode_status?: string | null;
  geocode_source?: string | null;
  location_verified?: boolean;
};
export function navigationUrl(lead: Omit<NavigableLead, "id">) {
  return canPlotLead(lead) &&
    (lead.geocode_status === "ok" || lead.location_verified === true)
    ? `https://www.google.com/maps/dir/?api=1&destination=${lead.lat},${lead.lng}`
    : null;
}
/** Fetch current coordinates on every click, including long-lived calendar pages. */
export async function openLeadNavigation(id: string) {
  const popup = window.open("about:blank", "_blank");
  if (popup) popup.opener = null;
  try {
    const response = await fetch(`/api/leads/${encodeURIComponent(id)}`, {
      cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok)
      throw Error(data.error || "Unable to load current location");
    const url = navigationUrl(data.lead);
    if (!url) throw Error("This lead needs location review before navigation.");
    if (popup) popup.location.replace(url);
    else window.location.assign(url);
  } catch (e) {
    popup?.close();
    throw e;
  }
}
