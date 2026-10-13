export function matchPartnerRegion(
  partner: {
    pincode: string;
    city: string;
    region_override?: string | null;
    source_lead_id?: string | null;
    source_lead?: { store: { region: string } | null } | null;
  },
  stores: readonly { pin_code: string; region: string }[],
  cities: readonly { city: string; region: string }[],
): string | null {
  if (partner.source_lead_id) return partner.source_lead?.store?.region || null;
  if (partner.region_override) return partner.region_override;
  const regions = [
    ...new Set(
      stores
        .filter((s) => s.pin_code.trim() === partner.pincode.trim())
        .map((s) => s.region),
    ),
  ];
  if (regions.length) return regions.length === 1 ? regions[0] : null;
  const city = partner.city.trim().toLowerCase();
  const matched = [
    ...new Set(
      cities
        .filter((c) => c.city.trim().toLowerCase() === city)
        .map((c) => c.region),
    ),
  ];
  return matched.length === 1 ? matched[0] : null;
}
