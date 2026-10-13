import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { canUserManageLeads, getLeadFilterForUser } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { canConfirmImportedLocation } from "@/lib/mapping/saved-location";
import { refreshAllotment } from "@/lib/assignment/allotment";
import { failure, RequestError } from "@/lib/phase5/http";
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user || !canUserManageLeads(user))
      throw new RequestError("Forbidden", 403);
    const body = await req.json();
    if (
      !Array.isArray(body.leads) ||
      !body.leads.length ||
      body.leads.length > 5000 ||
      body.leads.some((l: { id?: unknown }) => !l || typeof l.id !== "string")
    )
      throw new RequestError("Select between 1 and 5000 leads");
    const requested = new Map<
      string,
      { lat: number; lng: number; updated_at: string }
    >(
      body.leads.map(
        (l: { id: string; lat: number; lng: number; updated_at: string }) => [
          l.id,
          l,
        ],
      ),
    );
    const confirmed = await prisma.$transaction(
      async (tx) => {
        const leads = await tx.lead.findMany({
          where: {
            id: { in: [...requested.keys()] },
            AND: [getLeadFilterForUser(user)],
          },
        });
        let count = 0;
        for (const lead of leads) {
          const expected = requested.get(lead.id)!;
          if (
            !canConfirmImportedLocation(lead) ||
            expected.lat !== lead.lat ||
            expected.lng !== lead.lng ||
            expected.updated_at !== lead.updated_at.toISOString()
          )
            continue;
          const saved = await tx.lead.updateMany({
            where: { id: lead.id, updated_at: lead.updated_at },
            data: {
              location_verified: true,
              geocode_source: "manual",
              geocode_status: "ok",
              geocode_confidence: "high",
              geocode_issue_reason: null,
              geocode_candidates: [],
              geocode_flagged_at: null,
              cannot_locate: false,
            },
          });
          if (!saved.count) continue;
          await tx.geocodeJobItem.updateMany({
            where: { lead_id: lead.id },
            data: {
              status: "accepted",
              error: null,
              lease_until: null,
              next_attempt_at: null,
            },
          });
          await refreshAllotment(tx, lead.id, user.id);
          await tx.activityLog.create({
            data: {
              lead_id: lead.id,
              actor_id: user.id,
              action: "LOCATION_UPDATED",
              old_value: JSON.stringify({ lat: lead.lat, lng: lead.lng }),
              new_value: JSON.stringify({
                lat: lead.lat,
                lng: lead.lng,
                method: "bulk_confirm_imported_name_mismatch",
              }),
            },
          });
          count++;
        }
        return count;
      },
      { timeout: 60000 },
    );
    return NextResponse.json({
      confirmed,
      skipped: requested.size - confirmed,
    });
  } catch (error) {
    return failure(error);
  }
}
