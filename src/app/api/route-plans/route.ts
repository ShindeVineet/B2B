import { pincodeArea } from "@/lib/mapping/pincode-areas";
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canUserManageLeads, getLeadFilterForUser } from "@/lib/permissions";
import { failure, RequestError } from "@/lib/phase5/http";
import { leadEligibility, assertEligible } from "@/lib/routes/pool";
import { buildRouteBatch, routeLetter } from "@/lib/routes/geometry";
import { saveGeometry, routeInclude, assertScoped } from "@/lib/routes/service";
import {
  routeDistance,
  type ClusterLead,
} from "@/lib/clustering/cluster-leads";
import { canPlotLead } from "@/lib/mapping/visibility";
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user || !canUserManageLeads(user))
      throw new RequestError("Forbidden", 403);
    if (req.nextUrl.searchParams.get("filters") === "true") {
      const pairs = await prisma.lead.findMany({
        where: getLeadFilterForUser(user),
        select: { pin_code: true, region: true },
        distinct: ["pin_code", "region"],
        orderBy: { pin_code: "asc" },
      });
      return NextResponse.json({
        pairs: pairs.map((p) => ({
          ...p,
          area: pincodeArea(p.pin_code)?.primary_areas || "",
        })),
      });
    }
    if (req.nextUrl.searchParams.get("pool") === "true") {
      const p = req.nextUrl.searchParams;
      const pincodes = p.getAll("pincode").filter(Boolean);
      const search = p.get("search")?.trim();
      const scope = getLeadFilterForUser(user);
      const leads = await prisma.lead.findMany({
        where: {
          AND: [scope],
          ...(pincodes.length ? { pin_code: { in: pincodes } } : {}),
          ...(p.get("store") ? { assigned_store_id: p.get("store")! } : {}),
          ...(p.get("region") ? { region: p.get("region")! } : {}),
          ...(search
            ? {
                OR: [
                  { lead_code: { contains: search, mode: "insensitive" } },
                  { company_name: { contains: search, mode: "insensitive" } },
                  { owner_name: { contains: search, mode: "insensitive" } },
                  { phone_no: { contains: search } },
                ],
              }
            : {}),
        },
        select: { id: true },
      });
      const rows = await leadEligibility(
        prisma,
        leads.map((l) => l.id),
      );
      const calling = await prisma.lead.groupBy({
        by: ["pin_code"],
        where: {
          AND: [scope],
          intake_team: "caller",
          ...(pincodes.length ? { pin_code: { in: pincodes } } : {}),
          ...(p.get("store") ? { assigned_store_id: p.get("store")! } : {}),
          ...(p.get("region") ? { region: p.get("region")! } : {}),
          ...(search
            ? {
                OR: [
                  { lead_code: { contains: search, mode: "insensitive" } },
                  { company_name: { contains: search, mode: "insensitive" } },
                  { owner_name: { contains: search, mode: "insensitive" } },
                  { phone_no: { contains: search } },
                ],
              }
            : {}),
        },
        _count: { _all: true },
      });
      const callingIds = new Set(
        rows.filter((row) => row.lead.intake_team === "caller").map((row) => row.lead.id),
      );
      const visibleRows = rows.filter((row) => !callingIds.has(row.lead.id));
      return NextResponse.json({
        leads: visibleRows
          .filter((r) => !r.reason)
          .map((r) => ({
            id: r.lead.id,
            company_name: r.lead.company_name,
            lead_code: r.lead.lead_code,
            lat: r.lead.lat,
            lng: r.lead.lng,
            pin_code: r.lead.pin_code,
            lead_source: r.lead.lead_source,
            assigned_ground_rep_id: r.lead.assigned_ground_rep_id,
          })),
        excluded: visibleRows.filter((r) => r.reason).length,
        total: rows.length,
        excluded_leads: visibleRows
          .filter((r) => r.reason)
          .map((r) => ({
            id: r.lead.id,
            company_name: r.lead.company_name,
            reason: r.reason,
          })),
        calling_queue: calling.map((row) => ({
          pin_code: row.pin_code,
          count: row._count._all,
        })),
      });
    }
    return NextResponse.json({
      routes: await prisma.plannedRoute.findMany({
        include: routeInclude,
        orderBy: { created_at: "desc" },
      }),
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user || !canUserManageLeads(user))
      throw new RequestError("Forbidden", 403);
    const b = await req.json();
    if (
      !Array.isArray(b.lead_ids) ||
      !b.lead_ids.length ||
      b.lead_ids.length > 10000 ||
      b.lead_ids.some((id: unknown) => typeof id !== "string")
    )
      throw new RequestError("Select a non-empty lead pool (maximum 10,000)");
    if (
      !b.area_filter ||
      typeof b.area_filter !== "object" ||
      Array.isArray(b.area_filter)
    )
      throw new RequestError("Choose an area filter");
    const result = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(928059)`;
        await assertScoped(tx, user, b.lead_ids);
        const leads = await assertEligible(tx, b.lead_ids);
        if (leads.some((l) => !canPlotLead(l)))
          throw new RequestError("Resolve Mapping Issues first");
        const pool = leads.map((l) => ({ id: l.id, lat: l.lat!, lng: l.lng! }));
        const batch = buildRouteBatch(
          pool,
          b.leads_per_route,
          b.single ? 1 : b.route_count,
        );
        if (b.single) batch.remainder = [];
        if (!b.preview && b.expected_routes) {
          if (
            !Array.isArray(b.expected_routes) ||
            b.expected_routes.length !== batch.routes.length ||
            b.expected_routes.some((r: unknown) => !Array.isArray(r))
          )
            throw new RequestError(
              "Regenerate the preview after changing route count",
            );
          const saved: ClusterLead[][] = b.expected_routes;
          const points = saved.flat();
          const current = new Map(pool.map((p) => [p.id, p]));
          if (
            points.some(
              (p) =>
                !p ||
                typeof p.id !== "string" ||
                current.get(p.id)?.lat !== p.lat ||
                current.get(p.id)?.lng !== p.lng,
            ) ||
            new Set(points.map((p) => p.id)).size !== points.length
          )
            throw new RequestError(
              "The pool or coordinates changed. Regenerate and review before saving.",
              409,
            );
          const chosen = new Set(points.map((p) => p.id));
          const remainder = b.single
            ? []
            : pool
                .filter((p) => !chosen.has(p.id))
                .map((p) => p.id)
                .sort();
          if (
            !Array.isArray(b.expected_remainder) ||
            JSON.stringify([...b.expected_remainder].sort()) !==
              JSON.stringify(remainder)
          )
            throw new RequestError(
              "Review the current remainder before saving",
              409,
            );
          batch.routes = saved;
          batch.remainder = remainder;
          batch.after = saved.reduce((sum, r) => sum + routeDistance(r), 0);
        }
        if (b.preview) return { ...batch, preview: true };
        const batchId = randomUUID();
        const ids: string[] = [];
        const area = String(
          b.area_filter.label ||
            b.area_filter.pincode ||
            b.area_filter.region ||
            "Selected area",
        ).slice(0, 100);
        // Empty holding route retains a remainder when pool size < N.
        const groups = batch.routes.length ? batch.routes : [[]];
        for (const [i, stops] of groups.entries()) {
          const route = await tx.plannedRoute.create({
            data: {
              name: `${area} Route ${routeLetter(i)}`,
              area_filter: b.area_filter,
              target_count: b.leads_per_route,
              created_by: user.id,
              batch_id: batchId,
              remainder_lead_ids: i === 0 ? batch.remainder : [],
              leads: {
                create: stops.map((p, j) => ({
                  lead_id: p.id,
                  sequence_order: j + 1,
                })),
              },
            },
          });
          await saveGeometry(tx, route.id, stops);
          ids.push(route.id);
        }
        return { ids, ...batch };
      },
      { timeout: 120000, isolationLevel: "Serializable" },
    );
    return NextResponse.json(result);
  } catch (e) {
    return failure(e);
  }
}
