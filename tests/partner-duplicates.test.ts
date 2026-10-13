import test from "node:test";
import assert from "node:assert/strict";
import {
  samePartnerIdentity,
  isPartnerImportDuplicate,
} from "../src/lib/partners/duplicates";
const partner = {
  company_firm_name: "Example Firm",
  contact_person_name: "Alex Kumar",
  designation: "Director",
  mobile_number: "9999999999",
  gst_no: "GST-SHARED",
  partner_code: "FLZBLR01",
};
test("Same company can onboard another contact, another designation, or both despite shared phone/GST", () => {
  for (const change of [
    { contact_person_name: "Sam Kumar" },
    { designation: "Manager" },
    { contact_person_name: "Sam Kumar", designation: "Manager" },
  ]) {
    const other = { ...partner, ...change, partner_code: "FLZBLR02" };
    assert.equal(samePartnerIdentity(partner, other), false);
    assert.equal(isPartnerImportDuplicate(partner, other), false);
  }
});
test("Exact company/contact/designation duplicates ignore case and whitespace", () => {
  const other = {
    ...partner,
    company_firm_name: " example   firm ",
    contact_person_name: " ALEX KUMAR ",
    designation: " director ",
    mobile_number: "8888888888",
    gst_no: null,
    partner_code: "FLZBLR02",
  };
  assert.equal(samePartnerIdentity(partner, other), true);
  assert.equal(isPartnerImportDuplicate(partner, other), true);
});
test("A partner code cannot identify two different contacts; unrelated company phone/GST conflicts still get review", () => {
  assert.equal(
    isPartnerImportDuplicate(partner, {
      ...partner,
      contact_person_name: "Sam",
    }),
    true,
  );
  assert.equal(
    isPartnerImportDuplicate(partner, {
      ...partner,
      partner_code: "FLZBLR02",
      company_firm_name: "Other Firm",
    }),
    true,
  );
  assert.equal(samePartnerIdentity({}, {}), false);
});

test("GST identifies a renamed company without merging distinct project managers", () => {
  const renamed = { ...partner, partner_code: "FLZBLR02", company_firm_name: "Example Firm LLP" };
  assert.equal(samePartnerIdentity(partner, renamed), true);
  assert.equal(samePartnerIdentity(partner, { ...renamed, contact_person_name: "Second Manager" }), false);
  assert.equal(isPartnerImportDuplicate(partner, { ...renamed, contact_person_name: "Second Manager" }), false);
});
