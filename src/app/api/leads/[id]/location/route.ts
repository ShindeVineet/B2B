import { refreshAllotment } from "@/lib/assignment/allotment";
import { geocodeMetadata, inIndia } from "@/lib/location";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getLeadEditFilterForUser } from "@/lib/permissions";
import { manualCoordinates } from "@/lib/store-location";
import { mapBusiness, mappingFields } from "@/lib/mapping/pipeline";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user || !["b2b_head", "regional_manager", "store_associate"].includes(user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await prisma.lead.findFirst({
    where: { id, AND: [getLeadEditFilterForUser(user)] },
  });
  if (!existing)
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  if (
    user.role === "ground_rep" &&
    ["mapping_issue", "mismatch_flagged", "invalid"].includes(
      existing.geocode_status || "",
    )
  )
    return NextResponse.json(
      {
        error:
          "A manager must resolve this Mapping Issue before it can be used in a route.",
      },
      { status: 403 },
    );
  try {
    const body = await req.json();
    if (
      Object.keys(body).some(
        (key) => !["lat", "lng", "address", "pin_code"].includes(key),
      )
    )
      return NextResponse.json(
        { error: "Only location fields can be updated here." },
        { status: 400 },
      );
    if (
      (body.address !== undefined && typeof body.address !== "string") ||
      (body.pin_code !== undefined && typeof body.pin_code !== "string")
    )
      return NextResponse.json(
        { error: "Invalid address or PIN" },
        { status: 400 },
      );
    if ((body.address?.length || 0) > 2000 || (body.pin_code && !/^[1-9]\d{5}$/.test(body.pin_code))) return NextResponse.json({ error: "Enter a valid address and six-digit PIN code" }, { status: 400 });
    const manual = manualCoordinates(body);
    const result = manual
      ? null
      : await mapBusiness({
          ...existing,
          address: body.address ?? existing.address,
          pin_code: body.pin_code ?? existing.pin_code,
        });
    const location = manual || (result?.status === "ok" ? result.point : null);
    if (manual && !inIndia(manual))
      return NextResponse.json(
        { error: "Location must be within India" },
        { status: 400 },
      );
    const lead = await prisma.$transaction(async (tx) => {
      await tx.lead.update({
        where: { id, AND: [getLeadEditFilterForUser(user)] },
        data: {
          ...(result
            ? mappingFields(result)
            : {
                ...geocodeMetadata(manual!, "manual"),
                lat: manual!.lat,
                lng: manual!.lng,
                geocode_issue_reason: null,
                geocode_candidates: [],
                geocode_flagged_at: null,
                cannot_locate: false,
                geocode_confidence: "high",
                location_verified: ["b2b_head", "regional_manager", "store_associate"].includes(
                  user.role,
                ),
              }),
          ...(body.address !== undefined ? { address: body.address } : {}),
          ...(body.pin_code !== undefined ? { pin_code: body.pin_code } : {}),
        },
      });
      await tx.activityLog.create({
        data: {
          lead_id: id,
          actor_id: user.id,
          action: "LOCATION_UPDATED",
          old_value: JSON.stringify({ lat: existing.lat, lng: existing.lng, address: existing.address, pin_code: existing.pin_code }),
          new_value: JSON.stringify({ ...location, address: body.address ?? existing.address, pin_code: body.pin_code ?? existing.pin_code }),
        },
      });
      await refreshAllotment(tx, id, user.id);
      return tx.lead.findUniqueOrThrow({ where: { id } });
    });
    return NextResponse.json({ success: true, lead });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to save location",
      },
      { status: 400 },
    );
  }
}
