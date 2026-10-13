import test from "node:test";
import assert from "node:assert/strict";
import {
  mapBusiness,
  type MappingDependencies,
} from "../src/lib/mapping/pipeline";
import { retrySchedule } from "../src/lib/mapping/retry";
const area = { lat: 12.97, lng: 77.69 };
const poi = {
  ...area,
  name: "TimberCraft Interiors",
  displayName: "TimberCraft Interiors",
  kind: "office",
  rank: 30,
};
const noExternal = async () => {
  throw Error("External request forbidden");
};
function deps(): MappingDependencies {
  return {
    pin: async () => area,
    local: { search: async () => [poi] },
    provider: { search: noExternal },
    overpass: { search: noExternal },
  };
}
test("local company match returns without any external request", async () => {
  const r = await mapBusiness(
    { company_name: poi.name, pin_code: "560001" },
    deps(),
  );
  assert.equal(r.status === "ok" && r.source, "osm_local");
});
test("local-only miss is measurable without provider fallback", async () => {
  const d = deps();
  d.local = { search: async () => [] };
  const r = await mapBusiness(
    { company_name: "Unknown", pin_code: "560001" },
    d,
    { localOnly: true },
  );
  assert.equal(r.status === "mapping_issue" && r.reason, "not_found");
});
test("missing index throws and does not spend public API requests", async () => {
  const d = deps();
  d.local = {
    search: async () => {
      throw Error("Index not loaded");
    },
  };
  await assert.rejects(
    mapBusiness({ company_name: poi.name, pin_code: "560001" }, d),
    /Index not loaded/,
  );
});
test("local ambiguity and distant names never produce an arbitrary pin", async () => {
  const d = deps();
  d.local = { search: async () => [poi, { ...poi, lat: 12.98 }] };
  const r = await mapBusiness(
    { company_name: poi.name, pin_code: "560001" },
    d,
  );
  assert.equal(
    r.status === "mapping_issue" && r.reason,
    "ambiguous_multiple_matches",
  );
  d.local = { search: async () => [{ ...poi, lat: 28.6, lng: 77.2 }] };
  assert.equal(
    (
      await mapBusiness({ company_name: poi.name, pin_code: "560001" }, d, {
        localOnly: true,
      })
    ).status,
    "mapping_issue",
  );
});
test("retry delays grow exponentially, respect cooldown and recover after a bounded burst", () => {
  assert.equal(retrySchedule(1).delayMs, 30000);
  assert.equal(retrySchedule(2).delayMs, 60000);
  assert.equal(retrySchedule(2, 300000).delayMs, 300000);
  assert.deepEqual(retrySchedule(8), { exhausted: true, delayMs: 86400000 });
});

test('429 and 503 preserve Retry-After as transient cooldowns', async () => {
  const { checkProviderResponse, ProviderError } = await import('../src/lib/mapping/query-cache');
  for (const status of [429, 503]) {
    assert.throws(() => checkProviderResponse(new Response(null, {status, headers: {'Retry-After':'120'}})), error => error instanceof ProviderError && error.cooldownMs === 120000);
  }
});
