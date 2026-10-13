type LeadProgress = {
  status?: string;
  funnel_status?: string;
  latest_interest_level?: string | null;
  partners?: { partner_status: string }[];
};
export function isWonLead(lead: LeadProgress): boolean {
  // A deboarded/rejected partner alone must not keep a lead in Won.
  if (lead.partners?.length) return lead.partners.some(p => p.partner_status === "active");
  return ["converted", "onboarded", "closed-won", "won"].includes((lead.funnel_status || lead.status || "").toLowerCase());
}
export function interestBucket(lead: LeadProgress): "Won" | "Hot Leads" | "Warm Leads" | "Cold Leads" | null {
  if (isWonLead(lead)) return "Won";
  switch (lead.latest_interest_level?.toLowerCase()) {
    case "high": return "Hot Leads";
    case "medium": return "Warm Leads";
    case "low": case "not interested": return "Cold Leads";
    default: return null;
  }
}
