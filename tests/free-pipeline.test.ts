import test from "node:test";
import assert from "node:assert/strict";
import { overpassQuery, overpassCandidates } from "../src/lib/mapping/overpass";
import { normalizedQuery } from "../src/lib/mapping/query-cache";
import { navigationUrl } from "../src/lib/lead-navigation";
import { allotmentSuggestion } from "../src/lib/assignment/allotment";
const point = { lat: 12.97, lng: 77.69 };
test("Overpass searches bounded named POIs with escaped query tokens", () => {
  const q = overpassQuery('MSP "Interiors"; out;', {
    north: 13,
    south: 12.9,
    east: 77.8,
    west: 77.6,
  });
  assert.ok(q?.includes("(12.9,77.6,13,77.8)"));
  assert.ok(q?.includes('["name"~"msp|interiors|out",i]'));
  assert.equal(
    overpassQuery("!!!", { north: 13, south: 12.9, east: 77.8, west: 77.6 }),
    null,
  );
  const results = overpassCandidates({
    elements: [
      { lat: 12.97, lon: 77.69, tags: { name: "Shop", shop: "tiles" } },
      {
        center: { lat: 12.98, lon: 77.7 },
        tags: { name: "Office", office: "architect" },
      },
      { lat: 12.97, lon: 77.69, tags: { name: "City", place: "city" } },
    ],
  });
  assert.equal(results.length, 2);
  assert.equal(results[1].lng, 77.7);
  assert.throws(() => overpassCandidates({ elements: [], remark: "timeout" }));
});
test("Query normalization reuses whitespace and case variants", () => {
  assert.equal(
    normalizedQuery(" MSP   Interiors "),
    normalizedQuery("msp interiors"),
  );
});
test("Navigation uses only validated lead coordinates and ignores imported URL", () => {
  assert.equal(
    navigationUrl({ ...point, geocode_status: "ok" }),
    "https://www.google.com/maps/dir/?api=1&destination=12.97,77.69",
  );
  for (const geocode_status of ["mapping_issue", "invalid", "mismatch_flagged"])
    assert.equal(navigationUrl({ ...point, geocode_status }), null);
  assert.equal(
    navigationUrl({ ...point, geocode_source: "pincode_dataset" }),
    null,
  );
  assert.equal(navigationUrl({ lat: null, lng: null }), null);
});
test("Allotment retains service PIN priority but unresolved leads never receive suggestions", () => {
  const stores = [
    { id: "near", name: "Near", ...point, radius_km: 5, service_pincodes: [] },
    {
      id: "pin",
      name: "PIN",
      lat: 13,
      lng: 77.7,
      radius_km: 5,
      service_pincodes: [{ pin_code: "560001" }],
    },
  ];
  assert.equal(
    allotmentSuggestion(
      { ...point, pin_code: "560001", geocode_status: "ok" },
      stores,
    )?.store?.id,
    "pin",
  );
  assert.equal(
    allotmentSuggestion(
      { ...point, pin_code: "560002", geocode_status: "ok" },
      stores,
    )?.store?.id,
    "near",
  );
  assert.equal(
    allotmentSuggestion(
      { ...point, pin_code: "560001", geocode_status: "mapping_issue" },
      stores,
    ),
    null,
  );
});
