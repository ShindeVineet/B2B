import assert from "node:assert/strict";
import test from "node:test";
import { GeocodingService } from "../src/lib/geocoding/service";
import { manualCoordinates, storeMapsUrl } from "../src/lib/store-location";
import { parseImportDate } from "../src/lib/import-date";

test("store lookup uses full address even when a postcode centroid exists", async () => {
  const centroid = { lat: 10, lng: 70, provider: "local" };
  const exact = { lat: 10.5, lng: 70.5, provider: "nominatim" };
  const local = { name: "local", geocodePincode: async () => centroid, geocodeAddress: async () => centroid };
  const fallback = { name: "address", geocodePincode: async () => null, geocodeAddress: async (address: string) => address === "Full store address" ? exact : null };
  const service = new GeocodingService(local, fallback, async input => {
    assert.equal(input.pin_code, "560001");
    return input.address === "Full store address"
      ? { status: "ok", point: { lat: exact.lat, lng: exact.lng }, source: "nominatim", confidence: "high" }
      : { status: "mapping_issue", reason: "not_found", candidates: [] };
  });
  assert.deepEqual(await service.geocodeStore({ address: "Full store address", pin_code: "560001" }), exact);
  assert.equal(await service.geocodeStore({ address: "Unknown", pin_code: "560001" }), null);
  assert.deepEqual(await service.geocode({ pin_code: "560001" }), centroid);
});

test("manual store coordinates are validated and Open Maps searches the address", () => {
  assert.deepEqual(manualCoordinates({ lat: "12.97", lng: "77.59" }), { lat: 12.97, lng: 77.59 });
  assert.equal(manualCoordinates({lat:"",lng:""}), null);
  assert.throws(() => manualCoordinates({ lat: 91, lng: 20 }));
  assert.throws(() => manualCoordinates({ lat: "12.97" }));
  const url = new URL(storeMapsUrl({address:"12 Main Road, Bengaluru",pin_code:"560001"}));
  assert.equal(url.searchParams.get("query"), "12 Main Road, Bengaluru, 560001, India");
});

test("import dates support Excel, Indian CSV, and ISO formats", () => {
  assert.equal(parseImportDate(45000)?.toISOString().slice(0,10), "2023-03-15");
  assert.equal(parseImportDate("26/09/2026")?.toISOString().slice(0,10), "2026-09-26");
  assert.equal(parseImportDate("2026-09-26")?.toISOString().slice(0,10), "2026-09-26");
  assert.equal(parseImportDate("") , null);
  assert.throws(() => parseImportDate("31/02/2026"));
});

test('saved place coordinates take precedence over coarse postcode geocoding',async()=>{
 const unavailable={name:'unused',geocodePincode:async()=>{throw Error('PIN lookup must not run');},geocodeAddress:async()=>{throw Error('Address lookup must not run');}};
 const service=new GeocodingService(unavailable,unavailable);
 assert.deepEqual(await service.geocode({pin_code:'560037',google_map_link:'https://www.google.com/maps/place/Deejos/data=!3d12.9594219!4d77.6558297'}),{lat:12.9594219,lng:77.6558297,provider:'GoogleMapsPlaceLink'});
});
