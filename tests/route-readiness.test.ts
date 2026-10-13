import test from "node:test";
import assert from "node:assert/strict";
import {
  routeReadiness,
  selectLatestRouteLeads,
} from "../src/lib/route-readiness";
import { routeLinks } from "../src/lib/route-links";
test("Accepted saved coordinates are route-ready without manual verification or an address", () => {
  assert.equal(
    routeReadiness({ lat: 12.97, lng: 77.69, geocode_status: "ok" }),
    "ready",
  );
  assert.equal(routeReadiness({ lat: 12.97, lng: 77.69 }), "ready");
});
test("GPS review with saved coordinates is not a missing-location prompt", () => {
  assert.equal(
    routeReadiness({
      lat: 12.97,
      lng: 77.69,
      geocode_status: "mismatch_flagged",
    }),
    "review",
  );
  assert.equal(
    routeReadiness({ lat: null, lng: null, geocode_status: "mapping_issue" }),
    "review",
  );
  assert.equal(routeReadiness({ lat: null, lng: null }), "missing");
});
test("Route selection uses refreshed locations and never silently drops inaccessible leads", () => {
  const latest = [{ id: "lead", lat: 12.97, lng: 77.69, geocode_status: "ok" }];
  const selected = selectLatestRouteLeads(["lead"], latest);
  assert.equal(routeReadiness(selected[0]), "ready");
  assert.equal(routeLinks(selected).length, 1);
  assert.throws(
    () => selectLatestRouteLeads(["lead", "reassigned"], latest),
    /no longer assigned/,
  );
});
