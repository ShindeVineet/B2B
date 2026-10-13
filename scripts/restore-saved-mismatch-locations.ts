import { prisma } from "../src/lib/prisma";
import { importLocation } from "../src/lib/import-location";
import { IMPORTED_NAME_MISMATCH } from "../src/lib/mapping/saved-location";
async function main() {
  const leads = await prisma.lead.findMany({
    where: {
      location_verified: false,
      geocode_status: "mapping_issue",
      geocode_issue_reason: "not_found",
    },
  });
  let restored = 0;
  for (const lead of leads) {
    const matched = lead.extra_notes?.match(
      /^(?:matched_name|MatchedName):\s*(.+)$/m,
    )?.[1];
    if (!matched) continue;
    const logs = await prisma.activityLog.findMany({
      where: { lead_id: lead.id, action: "GEOCODING_REPROCESSED" },
      orderBy: { created_at: "desc" },
    });
    let point: ReturnType<typeof importLocation> = null;
    for (const log of logs) {
      try {
        point = importLocation({
          ...JSON.parse(log.old_value || "{}"),
          company_name: lead.company_name,
          matched_name: matched,
        });
      } catch {
        continue;
      }
      if (point?.valid && point.mismatch) break;
    }
    if (!point?.valid || !point.mismatch) continue;
    if (process.argv.includes("--apply"))
      await prisma.$transaction(async (tx) => {
        const updated = await tx.lead.updateMany({
          where: { id: lead.id, updated_at: lead.updated_at },
          data: {
            lat: point.lat,
            lng: point.lng,
            geocode_status: "mismatch_flagged",
            geocode_source: "google_link",
            geocode_confidence: "high",
            geocode_issue_reason: IMPORTED_NAME_MISMATCH,
            geocode_flagged_at: new Date(),
          },
        });
        if (updated.count)
          await tx.activityLog.create({
            data: {
              lead_id: lead.id,
              action: "SAVED_LOCATION_RESTORED",
              old_value: JSON.stringify({ lat: lead.lat, lng: lead.lng }),
              new_value: JSON.stringify({
                lat: point.lat,
                lng: point.lng,
                reason:
                  "Recovered saved imported coordinates from geocoding audit; human confirmation still required",
              }),
            },
          });
      });
    restored++;
  }
  console.log({
    mode: process.argv.includes("--apply") ? "applied" : "preview",
    recoverable: restored,
  });
}
main().finally(() => prisma.$disconnect());
