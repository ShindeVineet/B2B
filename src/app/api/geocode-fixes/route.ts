import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLeadFilterForUser, canUserManageLeads } from "@/lib/permissions";
export async function GET(req: NextRequest) {
  const u = await getCurrentUser(req);
  if (!u || !canUserManageLeads(u))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({
    leads: await prisma.lead.findMany({
      where: {
        AND: [getLeadFilterForUser(u)],
        geocode_status: { in: ["invalid", "mismatch_flagged"] },
      },
      orderBy: { updated_at: "desc" },
    }),
  });
}
