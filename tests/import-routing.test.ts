import test from "node:test";
import assert from "node:assert/strict";
import { importDuplicateKey, prepareImportRow } from "../src/lib/leads/import-row";

test("import routing depends on valid location, not phone presence", () => {
  const located = prepareImportRow({
    lead_source: "Houzz",
    company_name: "Located Studio",
    lat: "12.97",
    lng: "77.59",
  });
  assert.equal(located.intake_team, "ground");
  assert.equal(located.phone_no, null);
  assert.equal(located.location_verified, true);

  const calling = prepareImportRow({
    lead_source: "SCRIBD",
    company_name: "Phone Studio",
    phone_no: "9876543210",
  });
  assert.equal(calling.intake_team, "caller");
  assert.equal(calling.phone_no, "9876543210");
  assert.match(calling.geocode_issue_reason!, /Calling Queue/);
});

test("source is preserved and malformed optional values remain in context", () => {
  const row = prepareImportRow({
    lead_source: "TILE FITTER",
    address: "109 Infantry Road",
    pin_code: "560 001",
    phone_no: "2.33639392322886e+35",
    email: "lead@example.com",
  });
  assert.equal(row.lead_source, "TILE FITTER");
  assert.equal(row.company_name, "Unnamed lead — 109 Infantry Road");
  assert.equal(row.pin_code, null);
  assert.equal(row.phone_no, null);
  assert.match(row.extra_notes!, /Original PIN: 560 001/);
  assert.match(row.extra_notes!, /Original phone:/);
  assert.match(row.extra_notes!, /Email: lead@example.com/);
});

test("duplicates work for phone, coordinate-only and unlocated records", () => {
  assert.match(importDuplicateKey({ company_name: "A", phone_no: "98765 43210", pin_code: "560001", lat: null, lng: null }), /^phone:/);
  assert.match(importDuplicateKey({ company_name: "A", phone_no: null, pin_code: null, lat: 12.9, lng: 77.5 }), /^place:/);
  assert.match(importDuplicateKey({ company_name: "A", phone_no: null, pin_code: "560001", lat: null, lng: null }), /^name:/);
});
