import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
export async function GET(req: NextRequest) {
  if (!await getCurrentUser(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [stores, partners] = await Promise.all([
    prisma.store.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.partner.findMany({ where: { partner_status: "active" }, select: { id: true, partner_code: true, company_firm_name: true, contact_person_name: true }, orderBy: { company_firm_name: "asc" } }),
  ]);
  return NextResponse.json({ stores, partners });
}
