import { parseLeadPhones } from "@/lib/leads/phones";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { canUserManageLeads } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { failure, RequestError } from "@/lib/phase5/http";
import { parseImportDate } from "@/lib/import-date";
import { assignCaller } from "@/lib/calling/distribute";
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user || !canUserManageLeads(user))
      throw new RequestError("Forbidden", 403);
    const { rows } = await req.json();
    if (!Array.isArray(rows) || !rows.length || rows.length > 5000)
      throw new RequestError("Upload 1–5,000 rows");
    const result = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(928060)`;
        let imported = 0,
          skipped = 0;
        for (const row of rows) {
          if (!row || typeof row !== "object" || Array.isArray(row))
            throw new RequestError("Invalid spreadsheet row");
          const text = (key: string) => String(row[key] ?? "").trim();
          if (!Object.values(row).some((v) => String(v ?? "").trim())) continue;
          const externalId = text("lead_id") || null;
          if (
            externalId &&
            (await tx.lead.findUnique({
              where: { linkedin_lead_id: externalId },
            }))
          ) {
            skipped++;
            continue;
          }
          const name = [text("First name"), text("Last name")]
            .filter(Boolean)
            .join(" ");
          const phone = parseLeadPhones([text("Phone number")])[0];
          if (!phone || !/^\d{7,15}$/.test(phone.replace(/\D/g, ""))) throw new RequestError("Every LinkedIn lead needs a valid phone number");
          const lead = await tx.lead.create({
            data: {
              company_name: text("Company name"),
              owner_name: name || null,
              intake_team: "caller",
              phone_no: phone,
              lead_source: "LinkedIn",
              status: "New",
              linkedin_lead_id: externalId,
              linkedin_data: row,
              extra_notes: JSON.stringify({ linkedin_original: row }),
              scraped_date: parseImportDate(
                text("created_time") || text("created_date"),
              ),
              geocode_issue_reason: "Awaiting manager location",
              notes:
                "LinkedIn intake — confirm company and location before assigning a visit.",
            },
          });
          await assignCaller(tx, lead.id);
          await tx.activityLog.create({
            data: {
              lead_id: lead.id,
              actor_id: user.id,
              action: "LINKEDIN_IMPORTED",
              new_value: JSON.stringify({ external_id: externalId }),
            },
          });
          imported++;
        }
        return { imported, skipped };
      },
      { timeout: 120000 },
    );
    return NextResponse.json(result);
  } catch (e) {
    return failure(e);
  }
}
