import test from "node:test";
import assert from "node:assert/strict";
import {
  canConfirmImportedLocation,
  IMPORTED_NAME_MISMATCH,
  savedLocationLink,
} from "../src/lib/mapping/saved-location";
const lead = {
  lat: 12.97,
  lng: 77.59,
  geocode_status: "mismatch_flagged",
  geocode_issue_reason: IMPORTED_NAME_MISMATCH,
};
test("preserve and bulk-confirm only saved imported name mismatches", () => {
  assert.equal(canConfirmImportedLocation(lead), true);
  for (const patch of [
    { lat: null },
    { lng: NaN },
    { cannot_locate: true },
    { geocode_status: "mapping_issue" },
    { geocode_issue_reason: "not_found" },
    { geocode_issue_reason: "ambiguous" },
  ]) {
    assert.equal(canConfirmImportedLocation({ ...lead, ...patch }), false);
  }
});
test("review retains the original place link rather than substituting coordinates", () => {
  const link =
    "https://www.google.com/maps/search/?api=1&query=Park&query_place_id=ChIJ123";
  assert.equal(savedLocationLink(link), link);
  assert.equal(savedLocationLink("javascript:alert(1)"), null);
  assert.equal(savedLocationLink(null), null);
});
