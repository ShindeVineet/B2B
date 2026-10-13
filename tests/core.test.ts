import assert from "node:assert/strict";
import test from "node:test";
import { findNearestStore } from "../src/lib/geo";
import { getLeadFilterForUser, getStoreFilterForUser, getUserFilterForUser, canUserManageLeads } from "../src/lib/permissions";
import type { AuthUser } from "../src/lib/auth";

const manager: AuthUser = { id: "manager", name: "Manager", email: "manager@example.test", role: "regional_manager", region: "South" };

test("proximity selects the closest store whose catchment covers the lead", () => {
  const stores = [
    { id: "near", name: "Near", lat: 0.01, lng: 0, radius_km: 0.5 },
    { id: "covering", name: "Covering", lat: 0.02, lng: 0, radius_km: 5 },
  ];
  assert.equal(findNearestStore(0, 0, stores).nearestStore?.id, "covering");
  assert.equal(findNearestStore(0, 0, stores).isWithinRadius, true);
  assert.equal(findNearestStore(null, 0, stores).nearestStore, null);
  assert.equal(findNearestStore(10, 10, stores).isWithinRadius, false);
});

test("Store Leads see all stores regardless of region", () => {
  for (const region of [null, "All", ""]) {
    const user = { ...manager, region };
    assert.deepEqual(getLeadFilterForUser(user), {});
    assert.deepEqual(getStoreFilterForUser(user), {});
    assert.deepEqual(getUserFilterForUser(user), {});
  }
});

test("rep access is restricted to their identity and assigned store", () => {
  const rep: AuthUser = { ...manager, id: "rep", role: "ground_rep", store_id: null };
  assert.deepEqual(getLeadFilterForUser(rep), { assigned_ground_rep_id: "rep" });
  assert.deepEqual(getUserFilterForUser(rep), { id: "rep" });
  assert.deepEqual(getStoreFilterForUser(rep), { id: { in: [] } });
  assert.equal(canUserManageLeads(rep), false);
  assert.equal(canUserManageLeads({ ...manager, role: "analyst" }), false);
});

test("Store Associates can see assigned ground-team work but cannot assign",()=>{
 const u:AuthUser={...manager,role:"store_associate",store_id:"own-store"};
 assert.equal(canUserManageLeads(u),false);
 assert.ok(JSON.stringify(getLeadFilterForUser(u)).includes('ground_rep'));
 assert.deepEqual(getStoreFilterForUser(u),{id:"own-store"});
});
