import test from "node:test";
import assert from "node:assert/strict";
import {
  parseLegacyRow,
  legacyDate,
  mobiles,
  normalName,
} from "../src/lib/legacy/consultations";
const row = {
  Timestamp: "30/06/2026 11:31:19",
  "Company name ": "Test Firm",
  "Interest Level": "MEdium",
  "Name of Ground Executive": "Indranil Ghosal Ghosal",
  "Mobile Number": "98765 43210 / 87654 32109",
  "Lead Outcome": "Nurturing required",
};
test("legacy import preserves executive credit and normalises interest and multiple phones", () => {
  const r = parseLegacyRow(row, 2);
  assert.equal(r.interest, "Medium");
  assert.equal(r.executiveName, "Indranil Ghosal");
  assert.equal(r.originalExecutive, "Indranil Ghosal Ghosal");
  assert.deepEqual(r.phones, ["9876543210", "8765432109"]);
  assert.equal(r.timestamp?.toISOString(), "2026-06-30T06:01:19.000Z");
  assert.equal(r.id, parseLegacyRow(row, 2).id);
  assert.notEqual(r.id, parseLegacyRow(row, 3).id);
});
test("missing key information stays NA and is flagged, not fabricated", () => {
  const r = parseLegacyRow({ Timestamp: "01/07/2026" }, 3);
  assert.equal(r.interest, "NA");
  assert.equal(r.executiveName, undefined);
  assert.equal(r.phone, null);
  assert.ok(r.issues.includes("Missing company name"));
  assert.ok(r.issues.includes("Missing or unsupported Interest Level"));
});
test("joint credit and unnamed onboarding claims remain reviewable", () => {
  const r = parseLegacyRow(
    {
      ...row,
      "Name of Ground Executive": "Vineet and Navjot",
      "": "Onboarded",
    },
    4,
  );
  assert.equal(r.executiveName, "Vineet Shinde");
  assert.equal(r.onboarded, true);
  assert.ok(r.issues.some((i) => i.startsWith("Joint executive")));
});
test("dates and phones reject malformed data without inventing coordinates or identities", () => {
  assert.equal(legacyDate("31/02/2026"), null);
  assert.equal(legacyDate("invalid"), null);
  assert.deepEqual(mobiles("Nil"), []);
  assert.deepEqual(mobiles("+91 98765 43210"), ["9876543210"]);
  assert.equal(normalName("  Test & Firm "), "test firm");
});
