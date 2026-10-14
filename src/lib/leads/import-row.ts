import { importLocation } from "../import-location";
import { parseImportDate } from "../import-date";
import { parseLeadPhones } from "./phones";

const text = (value: unknown) => String(value ?? "").trim();

function safePhones(value: unknown) {
  try {
    return parseLeadPhones([value]).filter(
      (phone) => /^\d{7,15}$/.test(phone.replace(/\D/g, "")),
    );
  } catch {
    return [];
  }
}

export function prepareImportRow(raw: Record<string, unknown>) {
  const lead_source = text(raw.lead_source);
  if (!lead_source) throw new RangeError("Lead Source is required");

  const location = importLocation(raw);
  const routable = !!location?.valid && !location.mismatch;
  const rawPin = text(raw.pin_code);
  const pin_code = /^[1-9]\d{5}$/.test(rawPin) ? rawPin : null;
  const phones = safePhones(raw.phone_no);
  const rawPhone = text(raw.phone_no);
  const address = text(raw.address) || null;
  const owner_name = text(raw.owner_name || raw.contact_name) || null;
  const company_name =
    text(raw.company_name) ||
    owner_name ||
    `Unnamed lead${address ? ` — ${address.slice(0, 80)}` : ""}`;

  const context = [
    text(raw.email) ? `Email: ${text(raw.email)}` : "",
    rawPin && !pin_code ? `Original PIN: ${rawPin}` : "",
    rawPhone && !phones.length ? `Original phone: ${rawPhone}` : "",
    text(raw.extra_notes),
  ]
    .filter(Boolean)
    .join("\n");

  return {
    company_name,
    owner_name,
    phone_no: phones[0] || null,
    phones,
    pin_code,
    address,
    lead_source,
    intake_team: routable ? "ground" : "caller",
    lat: routable ? location.lat : null,
    lng: routable ? location.lng : null,
    geocode_status: routable
      ? ("ok" as const)
      : location
        ? (location.valid ? ("mismatch_flagged" as const) : ("mapping_issue" as const))
        : null,
    geocode_source: routable ? ("google_link" as const) : null,
    location_verified: routable,
    geocode_issue_reason: routable
      ? null
      : location
        ? location.valid
          ? "Imported matched name differs from firm; confirm location"
          : location.reason
        : "No imported coordinates — assigned to Calling Queue",
    category: text(raw.category) || "General",
    region: text(raw.region) || "Unassigned",
    website: text(raw.website) || null,
    google_map_link: text(raw.google_map_link) || null,
    notes: text(raw.notes) || null,
    extra_notes: context || null,
    scraped_date: parseImportDate(raw.scraped_date),
  };
}

export function importDuplicateKey(row: {
  company_name: string;
  phone_no: string | null;
  pin_code: string | null;
  lat: number | null;
  lng: number | null;
}) {
  const company = row.company_name.trim().toLocaleLowerCase();
  if (row.phone_no)
    return `phone:${row.phone_no.replace(/\D/g, "")}:${row.pin_code || ""}`;
  if (row.lat != null && row.lng != null)
    return `place:${company}:${row.lat.toFixed(6)}:${row.lng.toFixed(6)}`;
  return `name:${company}:${row.pin_code || ""}`;
}
