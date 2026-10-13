import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DEFAULT_COLD_CONFIG } from "@/lib/cold/rules";
import { evaluateCold } from "@/lib/cold/service";
import { failure, RequestError } from "@/lib/phase5/http";
export async function GET(req: NextRequest) {
  const u = await getCurrentUser(req);
  if (!u || u.role !== "b2b_head")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({
    config:
      (await prisma.coldLeadConfig.findUnique({ where: { id: "default" } })) ||
      DEFAULT_COLD_CONFIG,
  });
}
export async function PATCH(req: NextRequest) {
  try {
    const u = await getCurrentUser(req);
    if (!u || u.role !== "b2b_head") throw new RequestError("Forbidden", 403);
    const b = await req.json();
    const data = {
      outcome_rule: b.outcome_rule,
      checklist_rule: b.checklist_rule,
      low_interest_rule: b.low_interest_rule,
    };
    if (Object.values(data).some((v) => typeof v !== "boolean"))
      throw new RequestError("Invalid rule settings");
    await prisma.$transaction(
      async (tx) => {
        await tx.coldLeadConfig.upsert({
          where: { id: "default" },
          create: { id: "default", ...data },
          update: data,
        });
        const leads = await tx.lead.findMany({
          include: {
            consultations: { orderBy: { created_at: "desc" }, take: 1 },
          },
        });
        for (const lead of leads)
          if (lead.consultations[0])
            await evaluateCold(tx, lead, lead.consultations[0]);
      },
      { timeout: 60000 },
    );
    return NextResponse.json({ success: true });
  } catch (e) {
    return failure(e);
  }
}
