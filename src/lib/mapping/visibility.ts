import { inIndia } from "../location";
export function canPlotLead(lead: {
  lat?: number | null;
  lng?: number | null;
  geocode_status?: string | null;
  geocode_source?: string | null;
}) {
  const status = lead.geocode_status;
  return (
    lead.geocode_source !== "pincode_dataset" &&
    inIndia(lead) &&
    !["mapping_issue", "mismatch_flagged", "invalid"].includes(status || "")
  );
}
