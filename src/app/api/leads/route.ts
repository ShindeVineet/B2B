import { funnelStatus } from "@/lib/leads/funnel-status";
import { partnerType } from "@/lib/partners/identity";
import { validateIntake } from "@/lib/leads/intake";
import { assignCaller } from "@/lib/calling/distribute";
import { parseStoreVisit, saveStoreVisit } from "@/lib/consultations/store-visit";
import { dateOnly, todayIndia } from "@/lib/phase5/calendar";
import { RequestError } from "@/lib/phase5/http";
import { latestContact } from "@/lib/last-contact";
import { pincodeArea } from "@/lib/mapping/pincode-areas";
import { matchLeadStore } from "@/lib/assignment/store-match";
import { resolveAssignment } from "@/lib/assignment/validate";
import { failure } from "@/lib/phase5/http";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getLeadFilterForUser, getStoreFilterForUser } from "@/lib/permissions";
import { mapBusiness, mappingFields } from "@/lib/mapping/pipeline";
import { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const region = searchParams.get("region");
    const status = searchParams.get("status");
    const lead_source = searchParams.get("lead_source");
    const category = searchParams.get("category");
    const store_id = searchParams.get("store_id");
    const rep_id = searchParams.get("rep_id");
    const unassigned_only = searchParams.get("unassigned_only") === "true";
    const unmapped_only = searchParams.get("unmapped_only") === "true";
    const search = searchParams.get("search");
    const limit = parseInt(searchParams.get("limit") || "1000", 10);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const skip = (page - 1) * limit;
    const compact = searchParams.get("compact") === "true";

    // Role-based scoping
    const roleFilter = getLeadFilterForUser(user);

    const conditions: Prisma.LeadWhereInput[] = [roleFilter];
    const updatedSince = searchParams.get("updated_since");
    if (updatedSince) {
      const since = new Date(updatedSince);
      if (!Number.isFinite(since.getTime()))
        return NextResponse.json(
          { error: "Invalid update timestamp" },
          { status: 400 },
        );
      conditions.push({ updated_at: { gte: since } });
    }

    if (region && region !== "All") {
      conditions.push({ region });
    }

    if (status && status !== "All") {
      conditions.push({ status });
    }

    if (lead_source && lead_source !== "All") {
      conditions.push({ lead_source });
    }

    if (category && category !== "All") {
      conditions.push({ category });
    }

    if (store_id && store_id !== "All") {
      if (store_id === "unassigned") {
        conditions.push({ assigned_store_id: null });
      } else {
        conditions.push({ assigned_store_id: store_id });
      }
    }

    if (rep_id && rep_id !== "All") {
      if (rep_id === "unassigned") {
        conditions.push({ assigned_ground_rep_id: null });
      } else {
        conditions.push({ assigned_ground_rep_id: rep_id });
      }
    }

    if (unassigned_only || unmapped_only) {
      conditions.push({ assigned_store_id: null });
    }

    if (search && search.trim()) {
      const q = search.trim();
      conditions.push({
        OR: [
          { lead_code: { contains: q, mode: "insensitive" } },
          { company_name: { contains: q, mode: "insensitive" } },
          { phone_no: { contains: q, mode: "insensitive" } },
          { pin_code: { contains: q, mode: "insensitive" } },
          { address: { contains: q, mode: "insensitive" } },
          { category: { contains: q, mode: "insensitive" } },
        ],
      });
    }

    const where: Prisma.LeadWhereInput = {
      AND: conditions,
    };

    const [leads, totalCount] = await Promise.all([
      prisma.lead.findMany({
        where,
        omit: compact
          ? {
              original_data: true,
              linkedin_data: true,
              geocode_candidates: true,
              extra_notes: true,
            }
          : undefined,
        include: {
          partners: { select: { partner_status: true } },
          activity_logs: { where: { action: "FUNNEL_STATUS_UPDATED" }, orderBy: { created_at: "desc" }, take: 1, select: { new_value: true, created_at: true } },
          store_visits: { where: { status: "scheduled" }, orderBy: { scheduled_at: "asc" }, take: 1, include: { store: { select: { name: true } } } },
          call_logs: {
            orderBy: { created_at: "desc" },
            take: 1,
            select: { created_at: true },
          },
          follow_up: { select: { due_date: true, active: true } },
          trip_leads: {
            orderBy: [{ created_at: "desc" }, { scheduled_date: "desc" }],
            take: 1,
            include: {
              trip: { select: { status: true } },
              consultation: { include: { rep: { select: { name: true } } } },
            },
          },
          consultations: {
            orderBy: [{ visit_date: "desc" }, { created_at: "desc" }, { id: "desc" }],
            take: 1,
            select: {
              outcome: true,
              interest_level: true,
              created_at: true,
              visit_date: true,
              rep: { select: { name: true } },
            },
          },
          store: {
            select: {
              id: true,
              name: true,
              region: true,
              radius_km: true,
              lat: true,
              lng: true,
            },
          },
          ground_rep: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
            },
          },
          calling_associate: {
            select: { id: true, name: true, email: true },
          },
        },
        // Imported batches share a timestamp; the unique tie-breaker prevents
        // overlapping pages as PostgreSQL changes its scan order.
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
        take: limit,
        skip,
      }),
      prisma.lead.count({ where }),
    ]);

    // Also get active stores to compute nearest store suggestion on the fly for unassigned leads
    const storeFilter = getStoreFilterForUser(user);
    const activeStores = await prisma.store.findMany({
      where: { active: true, ...storeFilter },
      select: {
        id: true,
        name: true,
        lat: true,
        lng: true,
        radius_km: true,
        region: true,
        service_pincodes: true,
      },
    });

    const pins = await prisma.pincodeGeocache.findMany({
      where: {
        pin_code: {
          in: [
            ...new Set(leads.flatMap((l) => (l.pin_code ? [l.pin_code] : []))),
          ],
        },
      },
    });
    const pinPoints = new Map(pins.map((p) => [p.pin_code, p]));
    const enrichedLeads = leads.map((lead) => {
      const match = matchLeadStore(
        lead,
        activeStores,
        pinPoints.get(lead.pin_code || ""),
      );
      return {
        ...lead,
        funnel_status: funnelStatus(lead),
        last_contact_at: latestContact(
          lead.call_date,
          lead.call_logs[0]?.created_at,
          lead.consultations[0]?.visit_date,
        ),
        next_follow_up_date: lead.follow_up?.active
          ? lead.follow_up.due_date
          : null,
        consultation_read_only: lead.trip_leads[0]
          ? lead.trip_leads[0].completed ||
            lead.trip_leads[0].status === "visited"
          : lead.consultations.length > 0,
        consultation_visit_id: lead.trip_leads[0]?.id || null,
        consultation_filed_by:
          lead.trip_leads[0]?.consultation?.rep.name ||
          lead.consultations[0]?.rep.name ||
          null,
        consultation_filed_date:
          lead.trip_leads[0]?.consultation?.visit_date ||
          lead.consultations[0]?.visit_date ||
          null,
        pincode_area: pincodeArea(lead.pin_code),
        approximate_pin_area: null,
        latest_consultation_outcome: lead.consultations[0]?.outcome || null,
        latest_interest_level: lead.consultations[0]?.interest_level || null,
        allotment_changed:
          !!match.store &&
          !!(lead.assigned_store_id || lead.assigned_ground_rep_id) &&
          lead.assigned_store_id !== match.store.id,
        store_match_kind: match.kind,
        store_match_candidates: match.candidates.map((s) => ({
          id: s.id,
          name: s.name,
        })),
        nearestStoreSuggestion: match.store
          ? {
              store: match.store,
              distanceKm: match.distanceKm,
              isWithinRadius: match.isWithinRadius,
              source: match.kind,
              approximate: match.kind === "nearest" && match.approximate,
            }
          : null,
        isWithinCatchment: match.isWithinRadius,
      };
    });

    // If client specifically requested unmapped_only (no store assigned AND outside all store radii)
    let finalLeads = enrichedLeads;
    if (unmapped_only) {
      finalLeads = enrichedLeads.filter((l) => !l.assigned_store_id && true);
    }

    return NextResponse.json({
      leads: finalLeads,
      totalCount: unmapped_only ? finalLeads.length : totalCount,
      page,
      limit,
    });
  } catch (err) {
    console.error("GET /api/leads error:", err);
    return NextResponse.json(
      { error: "Failed to fetch leads" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!["b2b_head", "regional_manager", "store_associate"].includes(user.role))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const {
      pin_code,
      address,
      category,
      lead_source,
      region,
      website,
      notes,
      extra_notes,
      assigned_store_id,
      assigned_ground_rep_id,
    } = body;

    const intake = validateIntake({ ...body, lead_source: lead_source || "Manual" });
    if (intake.lead_source === "Manual" && user.role !== "b2b_head") throw new RequestError("Manual leads are handled by the B2B Head", 403);
    if (user.role === "store_associate" && !["Walk-in", "Phone", "CDT", "LinkedIn"].includes(intake.lead_source)) throw new RequestError("Manager access required for ground-team intake", 403);
    if (body.gst_no != null && (typeof body.gst_no !== "string" || body.gst_no.length > 30)) throw new RequestError("Invalid GST number");
    const type = partnerType(body.partner_type, body.gst_no);
    const combined = ["Manual", "Walk-in"].includes(intake.lead_source);
    if (combined && (!body.consultation || typeof body.consultation !== "object" || Array.isArray(body.consultation))) throw new RequestError("Save a consultation with this lead");
    const consultation = combined ? body.consultation : {};
    const visit = combined ? parseStoreVisit(consultation) : null;
    const follow = consultation.next_follow_up_date;
    if (follow && (typeof follow !== "string" || dateOnly(follow) < todayIndia())) throw new RequestError("Choose today or a future follow-up date");
    if (consultation.interest_level && !["High", "Medium", "Low"].includes(consultation.interest_level)) throw new RequestError("Choose a valid interest level");
    for (const key of ["notes", "lead_type"]) if (consultation[key] != null && (typeof consultation[key] !== "string" || consultation[key].length > 2000)) throw new RequestError(`Invalid consultation ${key}`);
    const numbers = intake.numbers;
    // Check duplicate
    if (numbers[0] && pin_code) {
      const existing = await prisma.lead.findFirst({
        where: {
          phone_no: numbers[0],
          pin_code: pin_code.trim(),
        },
      });

      if (existing) {
        return NextResponse.json(
          {
            error: "A lead with this phone number and pin code already exists",
            existingLead: existing,
          },
          { status: 409 },
        );
      }
    }

    const mapping = await mapBusiness({
      company_name: intake.company_name,
      pin_code,
      address,
      google_map_link: body.google_map_link,
    });
    const lat = mapping.status === "ok" ? mapping.point.lat : null;
    const lng = mapping.status === "ok" ? mapping.point.lng : null;
    const geocodedRegion = region;

    if (intake.intake_team !== "ground" && assigned_ground_rep_id) throw new RequestError("Assign this source to its intake team first");
    let targetStoreId =
      (await resolveAssignment(
        user,
        assigned_ground_rep_id,
        assigned_store_id,
        [
          {
            ...mappingFields(mapping),
            assigned_store_id: null,
            assigned_ground_rep_id: null,
          },
        ],
      )) || null;
    if (!targetStoreId) {
      const stores = await prisma.store.findMany({
        where: { active: true },
        include: { service_pincodes: true },
      });
      const match = matchLeadStore({ pin_code, lat, lng }, stores);
      if (mapping.status === "ok" && match.store)
        targetStoreId = match.store.id;
    }

    if (intake.intake_team === "store") targetStoreId = user.store_id || targetStoreId;
    const lead = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${numbers[0]}))`;
      if (await tx.lead.findFirst({ where: { phone_no: numbers[0], company_name: { equals: intake.company_name, mode: "insensitive" } } })) throw new RequestError("This lead already exists. Open the existing record.", 409);
      const created = await tx.lead.create({
        data: {
          company_name: intake.company_name,
          owner_name: intake.owner_name || null,
          gst_no: body.gst_no?.trim() || null,
          partner_type: type,
          intake_team: intake.intake_team,
          calling_associate_id: intake.intake_team === "head" || (intake.intake_team === "store" && user.role === "store_associate") ? user.id : null,
          phone_no: numbers[0] || null,
          pin_code: pin_code ? pin_code.trim() : null,
          address: address ? address.trim() : null,
          ...mappingFields(mapping),
          category: category || "General",
          lead_source: intake.lead_source,
          region: geocodedRegion || "Unassigned",
          website: website || null,
          google_map_link: body.google_map_link || null,
          notes: notes || null,
          extra_notes: extra_notes || null,
          status: combined ? (visit ? "Active — Visit Scheduled" : "Active — Nurturing") : targetStoreId ? "Assigned" : "New",
          assigned_store_id: targetStoreId,
          assigned_ground_rep_id: assigned_ground_rep_id || null,
          scraped_date: new Date(),
        },
        include: {
          store: true,
          ground_rep: {
            select: { id: true, name: true, email: true, phone: true },
          },
        },
      });

      await tx.leadPhone.createMany({
        data: numbers.slice(1).map((phone_number) => ({
          lead_id: created.id,
          phone_number,
          source: "manual",
          label: "alternate",
        })),
      });
      if (intake.intake_team === "caller" || (intake.intake_team === "store" && !created.calling_associate_id)) await assignCaller(tx, created.id);
      if (combined) {
        const record = await tx.consultation.create({ data: {
          lead_id: created.id, rep_id: user.id,
          direct_store_meeting: consultation.direct_store_meeting === true || consultation.direct_store_meeting === "true",
          interaction_channel: intake.intake_team === "store" ? "store" : "head",
          company_name: intake.company_name || null,
          decision_maker_name: intake.owner_name || null,
          decision_maker_phone: numbers[0], ground_staff_name: user.name,
          interest_level: consultation.interest_level || null,
          lead_type: consultation.lead_type || null,
          notes: consultation.notes || null,
          outcome: visit ? "Visit scheduled" : "Nurturing required",
          next_follow_up_date: follow ? new Date(follow) : null,
          responses: { ...consultation, kind: intake.lead_source === "Manual" ? "manual" : "walk_in" },
        } });
        await saveStoreVisit(tx, consultation, created.id, record.id);
        if (follow) await tx.followUp.create({ data: { lead_id: created.id, rep_id: user.id, due_date: new Date(follow) } });
      }
      await tx.activityLog.create({ data: { lead_id: created.id, actor_id: user.id, action: "LEAD_CREATED", new_value: JSON.stringify({ source: intake.lead_source, team: intake.intake_team, consultation: combined }) } });
      return created;
    });

    return NextResponse.json({ success: true, lead }, { status: 201 });
  } catch (err: unknown) {
    return failure(err);
  }
}
