import test from "node:test";
import assert from "node:assert/strict";
import {
  clusterLeadsIntoDays,
  orderDay,
  routeDistance,
  clusterSpan,
  nearestLeads,
  type ClusteringMode,
} from "../src/lib/clustering/cluster-leads";
const leads = Array.from({ length: 10 }, (_, i) => ({
  id: String(i),
  lat: 12 + i * 0.005,
  lng: 77 + i * 0.007,
}));
for (const mode of [
  "compact_sequential",
  "spread_coverage",
] as ClusteringMode[]) {
  test(`${mode}: even division and exact one-time coverage`, () => {
    const result = clusterLeadsIntoDays(
      leads,
      [2, 2, 2, 2, 2],
      { lat: 12, lng: 77 },
      mode,
    );
    assert.deepEqual(
      result.days.map((d) => d.lead_ids.length),
      [2, 2, 2, 2, 2],
    );
    assert.equal(new Set(result.days.flatMap((d) => d.lead_ids)).size, 10);
    assert.deepEqual(result.unscheduled_lead_ids, []);
  });
  test(`${mode}: uneven final batch and variable capacities`, () => {
    const result = clusterLeadsIntoDays(leads, [3, 2, 4, 4], null, mode);
    assert.deepEqual(
      result.days.map((d) => d.lead_ids.length),
      [3, 2, 4, 1],
    );
    assert.equal(result.days.at(-1)!.cluster_span_km, 0);
  });
}
test("Seeds distinguish compact continuation from spread coverage", () => {
  const points = [1, 1.1, 2, 2.1, 8, 8.1].map((x) => ({
    id: String(x),
    lat: 0,
    lng: x,
  }));
  const compact = clusterLeadsIntoDays(
    points,
    [2, 2, 2],
    { lat: 0, lng: 0 },
    "compact_sequential",
    { twoOptPasses: 0 },
  );
  const spread = clusterLeadsIntoDays(
    points,
    [2, 2, 2],
    { lat: 0, lng: 0 },
    "spread_coverage",
    { twoOptPasses: 0 },
  );
  assert.deepEqual(new Set(compact.days[0].lead_ids), new Set(["1", "1.1"]));
  assert.deepEqual(compact.days[1].lead_ids, ["2", "2.1"]);
  assert.deepEqual(new Set(spread.days[0].lead_ids), new Set(["8", "8.1"]));
  assert.deepEqual(new Set(spread.days[1].lead_ids), new Set(["1", "1.1"]));
});
test("Store-based batches take the closest capacity before route ordering", () => {
  const points = [
    { id: "seed", lat: 0, lng: 10 },
    { id: "a", lat: 0, lng: 9 },
    { id: "b", lat: 1.1, lng: 10 },
    { id: "chain", lat: 0, lng: 7.9 },
  ];
  const result = clusterLeadsIntoDays(
    points,
    [3, 1],
    { lat: 0, lng: 0 },
    "compact_sequential",
  );
  assert.ok(!result.days[0].lead_ids.includes("b"));
  assert.ok(result.days[0].lead_ids.includes("chain"));
});
test("No base uses stable northern seed regardless of input order; inputs remain untouched", () => {
  const input = Object.freeze(leads.map((l) => Object.freeze({ ...l })));
  const before = JSON.stringify(input);
  assert.deepEqual(
    clusterLeadsIntoDays(input, [3, 7], null),
    clusterLeadsIntoDays([...input].reverse(), [3, 7], null),
  );
  assert.ok(
    clusterLeadsIntoDays(input, [1], null).days[0].lead_ids.includes("9"),
  );
  assert.equal(JSON.stringify(input), before);
});
test("Zero capacity preserves day indexes and overflow is returned without extending", () => {
  const r = clusterLeadsIntoDays(leads, [0, 2, 0, 3], null);
  assert.deepEqual(
    r.days.map((d) => d.lead_ids.length),
    [0, 2, 0, 3],
  );
  assert.equal(r.unscheduled_lead_ids.length, 5);
  assert.equal(clusterLeadsIntoDays([], [], null).days.length, 0);
  assert.throws(() => clusterLeadsIntoDays(leads, [-1], null));
  assert.throws(() => clusterLeadsIntoDays([leads[0], leads[0]], [2], null));
});
test("Two-opt never worsens the open route and can be disabled; lookup is swappable", () => {
  const batch = [
    { id: "a", lat: 12, lng: 77 },
    { id: "b", lat: 12.1, lng: 77.1 },
    { id: "c", lat: 12, lng: 77.1 },
    { id: "d", lat: 12.1, lng: 77 },
  ];
  const start = { lat: 11.9, lng: 77 };
  const before = orderDay(batch, start, 0),
    after = orderDay(batch, start, 2);
  assert.ok(routeDistance(after, start) <= routeDistance(before, start) + 1e-9);
  assert.equal(new Set(after.map((l) => l.id)).size, 4);
  let calls = 0;
  clusterLeadsIntoDays(batch, [2, 2], start, "compact_sequential", {
    lookup: (p, pool, n) => {
      calls++;
      return nearestLeads(p, pool, n);
    },
  });
  assert.ok(calls > 0);
  assert.ok(clusterSpan(batch) > 15);
});

test("Spatial lookup matches scan results and honors the shrinking pool", async () => {
  const { createSpatialLookup } =
    await import("../src/lib/clustering/spatial-lookup");
  const points = Array.from({ length: 400 }, (_, i) => ({
    id: String(i),
    lat: 10 + ((i * 37) % 400) / 100,
    lng: 75 + ((i * 71) % 400) / 100,
  }));
  const lookup = createSpatialLookup(points),
    origin = { lat: 12, lng: 77 };
  for (const pool of [points, points.filter((_, i) => i % 3 === 0)])
    assert.deepEqual(
      lookup(origin, pool, 15).map((l) => l.id),
      nearestLeads(origin, pool, 15).map((l) => l.id),
    );
  const r = clusterLeadsIntoDays(points, Array(40).fill(10), origin);
  assert.equal(r.days.length, 40);
  assert.equal(new Set(r.days.flatMap((d) => d.lead_ids)).size, 400);
});

test("Two-opt removes a real nearest-neighbour detour", () => {
  const points = [
      { id: "0", lat: 12.64, lng: 77.86 },
      { id: "1", lat: 12.6, lng: 77.09 },
      { id: "2", lat: 12.14, lng: 77.95 },
      { id: "3", lat: 12.92, lng: 77.89 },
      { id: "4", lat: 12.55, lng: 77.18 },
      { id: "5", lat: 12.55, lng: 77.26 },
    ],
    start = { lat: 12, lng: 77 };
  assert.ok(
    routeDistance(orderDay(points, start, 2), start) <
      routeDistance(orderDay(points, start, 0), start) - 30,
  );
});
test("Every working day restarts at the base store rather than yesterday's last stop", () => {
  const points = [0.1, 2, -2.1, 3].map((lng) => ({
    id: String(lng),
    lat: 0,
    lng,
  }));
  const result = clusterLeadsIntoDays(
    points,
    [2, 1, 1],
    { lat: 0, lng: 0 },
    "compact_sequential",
  );
  assert.deepEqual(
    result.days.map((d) => d.lead_ids),
    [["0.1", "2"], ["-2.1"], ["3"]],
  );
});
