import {routeDistance} from "../src/lib/clustering/cluster-leads";
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRouteBatch,
  refineRoutes,
  cheapestInsertion,
} from "../src/lib/routes/geometry";
import { visitPoolReason } from "../src/lib/routes/eligibility";
const pool = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: String(i),
    lat: 12.9 + i * 0.001,
    lng: 77.5 + (i % 5) * 0.001,
  }));
for (const [size, n, remainder] of [
  [50, 10, 0],
  [51, 10, 1],
  [57, 10, 7],
  [3, 10, 3],
  [0, 10, 0],
])
  test(`batch ${size}/${n} preserves remainder`, () => {
    const result = buildRouteBatch(pool(size), n);
    assert.equal(result.routes.length, Math.floor(size / n));
    assert.equal(result.remainder.length, remainder);
    assert.equal(
      new Set([...result.routes.flat().map((p) => p.id), ...result.remainder])
        .size,
      size,
    );
    assert.ok(result.routes.every((r) => r.length === n));
  });
test("explicit K leaves all overflow unassigned", () => {
  assert.equal(buildRouteBatch(pool(51), 10, 3).remainder.length, 21);
  assert.throws(() => buildRouteBatch(pool(9), 10, 1));
});
test("single route chooses the shortest compact batch from the full pool", () => {
  const dense = Array.from({ length: 4 }, (_, i) => ({
    id: `dense-${i}`,
    lat: 12.97 + i * 0.0001,
    lng: 77.59 + i * 0.0001,
  }));
  const sparse = [
    { id: "north", lat: 28.61, lng: 77.2 },
    { id: "west", lat: 19.07, lng: 72.87 },
  ];
  const result = buildRouteBatch([...sparse, ...dense], 4, 1, false);
  assert.deepEqual(
    new Set(result.routes[0].map((point) => point.id)),
    new Set(dense.map((point) => point.id)),
  );
  assert.deepEqual(result.remainder, ["north", "west"]);
});
test("boundary swaps lower distance without losing or duplicating stops", () => {
  const groups = Array.from({ length: 10 }, (_, g) =>
    Array.from({ length: 5 }, (_, i) => ({
      id: `${g}-${i}`,
      lat: 12.8 + g * 0.025,
      lng: 77.5 + i * 0.002,
    })),
  );
  [groups[0][4], groups[1][0]] = [groups[1][0], groups[0][4]];
  [groups[4][4], groups[5][0]] = [groups[5][0], groups[4][4]];
  const refined = refineRoutes(groups);
  assert.equal(refined.before,groups.reduce((sum,r)=>sum+routeDistance(r),0));
  assert.ok(refined.after < refined.before);
  assert.ok(refined.routes.every((r) => r.length === 5));
  assert.equal(new Set(refined.routes.flat().map((p) => p.id)).size, 50);
  console.log(
    `Synthetic 10-route refinement: ${refined.before.toFixed(2)} km -> ${refined.after.toFixed(2)} km (${refined.improvement_percent.toFixed(1)}%)`,
  );
});
test("cheapest insertion finds middle stop", () => {
  const stops = [
    { id: "a", lat: 12, lng: 77 },
    { id: "b", lat: 12, lng: 77.2 },
  ];
  assert.deepEqual(
    cheapestInsertion(stops, { id: "c", lat: 12, lng: 77.1 }).stops.map(
      (p) => p.id,
    ),
    ["a", "c", "b"],
  );
});
test("visited leads need an explicit dated follow-up and no unresolved visit", () => {
  const latest = {
    status: "visited",
    completed: true,
    consultation: {
      outcome: "Visit scheduled",
      next_follow_up_date: "2026-10-12",
    },
  };
  assert.equal(visitPoolReason(latest, false, false), null);
  assert.equal(
    visitPoolReason(
      {
        ...latest,
        consultation: { ...latest.consultation, outcome: "Nurturing required" },
      },
      false,
      false,
    ),
    null,
  );
  assert.ok(
    visitPoolReason(
      {
        ...latest,
        consultation: { ...latest.consultation, next_follow_up_date: null },
      },
      false,
      false,
    ),
  );
  assert.ok(
    visitPoolReason(
      {
        ...latest,
        consultation: {
          ...latest.consultation,
          outcome: "Dont want commission",
        },
      },
      false,
      false,
    ),
  );
  assert.ok(visitPoolReason(latest, true, false));
  assert.ok(visitPoolReason(latest, false, true));
});

test("short revisit follow-ups re-enter routing only with a date",()=>{
 for(const outcome of ['Follow-up needed',"Couldn't meet"]){
  const v={status:'visited',completed:true,consultation:{outcome,next_follow_up_date:'2026-10-12'}};
  assert.equal(visitPoolReason(v,false,false),null);
  assert.ok(visitPoolReason({...v,consultation:{outcome,next_follow_up_date:null}},false,false));
 }
 assert.ok(visitPoolReason({status:'visited',completed:true,consultation:{outcome:'Ready for onboarding',next_follow_up_date:null}},false,false));
});
