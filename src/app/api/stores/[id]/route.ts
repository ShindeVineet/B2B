import { parseServicePins } from "@/lib/assignment/store-match";
import { manualCoordinates } from "@/lib/store-location";
import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { canUserManageStores } from "@/lib/permissions";
import { geocodingService } from "@/lib/geocoding/service";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser(req);
    if (!user || !canUserManageStores(user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await context.params;
    const body = await req.json();

    const existing = await prisma.store.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    const updateData: Prisma.StoreUpdateInput = {};
    if (body.name !== undefined) updateData.name = body.name.trim();
    if (body.region !== undefined) updateData.region = body.region;
    if (body.radius_km !== undefined)
      updateData.radius_km = parseFloat(body.radius_km);
    if (body.manager_id !== undefined)
      updateData.manager = body.manager_id
        ? { connect: { id: body.manager_id } }
        : { disconnect: true };
    if (body.active !== undefined) updateData.active = Boolean(body.active);
    if (body.google_map_link !== undefined)
      updateData.google_map_link = body.google_map_link?.trim() || null;

    let coordinates;
    try {
      coordinates = manualCoordinates(body);
    } catch (error) {
      return NextResponse.json(
        { error: (error as Error).message },
        { status: 400 },
      );
    }
    const locationInfoChanged =
      (body.pin_code !== undefined && body.pin_code !== existing.pin_code) ||
      (body.address !== undefined && body.address !== existing.address) ||
      (body.name !== undefined && body.name !== existing.name) ||
      (body.google_map_link !== undefined &&
        body.google_map_link !== existing.google_map_link);

    if (coordinates) {
      updateData.lat = coordinates.lat;
      updateData.lng = coordinates.lng;
    } else if (locationInfoChanged || body.refresh_location === true) {
      const geo = await geocodingService.geocodeStore({
        name: body.name ?? existing.name,
        pin_code: body.pin_code ?? existing.pin_code,
        address: body.address ?? existing.address,
        google_map_link:
          body.google_map_link !== undefined
            ? body.google_map_link
            : existing.google_map_link,
      });
      if (!geo)
        return NextResponse.json(
          {
            error:
              "Could not locate the store. Provide a Google Maps link, exact pincode, or latitude/longitude.",
          },
          { status: 422 },
        );
      updateData.lat = geo.lat;
      updateData.lng = geo.lng;
    }
    if (body.address !== undefined) updateData.address = body.address;
    if (body.pin_code !== undefined) updateData.pin_code = body.pin_code;

    if (body.service_pin_codes !== undefined)
      updateData.service_pincodes = {
        deleteMany: {},
        create: parseServicePins(body.service_pin_codes).map((pin_code) => ({
          pin_code,
        })),
      };
    const store = await prisma.store.update({
      where: { id },
      data: updateData,
      include: {
        service_pincodes: true,
        manager: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json({ success: true, store });
  } catch (err: unknown) {
    console.error("PATCH /api/stores/[id] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update store" },
      { status: err instanceof RangeError ? 400 : 500 },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser(req);
    if (!user || !canUserManageStores(user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await context.params;

    // Check if store has leads
    const leadsCount = await prisma.lead.count({
      where: { assigned_store_id: id },
    });
    if (leadsCount > 0) {
      // Soft deactivate or unlink leads
      await prisma.lead.updateMany({
        where: { assigned_store_id: id },
        data: { assigned_store_id: null, status: "New" },
      });
    }

    await prisma.store.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/stores/[id] error:", err);
    return NextResponse.json(
      { error: "Failed to delete store" },
      { status: 500 },
    );
  }
}
