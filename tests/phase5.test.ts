import test from "node:test";
import assert from "node:assert/strict";
import { inIndia, distanceKm, geocodeMetadata } from "../src/lib/location";
import {
  weekStart,
  working,
  nextSlot,
  redistribute,
  dateOnly,
  type Schedule,
} from "../src/lib/phase5/calendar";
const schedule: Schedule = {
  start: "2026-09-28",
  end: "2026-10-11",
  base: ["mon", "tue", "wed", "thu", "fri"],
  weeks: { "2026-09-28": ["mon", "wed"] },
  capacity: 2,
  capacities: { "2026-09-30": 1 },
};
test("India validator catches coordinate reversal, missing and boundary values", () => {
  assert.equal(inIndia({ lat: 12.97, lng: 77.59 }), true);
  assert.equal(inIndia({ lat: 77.59, lng: 12.97 }), false);
  assert.equal(inIndia({ lat: 6, lng: 68 }), true);
  assert.equal(inIndia({ lat: 38, lng: 98 }), true);
  assert.equal(inIndia({ lat: 38.01, lng: 98 }), false);
  assert.equal(inIndia({ lat: NaN, lng: 77 }), false);
  assert.equal(inIndia({ lat: null, lng: 77 }), false);
  assert.equal(
    geocodeMetadata({ lat: 0, lng: 0 }, "LocalIndiaPINCache").geocode_status,
    "invalid",
  );
  assert.equal(
    geocodeMetadata({ lat: 12, lng: 77 }, "OpenStreetMapNominatim")
      .geocode_source,
    "nominatim",
  );
  assert.equal(geocodeMetadata({ lat: 12, lng: 77 }).geocode_source, null);
  assert.ok(distanceKm({ lat: 12, lng: 77 }, { lat: 12.04, lng: 77 }) > 3);
  assert.equal(distanceKm({ lat: 12, lng: 77 }, { lat: 12, lng: 77 }), 0);
});
test("Monday weeks, explicit weekly overrides and daily capacity govern suggestions", () => {
  assert.equal(weekStart("2026-10-04"), "2026-09-28");
  assert.equal(working("2026-09-29", schedule), false);
  assert.equal(
    nextSlot("2026-09-28", schedule, { "2026-09-28": 2 }),
    "2026-09-30",
  );
  assert.equal(
    nextSlot("2026-09-28", schedule, { "2026-09-28": 2, "2026-09-30": 1 }),
    "2026-10-05",
  );
  const reset = { ...schedule, weeks: {} };
  assert.equal(working("2026-09-29", reset), true);
  assert.equal(nextSlot("2026-10-10", schedule, {}), null);
  assert.throws(() => dateOnly("2026-02-30"));
});
test("redistribution is all-or-nothing, respects aggregate occupancy and never extends a plan", () => {
  const counts = { "2026-09-28": 2 };
  assert.equal(
    redistribute(["a", "b"], "2026-09-28", "2026-10-04", schedule, counts),
    null,
  );
  assert.deepEqual(counts, { "2026-09-28": 2 });
  assert.deepEqual(
    redistribute(["a", "b"], "2026-10-05", "2026-10-11", schedule, {}),
    [
      { id: "a", date: "2026-10-05" },
      { id: "b", date: "2026-10-05" },
    ],
  );
  assert.equal(
    redistribute(["a"], "2026-10-12", "2026-10-18", schedule, {}),
    null,
  );
});

test("published snapshots retain geometry, reference exact visits, and increment versions", async () => {
  const { snapshotRoutes } = await import("../src/lib/phase5/snapshots");
  const saved: {
    version: number;
    coordinates: { lat: number; lng: number }[];
    trip_lead_ids: string[];
    total_distance_km: number;
  }[] = [];
  const lead = { lat: 12, lng: 77 };
  const tx = {
    $executeRaw: async () => 0,
    user: {findUnique: async () => null},
    tripLead: {
      update: async () => ({}),
      findMany: async () => [
        { id: "visit-a", lead_id: "a", lead },
        { id: "visit-b", lead_id: "b", lead: { lat: 12.04, lng: 77 } },
      ],
    },
    routeSnapshot: {
      findFirst: async () => saved.at(-1),
      create: async ({ data }: { data: (typeof saved)[number] }) => {
        saved.push(structuredClone(data));
        return data;
      },
    },
  };
  const { Prisma } = await import("@prisma/client");
  void Prisma;
  await snapshotRoutes(
    tx as unknown as import("@prisma/client").Prisma.TransactionClient,
    "rep",
    [new Date("2026-09-28")],
  );
  lead.lat = 13;
  await snapshotRoutes(
    tx as unknown as import("@prisma/client").Prisma.TransactionClient,
    "rep",
    [new Date("2026-09-28")],
  );
  assert.equal(saved[0].coordinates[0].lat, 12);
  assert.equal(saved[1].coordinates[saved[1].trip_lead_ids.indexOf("visit-a")].lat, 13);
  assert.equal(saved[1].version, 2);
  assert.deepEqual(saved[0].trip_lead_ids, ["visit-a", "visit-b"]);
  assert.ok(saved[0].total_distance_km > 4);
  lead.lat = 77;
  await assert.rejects(
    snapshotRoutes(
      tx as unknown as import("@prisma/client").Prisma.TransactionClient,
      "rep",
      [new Date("2026-09-29")],
    ),
    /invalid locations/,
  );
});

test("third missed visit alerts heads once and two misses never trigger the pattern alert", async () => {
  const { checkMissedPatterns } =
    await import("../src/lib/phase5/missed-pattern");
  const notices: { missed_visit_id: string; user_id: string }[] = [];
  const events = [
    { id: "1", trip_lead: { trip: { ground_rep_id: "rep" } } },
    { id: "2", trip_lead: { trip: { ground_rep_id: "rep" } } },
  ];
  const db = {
    missedVisit: { findMany: async () => events },
    user: { findMany: async () => [{ id: "head" }] },
    notification: {
      findFirst: async () => notices[0] || null,
      createMany: async ({ data }: { data: typeof notices }) => {
        notices.push(...data);
        return { count: data.length };
      },
    },
  };
  assert.equal(
    (
      await checkMissedPatterns(
        db as unknown as import("@prisma/client").PrismaClient,
      )
    ).created,
    0,
  );
  events.push({ id: "3", trip_lead: { trip: { ground_rep_id: "rep" } } });
  assert.equal(
    (
      await checkMissedPatterns(
        db as unknown as import("@prisma/client").PrismaClient,
      )
    ).created,
    1,
  );
  assert.equal(notices[0].missed_visit_id, "3");
  assert.equal(
    (
      await checkMissedPatterns(
        db as unknown as import("@prisma/client").PrismaClient,
      )
    ).created,
    0,
  );
});
