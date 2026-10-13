import { isPartnerImportDuplicate } from "@/lib/partners/duplicates";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAdministerPartners } from "@/lib/partners/access";
import { validatePartner } from "@/lib/partners/validation";
import { nextPartnerCode } from "@/lib/partners/codes";
import { RequestError, failure } from "@/lib/phase5/http";
import { parsePartnerImportDate } from "@/lib/partners/import-date";
import { partnerAuditValue } from "@/lib/partners/audit";
import type { Prisma } from "@prisma/client";
function normalize(raw: Record<string, unknown>): Record<string, unknown> {
  const gstRaw = raw.gst_registered;
  const gstStr = String(gstRaw ?? "")
    .trim()
    .toLowerCase();
  const gst_registered =
    typeof gstRaw === "boolean"
      ? gstRaw
      : gstStr === "yes" || gstStr === "true" || gstStr === "1"
        ? true
        : ["", "no", "false", "0"].includes(gstStr)
          ? false
          : gstRaw;

  return {
    ...raw,
    gst_registered,
    type_of_professional: String(raw.type_of_professional || "").trim(),
    // empty string is fine — validator treats it as null now
    onboarded_from: String(raw.onboarded_from || "")
      .trim()
      .toLowerCase()
      .replace(/[ -]+/g, "_"),
    onboarded_at: parsePartnerImportDate(raw.onboarded_at)?.toISOString(),
  };
}
export async function POST(req: NextRequest) {
  try {
    const u = await getCurrentUser(req);
    if (!u || !canAdministerPartners(u)) throw new RequestError("Forbidden", 403);
    const body = await req.json();
    if (
      !Array.isArray(body.rows) ||
      !body.rows.length ||
      body.rows.length > 1000
    )
      throw new RequestError("Import 1–1000 rows at a time");
    const result = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(707007)`;
        const results = [];
        type Candidate = Record<string, unknown> & {
          id: string;
          partner_code: string;
          company_firm_name: string;
          partner_status: string;
        };
        const existingPartners: Candidate[] = await tx.partner.findMany();
        const previewRows: Candidate[] = [];
        const committedRows = new Map<string, string>();
        for (let i = 0; i < body.rows.length; i++) {
          const input = body.rows[i];
          let raw: Record<string, unknown>;
          let fields;
          try {
            raw = normalize(input.fields || input);
            fields = validatePartner(raw);
            for (const url of [fields.gst_certificate_url, fields.pan_card_url, fields.bank_document_url])
              if (url && !/^https:\/\//.test(url))
                throw new RangeError(
                  "Historical documents must use HTTPS links",
                );
          } catch (e) {
            if (body.commit) throw e;
            results.push({ index: i, error: (e as Error).message });
            continue;
          }
          const code =
            typeof raw.partner_code === "string" ? raw.partner_code.trim() : "";
          const identity = { ...fields, partner_code: code };
          const matches = existingPartners.filter((p) =>
            isPartnerImportDuplicate(identity, p),
          );
          if (!body.commit)
            matches.push(
              ...previewRows.filter((p) =>
                isPartnerImportDuplicate(identity, p),
              ),
            );
          const targetId = committedRows.get(input.merge_id) || input.merge_id;
          const mergeTarget =
            matches.find((p) => p.id === targetId) || matches[0];
          const fill = mergeTarget
            ? Object.fromEntries(
                Object.entries(fields).filter(([key, value]) => {
                  const old = mergeTarget[key as keyof typeof mergeTarget];
                  return (
                    (old === null || old === "") &&
                    value !== null &&
                    value !== ""
                  );
                }),
              )
            : {};
          if (!body.commit) {
            results.push({
              index: i,
              fields,
              partner_code: code,
              matches: matches.map((p) => ({
                id: p.id,
                partner_code: p.partner_code,
                company_firm_name: p.company_firm_name,
                contact_person_name: String(p.contact_person_name || ""),
                designation: String(p.designation || ""),
              })),
              merge_preview: fill,
            });
            if (input.decision !== "skip")
              previewRows.push({
                ...fields,
                id: `row:${i}`,
                partner_code: code || `Generated code for row ${i + 1}`,
                partner_status: "active",
              });
            continue;
          }
          if (input.decision === "skip") {
            results.push({ index: i, status: "skipped" });
            continue;
          }
          if (
            matches.length &&
            !["merge", "import_anyway"].includes(input.decision)
          )
            throw new RequestError(
              `Row ${i + 1}: review duplicate matches`,
              409,
            );
          if (input.decision === "merge") {
            if (!mergeTarget || targetId !== mergeTarget.id)
              throw new RequestError(
                `Row ${i + 1}: choose the merge target`,
                409,
              );
            if (mergeTarget.partner_status !== "active")
              throw new RequestError("Merge target must be active");
            const p = await tx.partner.update({
              where: { id: mergeTarget.id },
              data: fill,
            });
            await tx.partnerActivity.create({
              data: {
                partner_id: p.id,
                actor_id: u.id,
                action: "HISTORICAL_MERGE",
                old_value: partnerAuditValue(mergeTarget),
                new_value: partnerAuditValue(p),
              },
            });
            const index = existingPartners.findIndex((v) => v.id === p.id);
            if (index >= 0) existingPartners[index] = p;
            committedRows.set(`row:${i}`, p.id);
            results.push({ index: i, status: "merged" });
            continue;
          }
          if (code && matches.some((p) => p.partner_code === code))
            throw new RequestError(
              `Row ${i + 1}: Partner Code already exists; skip or merge`,
              409,
            );
          for (const url of [fields.gst_certificate_url, fields.pan_card_url, fields.bank_document_url])
            if (url && !/^https:\/\//.test(url))
              throw new RequestError(
                "Historical documents must use HTTPS links",
              );
          const p = await tx.partner.create({
            data: {
              ...fields,
              partner_code: code || (await nextPartnerCode(tx)),
              submitted_by: u.id,
              is_migrated_historical: true,
              partner_status: "active",
            },
          });
          await tx.partnerActivity.create({
            data: {
              partner_id: p.id,
              actor_id: u.id,
              action: "HISTORICAL_IMPORT",
              new_value: fields as unknown as Prisma.InputJsonValue,
            },
          });
          existingPartners.push(p);
          committedRows.set(`row:${i}`, p.id);
          results.push({ index: i, status: "imported" });
        }
        return results;
      },
      { timeout: 60000 },
    );
    return NextResponse.json({ rows: result });
  } catch (e) {
    return failure(e);
  }
}
