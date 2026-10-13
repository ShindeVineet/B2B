import { checkReferral } from "@/lib/partners/referral";
import {leadGenSource} from "@/lib/partners/lead-gen-source";
import { findPartnerIdentityDuplicate } from "@/lib/partners/duplicates";
import { parseLeadPhones } from "@/lib/leads/phones";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getLeadFilterForUser } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { RequestError, failure } from "@/lib/phase5/http";
import { requirePartner, canReviewPartners } from "@/lib/partners/access";
import { validatePartner } from "@/lib/partners/validation";
import { attachPartnerDocuments } from "@/lib/partners/documents";
import { partnerAuditValue } from "@/lib/partners/audit";
import type { Prisma } from "@prisma/client";
type Context = { params: Promise<{ id: string }> };
export async function GET(req: NextRequest, ctx: Context) {
  try {
    const u = await getCurrentUser(req);
    if (!u) throw new RequestError("Unauthorized", 401);
    const { id } = await ctx.params,
      p = await requirePartner(u, id);
    const [activity, lead] = await Promise.all([
      prisma.partnerActivity.findMany({
        where: { partner_id: id },
        include: { actor: { select: { name: true } } },
        orderBy: { created_at: "desc" },
      }),
      p.source_lead_id
        ? prisma.lead.findFirst({
            where: { id: p.source_lead_id, AND: [getLeadFilterForUser(u)] },
            include: {
              consultations: {
                include: {
                  rep: { select: { id: true, name: true } },
                  lead: true,
                },
                orderBy: { created_at: "desc" },
              },
              trip_leads: { include: { trip: true } },
              activity_logs: {
                include: { actor: { select: { name: true } } },
                orderBy: { created_at: "desc" },
              },
            },
          })
        : null,
    ]);
    const routes = lead
      ? await prisma.routeSnapshot.findMany({
          where: { ordered_lead_ids: { array_contains: [lead.id] } },
          orderBy: { route_date: "desc" },
          select: { id: true, route_date: true, version: true },
        })
      : [];
    return NextResponse.json({ partner: p, activity, lead, routes });
  } catch (e) {
    return failure(e);
  }
}
export async function PATCH(req: NextRequest, ctx: Context) {
  try {
    const u = await getCurrentUser(req);
    if (!u) throw new RequestError("Unauthorized", 401);
    const { id } = await ctx.params;
    await requirePartner(u, id);
    const raw = await req.json();
    if (!canReviewPartners(u) && raw.action !== "resubmit")
      throw new RequestError("Manager/Head access required", 403);
    const partner = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(707007)`;
      const old = await tx.partner.findUniqueOrThrow({
        where: { id },
        include: { phones: true },
      });
      let data: Prisma.PartnerUncheckedUpdateInput;
      if (raw.action === "resubmit") {
        if (
          old.partner_status !== "rejected" ||
          (old.submitted_by !== u.id && !canReviewPartners(u))
        )
          throw new RequestError(
            "Only the submitter or Head/Ops can correct a rejected form",
            403,
          );
        data = {
          ...validatePartner(raw),
          partner_code: old.partner_code,
          partner_status: "pending_review",
          rejection_reason: null,
          reviewed_by: null,
          reviewed_at: null,
        };
        await attachPartnerDocuments(tx, id, u.id, [
          data.gst_certificate_url as string | null,
          data.pan_card_url as string | null,
          data.bank_document_url as string | null,
        ]);
      } else if (raw.action === "activate" || raw.action === "reject") {
        if (old.partner_status !== "pending_review")
          throw new RequestError(
            "Only pending submissions can be reviewed",
            409,
          );
        const reason =
          typeof raw.rejection_reason === "string"
            ? raw.rejection_reason.trim()
            : "";
        if (raw.action === "reject" && !reason)
          throw new RequestError("Rejection reason is required");
        data = {
          ...(raw.action === "activate" ? leadGenSource(raw) : {}),
          partner_status: raw.action === "activate" ? "active" : "rejected",
          reviewed_by: u.id,
          reviewed_at: new Date(),
          rejection_reason: reason || null,
        };
        if (raw.action === "activate" && old.source_lead_id) {
          const lead = await tx.lead.findUniqueOrThrow({
            where: { id: old.source_lead_id },
          });
          await tx.lead.update({
            where: { id: lead.id },
            data: { status: "onboarded", status_entered_at: new Date() },
          });
          await tx.followUp.updateMany({
            where: { lead_id: lead.id },
            data: { active: false },
          });
          await tx.coldLeadCase.updateMany({
            where: { lead_id: lead.id, resolved_at: null },
            data: { resolved_at: new Date() },
          });
          await tx.activityLog.create({
            data: {
              lead_id: lead.id,
              actor_id: u.id,
              action: "PARTNER_ACTIVATED",
              old_value: lead.status,
              new_value: "onboarded",
            },
          });
        }
        if (raw.action === "reject")
          await tx.partnerNotification.create({
            data: {
              partner_id: id,
              user_id: old.submitted_by,
              message: `${old.partner_code} rejected: ${reason}`,
            },
          });
      } else {
        if (old.partner_status !== "active")
          throw new RequestError("Only active partners can be edited");
        data = {
          ...validatePartner(raw),
          partner_code: old.partner_code,
          region_override:
            typeof raw.region_override === "string"
              ? raw.region_override.trim() || null
              : old.region_override,
        };
        await attachPartnerDocuments(
          tx,
          id,
          u.id,
          [
            data.gst_certificate_url as string | null,
            data.pan_card_url as string | null,
          data.bank_document_url as string | null,
          ],
          old.is_migrated_historical,
        );
      }
      if (
        raw.action !== "activate" &&
        raw.action !== "reject" &&
        raw.additional_phones !== undefined
      ) {
        await tx.partnerPhone.deleteMany({ where: { partner_id: id } });
        await tx.partnerPhone.createMany({
          data: parseLeadPhones([raw.additional_phones])
            .filter((n) => n !== raw.mobile_number)
            .map((phone_number) => ({ partner_id: id, phone_number })),
        });
      }
      if (old.source_lead_id && data.region_override)
        throw new RequestError(
          "Region is derived from the originating lead store",
        );
      if (
        typeof data.region_override === "string" &&
        !(await tx.store.findFirst({ where: { region: data.region_override } }))
      )
        throw new RequestError("Choose a known store region");
      if (
        typeof data.partner_code === "string" &&
        (await tx.partner.findFirst({
          where: { partner_code: data.partner_code, id: { not: id } },
        }))
      )
        throw new RequestError("Partner Code already exists", 409);
      if (
        (raw.action === "resubmit" ||
          (raw.action !== "activate" && raw.action !== "reject")) &&
        (await findPartnerIdentityDuplicate(tx, { ...old, ...data }, id))
      )
        throw new RequestError(
          "This company, contact person and designation already exist on another partner.",
          409,
        );
      if (data.referred_by_partner_id !== undefined) await checkReferral(tx, data.referred_by_partner_id as string | null, id);
      const p = await tx.partner.update({
        where: { id },
        data,
        include: { phones: true },
      });
      await tx.partnerActivity.create({
        data: {
          partner_id: id,
          actor_id: u.id,
          action:
            raw.action === "resubmit"
              ? "RESUBMITTED"
              : raw.action === "activate"
                ? "ACTIVATED"
                : raw.action === "reject"
                  ? "REJECTED"
                  : "EDITED",
          old_value: partnerAuditValue(old),
          new_value: partnerAuditValue(p),
        },
      });
      return p;
    });
    return NextResponse.json({ partner });
  } catch (e) {
    return failure(e);
  }
}
