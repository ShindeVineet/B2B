import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
export async function GET(req: NextRequest) {
  const u = await getCurrentUser(req);
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const notifications = await prisma.notification.findMany({
    where: { user_id: u.id },
    include: {
      missed_visit: {
        include: {
          trip_lead: {
            include: {
              lead: { select: { lead_code: true, company_name: true } },
              trip: { select: { ground_rep: { select: { name: true } } } },
            },
          },
        },
      },
    },
    orderBy: { created_at: "desc" },
    take: 100,
  });
  return NextResponse.json({
    notifications,
    partner_notifications: await prisma.partnerNotification.findMany({where:{user_id:u.id},orderBy:{created_at:"desc"},take:100}),
    workflow_notifications: await prisma.workflowNotification.findMany({
      include: {lead:{select:{lead_code:true}}},
      where: { user_id: u.id },
      orderBy: { created_at: "desc" },
      take: 100,
    }),
  });
}
