import { assignImportedCallers } from "@/lib/calling/distribute";
import {
  importDuplicateKey,
  prepareImportRow,
} from "@/lib/leads/import-row";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user || user.role !== "b2b_head") {
      return NextResponse.json(
        { error: "Unauthorized. Lead management permission required." },
        { status: 403 },
      );
    }

    const { rows, skipDuplicates = true } = await req.json();

    if (
      !Array.isArray(rows) ||
      rows.length === 0 ||
      rows.some((row) => !row || typeof row !== "object")
    ) {
      return NextResponse.json(
        { error: "No rows provided for import" },
        { status: 400 },
      );
    }

    try {
      for (const [index, row] of rows.entries()) {
        try {
          prepareImportRow(row as Record<string, unknown>);
        } catch (error) {
          throw new RangeError(
            `Data row ${index + 1}: ${(error as Error).message}. Check the column mapping or correct this cell. No rows were saved.`,
          );
        }
      }
    } catch (error) {
      return NextResponse.json(
        { error: (error as Error).message },
        { status: 400 },
      );
    }

    const performImport = async (
      progress: (processed: number, total: number) => void,
    ) => {
      const importBatchId = randomUUID();
      // Use the same identity keys for existing and incoming records, including
      // location-only rows which have no phone number.
      const existingLeads = await prisma.lead.findMany({
        select: {
          company_name: true,
          phone_no: true,
          pin_code: true,
          lat: true,
          lng: true,
        },
      });

      const existingKeySet = new Set(
        existingLeads.map(importDuplicateKey),
      );

      let totalImported = 0;
      const invalidRowsSkipped = 0;
      let duplicatesSkipped = 0;
      let geocodedCount = 0;
      const autoAssignedCount = 0;
      let unmappedCount = 0;
      let geocodeJobId: string | null = null;

      const importedPhones: {
        lead_id: string;
        phone_number: string;
        is_primary: boolean;
        label: "primary" | "alternate";
        source: "import";
      }[] = [];
      const leadsToCreate: Prisma.LeadCreateManyInput[] = [];
      const seenInBatch = new Set<string>();

      let processed = 0;
      for (const raw of rows) {
        try {
          const prepared = prepareImportRow(raw as Record<string, unknown>);

          // Duplicate check
          const key = importDuplicateKey(prepared);
          if (existingKeySet.has(key) || seenInBatch.has(key)) {
            duplicatesSkipped++;
            if (skipDuplicates) {
              continue;
            }
          }
          seenInBatch.add(key);

          if (prepared.location_verified) geocodedCount++;
          else unmappedCount++;


          const leadId = randomUUID();
          importedPhones.push(
            ...prepared.phones.map((phone_number, i) => ({
              lead_id: leadId,
              phone_number,
              is_primary: i === 0,
              label: i === 0 ? ("primary" as const) : ("alternate" as const),
              source: "import" as const,
            })),
          );
          leadsToCreate.push({
            id: leadId,
            company_name: prepared.company_name,
            owner_name: prepared.owner_name,
            intake_team: prepared.intake_team,
            phone_no: prepared.phone_no,
            pin_code: prepared.pin_code,
            address: prepared.address,
            lat: prepared.lat,
            lng: prepared.lng,
            geocode_status: prepared.geocode_status,
            geocode_source: prepared.geocode_source,
            location_verified: prepared.location_verified,
            geocode_issue_reason: prepared.geocode_issue_reason,
            category: prepared.category,
            lead_source: prepared.lead_source,
            region: prepared.region,
            website: prepared.website,
            google_map_link: prepared.google_map_link,
            reviews_count: raw.reviews_count
              ? parseInt(raw.reviews_count, 10) || 0
              : 0,
            status: raw.status || "New",
            notes: prepared.notes,
            extra_notes: [
              prepared.extra_notes,
              ...[
                "place_id",
                "matched_name",
                "formatted_address",
                "import_geocode_status",
              ]
                .filter((field) => raw[field])
                .map((field) => `${field}: ${raw[field]}`),
            ]
              .filter(Boolean)
              .join("\n") || null,
            assigned_store_id: null,
            scraped_date: prepared.scraped_date,
          });
        } finally {
          progress(++processed, rows.length);
        }
      }

      if (leadsToCreate.length > 0) {
        await prisma.$transaction(
          async (tx) => {
            await tx.lead.createMany({ data: leadsToCreate });
            await assignImportedCallers(
              tx,
              leadsToCreate
                .filter((lead) => lead.intake_team === "caller")
                .map((lead) => lead.id!),
            );
            await tx.leadPhone.updateMany({
              where: { lead_id: { in: leadsToCreate.map((l) => l.id!) } },
              data: { source: "import" },
            });
            await tx.leadPhone.createMany({
              data: importedPhones.filter((p) => !p.is_primary),
            });
            const linkedLeads = leadsToCreate.filter(
              (lead) =>
                lead.intake_team !== "caller" &&
                lead.google_map_link &&
                !lead.geocode_status,
            );
            if (linkedLeads.length) {
            const job = await tx.geocodeJob.create({
              data: { created_by: user.id },
            });
            await tx.geocodeJobItem.createMany({
              data: linkedLeads.map((lead) => ({
                job_id: job.id,
                lead_id: lead.id!,
              })),
            });
            geocodeJobId = job.id;
            }
            await tx.activityLog.createMany({
              data: leadsToCreate.map((lead) => ({
                lead_id: lead.id!,
                actor_id: user.id,
                action: "BULK_IMPORT",
                new_value: JSON.stringify({
                  import_batch_id: importBatchId,
                  source: lead.lead_source,
                  team: lead.intake_team,
                }),
              })),
            });
          },
          { timeout: 180000 },
        );
        totalImported = leadsToCreate.length;
      }

      return {
        success: true,
        importBatchId,
        totalProcessed: rows.length,
        totalImported,
        invalidRowsSkipped,
        duplicatesSkipped,
        geocodedCount,
        autoAssignedCount,
        unmappedCount,
        geocodeJobId,
        queuedCount: totalImported,
        callingQueueCount: leadsToCreate.filter(
          (lead) => lead.intake_team === "caller",
        ).length,
        routeBuilderCount: leadsToCreate.filter(
          (lead) => lead.intake_team === "ground",
        ).length,
      };
    };

    if (req.headers.get("accept")?.includes("application/x-ndjson")) {
      const encoder = new TextEncoder();
      let connected = true;
      const stream = new ReadableStream({
        async start(controller) {
          const send = (event: object) => {
            if (connected)
              controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
          };
          try {
            send({ type: "progress", processed: 0, total: rows.length });
            const result = await performImport((processed, total) =>
              send({ type: "progress", processed, total }),
            );
            send({ type: "complete", ...result });
          } catch (error) {
            console.error("Import stream failed", error);
            send({
              type: "error",
              error:
                "Import failed. No rows were saved. Check your mapped dates and fields and try again.",
            });
          } finally {
            if (connected) controller.close();
          }
        },
        cancel() {
          connected = false;
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "application/x-ndjson",
          "Cache-Control": "no-cache",
          "X-Accel-Buffering": "no",
        },
      });
    }
    return NextResponse.json(await performImport(() => {}));
  } catch (err: unknown) {
    console.error("Bulk import error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to import leads" },
      { status: 500 },
    );
  }
}
