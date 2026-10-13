import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { canUserManageLeads } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { queueGeocoding } from "@/lib/mapping/jobs";
import { failure, RequestError } from "@/lib/phase5/http";
export async function POST(req: NextRequest) {
  try {
    const u = await getCurrentUser(req);
    if (!u || !canUserManageLeads(u)) throw new RequestError("Forbidden", 403);
    const b = await req.json();
    if (
      b.lead_ids !== undefined &&
      (!Array.isArray(b.lead_ids) ||
        b.lead_ids.length > 10000 ||
        b.lead_ids.some((v: unknown) => typeof v !== "string"))
    )
      throw new RequestError("Invalid lead selection");
    const job = await queueGeocoding(u, b.lead_ids);
    return NextResponse.json({ job }, { status: 202 });
  } catch (e) {
    return failure(e);
  }
}
export async function GET(req: NextRequest) {
  const u = await getCurrentUser(req);
  if (!u || !canUserManageLeads(u))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const jobs = await prisma.geocodeJob.findMany({
    where: {
      created_by: u.id,
      ...(req.nextUrl.searchParams.get("id")
        ? { id: req.nextUrl.searchParams.get("id")! }
        : {}),
    },
    orderBy: { created_at: "desc" },
    take: 10,
    include: {
      items: {
        select: {
          status: true,
          error: true,
          next_attempt_at: true,
          retry_cycles: true,
          attempts: true,
          search_stage: true,
        },
      },
    },
  });
  const index = await prisma.osmPoiRefresh.findUnique({
    where: { id: "india" },
  });
  return NextResponse.json({
    indexReady: !!index?.refreshed_at && index.poi_count > 0,
    jobs: jobs.map((j) => ({
      id: j.id,
      status: j.status,
      total: j.items.length,
      processed: j.items.filter((i) =>
        ["accepted", "issue", "skipped"].includes(i.status),
      ).length,
      accepted: j.items.filter((i) => i.status === "accepted").length,
      issues: j.items.filter((i) => i.status === "issue").length,
      retrying: j.items.filter((i) => ["retrying", "error"].includes(i.status))
        .length,
      localPending: j.items.filter(
        (i) =>
          ["pending", "processing", "retrying"].includes(i.status) &&
          i.search_stage === "local",
      ).length,
      externalPending: j.items.filter(
        (i) =>
          ["pending", "processing", "retrying"].includes(i.status) &&
          i.search_stage === "external",
      ).length,
      pending: j.items.filter((i) =>
        ["pending", "processing"].includes(i.status),
      ).length,
      exhausted: j.items.filter(
        (i) =>
          i.status === "retrying" && i.retry_cycles > 0 && i.attempts === 0,
      ).length,
      errors: [],
      nextRetryAt:
        j.items
          .filter((i) => i.next_attempt_at)
          .map((i) => i.next_attempt_at!)
          .sort((a, b) => a.getTime() - b.getTime())[0] || null,
      created_at: j.created_at,
    })),
  });
}
