import { channelFor } from "@/lib/dashboard/metrics";
import { parseStoreVisit, saveStoreVisit } from "@/lib/consultations/store-visit";
import { consultationVisit } from "@/lib/routes/consultation-visit";
import { validateResponses } from "@/lib/consultations/validation";
import type { FieldDefinition } from "@/lib/consultations/fields";
import {
  evaluateCold,
  notifyWorkflow,
  managerRecipients,
} from "@/lib/cold/service";
import { failure } from "@/lib/phase5/http";

import type { Prisma } from "@prisma/client";
import { getLeadFilterForUser } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const paginated = searchParams.has("page");
    const page = Math.max(1, Math.floor(Number(searchParams.get("page")) || 1));
    const leadId = searchParams.get("lead_id");
    const repId = searchParams.get("rep_id");

    const where: Prisma.ConsultationWhereInput = {
      lead: getLeadFilterForUser(user),
    };
    if (leadId) where.lead_id = leadId;
    if (repId) where.rep_id = repId;

    if (user.role === "ground_rep" || searchParams.get("mine") === "true") {
      where.rep_id = user.id;
    }

    const leadFilter: Prisma.LeadWhereInput = getLeadFilterForUser(user);
    const clauses: Prisma.LeadWhereInput[] = [leadFilter];
    for (const [param, field] of [
      ["region", "region"],
      ["store", "assigned_store_id"],
    ] as const) {
      const value = searchParams.get(param);
      if (value) clauses.push({ [field]: value });
    }
    const q = searchParams.get("q")?.trim();
    if (q)
      where.OR = [
        { lead: { lead_code: { contains: q, mode: "insensitive" } } },
        { lead: { company_name: { contains: q, mode: "insensitive" } } },
        { lead: { phone_no: { contains: q } } },
        { decision_maker_phone: { contains: q } },
      ];
    where.lead = { AND: clauses };
    for (const field of ["outcome", "interest_level", "lead_type"] as const) {
      const value = searchParams.get(field);
      if (value) where[field] = value;
    }
    const from = searchParams.get("from"),
      to = searchParams.get("to");
    if (
      (from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) ||
      (to && !/^\d{4}-\d{2}-\d{2}$/.test(to))
    )
      return NextResponse.json(
        { error: "Invalid date filter" },
        { status: 400 },
      );
    if (from || to)
      where.visit_date = {
        ...(from ? { gte: new Date(from + "T00:00:00+05:30") } : {}),
        ...(to
          ? {
              lt: new Date(
                new Date(to + "T00:00:00+05:30").getTime() + 86400000,
              ),
            }
          : {}),
      };
    const consultations = await prisma.consultation.findMany({
      where,
      ...(paginated ? { skip: (page - 1) * 24, take: 24 } : {}),
      include: {
        store_visit: { include: { store: { select: { name: true } } } },
        lead: {
          select: {
            partners: { select: { partner_status: true } },
            id: true,
            lead_code: true,
            company_name: true,
            phone_no: true,
            address: true,
            status: true,
            lat: true,
            geocode_status: true,
            geocode_source: true,
            lng: true,
            region: true,
            assigned_store_id: true,
            assigned_ground_rep_id: true,
            calling_associate_id: true,
            lead_source: true,
            intake_team: true,
          },
        },
        rep: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy:
        searchParams.get("sort") === "company"
          ? { lead: { company_name: "asc" } }
          : {
              visit_date:
                searchParams.get("sort") === "oldest" ? "asc" : "desc",
            },
    });

    return NextResponse.json({
      success: true,
      consultations,
      totalCount: paginated
        ? await prisma.consultation.count({ where })
        : consultations.length,
    });
  } catch (err: unknown) {
    console.error("GET /api/consultations error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to fetch consultations",
      },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user || user.role === "analyst")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const body = await req.json();
    const lead = await prisma.lead.findFirst({
      where: { id: body.lead_id, AND: [getLeadFilterForUser(user)] },
    });
    if (!lead)
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    const definitions = await prisma.formField.findMany({
      where: { active: true },
      orderBy: { display_order: "asc" },
    });
    if (!definitions.length)
      return NextResponse.json(
        {
          error:
            "Consultation fields have not been installed. Apply the migration.",
        },
        { status: 503 },
      );
    const raw = body.responses || body;
    const storeVisit = parseStoreVisit(raw);
    const responses = validateResponses(
      definitions.map((f) => ({
        ...f,
        type: ["primary_pain_point", "competitor_involved"].includes(f.key)
          ? "multi_select"
          : f.type,
        max_files: f.max_files ?? undefined,
        options: Array.isArray(f.options) ? (f.options as string[]) : undefined,
        required: f.key === "next_follow_up_date" ? false : f.required,
        required_when: f.key === "next_follow_up_date" ? undefined : f.required_when as FieldDefinition["required_when"],
      })),
      raw,
      user.name,
      user.role === "b2b_head",
    );
    const text = (key: string) =>
      typeof responses[key] === "string" ? (responses[key] as string) : "";
    const multiText = (key: string) =>
      Array.isArray(responses[key]) ? (responses[key] as string[]).join(", ") : text(key);
    const photos = [
      ...((responses.site_photos as string[]) || []),
      ...((responses.visiting_card_photos as string[]) || []),
    ];
    const photoIds = [...new Set(photos.map((url) => url.split("/").at(-1)!))];
    if (
      (await prisma.photoAsset.count({
        where: {
          id: { in: photoIds },
          lead_id: lead.id,
          ...(user.role === "b2b_head" ? {} : { owner_id: user.id }),
        },
      })) !== photoIds.length
    )
      return NextResponse.json(
        { error: "A photo does not belong to this lead or uploader" },
        { status: 400 },
      );
    const outcome = text("outcome");
    const status: Record<string, string> = {
      "On-boarding Done": "onboarded",
      "Visit scheduled": "Active — Visit Scheduled",
      "Nurturing required": "Active — Nurturing",
      "Dont want commission": "Needs Manager Review",
      "Lost Lead - (does not do tiles business)": "Closed-Lost",
      "Wrong location": "Needs Data Correction",
      "Office closed": "Assigned",
      "Wrong Location/Office closed": "Needs Data Correction",
    };
    if (!status[outcome])
      return NextResponse.json(
        { error: "Choose a valid Lead Outcome" },
        { status: 400 },
      );
    const consultation = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM leads WHERE id=${lead.id} FOR UPDATE`;
      const visit = await consultationVisit(
        tx,
        user,
        lead.id,
        body.trip_lead_id,
      );
      const record = await tx.consultation.create({
        data: {
          lead_id: lead.id,
          interaction_channel: channelFor({ ...lead, trip_lead_id: visit?.id, direct_store_meeting: raw.direct_store_meeting === true || raw.direct_store_meeting === "true", rep_role: user.role }),
          direct_store_meeting: raw.direct_store_meeting === true || raw.direct_store_meeting === "true",
          trip_lead_id: visit?.id || null,
          rep_id: user.id,
          company_name: text("company_name"),
          decision_maker_name: text("decision_maker_name"),
          decision_maker_phone: text("decision_maker_phone"),
          alternate_mobile_number: text("alternate_mobile_number") || null,
          designation: text("designation"),
          lead_type: text("lead_type"),
          email: text("email") || null,
          interest_level: text("interest_level"),
          current_lead_status: text("current_lead_status"),
          outcome,
          visit_date: new Date(text("visit_date") + "T12:00:00+05:30"),
          primary_pain_point: multiText("primary_pain_point") || null,
          competitor_involved: multiText("competitor_involved") || null,
          site_photos: responses.site_photos || [],
          visiting_card_photos: responses.visiting_card_photos || [],
          checklist: responses.checklist || [],
          notes: text("notes") || null,
          ground_staff_name: text("ground_staff_name"),
          next_follow_up_date: text("next_follow_up_date")
            ? new Date(text("next_follow_up_date"))
            : null,
          responses: { ...responses, ...(storeVisit ? { visit_scheduled: "true", visit_store_id: storeVisit.store_id, visit_scheduled_at: storeVisit.scheduled_at.toISOString() } : {}) },
        },
      });
      await saveStoreVisit(tx, raw, lead.id, record.id);
      const updated = await tx.lead.update({
        where: { id: lead.id },
        data: {
          status: status[outcome],
          outcome,
          call_outcome: outcome,
          assigned_visit_date: new Date(text("visit_date")),
          ...(["Wrong location", "Wrong Location/Office closed"].includes(outcome)
            ? {
                geocode_status: "mapping_issue" as const,
                geocode_issue_reason: "not_found",
                geocode_flagged_at: new Date(),
              }
            : {}),
        },
      });
      if (text("next_follow_up_date"))
        await tx.followUp.upsert({
          where: { lead_id: lead.id },
          create: {
            lead_id: lead.id,
            rep_id: lead.assigned_ground_rep_id || user.id,
            due_date: new Date(text("next_follow_up_date")),
          },
          update: {
            rep_id: lead.assigned_ground_rep_id || user.id,
            due_date: new Date(text("next_follow_up_date")),
            active: true,
          },
        });
      else
        await tx.followUp.updateMany({
          where: { lead_id: lead.id },
          data: { active: false },
        });
      if (visit)
        await tx.tripLead.update({
          where: { id: visit.id },
          data: { completed: true, status: "visited" },
        });
      await evaluateCold(tx, updated, record);
      if (["Wrong location", "Wrong Location/Office closed"].includes(outcome))
        await notifyWorkflow(
          tx,
          lead.id,
          "data_correction_needed",
          `correction:${record.id}`,
          `${updated.company_name} needs a location correction`,
          await managerRecipients(tx, updated),
        );
      await tx.activityLog.create({
        data: {
          lead_id: lead.id,
          actor_id: user.id,
          action: "CONSULTATION_LOGGED",
          old_value: lead.status,
          new_value: outcome,
        },
      });
      return record;
    });
    return NextResponse.json({ success: true, consultation });
  } catch (e) {
    return failure(e);
  }
}
