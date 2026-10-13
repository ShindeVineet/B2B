import { checkReferral } from "@/lib/partners/referral";
import { leadGenSource } from "@/lib/partners/lead-gen-source";
import { nextPartnerCode } from "@/lib/partners/codes";
import { findPartnerIdentityDuplicate } from "@/lib/partners/duplicates";
import { parseLeadPhones } from "@/lib/leads/phones";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLeadFilterForUser } from "@/lib/permissions";
import { RequestError, failure } from "@/lib/phase5/http";
import { visiblePartners } from "@/lib/partners/access";
import { validatePartner } from "@/lib/partners/validation";
import { attachPartnerDocuments } from "@/lib/partners/documents";
export async function GET(req: NextRequest) {
  try {
    const u = await getCurrentUser(req);
    if (!u) throw new RequestError("Unauthorized", 401);
    return NextResponse.json({ partners: await visiblePartners(u) });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: NextRequest) {
  try {
    const u = await getCurrentUser(req);
    if (!u) throw new RequestError("Unauthorized", 401);
    if (u.role === "analyst") throw new RequestError("Read-only access", 403);
    const raw = await req.json(),
      fields = validatePartner(raw);
    const partner = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(707007)`;
      const lead = raw.source_lead_id
        ? await tx.lead.findFirst({
            where: { id: raw.source_lead_id, AND: [getLeadFilterForUser(u)] },
            include: {
              consultations: { orderBy: { created_at: "desc" }, take: 1 },
            },
          })
        : null;
      if (raw.source_lead_id && !lead)
        throw new RequestError("Lead not found", 404);
      if (await findPartnerIdentityDuplicate(tx, fields))
        throw new RequestError(
          "A partner with this company, contact person and designation already exists. Edit that record or use a different contact person or designation.",
          409,
        );
      await checkReferral(tx, fields.referred_by_partner_id);
      const p = await tx.partner.create({
        data: {
          ...fields,
          partner_code: await nextPartnerCode(tx),
          submitted_by: u.id,
          partner_status: u.role === "ground_rep" ? "pending_review" : "active",
          ...(u.role === "ground_rep"
            ? {}
            : {
                ...leadGenSource(raw),
                reviewed_by: u.id,
                reviewed_at: new Date(),
              }),
          source_lead_id: lead?.id,
          source_lead_code: lead?.lead_code,
        },
      });
      if (p.partner_status === "active" && lead) {
        await tx.lead.update({
          where: { id: lead.id },
          data: { status: "onboarded", status_entered_at: new Date() },
        });
        await tx.followUp.updateMany({
          where: { lead_id: lead.id },
          data: { active: false },
        });
      }
      await tx.partnerPhone.createMany({
        data: parseLeadPhones([raw.additional_phones])
          .filter((n) => n !== fields.mobile_number)
          .map((phone_number) => ({ partner_id: p.id, phone_number })),
      });
      await attachPartnerDocuments(tx, p.id, u.id, [
        fields.gst_certificate_url,
        fields.pan_card_url,
        fields.bank_document_url,
      ]);
      await tx.partnerActivity.create({
        data: { partner_id: p.id, actor_id: u.id, action: "SUBMITTED" },
      });
      return p;
    });
    return NextResponse.json({ partner }, { status: 201 });
  } catch (e) {
    return failure(e);
  }
}
