import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LEAD_OUTCOMES } from "@/lib/consultations/fields";
export async function GET(req: NextRequest) {
  const u = await getCurrentUser(req);
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({
    fields: (await prisma.formField.findMany({
      where: { active: true },
      orderBy: { display_order: "asc" },
    })).map(f => f.key === "outcome"
      ? { ...f, options: LEAD_OUTCOMES }
      : ["primary_pain_point", "competitor_involved"].includes(f.key)
      ? { ...f, type: "multi_select" }
      : f.key === "next_follow_up_date" ? { ...f, required: false, required_when: null } : f),
    staff_name: u.name,
    can_edit_staff: u.role === "b2b_head",
  });
}
