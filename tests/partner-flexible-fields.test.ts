import test from "node:test";
import assert from "node:assert/strict";
import { validatePartner } from "../src/lib/partners/validation";
const fields = {
  company_firm_name: "Example",
  contact_person_name: "Contact",
  designation: "Director",
  mobile_number: "9999999999",
  office_address: "Office",
  pincode: "560001",
  city: "BLR",
  state: "KA",
  type_of_professional: "Builder/Contractor",
  years_operating: "10+ years",
  specialized_in: "Both",
  expected_monthly_order_value: 100,
  pan_no: "TEST",
  bank_account_name: "Example",
  bank_name: "Bank",
  branch: "Branch",
  account_no: "00123",
  ifsc_code: "TEST001",
};
test("Partner flexible fields preserve professional/years text and optional source; blank GST defaults to No", () => {
  const p = validatePartner({ ...fields, gst_registered: "" });
  assert.equal(p.type_of_professional, "Builder/Contractor");
  assert.equal(p.years_operating, "10+ years");
  assert.equal(p.onboarded_from, null);
  assert.equal(p.gst_registered, false);
  assert.equal(
    validatePartner({ ...fields, years_operating: 23 }).years_operating,
    "23",
  );
  assert.equal(
    validatePartner({ ...fields, gst_registered: true, gst_no: "GST123" })
      .gst_certificate_url,
    null,
  );
  assert.throws(
    () => validatePartner({ ...fields, gst_registered: true }),
    /GST No/,
  );
  assert.throws(
    () => validatePartner({ ...fields, onboarded_from: "invalid" }),
    /source/,
  );
  assert.throws(
    () => validatePartner({ ...fields, years_operating: Infinity }),
    /text/,
  );
});

test("Additional named contacts retain primary identity and validate phone text", () => {
  const result = validatePartner({
    ...fields,
    additional_contacts: [{ name: "Second Person", phone: "9876543210" }],
  });
  assert.equal(result.contact_person_name, "Contact");
  assert.deepEqual(result.additional_contacts, [
    { name: "Second Person", phone: "9876543210" },
  ]);
  assert.throws(
    () =>
      validatePartner({
        ...fields,
        additional_contacts: [{ name: "", phone: "" }],
      }),
    /needs a name/,
  );
  assert.throws(
    () =>
      validatePartner({
        ...fields,
        additional_contacts: [{ name: "Second", phone: "invalid" }],
      }),
    /phone/,
  );
});

test("Referral selection is required only when checked; WhatsApp is a strict boolean", () => {
  assert.throws(() => validatePartner({ ...fields, is_referral: true }), /referring partner/);
  const result = validatePartner({ ...fields, is_referral: true, referred_by_partner_id: "partner-1", whatsapp_group_created: true });
  assert.equal(result.referred_by_partner_id, "partner-1");
  assert.equal(result.whatsapp_group_created, true);
  assert.equal(validatePartner({ ...fields, is_referral: false, referred_by_partner_id: "stale" }).referred_by_partner_id, null);
  assert.throws(() => validatePartner({ ...fields, whatsapp_group_created: "yes" }), /WhatsApp/);
});
