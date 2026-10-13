import { funnelStatus } from "./funnel-status";
type Lead = Parameters<typeof funnelStatus>[0] & { geocode_status?: string | null; geocode_issue_reason?: string | null };
export function currentDataIssues(lead: Lead): string[] {
  const reasons: string[] = [];
  if (["mapping_issue", "mismatch_flagged", "invalid"].includes(lead.geocode_status || ""))
    reasons.push(`Location: ${lead.geocode_issue_reason || lead.geocode_status}`);
  if (funnelStatus(lead) === "Needs Data Correction")
    reasons.push(lead.consultations?.[0]?.outcome || "Needs Data Correction");
  return [...new Set(reasons)];
}
