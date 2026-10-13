import { writeFile } from "node:fs/promises";
import { prisma } from "../src/lib/prisma";
import { mapBusiness, mappingFields } from "../src/lib/mapping/pipeline";
import { refreshAllotment } from "../src/lib/assignment/allotment";
async function main() {
  const jobId = process.argv.find((arg) => arg.startsWith("--job="))?.slice(6);
  if (!jobId) throw Error("Pass --job=<existing job id>; no batch is inferred");
  const job = await prisma.geocodeJob.findUniqueOrThrow({
    where: { id: jobId },
    include: { items: { include: { lead: true }, orderBy: { id: "asc" } } },
  });
  const index = await prisma.osmPoiRefresh.findUniqueOrThrow({
    where: { id: "india" },
  });
  if (!index.refreshed_at || !index.poi_count)
    throw Error("Load the real India index before auditing");
  const started = Date.now();
  const results = [];
  for (const item of job.items) {
    const result = await mapBusiness(item.lead, undefined, { localOnly: true });
    const disposition =
      result.status === "ok"
        ? "local_match"
        : result.reason === "not_found"
          ? "external_fallback"
          : "needs_review";
    results.push({ item, result, disposition });
    if (results.length % 250 === 0)
      console.log(`Local-only audit ${results.length}/${job.items.length}`);
  }
  const matched = results.filter((r) => r.disposition === "local_match").length;
  const report = {
    jobId,
    auditedAt: new Date().toISOString(),
    total: results.length,
    indexCount: index.poi_count,
    indexTimestamp: index.source_timestamp,
    localMatched: matched,
    localMatchRatePercent: Number(
      ((100 * matched) / results.length).toFixed(2),
    ),
    externalFallbackNeeded: results.filter(
      (r) => r.disposition === "external_fallback",
    ).length,
    needsReviewBeforeExternal: results.filter(
      (r) => r.disposition === "needs_review",
    ).length,
    verifiedLocationsPreserved: results.filter(
      (r) => r.item.lead.location_verified,
    ).length,
    elapsedMs: Date.now() - started,
    externalRequests: 0,
    results: results.map((r) => ({
      leadId: r.item.lead_id,
      disposition: r.disposition,
      result: r.result,
    })),
  };
  await writeFile(
    "docs/LOCAL-POI-AUDIT.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify({ ...report, results: undefined }));
  if (process.argv.includes("--apply")) {
    // Run only after the local-only report is persisted. The worker must be paused during this step.
    await prisma.geocodeJob.update({
      where: { id: job.id },
      data: { status: "paused", finished_at: null },
    });
    for (const { item, result, disposition } of results) {
      await prisma.$transaction(async (tx) => {
        const fresh = await tx.lead.findUniqueOrThrow({
          where: { id: item.lead_id },
        });
        if (
          fresh.location_verified ||
          fresh.updated_at.getTime() !== item.lead.updated_at.getTime()
        ) {
          await tx.geocodeJobItem.update({
            where: { id: item.id },
            data: {
              status: "skipped",
              error: null,
              attempts: 0,
              next_attempt_at: null,
              lease_until: null,
            },
          });
          return;
        }
        if (disposition !== "external_fallback") {
          await tx.lead.update({
            where: { id: fresh.id },
            data: mappingFields(result),
          });
          if (result.status === "ok")
            await refreshAllotment(tx, fresh.id, job.created_by);
          await tx.activityLog.create({
            data: {
              lead_id: fresh.id,
              actor_id: job.created_by,
              action: "LOCAL_POI_REPROCESSED",
              old_value: JSON.stringify({ lat: fresh.lat, lng: fresh.lng }),
              new_value: JSON.stringify(result),
            },
          });
        } else if (fresh.lat === null && fresh.lng === null) {
          await tx.lead.update({
            where: { id: fresh.id },
            data: {
              geocode_status: null,
              geocode_issue_reason:
                "Queued for external fallback after local POI miss",
            },
          });
        }
        await tx.geocodeJobItem.update({
          where: { id: item.id },
          data: {
            search_stage:
              disposition === "external_fallback" ? "external" : "local",
            status:
              disposition === "external_fallback"
                ? "pending"
                : result.status === "ok"
                  ? "accepted"
                  : "issue",
            attempts: 0,
            retry_cycles: 0,
            error: null,
            next_attempt_at: null,
            lease_until: null,
          },
        });
      });
    }
    await prisma.geocodeJob.update({
      where: { id: job.id },
      data: {
        status: report.externalFallbackNeeded ? "queued" : "completed",
        finished_at: report.externalFallbackNeeded ? null : new Date(),
      },
    });
    console.log(
      "Local results applied and remaining misses queued; no external requests made by this script",
    );
  }
}
main()
  .finally(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
