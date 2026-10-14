import test from "node:test";
import assert from "node:assert/strict";
import { routeLinks, fullRouteLink, routeLinkStopCount } from "../src/lib/route-links";
test("every selected stop is represented across connected mobile-compatible route legs", () => {
  const stops = Array.from({ length: 11 }, (_, i) => ({
    lat: 12 + i / 100,
    lng: 77 + i / 100,
  }));
  const urls = routeLinks(stops, { lat: 12, lng: 76 }).map(
    (url) => new URL(url),
  );
  assert.equal(urls.length, 3);
  const included = urls.flatMap((url) => [
    ...(url.searchParams.get("waypoints")?.split("|") || []),
    url.searchParams.get("destination"),
  ]);
  assert.deepEqual(
    included,
    stops.map((p) => `${p.lat},${p.lng}`),
  );
  assert.equal(
    urls[1].searchParams.get("origin"),
    urls[0].searchParams.get("destination"),
  );
  assert.equal(routeLinkStopCount(urls.map((url) => url.toString())), stops.length);
});
test("route coverage count includes every waypoint and destination across parts", () => {
  const stops = Array.from({ length: 17 }, (_, i) => ({
    lat: 12.8 + i / 100,
    lng: 77.4 + i / 100,
  }));
  assert.equal(routeLinkStopCount(routeLinks(stops)), 17);
});
test("route links reject missing coordinates rather than dropping stops", () => {
  assert.throws(() =>
    routeLinks([
      { lat: 12, lng: 77 },
      { lat: null, lng: null },
    ]),
  );
  assert.throws(() => routeLinks([{ lat: 100, lng: 77 }]));
  assert.throws(() => routeLinks([{ lat: 0, lng: 0 }]));
});

test("full route link combines sections without changing the stop order",()=>{
 const stops=Array.from({length:10},(_,i)=>({lat:12+i/100,lng:77}));
 const url=new URL(fullRouteLink(routeLinks(stops,{lat:12,lng:76}))!);
 assert.deepEqual([...(url.searchParams.get('waypoints')?.split('|')||[]),url.searchParams.get('destination')],stops.map(p=>`${p.lat},${p.lng}`));
 assert.equal(url.searchParams.get('origin'),'12,76');
 assert.equal(fullRouteLink(routeLinks([...stops,{lat:13,lng:77}])) ,null);
});
