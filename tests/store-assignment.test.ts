import test from "node:test";
import assert from "node:assert/strict";
import {
  matchLeadStore,
  parseServicePins,
} from "../src/lib/assignment/store-match";
const stores = [
  {
    id: "a",
    name: "A",
    lat: 13,
    lng: 80,
    radius_km: 5,
    service_pincodes: [{ pin_code: "600001" }],
  },
  {
    id: "b",
    name: "B",
    lat: 12.9,
    lng: 80,
    radius_km: 5,
    service_pincodes: [{ pin_code: "600002" }],
  },
];
test("Unique service PIN wins even without business coordinates", () => {
  const lead = { pin_code: "600001", lat: null, lng: null };
  const r = matchLeadStore(lead, stores);
  assert.equal(r.kind, "service_pin");
  assert.equal(r.store?.id, "a");
  assert.equal(r.distanceKm, null);
  assert.deepEqual(lead, { pin_code: "600001", lat: null, lng: null });
});
test("Overlapping PIN coverage never silently chooses a store", () => {
  const r = matchLeadStore({ pin_code: "600001", lat: 13, lng: 80 }, [
    stores[0],
    { ...stores[1], service_pincodes: [{ pin_code: "600001" }] },
  ]);
  assert.equal(r.kind, "overlap");
  assert.equal(r.store, null);
  assert.equal(r.candidates.length, 2);
});
test("Unmatched PIN uses a nearest-store suggestion, with an explicit approximate-PIN flag", () => {
  const r = matchLeadStore({ pin_code: "600003" }, stores, {
    lat: 12.91,
    lng: 80,
  });
  assert.equal(r.kind, "nearest");
  assert.equal(r.store?.id, "b");
  assert.equal(r.kind === "nearest" && r.approximate, true);
  assert.equal(matchLeadStore({ pin_code: "600003" }, stores).kind, "none");
  const exact = matchLeadStore(
    { pin_code: "600003", lat: 13, lng: 80 },
    stores,
    { lat: 12.91, lng: 80 },
  );
  assert.equal(exact.store?.id, "a");
  assert.equal(exact.kind === "nearest" && exact.approximate, false);
});
test("Service PIN lists normalize separators and reject malformed values", () => {
  assert.deepEqual(parseServicePins("600001,600002; 600001\n600003"), [
    "600001",
    "600002",
    "600003",
  ]);
  assert.throws(() => parseServicePins("60001"));
  assert.deepEqual(parseServicePins(""), []);
});

test('Flagged business coordinates cannot silently drive nearest-store suggestions',()=>{
 const lead={pin_code:'600003',lat:13,lng:80,geocode_status:'mismatch_flagged'};
 assert.equal(matchLeadStore(lead,stores).kind,'none');
 const result=matchLeadStore(lead,stores,{lat:12.91,lng:80});
 assert.equal(result.store?.id,'b');assert.equal(result.kind==='nearest'&&result.approximate,true);
});

test("A covering store wins when the closest store's smaller radius does not cover the lead",()=>{
 const result=matchLeadStore({pin_code:'600009'},[{...stores[0],lat:13.01,radius_km:.1},{...stores[1],lat:13.02,radius_km:5}],{lat:13,lng:80});
 assert.equal(result.store?.id,'b');assert.equal(result.isWithinRadius,true);
});
