import test from "node:test";
import assert from "node:assert/strict";
import { validateGstFields } from "../src/lib/partners/validation";
import { parseLeadPhones } from "../src/lib/leads/phones";

test("GST registration requires a number; certificate is optional", () => {
  for (const fields of [
    {},
    { gst_certificate_url: "/api/documents/one" },
    { gst_no: "  ", gst_certificate_url: "/api/documents/one" },
  ])
    assert.throws(() => validateGstFields({ gst_registered: true, ...fields }));
  assert.doesNotThrow(() =>
    validateGstFields({ gst_registered: true, gst_no: "GST123" }),
  );
  assert.doesNotThrow(() =>
    validateGstFields({
      gst_registered: true,
      gst_no: "GST123",
      gst_certificate_url: "/api/documents/one",
    }),
  );
});

test("Blank GST defaults to No; non-blank invalid values are rejected", () => {
  assert.doesNotThrow(() => validateGstFields({ gst_registered: false }));
  for (const value of [null, undefined, "", "   "]) {
    const input = { gst_registered: value as unknown };
    validateGstFields(input);
    assert.equal(input.gst_registered, false);
  }
  for (const value of ["false", "Yes", 0])
    assert.throws(() => validateGstFields({ gst_registered: value }));
});

test("Multiple phone columns and delimited cells retain primary order and deduplicate", () => {
  assert.deepEqual(
    parseLeadPhones([
      "+91 98765 43210; 044-12345678",
      "+91-98765-43210, 9999999999",
      null,
    ]),
    ["+91 98765 43210", "044-12345678", "9999999999"],
  );
  assert.deepEqual(parseLeadPhones(["", null]), []);
  assert.deepEqual(parseLeadPhones([9876543210]), ["9876543210"]);
  assert.throws(() => parseLeadPhones(["call office"]));
  assert.throws(() => parseLeadPhones([1.5]));
});

import { matchPartnerRegion } from "../src/lib/partners/regions";
import { formatPartnerCode } from "../src/lib/partners/codes";
test("Partner code formatting preserves uniqueness beyond padding width", () => {
  const codes = Array.from({ length: 10001 }, (_, i) =>
    formatPartnerCode(i + 1),
  );
  assert.equal(new Set(codes).size, codes.length);
  assert.equal(codes[0], "FLZ-P-0001");
  assert.equal(codes[10000], "FLZ-P-10001");
  assert.equal(formatPartnerCode(12, "CUSTOM-"), "CUSTOM-0012");
});
test("Historical region matching prefers exact PIN and refuses ambiguous matches", () => {
  const stores = [
    { pin_code: "600001", region: "Chennai" },
    { pin_code: "500001", region: "Hyderabad" },
  ];
  const cities = [{ city: "Chennai", region: "Chennai" }];
  assert.equal(
    matchPartnerRegion({ pincode: "600001", city: "Other" }, stores, cities),
    "Chennai",
  );
  assert.equal(
    matchPartnerRegion(
      { pincode: "unknown", city: " CHENNAI " },
      stores,
      cities,
    ),
    "Chennai",
  );
  assert.equal(
    matchPartnerRegion({ pincode: "unknown", city: "Unknown" }, stores, cities),
    null,
  );
  assert.equal(
    matchPartnerRegion(
      { pincode: "600001", city: "Chennai" },
      [...stores, { pin_code: "600001", region: "Conflict" }],
      cities,
    ),
    null,
  );
  assert.equal(
    matchPartnerRegion(
      {
        pincode: "600001",
        city: "Chennai",
        source_lead_id: "lead",
        source_lead: { store: { region: "Hyderabad" } },
      },
      stores,
      cities,
    ),
    "Hyderabad",
  );
  assert.equal(
    matchPartnerRegion(
      { pincode: "unknown", city: "Unknown", region_override: "Chennai" },
      stores,
      cities,
    ),
    "Chennai",
  );
});
