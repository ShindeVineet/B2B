import test from "node:test";
import assert from "node:assert/strict";
import { proximityOrder } from "../src/lib/route-order";
import { routeLinks } from "../src/lib/route-links";
test("Routes choose the closest next stop from the store regardless of assignment order", () => {
  const origin = { lat: 12, lng: 77 };
  const stops = [
    { id: "far", lat: 12.04, lng: 77 },
    { id: "near", lat: 12.01, lng: 77 },
    { id: "middle", lat: 12.02, lng: 77 },
  ];
  const ordered = proximityOrder(stops, origin);
  assert.deepEqual(
    ordered.map((p) => p.id),
    ["near", "middle", "far"],
  );
  assert.deepEqual(
    stops.map((p) => p.id),
    ["far", "near", "middle"],
  );
  const url = new URL(routeLinks(ordered, origin)[0]);
  assert.equal(url.searchParams.get("waypoints"), "12.01,77|12.02,77");
  assert.equal(url.searchParams.get("destination"), "12.04,77");
});
test("No-store ordering is deterministic and does not discard missing stops", () => {
  const points = [
    { id: "b", lat: 12, lng: 77.2 },
    { id: "a", lat: 12, lng: 77.1 },
    { id: "missing", lat: null, lng: null },
  ];
  assert.deepEqual(
    proximityOrder(points).map((p) => p.id),
    ["a", "b", "missing"],
  );
  assert.deepEqual(
    proximityOrder(points.slice().reverse()).map((p) => p.id),
    ["a", "b", "missing"],
  );
  assert.throws(() => routeLinks(proximityOrder(points)));
});
