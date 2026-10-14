import { inIndia } from "@/lib/location";

export type CorrectedLocationRow = {
  firm_name?: unknown;
  phone_numbers?: unknown;
  pincode?: unknown;
  Lat?: unknown;
  Lng?: unknown;
  FormattedAddress?: unknown;
  address?: unknown;
  GoogleMapsLink?: unknown;
  GeocodeStatus?: unknown;
};

export type ReconciliationLead = {
  id: string;
  company_name: string;
  phone_no: string | null;
  pin_code: string | null;
  phones?: { phone_number: string }[];
};

const legalSuffixes = new Set([
  "co", "company", "inc", "incorporated", "llp", "limited", "ltd", "pvt", "private",
]);

export function firmKey(value: unknown) {
  const tokens = String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  while (tokens.length > 1 && legalSuffixes.has(tokens.at(-1)!)) tokens.pop();
  return tokens.join(" ");
}

export function phoneKey(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : "";
}

function phoneKeys(value: unknown) {
  return new Set(
    String(value ?? "")
      .split(/[,;|/\n]+/)
      .map(phoneKey)
      .filter(Boolean),
  );
}

export function pinKey(value: unknown) {
  const pin = String(value ?? "").trim();
  return /^[1-9]\d{5}$/.test(pin) ? pin : "";
}

export function correctedPoint(row: CorrectedLocationRow) {
  const point = { lat: Number(row.Lat), lng: Number(row.Lng) };
  return inIndia(point) ? point : null;
}

export function matchCorrectedRows(
  rows: CorrectedLocationRow[],
  leads: ReconciliationLead[],
) {
  const leadsByName = Map.groupBy(leads, (lead) => firmKey(lead.company_name));
  const matched = new Map<string, CorrectedLocationRow>();
  const ambiguous: { row: CorrectedLocationRow; leadIds: string[]; reason: string }[] = [];
  const unmatched: CorrectedLocationRow[] = [];
  const conflicts = new Set<string>();

  for (const row of rows) {
    const key = firmKey(row.firm_name);
    if (!key) {
      unmatched.push(row);
      continue;
    }
    let candidates = leadsByName.get(key) || [];
    if (candidates.length > 1) {
      const phones = phoneKeys(row.phone_numbers);
      const byPhone = phones.size
        ? candidates.filter((lead) =>
            [lead.phone_no, ...(lead.phones || []).map((item) => item.phone_number)]
              .map(phoneKey)
              .some((phone) => phone && phones.has(phone)),
          )
        : [];
      if (byPhone.length === 1) candidates = byPhone;
      else {
        const pin = pinKey(row.pincode);
        const byPin = pin ? candidates.filter((lead) => pinKey(lead.pin_code) === pin) : [];
        if (byPin.length === 1) candidates = byPin;
      }
    }
    if (candidates.length !== 1) {
      if (candidates.length)
        ambiguous.push({
          row,
          leadIds: candidates.map((lead) => lead.id),
          reason: "Company name matched multiple current leads",
        });
      else unmatched.push(row);
      continue;
    }
    const lead = candidates[0];
    const previous = matched.get(lead.id);
    if (!previous) matched.set(lead.id, row);
    else {
      const before = correctedPoint(previous), next = correctedPoint(row);
      if (before && next && (before.lat !== next.lat || before.lng !== next.lng)) {
        matched.delete(lead.id);
        conflicts.add(lead.id);
      } else if (!before && next) matched.set(lead.id, row);
    }
  }
  return { matched, ambiguous, unmatched, conflicts: [...conflicts] };
}
