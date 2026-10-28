import test from "node:test";
import assert from "node:assert/strict";
import type { Prisma } from "@prisma/client";
import { routeInWorkspace } from "../src/lib/routes/workspace";
import { leadEligibility } from "../src/lib/routes/pool";

const completed = { route_id: "old", status: "visited", completed: true, consultation: null, trip: { ground_rep_id: "rep" }, scheduled_date: new Date("2026-01-01") };
function client(patch: object = {}) {
  return {
    plannedRoute: { findMany: async () => [], findUnique: async () => ({ area_filter: { kind: "assigned_revisit", rep_id: "rep" } }) },
    lead: { findMany: async () => [{
      id: "lead", company_name: "Company", intake_team: "ground", assigned_ground_rep_id: "rep",
      lat: 12.97, lng: 77.59, route_memberships: [{ route_id: "old" }],
      trip_leads: [completed], consultations: [], partners: [], ...patch,
    }] },
  } as unknown as Prisma.TransactionClient;
}
test("assigned revisit accepts completed old route membership without a follow-up date; normal pool remains blocked", async () => {
  assert.equal((await leadEligibility(client(), ["lead"], undefined, [], "rep"))[0].reason, null);
  assert.match((await leadEligibility(client(), ["lead"]))[0].reason!, /Reserved/);
});
test("assigned revisits preserve ownership, pending-visit, reservation, location and onboarding checks", async () => {
  for (const [patch, reason] of [
    [{ assigned_ground_rep_id: "other" }, /no longer assigned/],
    [{ trip_leads: [{ ...completed, status: "pending", completed: false }], route_memberships: [] }, /unresolved/],
    [{ route_memberships: [{ route_id: "draft" }] }, /Reserved/],
    [{ lat: null }, /Mapping/],
    [{ partners: [{ id: "partner" }] }, /onboarded/],
  ] as const) {
    assert.match((await leadEligibility(client(patch), ["lead"], undefined, [], "rep"))[0].reason!, reason);
  }
});

test("saved revisit drafts retain owner eligibility when reopened or edited", async () => {
  assert.equal((await leadEligibility(client(), ["lead"], "draft"))[0].reason, null);
  assert.match((await leadEligibility(client({ assigned_ground_rep_id: "other" }), ["lead"], "draft"))[0].reason!, /no longer assigned/);
});
test("draft workspaces separate regular drafts and each person's revisit drafts", () => {
  const draft = { status: "draft", area_filter: { kind: "assigned_revisit", rep_id: "rep" } };
  assert.equal(routeInWorkspace(draft, "revisits", "rep"), true);
  assert.equal(routeInWorkspace(draft, "revisits", "other"), false);
  assert.equal(routeInWorkspace(draft, "revisits", ""), false);
  assert.equal(routeInWorkspace(draft, "planning", "rep"), false);
  assert.equal(routeInWorkspace({ status: "draft" }, "planning", "rep"), true);
  assert.equal(routeInWorkspace({ ...draft, status: "ready" }, "revisits", "rep"), true);
  assert.equal(routeInWorkspace({ ...draft, status: "assigned" }, "revisits", "rep"), false);
  assert.equal(routeInWorkspace({ ...draft, status: "assigned" }, "assigned", ""), true);
});
