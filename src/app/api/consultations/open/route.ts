import { callingFormFor } from "@/lib/consultations/calling";
import { getLeadFilterForUser } from "@/lib/permissions";
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
    const lead = await prisma.lead.findFirst({ where: { id, AND: [getLeadFilterForUser(user)] } });
    if (!lead) throw new RequestError("Lead not found", 404);
    if (req.nextUrl.searchParams.get("context") !== "ground" && callingFormFor(lead, user.role, req.nextUrl.searchParams.get("trip_lead_id"))) return NextResponse.json({ mode: "calling", trip_lead_id: null });
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
