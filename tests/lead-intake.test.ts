import test from "node:test";
import assert from "node:assert/strict";
import { validateIntake, normalizeSource, intakeTeam } from "../src/lib/leads/intake";
import { parseStoreVisit, saveStoreVisit } from "../src/lib/consultations/store-visit";
import { checkReferral } from "../src/lib/partners/referral";
import type { Prisma } from "@prisma/client";
const phone = "9876543210";
test("CDT, LinkedIn and Phone accept phone-only intake without invented company names", () => {
  for (const source of ["CDT", "LinkedIn", "Phone"]) {
    const result = validateIntake({ lead_source: source, phone_no: phone });
    assert.equal(result.company_name, ""); assert.equal(result.intake_team, "caller");
    assert.throws(() => validateIntake({ lead_source: source }), /phone/);
  }
});
test("Walk-in requires only name and phone; manual is Head-owned", () => {
  assert.throws(() => validateIntake({ lead_source: "Walk-in", phone_no: phone }), /owner name/);
  assert.equal(validateIntake({ lead_source: "Walk-in", phone_no: phone, owner_name: "Alex" }).company_name, "");
  assert.equal(intakeTeam("Manual"), "head");
  assert.equal(normalizeSource("Manual Entry"), "Manual");
});
test("Directory and Maps enforce every ground-team intake field", () => {
  for (const source of ["Book Directory", "Google Maps"]) {
    const raw: Record<string, unknown> = { lead_source: source, company_name: "Firm", owner_name: "Alex", phone_no: phone, address: "Street 1", pin_code: "560001" };
    assert.equal(validateIntake(raw).intake_team, "ground");
    for (const field of ["company_name", "owner_name", "phone_no", "address", "pin_code"]) assert.throws(() => validateIntake({ ...raw, [field]: "" }), /required/);
  }
});
test("Invalid sources, short phones and malformed optional PIN codes are rejected", () => {
  for (const patch of [{ lead_source: "Other" }, { phone_no: "123" }, { phone_no: "abc" }, { pin_code: "12345" }, { company_name: {} }]) assert.throws(() => validateIntake({ lead_source: "CDT", phone_no: phone, ...patch }));
});
test("A scheduled store visit requires an actual store and future instant; follow-up alone is not a visit", () => {
  assert.equal(parseStoreVisit({ next_follow_up_date: "2099-12-01" }), null);
  for (const raw of [{ visit_scheduled: true }, { outcome: "Visit scheduled" }, { visit_scheduled: true, visit_store_id: "store", visit_scheduled_at: "2000-01-01T10:00:00+05:30" }, { visit_scheduled: true, visit_store_id: "store", visit_scheduled_at: "2099-12-01T10:00" }]) assert.throws(() => parseStoreVisit(raw));
  assert.equal(parseStoreVisit({ visit_scheduled: "true", visit_store_id: "store", visit_scheduled_at: "2099-12-01T10:00:00+05:30" })?.scheduled_at.toISOString(), "2099-12-01T04:30:00.000Z");
});
test("Appointments reject inactive stores before writing; referrals reject self and missing partners", async () => {
  const tx = { store: { findFirst: async () => null }, partner: { findFirst: async () => null }, storeVisit: { create: () => { throw Error("must not write"); } } } as unknown as Prisma.TransactionClient;
  await assert.rejects(saveStoreVisit(tx, { visit_scheduled: true, visit_store_id: "missing", visit_scheduled_at: "2099-12-01T10:00:00Z" }, "lead", "consultation"), /active store/);
  await assert.rejects(checkReferral(tx, "self", "self"), /themselves/);
  await assert.rejects(checkReferral(tx, "missing"), /active referring partner/);
});
