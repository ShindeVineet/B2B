import { getLeadEditFilterForUser, getLeadFilterForUser } from "@/lib/permissions";
import { parseStoreVisit } from "@/lib/consultations/store-visit";
import { todayIndia } from "@/lib/phase5/calendar";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { failure, RequestError } from "@/lib/phase5/http";
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) throw new RequestError("Unauthorized", 401);
    const today = new Date(todayIndia() + "T00:00:00+05:30");
    // All staff see the appointment board; full lead access retains its existing scope.
    const visits = await prisma.storeVisit.findMany({
      where: { status: "scheduled",
        ...(req.nextUrl.searchParams.get("today") === "true" ? { scheduled_at: { gte: today, lt: new Date(today.getTime() + 86400000) } } : {}),
        ...(req.nextUrl.searchParams.get("receiving") === "true" && user.role === "store_associate" ? { store_id: user.store_id || "__none__" } : {}),
        ...(req.nextUrl.searchParams.get("lead_id") ? { lead_id: req.nextUrl.searchParams.get("lead_id")! } : {}),
      }, orderBy: { scheduled_at: "asc" },
      select: { id: true, scheduled_at: true, status: true, store: { select: { id: true, name: true } }, lead: { select: { id: true, lead_code: true, company_name: true, owner_name: true } } },
    });
    return NextResponse.json({ visits });
  } catch (e) { return failure(e); }
}
export async function PATCH(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) throw new RequestError("Unauthorized", 401);
    const raw = await req.json();
    if (!["completed", "cancelled"].includes(raw.status) || typeof raw.id !== "string") throw new RequestError("Choose completed or cancelled");
    await prisma.$transaction(async tx => {
      const visit = await tx.storeVisit.findUnique({ where: { id: raw.id } });
      if (!visit) throw new RequestError("Visit not found", 404);
      if (!["b2b_head", "regional_manager"].includes(user.role) && !(user.role === "store_associate" && user.store_id === visit.store_id)) throw new RequestError("Only managers or the receiving store can update this visit", 403);
      const result = await tx.storeVisit.updateMany({ where: { id: visit.id, status: "scheduled" }, data: { status: raw.status } });
      if (!result.count) throw new RequestError("This visit has already been updated", 409);
      await tx.activityLog.create({ data: { lead_id: visit.lead_id, actor_id: user.id, action: "STORE_VISIT_UPDATED", old_value: "scheduled", new_value: `${visit.id}: ${raw.status}` } });
    });
    return NextResponse.json({ success: true });
  } catch (e) { return failure(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) throw new RequestError("Unauthorized", 401);
    if (user.role === "analyst") throw new RequestError("Read-only access", 403);
    const raw = await req.json();
    if (typeof raw.lead_id !== "string") throw new RequestError("Choose a lead");
    const input = parseStoreVisit({ ...raw, visit_scheduled: true })!;
    const visit = await prisma.$transaction(async tx => {
      const lead = await tx.lead.findFirst({ where: { id: raw.lead_id, AND: [user.role === "ground_rep" ? getLeadFilterForUser(user) : getLeadEditFilterForUser(user)] } });
      if (!lead) throw new RequestError("Lead not found or not editable", 404);
      await tx.$queryRaw`SELECT id FROM leads WHERE id=${lead.id} FOR UPDATE`;
      if (!await tx.store.findFirst({ where: { id: input.store_id, active: true } })) throw new RequestError("Choose an active store");
      if (await tx.storeVisit.findFirst({ where: { lead_id: lead.id, status: "scheduled", ...input } })) throw new RequestError("This appointment is already scheduled", 409);
      const result = await tx.storeVisit.create({ data: { ...input, lead_id: lead.id } });
      await tx.activityLog.create({ data: { lead_id: lead.id, actor_id: user.id, action: "STORE_VISIT_SCHEDULED", new_value: JSON.stringify({ id: result.id, ...input }) } });
      return result;
    });
    return NextResponse.json({ visit }, { status: 201 });
  } catch (e) { return failure(e); }
}
