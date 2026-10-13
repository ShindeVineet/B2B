/** Uses rollback-only fixtures; does not change business records. Run with node --env-file=.env --import tsx. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { saveStoreVisit } from "../src/lib/consultations/store-visit";
import { checkReferral } from "../src/lib/partners/referral";
const db = new PrismaClient();
const rollback = new Error("verification rollback");
async function main() {
  const user = await db.user.findFirstOrThrow({ where: { role: "b2b_head", active: true } });
  const store = await db.store.findFirstOrThrow({ where: { active: true } });
  const marker = randomUUID();
  try {
    await db.$transaction(async tx => {
      const lead = await tx.lead.create({ data: { id: `verify-${marker}`, lead_code: `VERIFY-${marker}`, company_name: "Original Maps firm", owner_name: "Original owner", lead_source: "Google Maps", intake_team: "ground", phone_no: "9876543210", address: "Original address", pin_code: "560001" } });
      const origin = lead.original_data as Record<string, unknown>;
      assert.equal(origin.company_name, "Original Maps firm");
      assert.equal(origin.owner_name, "Original owner");
      const changed = await tx.lead.update({ where: { id: lead.id }, data: { company_name: "Registered firm LLP", phone_no: "9876543211", owner_name: "Project Manager" } });
      assert.deepEqual(changed.original_data, origin);
      assert.equal(changed.lead_code, lead.lead_code);
      const consultation = await tx.consultation.create({ data: { lead_id: lead.id, rep_id: user.id, outcome: "Visit scheduled" } });
      await saveStoreVisit(tx, { visit_scheduled: true, visit_store_id: store.id, visit_scheduled_at: "2099-12-01T10:00:00+05:30" }, lead.id, consultation.id);
      assert.equal(await tx.storeVisit.count({ where: { lead_id: lead.id } }), 1);
      await checkReferral(tx, null);
      throw rollback;
    });
  } catch (e) { if (e !== rollback) throw e; }
  assert.equal(await db.lead.count({ where: { id: `verify-${marker}` } }), 0);
  for (const change of [{ original_data: {} }, { lead_source: "CDT" }, { lead_code: "TAMPERED" }]) {
    await assert.rejects(db.$transaction(async tx => {
      const lead = await tx.lead.create({ data: { company_name: "Rollback guard test", lead_code: `VERIFY-${randomUUID()}`, phone_no: "9876543212" } });
      await tx.lead.update({ where: { id: lead.id }, data: change });
      throw Error("Guard did not reject mutation");
    }), /immutable|cannot.*chang/i);
  }
  console.log("PASS: original snapshot, stable ID/code, alternate details, appointment links, and DB tamper guards. All fixtures rolled back.");
}
main().catch(e => { console.error(e instanceof Error ? e.message : "Verification failed"); process.exitCode = 1; }).finally(() => db.$disconnect());
