import { parseLeadPhones } from "./phones";
export const LEAD_SOURCES = ["CDT", "Phone", "LinkedIn", "Walk-in", "Book Directory", "Google Maps", "Manual"] as const;
export type LeadSource = typeof LEAD_SOURCES[number];
export function normalizeSource(value: unknown): LeadSource {
  const key = String(value ?? "").trim().toLowerCase();
  const aliases: Record<string, LeadSource> = { "manual entry": "Manual", "directory book": "Book Directory", "book directory": "Book Directory", "google map": "Google Maps", "walk in": "Walk-in" };
  const source = aliases[key] || LEAD_SOURCES.find(s => s.toLowerCase() === key);
  if (!source) throw new RangeError("Choose a lead source");
  return source;
}
export function intakeTeam(source: LeadSource) {
  return ["CDT", "Phone", "LinkedIn"].includes(source) ? "caller" : source === "Walk-in" ? "store" : source === "Manual" ? "head" : "ground";
}
export function validateIntake(raw: Record<string, unknown>) {
  const source = normalizeSource(raw.lead_source);
  const text = (key: string) => {
    if (raw[key] != null && typeof raw[key] !== "string") throw new RangeError(`${key}: use text`);
    const value = String(raw[key] ?? "").trim();
    if (value.length > 2000) throw new RangeError(`${key} is too long`);
    return value;
  };
  const fields = { company_name: text("company_name"), owner_name: text("owner_name"), address: text("address"), pin_code: text("pin_code"), phone_no: text("phone_no") };
  const required = intakeTeam(source) === "ground" ? Object.keys(fields) : source === "Walk-in" ? ["phone_no", "owner_name"] : ["phone_no"];
  for (const key of required) if (!fields[key as keyof typeof fields]) throw new RangeError(`${key.replaceAll("_", " ")} is required for ${source}`);
  const numbers = parseLeadPhones([fields.phone_no]);
  if (!numbers.length || numbers.some(n => !/^\d{7,15}$/.test(n.replace(/\D/g, "")))) throw new RangeError("A valid phone number is required");
  if (fields.pin_code && !/^[1-9]\d{5}$/.test(fields.pin_code)) throw new RangeError("Enter a valid six-digit PIN code");
  return { ...fields, phone_no: numbers[0], numbers, lead_source: source, intake_team: intakeTeam(source) };
}
