import { refreshAllotment } from "@/lib/assignment/allotment";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getLeadFilterForUser, canUserManageLeads } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { inIndia } from "@/lib/location";
import { resolveGooglePoint } from "@/lib/mapping/google-link";
import { queueGeocoding } from "@/lib/mapping/jobs";
import { failure, RequestError } from "@/lib/phase5/http";
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const u = await getCurrentUser(req);
    if (!u || !canUserManageLeads(u)) throw new RequestError("Forbidden", 403);
    const { id } = await params,
      b = await req.json();
    const lead = await prisma.lead.findFirst({
      where: { id, AND: [getLeadFilterForUser(u)] },
    });
    if (!lead) throw new RequestError("Not found", 404);
    if (b.action === "rerun") {
      if (typeof b.address !== "string" || typeof b.pin_code !== "string")
        throw new RequestError("Enter address and PIN");
      await prisma.$transaction(async (tx) => {
        await tx.lead.update({
          where: { id },
          data: {
            address: b.address,
            pin_code: b.pin_code,
            location_verified: false,
            geocode_status: "mapping_issue",
            geocode_flagged_at: new Date(),
          },
        });
        await tx.activityLog.create({
          data: {
            lead_id: id,
            actor_id: u.id,
            action: "MAPPING_ADDRESS_UPDATED",
            old_value: JSON.stringify({
              address: lead.address,
              pin_code: lead.pin_code,
            }),
            new_value: JSON.stringify({
              address: b.address,
              pin_code: b.pin_code,
            }),
          },
        });
      });
      return NextResponse.json({ job: await queueGeocoding(u, [id]) });
    }
    if (b.action === "cannot_locate") {
      await prisma.$transaction(async (tx) => {
        await tx.lead.update({
          where: { id },
          data: {
            cannot_locate: true,
            geocode_status: "mapping_issue",
            geocode_issue_reason: "not_found",
            geocode_flagged_at: lead.geocode_flagged_at || new Date(),
          },
        });
        await tx.activityLog.create({
          data: {
            lead_id: id,
            actor_id: u.id,
            action: "CANNOT_LOCATE",
            new_value: "Marked cannot locate; remains blocked from planning",
          },
        });
      });
      return NextResponse.json({ success: true });
    }
    let point = null;
    if (b.action === "confirm_location") {
      if (lead.geocode_status !== "mismatch_flagged" || !inIndia(lead))
        throw new RequestError("No flagged saved location to confirm", 409);
      if (b.lat !== lead.lat || b.lng !== lead.lng)
        throw new RequestError("Location changed. Refresh and review it again", 409);
      point = { lat: lead.lat!, lng: lead.lng! };
    }
    if (b.action === "link" && typeof b.google_map_link === "string")
      point = await resolveGooglePoint(b.google_map_link);
    if (
      b.action === "candidate" &&
      Number.isInteger(b.index) &&
      Array.isArray(lead.geocode_candidates)
    ) {
      const c = lead.geocode_candidates[b.index];
      if (
        c &&
        typeof c === "object" &&
        !Array.isArray(c) &&
        typeof c.lat === "number" &&
        typeof c.lng === "number"
      )
        point = { lat: c.lat, lng: c.lng };
    }
    if (!point || !inIndia(point))
      throw new RequestError(
        "No valid India coordinates found. Use a full place link or drop the pin manually.",
      );
    await prisma.$transaction(async (tx) => {
      const saved = await tx.lead.updateMany({
        where: { id, updated_at: lead.updated_at },
        data: {
          ...point,
          location_verified: true,
          geocode_source: "manual",
          geocode_status: "ok",
          geocode_confidence: "high",
          geocode_issue_reason: null,
          geocode_candidates: [],
          geocode_flagged_at: null,
          cannot_locate: false,
          ...(b.action === "link"
            ? { google_map_link: b.google_map_link }
            : {}),
        },
      });
      if (!saved.count) throw new RequestError("Lead changed. Refresh and review it again", 409);
      await tx.geocodeJobItem.updateMany({where: {lead_id: id}, data: {status: "accepted", error: null, lease_until: null, next_attempt_at: null}});
      await refreshAllotment(tx, id, u.id);
      await tx.activityLog.create({
        data: {
          lead_id: id,
          actor_id: u.id,
          action: "LOCATION_UPDATED",
          old_value: JSON.stringify({ lat: lead.lat, lng: lead.lng }),
          new_value: JSON.stringify({ ...point, method: b.action }),
        },
      });
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    return failure(e);
  }
}
