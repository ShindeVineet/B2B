import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserFilterForUser } from "@/lib/permissions";
import { RequestError, failure } from "@/lib/phase5/http";
export async function GET(req: NextRequest) {
  try {
    const u = await getCurrentUser(req);
    if (!u) throw new RequestError("Unauthorized", 401);
    const p = req.nextUrl.searchParams,
      date = p.get("date"),
      rep = u.role === "ground_rep" ? u.id : p.get("rep_id");
    if (!rep || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date))
      throw new RequestError("Choose a rep and date");
    const versions = await prisma.routeSnapshot.findMany({
      where: {
        ground_rep_id: rep,
        route_date: new Date(date),
        rep: getUserFilterForUser(u),
      },
      orderBy: { version: "desc" },
    });
    const selected =
      versions.find((s) => s.version === Number(p.get("version"))) ||
      versions[0];
    if (!selected) return NextResponse.json({ versions: [], snapshot: null });
    const visits = await prisma.tripLead.findMany({
      where: { id: { in: selected.trip_lead_ids as string[] } },
      select: {
        id: true,
        status: true,
        completed: true,
        consultation: {select:{visit_date:true,rep:{select:{name:true}}}},
        lead: { select: { lead_code: true, company_name: true } },
      },
    });
    return NextResponse.json({
      versions: versions.map((s) => s.version),
      snapshot: selected,
      visits,
    });
  } catch (e) {
    return failure(e);
  }
}
