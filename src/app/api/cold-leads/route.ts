import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getLeadFilterForUser } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
export async function GET(req: NextRequest) {
  const u = await getCurrentUser(req);
  if (!u || u.role === "ground_rep")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const where = {
    resolved_at: null,
    lead: {
      AND: [getLeadFilterForUser(u)],
      partners: { none: { partner_status: "active" as const } },
      status: {
        notIn: [
          "onboarded",
          "Converted",
          "Closed-Won",
          "Closed-Lost",
          "Needs Data Correction",
        ],
      },
    },
  };
  const cases = await prisma.coldLeadCase.findMany({
    where,
    include: { lead: true },
    orderBy: { flagged_at: "asc" },
  });
  const consultations = await prisma.consultation.findMany({
    where: { id: { in: cases.map((c) => c.consultation_id) } },
    include: {
      rep: { select: { id: true, name: true } },
      lead: {
        select: {
          id: true,
          lead_code: true,
          company_name: true,
          phone_no: true,
          lat: true,
          geocode_status: true,
          geocode_source: true,
          lng: true,
          status: true,
          region: true,
          assigned_store_id: true,
        },
      },
    },
  });
  // Interest classification is independent of escalation-case creation.
  // Include the same latest-consultation Low leads shown to ground reps.
  const candidates = await prisma.lead.findMany({
    where: {
      AND: [getLeadFilterForUser(u)],
      partners: { none: { partner_status: "active" as const } },
      status: { notIn: ["onboarded", "Converted", "Closed-Won", "Won"] },
      consultations: { some: { interest_level: "Low" } },
    },
    include: {
      consultations: {
        orderBy: { created_at: "desc" },
        take: 1,
        include: { rep: { select: { id: true, name: true } } },
      },
    },
  });
  const existingIds = new Set(cases.map((c) => c.lead_id));
  const interestRows = candidates
    .filter(
      (l) =>
        l.consultations[0]?.interest_level === "Low" && !existingIds.has(l.id),
    )
    .map((l) => {
      const { consultations: history, ...lead } = l;
      const latest = history[0];
      return {
        id: `interest:${l.id}`,
        lead_id: l.id,
        flagged_at: latest.visit_date,
        rules: ["Low interest"],
        interest_only: true,
        lead,
        consultation: { ...latest, lead },
      };
    });
  const rows = [
    ...cases.map((c) => ({
      ...c,
      interest_only: false,
      consultation: consultations.find((v) => v.id === c.consultation_id),
    })),
    ...interestRows,
  ].sort(
    (a, b) =>
      new Date(a.flagged_at).getTime() - new Date(b.flagged_at).getTime(),
  );
  if (req.nextUrl.searchParams.get("count") === "true")
    return NextResponse.json({ count: rows.length });
  return NextResponse.json({ cases: rows });
}
