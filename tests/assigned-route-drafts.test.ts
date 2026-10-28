import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import type { PrismaClient } from "@prisma/client";

test("assigned route preview writes nothing; draft save preserves person and remainder without scheduling", async () => {
  const manager = { id: "manager", role: "b2b_head", name: "Manager", email: "manager@example.test" };
  const leads = Array.from({ length: 3 }, (_, i) => ({
    id: `lead-${i}`, company_name: `Company ${i}`, assigned_ground_rep_id: "rep", intake_team: "ground",
    lat: 12.97 + i * 0.001, lng: 77.59 + i * 0.001,
    route_memberships: [], trip_leads: [{ status: "visited", completed: true, trip: { ground_rep_id: "rep" }, consultation: null }],
    consultations: [], partners: [],
  }));
  const created: Record<string, unknown>[] = [];
  const fake = {
    user: { findFirst: async ({ where }: { where: { id: string } }) => where.id === "manager" ? manager : where.id === "rep" ? { id: "rep" } : null },
    $executeRaw: async () => 1, $queryRaw: async () => [],
    lead: { count: async () => 3, findMany: async () => leads },
    plannedRoute: {
      findMany: async () => [],
      create: async ({ data }: { data: Record<string, unknown> }) => { created.push(data); return { id: "draft" }; },
      update: async () => ({}),
    },
    routeLead: { update: async () => ({}) },
    // No trip/visit/assignment models: draft creation must never schedule visits.
    $transaction: async (work: (tx: unknown) => Promise<unknown>) => work(fake),
  };
  const globalClient = globalThis as unknown as { prisma?: PrismaClient };
  const previous = globalClient.prisma;
  const oldSecret = process.env.JWT_SECRET;
  globalClient.prisma = fake as unknown as PrismaClient;
  process.env.JWT_SECRET = "assigned-draft-unit-test-secret";
  try {
    const { POST } = await import("../src/app/api/assigned-lead-routes/route");
    const { signToken } = await import("../src/lib/auth");
    const auth = signToken(manager as Parameters<typeof signToken>[0]);
    const request = (body: object, path = "/api/assigned-lead-routes") => new NextRequest(`http://localhost${path}`, {
      method: "POST", headers: { "Content-Type": "application/json", authorization: `Bearer ${auth}` }, body: JSON.stringify(body),
    });
    const body = { rep_id: "rep", lead_ids: leads.map(l => l.id), leads_per_route: 2, route_count: 1, area_filter: { label: "Area" } };
    const preview = await POST(request({ ...body, preview: true }));
    assert.equal(preview.status, 200);
    const batch = await preview.json();
    assert.equal(batch.routes.length, 1);
    assert.equal(batch.remainder.length, 1);
    assert.equal(created.length, 0);
    const saved = await POST(request({ ...body, collection_name: "Revisit draft", expected_routes: batch.routes, expected_remainder: batch.remainder }));
    assert.equal(saved.status, 200);
    assert.equal(created.length, 1);
    assert.deepEqual(created[0].area_filter, { label: "Area", kind: "assigned_revisit", rep_id: "rep" });
    assert.deepEqual(created[0].remainder_lead_ids, batch.remainder);
    assert.equal(created[0].status, undefined); // Schema default is draft.
    assert.equal(created[0].ground_rep_id, undefined);
    assert.equal(created[0].route_date, undefined);
    assert.equal((await POST(request({ ...body, rep_id: "", preview: true }))).status, 400);
    leads[0].assigned_ground_rep_id = "other";
    assert.equal((await POST(request({ ...body, preview: true }))).status, 409);
    // A normal draft cannot borrow revisit eligibility by injecting metadata.
    leads[0].assigned_ground_rep_id = "rep";
    assert.equal((await POST(request({ ...body, area_filter: { kind: "assigned_revisit", rep_id: "rep" }, preview: true }, "/api/route-plans"))).status, 409);
    assert.equal(created.length, 1);
  } finally {
    globalClient.prisma = previous;
    if (oldSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = oldSecret;
  }
});
