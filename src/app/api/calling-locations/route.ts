import { latestContact, callingPriority } from "@/lib/last-contact";
import { todayIndia } from "@/lib/phase5/calendar";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (
    !user ||
    !["b2b_head", "regional_manager", "store_associate"].includes(user.role)
  )
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const where = {
    partners: { none: { partner_status: "active" as const } },
    status: { notIn: ["onboarded", "Converted", "Closed-Won", "Won"] },
    geocode_issue_reason: "not_found",
    location_verified: false,
    ...(user.role === "store_associate"
      ? { calling_associate_id: user.id }
      : {}),
  };
  if (req.nextUrl.searchParams.get("notifications") === "true")
    return NextResponse.json({
      items: await prisma.lead.findMany({
        where,
        select: { id: true, geocode_flagged_at: true },
        orderBy: { geocode_flagged_at: "desc" },
      }),
    });
  const page = Math.max(
    1,
    Math.min(
      100000,
      Math.floor(Number(req.nextUrl.searchParams.get("page")) || 1),
    ),
  );
  const [leads, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      include: {
        store_visits: { where: { status: "scheduled" }, orderBy: { scheduled_at: "asc" }, take: 1, include: { store: { select: { name: true } } } },
        call_logs: {
          orderBy: { created_at: "desc" },
          take: 1,
          select: { created_at: true },
        },
        consultations: {
          orderBy: { created_at: "desc" },
          take: 1,
          select: { visit_date: true },
        },
        follow_up: { select: { due_date: true, active: true } },
      },
      orderBy: [{ geocode_flagged_at: "desc" }, { id: "asc" }],
    }),
    prisma.lead.count({ where }),
  ]);
  const ordered = leads
    .map((l) => ({
      ...l,
      last_contact_at: latestContact(
        l.call_date,
        l.call_logs[0]?.created_at,
        l.consultations[0]?.visit_date,
      ),
      next_follow_up_date: l.follow_up?.active
        ? l.follow_up.due_date.toISOString()
        : null,
    }))
    .sort((a, b) => callingPriority(a, b, todayIndia()));
  return NextResponse.json({
    leads: ordered.slice((page - 1) * 30, page * 30),
    total,
  });
}
