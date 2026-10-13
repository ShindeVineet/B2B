import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAdministerPartners } from "@/lib/partners/access";
import { RequestError, failure } from "@/lib/phase5/http";
export async function GET(req: NextRequest) {
  try {
    const u = await getCurrentUser(req);
    if (!u || !canAdministerPartners(u)) throw new RequestError("Forbidden", 403);
    return NextResponse.json({
      cities: await prisma.partnerCityRegion.findMany(),
      regions: await prisma.store.findMany({
        distinct: ["region"],
        select: { region: true },
      }),
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: NextRequest) {
  try {
    const u = await getCurrentUser(req);
    if (!u || !canAdministerPartners(u)) throw new RequestError("Forbidden", 403);
    const raw = await req.json();
    const city =
        typeof raw.city === "string" ? raw.city.trim().toLowerCase() : "",
      region = typeof raw.region === "string" ? raw.region.trim() : "";
    if (
      !city ||
      !region ||
      !(await prisma.store.findFirst({ where: { region } }))
    )
      throw new RequestError("Choose a city and known store region");
    return NextResponse.json({
      mapping: await prisma.partnerCityRegion.upsert({
        where: { city },
        create: { city, region },
        update: { region },
      }),
    });
  } catch (e) {
    return failure(e);
  }
}
