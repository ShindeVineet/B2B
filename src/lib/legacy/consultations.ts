import { createHash } from "node:crypto";
export const LEGACY_BATCH = "combined-consult-2026-v1";
export type LegacyRow = Record<string, string>;
export function normalName(value: string | null | undefined) {
  return (value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
export function mobile(value: string | null | undefined) {
  const digits = (value || "").replace(/\D/g, "");
  const n =
    digits.length === 12 && digits.startsWith("91")
      ? digits.slice(2)
      : digits.length === 11 && digits.startsWith("0")
        ? digits.slice(1)
        : digits;
  return /^[6-9]\d{9}$/.test(n) ? n : null;
}
export function mobiles(value: string) {
  return [
    ...new Set(
      value
        .split(/[,;\/\n]|\s+&\s+/)
        .map(mobile)
        .filter((v): v is string => !!v),
    ),
  ];
}
export function legacyDate(value: string | undefined) {
  if (!value?.trim()) return null;
  const m = value
    .trim()
    .match(
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
    );
  if (!m) return null;
  const [, day, month, year, hour = "00", minute = "00", second = "00"] = m;
  const date = new Date(
    `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${hour.padStart(2, "0")}:${minute}:${second}+05:30`,
  );
  if (!Number.isFinite(date.getTime())) return null;
  const india = new Date(date.getTime() + 330 * 60000);
  return india.getUTCDate() === +day &&
    india.getUTCMonth() + 1 === +month &&
    india.getUTCFullYear() === +year
    ? date
    : null;
}
export function parseLegacyRow(raw: LegacyRow, rowNumber: number) {
  const get = (key: string) => (raw[key] || "").trim();
  const issues: string[] = [];
  const interest =
    ({ high: "High", medium: "Medium", low: "Low" } as Record<string, string>)[
      get("Interest Level").toLowerCase()
    ] || "NA";
  if (interest === "NA") issues.push("Missing or unsupported Interest Level");
  const originalExecutive = get("Name of Ground Executive");
  const executive = normalName(originalExecutive).replace(
    /ghosal ghosal$/,
    "ghosal",
  );
  const executiveName = (
    {
      "sumesh mukundan": "Sumesh Mukundan",
      shinoy: "Shinoy",
      "indranil ghosal": "Indranil Ghosal",
      vineet: "Vineet Shinde",
      "vineet and navjot": "Vineet Shinde",
    } as Record<string, string>
  )[executive];
  if (executive === "vineet and navjot")
    issues.push("Joint executive credit: Vineet and Navjot; linked to Vineet");
  if (!executiveName) issues.push("Ground Executive does not match a user");
  const company = get("Company name ");
  if (!company) issues.push("Missing company name");
  const phones = mobiles(get("Mobile Number"));
  const phone = phones[0] || null;
  if (!phone) issues.push("Missing or invalid mobile number");
  const pin = get("Pincode");
  if (pin && !/^[1-9]\d{5}$/.test(pin)) issues.push("Invalid PIN code");
  const timestamp = legacyDate(get("Timestamp"));
  if (!timestamp) issues.push("Invalid consultation timestamp");
  const followup = legacyDate(get("Next Follow-up Date"));
  if (get("Next Follow-up Date") && !followup)
    issues.push("Invalid next follow-up date");
  if (get("ShopVisit date") && !legacyDate(get("ShopVisit date")))
    issues.push("Invalid shop visit date");
  const outcome = get("Lead Outcome") || "NA";
  if (outcome === "NA") issues.push("Missing lead outcome");
  const onboarded = [get("Status"), get(""), outcome].some((s) =>
    ["onboarded", "on-boarding done"].includes(s.toLowerCase()),
  );
  return {
    id:
      "legacy_consult_" +
      createHash("sha256")
        .update(JSON.stringify([LEGACY_BATCH, rowNumber, raw]))
        .digest("hex")
        .slice(0, 32),
    rowNumber,
    raw,
    issues,
    interest,
    originalExecutive,
    executiveName,
    company,
    phone,
    phones,
    pin: /^[1-9]\d{5}$/.test(pin) ? pin : null,
    timestamp,
    followup,
    outcome,
    onboarded,
  };
}
