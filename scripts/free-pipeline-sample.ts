/** Read-only against leads; provider caches/rate-limit state are updated. */
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { prisma } from "../src/lib/prisma";
import { mapBusiness } from "../src/lib/mapping/pipeline";
async function main() {
  const results: {
    id: string;
    status: string;
    reason?: string;
    source?: string;
    error?: string;
  }[] = [];
  try {
    const leads = await prisma.lead.findMany({ orderBy: { id: "asc" } });
    const sample = leads
      .sort((a, b) =>
        createHash("sha256")
          .update("free-v2:" + a.id)
          .digest("hex")
          .localeCompare(
            createHash("sha256")
              .update("free-v2:" + b.id)
              .digest("hex"),
          ),
      )
      .slice(0, 20);
    for (const lead of sample) {
      try {
        const r = await mapBusiness(lead);
        results.push({
          id: lead.id,
          status: r.status,
          ...(r.status === "ok" ? { source: r.source } : { reason: r.reason }),
        });
      } catch (e) {
        results.push({
          id: lead.id,
          status: "provider_error",
          error: e instanceof Error ? e.message : "Unavailable",
        });
      }
      console.log(
        JSON.stringify({
          processed: results.length,
          total: sample.length,
          ...results.at(-1),
        }),
      );
    }
    const report = {
      at: new Date().toISOString(),
      population: leads.length,
      sampleSize: sample.length,
      method:
        "20 lowest SHA-256(free-v2:lead-id), deterministic uniform sample; no lead writes",
      accepted: results.filter((r) => r.status === "ok").length,
      issues: results.filter((r) => r.status === "mapping_issue").length,
      providerErrors: results.filter((r) => r.status === "provider_error")
        .length,
      results,
    };
    await writeFile(
      "docs/FREE-PIPELINE-SAMPLE.json",
      JSON.stringify(report, null, 2) + "\n",
    );
    console.log(JSON.stringify(report));
  } finally {
    await prisma.$disconnect();
  }
}
void main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
