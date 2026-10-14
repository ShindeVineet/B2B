import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import Papa from "papaparse";
import { Prisma, PrismaClient } from "@prisma/client";
import { assignImportedCallers } from "../src/lib/calling/distribute.ts";
import { correctedPoint, matchCorrectedRows, pinKey } from "../src/lib/leads/location-reconciliation.ts";

const file = process.argv.find((arg) => arg.endsWith(".csv"));
const apply = process.argv.includes("--apply");
if (!file) throw Error("Provide the corrected-location CSV path; add --apply after reviewing the dry run.");
const db = new PrismaClient();

try {
  const parsed = Papa.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header, index) => header || `_blank_${index}`,
  });
  if (parsed.errors.length) throw Error(`CSV errors: ${JSON.stringify(parsed.errors.slice(0, 20))}`);
  const leads = await db.lead.findMany({
    select: { id: true, company_name: true, phone_no: true, pin_code: true, lat: true, lng: true, intake_team: true, phones: { select: { phone_number: true } } },
  });
  const result = matchCorrectedRows(parsed.data, leads);
  const updates = [...result.matched].map(([leadId, row]) => ({ leadId, row, point: correctedPoint(row) }));
  const summary = {
    mode: apply ? "apply" : "dry-run",
    sourceRows: parsed.data.length,
    currentLeads: leads.length,
    matched: updates.length,
    routeReady: updates.filter((item) => item.point).length,
    callingQueue: updates.filter((item) => !item.point).length,
    unmatchedSheetRows: result.unmatched.length,
    ambiguousSheetRows: result.ambiguous.length,
    conflictingCorrectedRows: result.conflicts.length,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (!apply) process.exit(0);

  const actor = await db.user.findFirstOrThrow({
    where: { role: "super_admin", active: true },
    select: { id: true },
  });
  const callingIds = [];
  const batchSize = 150;
  for (let offset = 0; offset < updates.length; offset += batchSize) {
    const batch = updates.slice(offset, offset + batchSize);
    await db.$transaction(async (tx) => {
      const located = batch.filter((item) => item.point);
      const notFound = batch.filter((item) => !item.point);
      if (located.length) {
        const values = located.map(({ leadId, row, point }) => {
          const current = leads.find((lead) => lead.id === leadId);
          return Prisma.sql`(${leadId}, ${point.lat}, ${point.lng}, ${pinKey(row.pincode) || current?.pin_code || null}, ${String(row.FormattedAddress || row.address || "").trim() || null}, ${String(row.GoogleMapsLink || "").trim() || null})`;
        });
        await tx.$executeRaw(Prisma.sql`
          UPDATE leads AS lead SET
            lat = value.lat, lng = value.lng,
            pin_code = COALESCE(value.pin, lead.pin_code),
            address = COALESCE(value.address, lead.address),
            google_map_link = COALESCE(value.map_link, lead.google_map_link),
            intake_team = 'ground', location_verified = true,
            geocode_status = 'ok'::"GeocodeStatus",
            geocode_source = CASE WHEN value.map_link IS NULL THEN 'manual'::"GeocodeSource" ELSE 'google_link'::"GeocodeSource" END,
            geocode_confidence = 'high', geocode_issue_reason = NULL,
            geocode_candidates = '[]'::jsonb, geocode_flagged_at = NULL,
            cannot_locate = false, updated_at = now()
          FROM (VALUES ${Prisma.join(values)}) AS value(id, lat, lng, pin, address, map_link)
          WHERE lead.id = value.id
        `);
      }
      if (notFound.length) {
        const values = notFound.map(({ leadId, row }) => {
          const current = leads.find((lead) => lead.id === leadId);
          return Prisma.sql`(${leadId}, ${pinKey(row.pincode) || current?.pin_code || null}, ${String(row.FormattedAddress || row.address || "").trim() || null}, ${String(row.GoogleMapsLink || "").trim() || null})`;
        });
        await tx.$executeRaw(Prisma.sql`
          UPDATE leads AS lead SET
            lat = NULL, lng = NULL,
            pin_code = COALESCE(value.pin, lead.pin_code),
            address = COALESCE(value.address, lead.address),
            google_map_link = COALESCE(value.map_link, lead.google_map_link),
            intake_team = 'caller', location_verified = false,
            geocode_status = 'invalid'::"GeocodeStatus", geocode_source = NULL,
            geocode_confidence = NULL, geocode_issue_reason = 'not_found',
            geocode_candidates = '[]'::jsonb, geocode_flagged_at = now(),
            cannot_locate = false, updated_at = now()
          FROM (VALUES ${Prisma.join(values)}) AS value(id, pin, address, map_link)
          WHERE lead.id = value.id
        `);
      }
      await tx.activityLog.createMany({ data: batch.map(({ leadId, row, point }) => {
        const current = leads.find((lead) => lead.id === leadId);
        if (!point) callingIds.push(leadId);
        return {
          lead_id: leadId, actor_id: actor.id, action: "CORRECTED_LOCATION_SHEET_RECONCILED",
          old_value: JSON.stringify({ lat: current?.lat, lng: current?.lng, intake_team: current?.intake_team }),
          new_value: JSON.stringify({ lat: point?.lat ?? null, lng: point?.lng ?? null, intake_team: point ? "ground" : "caller", source_file: file.split("/").at(-1) }),
        };
      }) });
    }, { timeout: 120000 });
  }
  await db.$transaction((tx) => assignImportedCallers(tx, callingIds), { timeout: 120000 });
  mkdirSync(".data/audits", { recursive: true });
  const audit = `.data/audits/corrected-location-reconciliation-${new Date().toISOString().replaceAll(":", "-")}.json`;
  writeFileSync(audit, JSON.stringify({ summary, unmatched: result.unmatched.map((row) => row.firm_name), ambiguous: result.ambiguous.map((item) => ({ firm_name: item.row.firm_name, leadIds: item.leadIds })), conflicts: result.conflicts }, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ applied: updates.length, callerAssignmentsChecked: callingIds.length, audit }, null, 2));
} finally {
  await db.$disconnect();
}
