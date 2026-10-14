import test from "node:test";
import assert from "node:assert/strict";
import { correctedPoint, firmKey, matchCorrectedRows } from "../src/lib/leads/location-reconciliation";

test("firm matching ignores punctuation and legal suffixes without fuzzy guessing", () => {
  assert.equal(firmKey("Ahir Consultancy Pvt. Ltd."), firmKey("Ahir Consultancy Private Limited"));
  assert.notEqual(firmKey("ABC Architects"), firmKey("ABC Interiors"));
});

test("duplicate names use phone then PIN and unresolved duplicates stay ambiguous", () => {
  const leads = [
    { id: "a", company_name: "Studio One Pvt Ltd", phone_no: "9876543210", pin_code: "560001" },
    { id: "b", company_name: "Studio One", phone_no: "9123456780", pin_code: "560002" },
  ];
  const result = matchCorrectedRows([
    { firm_name: "Studio One Private Limited", phone_numbers: "+91 98765 43210" },
    { firm_name: "Studio One", pincode: "560002" },
    { firm_name: "Studio One" },
  ], leads);
  assert.equal(result.matched.get("a")?.phone_numbers, "+91 98765 43210");
  assert.equal(result.matched.get("b")?.pincode, "560002");
  assert.equal(result.ambiguous.length, 1);
});

test("only valid India coordinates become corrected points", () => {
  assert.deepEqual(correctedPoint({ Lat: "12.97", Lng: "77.59" }), { lat: 12.97, lng: 77.59 });
  assert.equal(correctedPoint({ Lat: "", Lng: "" }), null);
  assert.equal(correctedPoint({ Lat: "77.59", Lng: "12.97" }), null);
});
