import test from "node:test";
import assert from "node:assert/strict";
import type { Lead, Prisma } from "@prisma/client";
import type { AuthUser } from "../src/lib/auth";
import { CONSULTATION_FIELDS } from "../src/lib/consultations/fields";
import { saveGroundConsultation } from "../src/lib/consultations/save-ground";

const user = { id: "rep", name: "Rep Name", role: "ground_rep", email: "rep@example.test" } as AuthUser;
const lead = { id: "new-lead", company_name: "Original company", status: "Assigned", intake_team: "ground", assigned_ground_rep_id: user.id } as Lead;
const answers = {
  company_name: "Verified company", decision_maker_name: "Owner", decision_maker_phone: "9876543210",
  alternate_mobile_number: "9876543211", designation: "Director", lead_type: "Architect", interest_level: "High",
  outcome: "Nurturing required", visit_date: "2026-10-26", ground_staff_name: "Spoofed staff",
  primary_pain_point: ["High price", "No credit support"], competitor_involved: ["Kajaria", "Somany"],
  site_photos: ["/api/photos/owned-photo"], visiting_card_photos: [],
  notes: "Full consultation notes", direct_store_meeting: "true", next_follow_up_date: "2099-12-01",
};
function fixture(photoCount = 1) {
  let saved: Prisma.ConsultationUncheckedCreateInput | undefined;
  let updated: Prisma.LeadUpdateInput | undefined;
  let followUp: unknown;
  const tx = {
    formField: { findMany: async () => CONSULTATION_FIELDS },
    photoAsset: { count: async () => photoCount },
    $queryRaw: async () => [],
    lead: { findFirst: async () => lead, update: async ({ data }: { data: Prisma.LeadUpdateInput }) => { updated = data; return { ...lead, ...data }; } },
    tripLead: { findMany: async () => [] },
    consultation: { count: async () => 0, create: async ({ data }: { data: Prisma.ConsultationUncheckedCreateInput }) => { saved = data; return { id: "consultation", ...data }; } },
    followUp: { upsert: async (data: unknown) => { followUp = data; }, updateMany: async () => ({ count: 0 }) },
    coldLeadConfig: { findUnique: async () => null },
    coldLeadCase: { findUnique: async () => null },
    activityLog: { create: async () => ({}) },
  } as unknown as Prisma.TransactionClient;
  return { tx, saved: () => saved, updated: () => updated, followUp: () => followUp };
}
test("new ground intake saves the full consultation, verified details, photos, multi-selects and follow-up", async () => {
  const f = fixture();
  await saveGroundConsultation(f.tx, user, lead, answers);
  assert.equal(f.saved()?.company_name, "Verified company");
  assert.equal(f.saved()?.decision_maker_name, "Owner");
  assert.equal(f.saved()?.alternate_mobile_number, "9876543211");
  assert.equal(f.saved()?.ground_staff_name, "Rep Name");
  assert.equal(f.saved()?.interaction_channel, "ground");
  assert.equal(f.saved()?.direct_store_meeting, true);
  assert.equal(f.saved()?.visit_date instanceof Date && f.saved()!.visit_date!.toString(), new Date("2026-10-26T12:00:00+05:30").toString());
  assert.equal(f.saved()?.primary_pain_point, "High price, No credit support");
  assert.deepEqual((f.saved()?.responses as Record<string, unknown>).competitor_involved, ["Kajaria", "Somany"]);
  assert.deepEqual(f.saved()?.site_photos, ["/api/photos/owned-photo"]);
  assert.equal(f.updated()?.status, "Active — Nurturing");
  assert.ok(f.followUp());
});
test("full consultation validation rejects missing mandatory answers and unowned photos before creating a record", async () => {
  for (const patch of [{ decision_maker_name: "" }, { site_photos: [] }, { outcome: "Unknown" }, { primary_pain_point: ["Unknown"] }]) {
    const f = fixture();
    await assert.rejects(saveGroundConsultation(f.tx, user, lead, { ...answers, ...patch }));
    assert.equal(f.saved(), undefined);
  }
  const f = fixture(0);
  await assert.rejects(saveGroundConsultation(f.tx, user, lead, answers), /photo does not belong/);
  assert.equal(f.saved(), undefined);
});
