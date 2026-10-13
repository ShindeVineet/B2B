import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLeadFilterForUser } from "@/lib/permissions";
import { parseLeadPhones } from "@/lib/leads/phones";
import { RequestError, failure } from "@/lib/phase5/http";
type Context = { params: Promise<{ id: string }> };
export async function GET(req: NextRequest, ctx: Context) {
  try {
    const u = await getCurrentUser(req);
    if (!u) throw new RequestError("Unauthorized", 401);
    const { id } = await ctx.params;
    const lead = await prisma.lead.findFirst({
      where: { id, AND: [getLeadFilterForUser(u)] },
      include: {
        phones: { orderBy: [{ is_primary: "desc" }, { created_at: "asc" }] },
      },
    });
    if (!lead) throw new RequestError("Lead not found", 404);
    return NextResponse.json({
      phones: lead.phones,
      lead_code: lead.lead_code,
      can_edit: !["analyst", "ground_rep"].includes(u.role),
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: NextRequest, ctx: Context) {
  try {
    const u = await getCurrentUser(req);
    if (!u || ["analyst", "ground_rep"].includes(u.role)) throw new RequestError("Forbidden", 403);
    const { id } = await ctx.params,
      raw = await req.json();
    if (!["primary", "alternate", "whatsapp"].includes(raw.label))
      throw new RequestError("Choose a valid label");
    const numbers = parseLeadPhones([raw.phone_number]);
    if (numbers.length !== 1) throw new RequestError("Enter one number");
    const result = await prisma.$transaction(async (tx) => {
      const lead = await tx.lead.findFirst({
        where: { id, AND: [getLeadFilterForUser(u)] },
      });
      if (!lead) throw new RequestError("Lead not found", 404);
      await tx.$executeRaw`SELECT id FROM leads WHERE id=${id} FOR UPDATE`;
      const primary = raw.is_primary === true || !lead.phone_no;
      if (primary)
        await tx.leadPhone.updateMany({
          where: { lead_id: id, is_primary: true },
          data: { is_primary: false },
        });
      const phone = await tx.leadPhone.upsert({
        where: {
          lead_id_phone_number: { lead_id: id, phone_number: numbers[0] },
        },
        create: {
          lead_id: id,
          phone_number: numbers[0],
          label: raw.label,
          is_primary: primary,
          source: u.role === "ground_rep" ? "rep_added" : "manual",
        },
        update: { label: raw.label, ...(primary ? { is_primary: true } : {}) },
      });
      await tx.activityLog.create({
        data: {
          lead_id: id,
          actor_id: u.id,
          action: primary ? "PRIMARY_PHONE_CHANGED" : "PHONE_ADDED_OR_UPDATED",
          old_value: lead.phone_no,
          new_value: numbers[0],
        },
      });
      return phone;
    });
    return NextResponse.json({ phone: result });
  } catch (e) {
    return failure(e);
  }
}
