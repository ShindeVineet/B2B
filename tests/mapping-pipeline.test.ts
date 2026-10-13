import test from "node:test";
import assert from "node:assert/strict";
import {
  mapBusiness,
  mappingFields,
  type MappingDependencies,
} from "../src/lib/mapping/pipeline";
import {
  extractGooglePoint,
  resolveGooglePoint,
} from "../src/lib/mapping/google-link";
import { canPlotLead } from "../src/lib/mapping/visibility";
import type { Candidate } from "../src/lib/mapping/domain";
const area = { lat: 12.97, lng: 77.69 };
const candidate: Candidate = {
  ...area,
  name: "MSP Interiors",
  displayName: "MSP Interiors, Bangalore",
  kind: "office",
  rank: 30,
};
function deps(results: Candidate[] = []): MappingDependencies {
  return {
    pin: async () => area,
    provider: { search: async () => results },
    overpass: { search: async () => [] },
  };
}
test("Local PIN is mandatory; imported links never bypass the free pipeline", async () => {
  const d = deps();
  d.pin = async () => null;
  d.provider.search = d.overpass.search = async () => {
    throw Error("Must not query without area");
  };
  for (const pin_code of [undefined, "560037"])
    assert.deepEqual(
      await mapBusiness(
        {
          company_name: "MSP",
          pin_code,
          address: "Bangalore 560037",
          google_map_link: "https://www.google.com/maps?q=12.97,77.69",
        },
        d,
      ),
      { status: "mapping_issue", reason: "no_area_identified", candidates: [] },
    );
});
test("PIN centroids are never plotted, even with a stored Google link", async () => {
  const r = await mapBusiness(
    {
      company_name: "Unknown",
      pin_code: "560037",
      google_map_link: "https://www.google.com/maps?q=12.97,77.69",
    },
    deps(),
  );
  assert.equal(r.status, "mapping_issue");
  assert.equal(mappingFields(r).lat, null);
});
test("Company -> Overpass -> address order uses one bounded area and stops at first match", async () => {
  const calls: string[] = [];
  const d = deps();
  d.provider.search = async (q, box) => {
    assert.ok(box);
    calls.push(q);
    return q === "Office street"
      ? [{ ...candidate, name: "Office street", kind: "road", rank: 26 }]
      : [];
  };
  d.overpass.search = async (q, box) => {
    assert.ok(box);
    calls.push("overpass:" + q);
    return [candidate];
  };
  let r = await mapBusiness(
    {
      company_name: "MSP Interiors",
      pin_code: "560037",
      address: "Office street",
    },
    d,
  );
  assert.equal(r.status === "ok" && r.source, "overpass");
  assert.deepEqual(calls, ["MSP Interiors", "overpass:MSP Interiors"]);
  calls.length = 0;
  d.overpass.search = async (q) => {
    calls.push("overpass:" + q);
    return [];
  };
  r = await mapBusiness(
    {
      company_name: "MSP Interiors",
      pin_code: "560037",
      address: "Office street",
    },
    d,
  );
  assert.equal(r.status === "ok" && r.source, "nominatim");
  assert.deepEqual(calls, [
    "MSP Interiors",
    "overpass:MSP Interiors",
    "Office street",
  ]);
});
test("Company validation rejects distant, swapped and wrong-name places; retains local low-confidence candidates", async () => {
  for (const c of [
    { ...candidate, lat: 28.61, lng: 77.2 },
    { ...candidate, lat: 77.69, lng: 12.97 },
    { ...candidate, name: "Different business" },
  ]) {
    const r = await mapBusiness(
      { company_name: "MSP Interiors", pin_code: "560037" },
      deps([c]),
    );
    assert.equal(r.status, "mapping_issue");
    if (r.status === "mapping_issue") {
      assert.equal(r.reason, "not_found");
      assert.equal(
        r.candidates.length,
        c.name === "Different business" ? 1 : 0,
      );
    }
  }
  assert.equal(
    (
      await mapBusiness(
        { company_name: "MSP INTERIORS Pvt. Ltd.", pin_code: "560037" },
        deps([candidate]),
      )
    ).status,
    "ok",
  );
});
test("Ambiguous candidates require review; city/postal address results are never accepted", async () => {
  const r = await mapBusiness(
    { company_name: "MSP Interiors", pin_code: "560037" },
    deps(
      [0, 0.005, 0.01, 0.015].map((n) => ({ ...candidate, lat: area.lat + n })),
    ),
  );
  assert.equal(r.status, "mapping_issue");
  if (r.status === "mapping_issue") {
    assert.equal(r.reason, "ambiguous_multiple_matches");
    assert.equal(r.candidates.length, 3);
  }
  const coarse = await mapBusiness(
    { company_name: "Unknown", pin_code: "560037", address: "Bangalore" },
    deps([{ ...candidate, name: "Bangalore", rank: 16, kind: "city" }]),
  );
  assert.equal(coarse.status, "mapping_issue");
});
test("Provider outages can fall through to an accepted address but never become a false not-found", async () => {
  const d = deps();
  d.overpass.search = async () => {
    throw Error("outage");
  };
  await assert.rejects(
    mapBusiness({ company_name: "MSP", pin_code: "560037" }, d),
    /outage/,
  );
  d.provider.search = async (q) => (q === "Street" ? [candidate] : []);
  assert.equal(
    (
      await mapBusiness(
        { company_name: "MSP", pin_code: "560037", address: "Street" },
        d,
      )
    ).status,
    "ok",
  );
});
test("Manual link resolver remains available; unresolved leads and PIN centroids cannot plot or route", async () => {
  assert.deepEqual(
    extractGooglePoint(
      "https://www.google.com/maps/@1,2,14z/data=!3d12.97!4d77.69",
    ),
    area,
  );
  assert.equal(await resolveGooglePoint("http://127.0.0.1/private"), null);
  for (const geocode_status of ["mapping_issue", "mismatch_flagged", "invalid"])
    assert.equal(canPlotLead({ ...area, geocode_status }), false);
  assert.equal(
    canPlotLead({
      ...area,
      geocode_status: "ok",
      geocode_source: "pincode_dataset",
    }),
    false,
  );
  assert.equal(canPlotLead({ ...area, geocode_status: "ok" }), true);
});
