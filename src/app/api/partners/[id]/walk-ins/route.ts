import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { failure, RequestError } from "@/lib/phase5/http";
import { requirePartner } from "@/lib/partners/access";
import { todayIndia } from "@/lib/phase5/calendar";

type Context = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, context: Context) {
  try {
    const user = await getCurrentUser(req);
    if (!user) throw new RequestError("Unauthorized", 401);
    if (user.role !== "store_associate")
      throw new RequestError("Only Store Associates can log partner walk-ins", 403);
    const { id } = await context.params;
    await requirePartner(user, id);
    const body = await req.json();
    const notes = typeof body.notes === "string" ? body.notes.trim() : "";
    if (!notes) throw new RequestError("Walk-in notes are required");
    if (notes.length > 2000)
      throw new RequestError("Walk-in notes must be 2,000 characters or fewer");
    const activity = await prisma.partnerActivity.create({
      data: {
        partner_id: id,
        actor_id: user.id,
        action: "PARTNER_WALK_IN",
        new_value: {
          notes,
          walk_in_date: todayIndia(),
          recorded_at: new Date().toISOString(),
        },
      },
      include: { actor: { select: { name: true } } },
    });
    return NextResponse.json({ activity }, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}
