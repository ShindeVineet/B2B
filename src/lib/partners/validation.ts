import { partnerType } from "./identity";
// Kept for UI dropdowns; no longer enforced as a hard enum on import/save
export const PROFESSIONAL_TYPES = [
  "architect",
  "interior_designer",
  "builder",
  "contractor",
  "other",
] as const;
export const ONBOARDING_SOURCES = [
  "ground_visit",
  "referral",
  "website",
  "walk_in",
  "other",
] as const;

/** Shared by onboarding UI and server; attachment ownership is checked separately. */
export function validateGstFields(input: {
  gst_registered: unknown;
  gst_no?: unknown;
  gst_certificate_url?: unknown;
}) {
  // User-approved legacy rule: blank/missing means not registered.
  if (
    input.gst_registered == null ||
    (typeof input.gst_registered === "string" && !input.gst_registered.trim())
  )
    input.gst_registered = false;
  if (typeof input.gst_registered !== "boolean")
    throw new RangeError("Choose Yes or No for GST Registered");
  // Only GST No. is required when registered.
  // GST Certificate is optional — older partners may have pending certification.
  for (const [key, label, required] of [
    ["gst_no", "GST No.", true],
    ["gst_certificate_url", "GST Certificate", false],
  ] as const) {
    const value = input[key as keyof typeof input];
    if (value != null && typeof value !== "string")
      throw new RangeError(`${label}: invalid value`);
    if (
      required &&
      input.gst_registered &&
      !(typeof value === "string" && value.trim())
    )
      throw new RangeError(`${label} is required when GST Registered is Yes`);
  }
}

export function validatePartner(raw: Record<string, unknown>) {
  const text = (key: string, required = true) => {
    const value =
      key === "years_operating" &&
      typeof raw[key] === "number" &&
      Number.isFinite(raw[key])
        ? String(raw[key])
        : raw[key];
    if (value != null && typeof value !== "string")
      throw new RangeError(`${key}: use text`);
    const result = String(value ?? "").trim();
    if (required && !result) throw new RangeError(`${key} is required`);
    if (result.length > 10000) throw new RangeError(`${key} is too long`);
    return result;
  };
  const number = (key: string, integer = false) => {
    if (raw[key] == null || raw[key] === "")
      throw new RangeError(`${key} is required`);
    if (typeof raw[key] !== "string" && typeof raw[key] !== "number")
      throw new RangeError(`${key}: invalid number`);
    const n = Number(raw[key]);
    if (!Number.isFinite(n) || n < 0 || (integer && !Number.isSafeInteger(n)))
      throw new RangeError(`${key}: invalid number`);
    return n;
  };
  validateGstFields(raw as { gst_registered: unknown });
  // Accept any non-empty string — the CSV may contain values like
  // "Interior Designer", "Architect", "Builder & Contractor", etc.
  const professional = text("type_of_professional");
  // onboarded_from is optional — leave blank if not known
  const source = text("onboarded_from", false);
  if (source && !(ONBOARDING_SOURCES as readonly string[]).includes(source))
    throw new RangeError("Choose a valid onboarding source");
  const onboarded_at = raw.onboarded_at
    ? new Date(text("onboarded_at"))
    : new Date();
  if (!Number.isFinite(onboarded_at.getTime()))
    throw new RangeError("Invalid timestamp");
  const contacts = raw.additional_contacts ?? [];
  if (!Array.isArray(contacts) || contacts.length > 20)
    throw new RangeError("Use at most 20 additional contacts");
  const additional_contacts = contacts.map((c: unknown) => {
    if (
      !c ||
      typeof c !== "object" ||
      !("name" in c) ||
      typeof c.name !== "string" ||
      !c.name.trim() ||
      c.name.length > 200
    )
      throw new RangeError("Each additional contact needs a name");
    const phone = "phone" in c ? c.phone : "";
    if (
      typeof phone !== "string" ||
      phone.length > 40 ||
      (phone && !/^\+?[\d\s().-]{7,40}$/.test(phone))
    )
      throw new RangeError("Invalid additional contact phone");
    return { name: c.name.trim(), phone: phone.trim() };
  });
  if (raw.is_referral != null && typeof raw.is_referral !== "boolean") throw new RangeError("Invalid referral selection");
  if (raw.whatsapp_group_created != null && typeof raw.whatsapp_group_created !== "boolean") throw new RangeError("Invalid WhatsApp group selection");
  const referral = raw.is_referral === false ? null : text("referred_by_partner_id", false) || null;
  if (raw.is_referral === true && !referral) throw new RangeError("Select the referring partner");
  return {
    company_legal_name: text("company_legal_name", false) || null,
    partner_type: partnerType(raw.partner_type, raw.gst_no),
    referred_by_partner_id: referral,
    whatsapp_group_created: raw.whatsapp_group_created === true,
    additional_contacts,
    company_firm_name: text("company_firm_name"),
    contact_person_name: text("contact_person_name"),
    designation: text("designation"),
    mobile_number: text("mobile_number"),
    business_email_id: text("business_email_id", false) || null,
    form_submitter_email: text("form_submitter_email", false) || null,
    office_address: text("office_address"),
    pincode: text("pincode"),
    city: text("city"),
    state: text("state"),
    type_of_professional: professional,
    // Accept any text — "5 years", "10+", "~3", or a plain number
    years_operating: text("years_operating"),
    specialized_in: text("specialized_in"),
    expected_monthly_order_value: number("expected_monthly_order_value"),
    gst_registered: raw.gst_registered as boolean,
    gst_no: text("gst_no", false) || null,
    gst_certificate_url: text("gst_certificate_url", false) || null,
    pan_no: text("pan_no"),
    pan_card_url: text("pan_card_url", false) || null,
    bank_document_url: text("bank_document_url", false) || null,
    bank_account_name: text("bank_account_name"),
    bank_name: text("bank_name"),
    branch: text("branch"),
    account_no: text("account_no"),
    ifsc_code: text("ifsc_code"),
    onboarded_from: (source || null) as
      (typeof ONBOARDING_SOURCES)[number] | null,
    onboarded_at,
  };
}
