import { partnerType } from "@/lib/partners/identity";
import { parseLeadPhones } from "@/lib/leads/phones";
import { refreshAllotment } from "@/lib/assignment/allotment";
import type { Prisma } from "@prisma/client";
import { resolveAssignment } from "@/lib/assignment/validate";
import { RequestError } from "@/lib/phase5/http";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  canUserManageLeads,
  getLeadEditFilterForUser,
  getLeadFilterForUser,
  getStoreFilterForUser,
  getUserFilterForUser,
} from "@/lib/permissions";
import {resolveGoogleMapsLink} from "@/lib/maps-place";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;

    const lead = await prisma.lead.findUnique({
      where: { id, AND: [getLeadFilterForUser(user)] },
      include: {
        store: true,
        ground_rep: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            role: true,
          },
        },
        activity_logs: {
          orderBy: { created_at: "desc" },
          take: 20,
          include: {
            actor: {
              select: { id: true, name: true, role: true },
            },
          },
        },
      },
    });

    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    return NextResponse.json({ lead });
  } catch (err) {
    console.error("GET /api/leads/[id] error:", err);
    return NextResponse.json(
      { error: "Failed to fetch lead" },
      { status: err instanceof RequestError ? err.status : err instanceof RangeError ? 400 : 500 },
    );
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    if (["analyst", "ground_rep"].includes(user.role))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const body = await req.json();
    if (user.role === "store_associate" && ["assigned_ground_rep_id", "assigned_store_id", "assigned_visit_date"].some(key => Object.hasOwn(body,key)))
      return NextResponse.json({error:"Only Store Lead or B2B Head can assign leads"},{status:403});

    if (
      body.assigned_store_id &&
      !(await prisma.store.findFirst({
        where: {
          AND: [
            getStoreFilterForUser(user),
            { id: body.assigned_store_id, active: true },
          ],
        },
      }))
    )
      return NextResponse.json({ error: "Invalid store" }, { status: 403 });
    if (
      body.assigned_ground_rep_id &&
      !(await prisma.user.findFirst({
        where: {
          AND: [
            getUserFilterForUser(user),
            {
              id: body.assigned_ground_rep_id,
              active: true,
              role: { in: ["ground_rep", "regional_manager", "b2b_head"] },
            },
          ],
        },
      }))
    )
      return NextResponse.json({ error: "Invalid rep" }, { status: 403 });
    const existing = await prisma.lead.findUnique({
      where: { id, AND: [getLeadEditFilterForUser(user)] },
    });

    if (!existing) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    // Ground reps can only update notes, call_outcome, outcome of their own leads
    if (
      user.role === "ground_rep" &&
      existing.assigned_ground_rep_id !== user.id
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (["id", "lead_code", "original_data", "lead_source", "intake_team"].some(k => Object.hasOwn(body, k))) throw new RequestError("Original lead details and identifiers cannot be changed; use alternate details");
    for (const key of ["gst_no", "company_name", "owner_name", "phone_no", "address", "pin_code", "website", "category", "google_map_link"]) {
      if (body[key] != null && (typeof body[key] !== "string" || body[key].length > 2000)) throw new RequestError(`Invalid ${key}`);
    }
    if (body.company_name === null) body.company_name = "";
    if (body.phone_no) {
      const numbers = parseLeadPhones([body.phone_no]);
      if (numbers.length !== 1 || !/^\d{7,15}$/.test(numbers[0].replace(/\D/g, ""))) throw new RequestError("Enter one valid phone number; add extra numbers using alternate contacts");
      body.phone_no = numbers[0];
    }
    if (body.pin_code && !/^[1-9]\d{5}$/.test(body.pin_code)) throw new RequestError("Enter a valid six-digit PIN code");
    if (body.whatsapp_group_created !== undefined && typeof body.whatsapp_group_created !== "boolean") throw new RequestError("Invalid WhatsApp group selection");
    if (body.partner_type !== undefined || body.gst_no !== undefined) body.partner_type = partnerType(body.partner_type, body.gst_no ?? existing.gst_no);
    const updateData: Prisma.LeadUncheckedUpdateInput = {};
    const changes: string[] = [];

    // Fields that any authorized user can update
    const allowedFields = [
      "status",
      "call_outcome",
      "notes",
      "extra_notes",
      "whatsapp_group_created",
      "outcome",
      "assigned_visit_date",
    ] as const;

    // Fields that only managers/admins can update
    const managerFields = [
      "gst_no",
      "partner_type",
      "company_name",
      "phone_no",
      "pin_code",
      "address",
      "category",
      "owner_name",
      "region",
      "website",
      "google_map_link",
      "assigned_store_id",
      "assigned_ground_rep_id",
    ] as const;

    for (const f of allowedFields) {
      if (body[f] !== undefined) {
        updateData[f] = body[f];
        if (existing[f as keyof typeof existing] !== body[f]) {
          changes.push(
            `${f}: ${existing[f as keyof typeof existing]} -> ${body[f]}`,
          );
        }
      }
    }

    if (canUserManageLeads(user) || user.role === "store_associate") {
      for (const f of managerFields) {
        if (body[f] !== undefined) {
          updateData[f] = body[f] === "" && f !== "company_name" ? null : body[f];
          if (existing[f as keyof typeof existing] !== body[f]) {
            changes.push(
              `${f}: ${existing[f as keyof typeof existing]} -> ${body[f]}`,
            );
          }
        }
      }

      // If address or pin code changed, re-geocode
      if (
        (body.google_map_link &&
          body.google_map_link !== existing.google_map_link) ||
        (body.pin_code && body.pin_code !== existing.pin_code) ||
        (body.address && body.address !== existing.address)
      ) {
        const point = body.google_map_link ? await resolveGoogleMapsLink(body.google_map_link) : null;
        Object.assign(updateData, point ? {...point, geocode_status:"ok",geocode_source:"google_link",location_verified:true,geocode_issue_reason:null} : {lat:null,lng:null,geocode_status:"mapping_issue",location_verified:false,geocode_issue_reason:existing.geocode_issue_reason === "not_found" ? "not_found" : "Awaiting manager location"});
      }
    }

    if (
      body.assigned_ground_rep_id !== undefined ||
      body.assigned_store_id !== undefined
    ) {
      const target = await resolveAssignment(
        user,
        body.assigned_ground_rep_id,
        body.assigned_store_id,
        [{ ...existing, ...updateData } as typeof existing],
      );
      if (target !== undefined) updateData.assigned_store_id = target || null;
    }
    const updated = await prisma.$transaction(async (tx) => {
      await tx.lead.update({
        where: { id, AND: [getLeadFilterForUser(user)] },
        data: updateData,
        include: {
          store: true,
          ground_rep: {
            select: { id: true, name: true, email: true, phone: true },
          },
        },
      });

      if (updateData.lat !== undefined || updateData.lng !== undefined)
        await refreshAllotment(tx, id, user.id);
      if (body.status !== undefined) await tx.activityLog.create({ data: { lead_id: id, actor_id: user.id, action: "FUNNEL_STATUS_UPDATED", old_value: existing.status, new_value: body.status } });
      if (changes.length) await tx.activityLog.create({ data: { lead_id: id, actor_id: user.id, action: "ALTERNATE_DETAILS_UPDATED", new_value: changes.join("; ") } });
      return tx.lead.findUniqueOrThrow({
        where: { id },
        include: {
          store: true,
          ground_rep: {
            select: { id: true, name: true, email: true, phone: true },
          },
        },
      });
    });

    return NextResponse.json({ success: true, lead: updated });
  } catch (err: unknown) {
    console.error("PATCH /api/leads/[id] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update lead" },
      { status: err instanceof RequestError ? err.status : err instanceof RangeError ? 400 : 500 },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser(req);
    if (!user || !canUserManageLeads(user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await context.params;

    await prisma.lead.delete({
      where: { id, AND: [getLeadFilterForUser(user)] },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/leads/[id] error:", err);
    return NextResponse.json(
      { error: "Failed to delete lead" },
      { status: err instanceof RequestError ? err.status : err instanceof RangeError ? 400 : 500 },
    );
  }
}
