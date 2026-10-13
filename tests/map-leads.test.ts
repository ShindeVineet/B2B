import assert from "node:assert/strict";
import test from "node:test";
import { fetchAllMapLeads, hasMapCoordinates } from "../src/lib/map-leads";

test("map loads every page, including assigned and unassigned leads", async () => {
  const urls: string[] = [];
  const request: typeof fetch = async (input) => {
    urls.push(String(input));
    const page = new URL(String(input), "http://localhost").searchParams.get(
      "page",
    );
    return Response.json({
      totalCount: 1001,
      leads:
        page === "1"
          ? Array.from({ length: 1000 }, (_, id) => ({
              id: String(id),
              assigned_store_id: "store",
            }))
          : [{ id: "1000", assigned_store_id: null }],
    });
  };
  const leads = await fetchAllMapLeads<{
    id: string;
    assigned_store_id: string | null;
  }>(request);
  assert.equal(leads.length, 1001);
  assert.equal(leads[1000].assigned_store_id, null);
  assert.deepEqual(urls, [
    "/api/leads?limit=1000&page=1",
    "/api/leads?limit=1000&page=2",
  ]);
});

test("map reports failed pages instead of presenting a partial lead list", async () => {
  await assert.rejects(
    fetchAllMapLeads(async () => new Response(null, { status: 500 })),
    /Unable to load/,
  );
});

test("missing or invalid coordinates cannot be represented as a real map pin", () => {
  assert.equal(hasMapCoordinates({ lat: 0, lng: 0 }), false);
  assert.equal(hasMapCoordinates({ lat: null, lng: 77 }), false);
  assert.equal(hasMapCoordinates({ lat: NaN, lng: 77 }), false);
  assert.equal(hasMapCoordinates({ lat: 91, lng: 77 }), false);
});


test("overlapping pages render each lead once and retain the latest copy", async () => {
  let calls = 0;
  const leads = await fetchAllMapLeads(async () => {
    calls++;
    return Response.json({ totalCount: 4, leads: calls === 1
      ? [{ id: "a", status: "New" }, { id: "b", status: "New" }]
      : [{ id: "b", status: "Assigned" }, { id: "c", status: "New" }] });
  });
  assert.deepEqual(leads, [{ id: "a", status: "New" }, { id: "b", status: "Assigned" }, { id: "c", status: "New" }]);
  assert.equal(calls, 2);
});
