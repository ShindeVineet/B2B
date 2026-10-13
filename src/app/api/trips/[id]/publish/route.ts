import { assertEligible } from "@/lib/routes/pool";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canUserManageLeads, getUserFilterForUser } from "@/lib/permissions";
import { snapshotRoutes } from "@/lib/phase5/snapshots";
import { failure, RequestError } from "@/lib/phase5/http";
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const u = await getCurrentUser(req);
    if (!u || !canUserManageLeads(u)) throw new RequestError("Forbidden", 403);
    const { id } = await params;
    const result = await prisma.$transaction(
      async (tx) => {
        const plan = await tx.tripPlan.findFirst({
          where: { id, ground_rep: getUserFilterForUser(u) },
          include: { trip_leads: true },
        });
        if (!plan) throw new RequestError("Plan not found", 404);
        const pending = plan.trip_leads.filter(v => !v.completed && v.status !== "visited");
        for (const visit of pending) await assertEligible(tx, [visit.lead_id], visit.route_id || undefined, [visit.id]);
        await tx.tripPlan.update({
          where: { id },
          data: { status: "published" },
        });
        const previous = await tx.routeSnapshot.findMany({
          where: {
            ground_rep_id: plan.ground_rep_id,
            route_date: { gte: plan.start_date, lte: plan.end_date },
          },
          select: { route_date: true },
        });
        const dates = [
          ...new Set([
            ...plan.trip_leads.map((l) =>
              l.scheduled_date.toISOString().slice(0, 10),
            ),
            ...previous.map((s) => s.route_date.toISOString().slice(0, 10)),
          ]),
        ]
          .sort()
          .map((d) => new Date(d));
        return snapshotRoutes(tx, plan.ground_rep_id, dates);
      },
      { isolationLevel: "Serializable" },
    );
    return NextResponse.json({ snapshots: result });
  } catch (e) {
    return failure(e);
  }
}
