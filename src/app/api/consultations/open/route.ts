import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { consultationVisit } from "@/lib/routes/consultation-visit";
import { failure, RequestError } from "@/lib/phase5/http";
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user || user.role === "analyst")
      throw new RequestError("Forbidden", 403);
    const id = req.nextUrl.searchParams.get("lead_id");
    if (!id) throw new RequestError("Choose a lead");
    const visit = await consultationVisit(
      prisma,
      user,
      id,
      req.nextUrl.searchParams.get("trip_lead_id"),
    );
    return NextResponse.json({ trip_lead_id: visit?.id || null });
  } catch (e) {
    return failure(e);
  }
}
