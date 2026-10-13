export const PARTNER_TYPES = ["Company", "Individual"] as const;
export function partnerType(raw: unknown, gst: unknown) {
  if (raw != null && raw !== "" && !PARTNER_TYPES.includes(raw as typeof PARTNER_TYPES[number])) throw new RangeError("Choose Company or Individual");
  return raw ? raw as typeof PARTNER_TYPES[number] : typeof gst === "string" && gst.trim() ? "Company" : "Individual";
}
export function partnerEmailName(partner: { company_legal_name?: string | null; company_firm_name: string; source_lead?: { company_name?: string | null; owner_name?: string | null } | null }) {
  return partner.company_legal_name?.trim() || partner.source_lead?.company_name?.trim() || partner.source_lead?.owner_name?.trim() || partner.company_firm_name;
}
