export type ColdConfig = {
  outcome_rule: boolean;
  checklist_rule: boolean;
  low_interest_rule: boolean;
};
export const DEFAULT_COLD_CONFIG: ColdConfig = {
  outcome_rule: true,
  checklist_rule: true,
  low_interest_rule: true,
};
export const EXCLUDED_OUTCOMES = [
  "On-boarding Done",
  "Lost Lead - (does not do tiles business)",
  "Wrong location",
  "Office closed",
  "Wrong Location/Office closed",
];
export function coldReasons(
  c: { outcome: string; interest_level: string | null; checklist: unknown },
  config: ColdConfig,
) {
  if (EXCLUDED_OUTCOMES.includes(c.outcome)) return [];
  const reasons: string[] = [];
  if (config.outcome_rule && c.outcome === "Dont want commission")
    reasons.push("Commission declined");
  if (
    config.checklist_rule &&
    Array.isArray(c.checklist) &&
    c.checklist.includes("Removed from office/Not interested")
  )
    reasons.push("Removed from office / not interested");
  if (config.low_interest_rule && c.interest_level === "Low")
    reasons.push("Low interest");
  return reasons;
}
