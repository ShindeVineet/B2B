import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
export async function GET(req: NextRequest) {
  const u = await getCurrentUser(req);
  if (!u || !["b2b_head", "analyst"].includes(u.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const leads = await prisma.lead.findMany({
    where: {
      status: { in: ["Needs Manager Review", "Needs Data Correction"] },
    },
    select: {
      id: true,
      lead_code: true, company_name: true,
      status: true,
      region: true,
      status_entered_at: true,
      store: {
        select: { region: true, manager: { select: { id: true, name: true } } },
      },
    },
    orderBy: { status_entered_at: "asc" },
  });
  return NextResponse.json({ leads, as_of: new Date() });
}
