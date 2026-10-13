export const LEAD_GEN_SOURCES = [
  "On Ground Direct Convert",
  "CDT",
  "LinkedIN ADS",
  "Walk in (Direct)",
  "Walk in (On Ground)",
  "Nurturing",
  "Referral",
  "Other",
] as const;
export function leadGenSource(raw: Record<string, unknown>) {
  if (
    !LEAD_GEN_SOURCES.includes(
      raw.lead_gen_source as (typeof LEAD_GEN_SOURCES)[number],
    )
  )
    throw new RangeError("Choose Lead Gen Source");
  const other =
    typeof raw.lead_gen_source_other === "string"
      ? raw.lead_gen_source_other.trim()
      : "";
  if (raw.lead_gen_source === "Other" && (!other || other.length > 1000))
    throw new RangeError(
      "Describe the other lead generation source (up to 1,000 characters)",
    );
  return {
    lead_gen_source: String(raw.lead_gen_source),
    lead_gen_source_other: raw.lead_gen_source === "Other" ? other : null,
  };
}
