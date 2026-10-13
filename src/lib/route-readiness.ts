import { inIndia } from "./location";
import type { RoutePoint } from "./route-links";
export function routeReadiness(
  lead: RoutePoint,
): "ready" | "review" | "missing" {
  if (
    ["mapping_issue", "mismatch_flagged", "invalid"].includes(
      lead.geocode_status || "",
    )
  )
    return "review";
  return inIndia(lead) ? "ready" : "missing";
}
export function selectLatestRouteLeads<T extends { id: string }>(
  ids: string[],
  latest: T[],
): T[] {
  const byId = new Map(latest.map((lead) => [lead.id, lead]));
  return ids.map((id) => {
    const lead = byId.get(id);
    if (!lead)
      throw new Error(
        "A selected lead is no longer assigned to you. Refresh your lead list.",
      );
    return lead;
  });
}
