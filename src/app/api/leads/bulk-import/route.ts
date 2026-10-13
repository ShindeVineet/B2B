import { validateIntake } from "@/lib/leads/intake";
import { assignCaller } from "@/lib/calling/distribute";
import { importLocation } from "@/lib/import-location";
import { parseLeadPhones } from "@/lib/leads/phones";
import { parseImportDate } from "@/lib/import-date";
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
          const intake = validateIntake({ ...row, company_name: String(row.company_name || ""), owner_name: String(row.owner_name || row.contact_name || ""), phone_no: String(row.phone_no || ""), pin_code: String(row.pin_code || ""), address: String(row.address || "") });
          if (["Manual", "Walk-in"].includes(intake.lead_source)) throw new RangeError("Use Add lead for Manual / Walk-in so the consultation is saved with the lead");
          parseImportDate(row.scraped_date);
          parseLeadPhones([row.phone_no]);
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
      // Fetch existing phone + pin combinations for duplicate detection
      const existingLeads = await prisma.lead.findMany({
        select: { phone_no: true, pin_code: true },
        where: {
          phone_no: { not: null },
          pin_code: { not: null },
        },
      });

      const existingKeySet = new Set(
        existingLeads.map(
          (l) => `${(l.phone_no || "").trim()}_${(l.pin_code || "").trim()}`,
        ),
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
          const intake = validateIntake({ ...raw, company_name: String(raw.company_name || ""), owner_name: String(raw.owner_name || raw.contact_name || ""), phone_no: String(raw.phone_no || ""), pin_code: String(raw.pin_code || ""), address: String(raw.address || "") });
          const company_name = intake.company_name;

          const numbers = parseLeadPhones([raw.phone_no]);
          const phone_no = numbers[0] || null;
          const pin_code = raw.pin_code ? raw.pin_code.toString().trim() : null;
          const address = raw.address ? raw.address.toString().trim() : null;

          // Duplicate check
          if (phone_no && pin_code) {
            const key = `${phone_no}_${pin_code}`;
            if (existingKeySet.has(key) || seenInBatch.has(key)) {
              duplicatesSkipped++;
              if (skipDuplicates) {
                continue;
              }
            }
            seenInBatch.add(key);
          }

          const detectedRegion = raw.region
            ? raw.region.toString().trim()
            : null;
          const location = importLocation(raw);
          if (location?.valid && !location.mismatch) geocodedCount++;
          else unmappedCount++;


          const leadId = randomUUID();
          importedPhones.push(
            ...numbers.map((phone_number, i) => ({
              lead_id: leadId,
              phone_number,
              is_primary: i === 0,
              label: i === 0 ? ("primary" as const) : ("alternate" as const),
              source: "import" as const,
            })),
          );
          leadsToCreate.push({
            id: leadId,
            company_name,
            owner_name: intake.owner_name || null,
            intake_team: intake.intake_team,
            phone_no,
            pin_code,
            address,
            lat: location?.valid ? location.lat : null,
            lng: location?.valid ? location.lng : null,
            geocode_status: location?.valid ? (location.mismatch ? "mismatch_flagged" : "ok") : location ? "mapping_issue" : null,
            geocode_source: location?.valid ? "google_link" : null,
            location_verified: !!location?.valid && !location.mismatch,

            geocode_issue_reason: location ? (location.valid ? (location.mismatch ? "Imported matched name differs from firm; confirm location" : null) : location.reason) : raw.google_map_link?.toString().trim() ? "Queued for geocoding" : "Awaiting manager location",
            category: raw.category ? raw.category.toString().trim() : "General",
            lead_source: intake.lead_source,
            region: detectedRegion || "Unassigned",
            website: raw.website ? raw.website.toString().trim() : null,
            google_map_link: raw.google_map_link
              ? raw.google_map_link.toString().trim()
              : null,
            reviews_count: raw.reviews_count
              ? parseInt(raw.reviews_count, 10) || 0
              : 0,
            status: raw.status || "New",
            notes: raw.notes ? raw.notes.toString().trim() : null,
            extra_notes: [raw.extra_notes, ...["email", "contact_name", "place_id", "matched_name", "formatted_address", "import_geocode_status"].filter(key => raw[key]).map(key => `${key}: ${raw[key]}`)].filter(Boolean).join("\n") || null,
            assigned_store_id: null,
            scraped_date: parseImportDate(raw.scraped_date),
          });
        } finally {
          progress(++processed, rows.length);
        }
      }

      if (leadsToCreate.length > 0) {
        await prisma.$transaction(
          async (tx) => {
            await tx.lead.createMany({ data: leadsToCreate });
            for (const lead of leadsToCreate) if (lead.intake_team === "caller") await assignCaller(tx, lead.id!);
            await tx.leadPhone.updateMany({
              where: { lead_id: { in: leadsToCreate.map((l) => l.id!) } },
              data: { source: "import" },
            });
            await tx.leadPhone.createMany({
              data: importedPhones.filter((p) => !p.is_primary),
            });
            const linkedLeads = leadsToCreate.filter(lead => lead.google_map_link && !lead.geocode_status);
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
                new_value: "Imported lead",
              })),
            });
          },
          { timeout: 60000 },
        );
        totalImported = leadsToCreate.length;
      }

      return {
        success: true,
        totalProcessed: rows.length,
        totalImported,
        invalidRowsSkipped,
        duplicatesSkipped,
        geocodedCount,
        autoAssignedCount,
        unmappedCount,
        geocodeJobId,
        queuedCount: totalImported,
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
