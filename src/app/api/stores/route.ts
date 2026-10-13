import { parseServicePins } from "@/lib/assignment/store-match";
import { manualCoordinates } from "@/lib/store-location";
import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getStoreFilterForUser, canUserManageStores } from "@/lib/permissions";
import { geocodingService } from "@/lib/geocoding/service";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const region = searchParams.get("region");

    const roleFilter = getStoreFilterForUser(user);
    const where: Prisma.StoreWhereInput = {
      active: true,
      ...roleFilter,
    };

    if (region && region !== "All") {
      where.region = region;
    }

    const stores = await prisma.store.findMany({
      where: { AND: [roleFilter, where] },
      include: {
        service_pincodes: true,
        manager: {
          select: { id: true, name: true, email: true, phone: true },
        },
        _count: {
          select: {
            leads: true,
            staff_users: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ stores });
  } catch (err) {
    console.error("GET /api/stores error:", err);
    return NextResponse.json(
      { error: "Failed to fetch stores" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user || !canUserManageStores(user)) {
      return NextResponse.json(
        { error: "Forbidden. Admin rights required to manage stores." },
        { status: 403 },
      );
    }

    const body = await req.json();
    const {
      name,
      address,
      pin_code,
      google_map_link,
      region,
      radius_km = 10,
      manager_id,
    } = body;

    if (!name || !address || !pin_code) {
      return NextResponse.json(
        { error: "Name, address, and pin code are required" },
        { status: 400 },
      );
    }

    // Geocode store using Google Maps Link -> lead>pincode>name>map logic
    let coordinates;
    try {
      coordinates = manualCoordinates(body);
    } catch (error) {
      return NextResponse.json(
        { error: (error as Error).message },
        { status: 400 },
      );
    }
    const geo =
      coordinates ||
      (await geocodingService.geocodeStore({
        name,
        address,
        pin_code,
        google_map_link,
      }));
    if (!geo) {
      return NextResponse.json(
        {
          error:
            "Could not locate store. Please provide a valid Google Maps link, exact pincode, or latitude and longitude.",
        },
        { status: 422 },
      );
    }

    const servicePins = parseServicePins(body.service_pin_codes);
    const store = await prisma.store.create({
      data: {
        name: name.trim(),
        address: address.trim(),
        pin_code: pin_code.trim(),
        google_map_link: google_map_link?.trim() || null,
        region: region || "South",
        lat: geo.lat,
        lng: geo.lng,
        radius_km: parseFloat(radius_km) || 10,
        manager: manager_id ? { connect: { id: manager_id } } : undefined,
        active: true,
        service_pincodes: {
          create: servicePins.map((pin_code) => ({ pin_code })),
        },
      },
      include: {
        service_pincodes: true,
        manager: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json({ success: true, store }, { status: 201 });
  } catch (err: unknown) {
    console.error("POST /api/stores error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create store" },
      { status: err instanceof RangeError ? 400 : 500 },
    );
  }
}
