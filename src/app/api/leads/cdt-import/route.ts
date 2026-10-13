import { assignCaller } from "@/lib/calling/distribute";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { canUserManageLeads } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { failure, RequestError } from "@/lib/phase5/http";
import { parseLeadPhones } from "@/lib/leads/phones";
import { parseImportDate } from "@/lib/import-date";
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user || !canUserManageLeads(user))
      throw new RequestError("Forbidden", 403);
    const { rows } = await req.json();
    if (!Array.isArray(rows) || !rows.length || rows.length > 5000)
      throw new RequestError("Upload 1–5,000 rows");
    const stores = await prisma.store.findMany({ where: { active: true } });
    const parsed = rows.map((row: Record<string, unknown>, index: number) => {
      const text = (key: string) => String(row[key] ?? "").trim();
      const preferred = text("preferred_store");
      const matches = stores.filter(
        (s) => s.name.toLowerCase() === preferred.toLowerCase(),
      );
      const store = matches.length === 1 ? matches[0] : null;
      if (
        user.role === "regional_manager" &&
        store &&
        store.region !== user.region
      )
        throw new RequestError(
          `Row ${index + 1}: preferred store is outside your region`,
        );
      let phone: string | null = null;
      try {
        phone = parseLeadPhones([text("phone_no")])[0] || null;
      } catch {
        throw new RequestError(
          `Row ${index + 1}: invalid phone number; a phone number is required`,
        );
      }
      if (!phone || !/^\d{7,15}$/.test(phone.replace(/\D/g, ""))) throw new RequestError(`Row ${index + 1}: phone number is required`);
      return {
        company_name: text("company_name"),
        owner_name: text("name") || null,
        intake_team: "caller",
        phone_no: phone,
        category: text("business_type") || null,
        lead_source: "CDT",
        status: "New",
        assigned_store_id: store?.id || null,
        region:
          store?.region ||
          (user.role === "regional_manager" ? user.region : null),
        scraped_date: parseImportDate(text("date")),
        notes:
          "CDT intake — complete company and location details before assigning a visit.",
        extra_notes: JSON.stringify({
          cdt_original: row,
          preferred_store: preferred,
        }),
        geocode_issue_reason: "Awaiting manager location",
      };
    });
    const imported = await prisma.$transaction(
      async (tx) => {
        for (const data of parsed) {
          const lead = await tx.lead.create({ data });
          await assignCaller(tx, lead.id);
          await tx.activityLog.create({
            data: {
              lead_id: lead.id,
              actor_id: user.id,
              action: "CDT_IMPORTED",
              new_value: lead.extra_notes,
            },
          });
        }
        return parsed.length;
      },
      { timeout: 60000 },
    );
    return NextResponse.json({ imported });
  } catch (e) {
    return failure(e);
  }
}
