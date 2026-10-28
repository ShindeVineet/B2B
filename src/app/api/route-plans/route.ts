import { pincodeArea } from "@/lib/mapping/pincode-areas";
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canUserManageLeads, getLeadFilterForUser, getUserFilterForUser } from "@/lib/permissions";
import { failure, RequestError } from "@/lib/phase5/http";
import { leadEligibility, assertEligible } from "@/lib/routes/pool";
import { buildRouteBatch } from "@/lib/routes/geometry";
import {
  saveGeometry,
  routeById,
  routeInclude,
  assertScoped,
} from "@/lib/routes/service";
import {
  routeDistance,
  type ClusterLead,
} from "@/lib/clustering/cluster-leads";
import { canPlotLead } from "@/lib/mapping/visibility";
async function selectedRep(req: NextRequest, user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>, value: unknown) {
  if (req.nextUrl.pathname !== "/api/assigned-lead-routes") return undefined;
  if (typeof value !== "string" || !value.trim()) throw new RequestError("Select a person first");
  const rep = await prisma.user.findFirst({ where: {
    id: value, active: true, role: { in: ["ground_rep", "regional_manager", "b2b_head"] },
    AND: [getUserFilterForUser(user)],
  }, select: { id: true } });
  if (!rep) throw new RequestError("Choose an active person in your team", 403);
  return rep.id;
}
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user || !canUserManageLeads(user))
      throw new RequestError("Forbidden", 403);
    const rep = await selectedRep(req, user, req.nextUrl.searchParams.get("rep_id"));
    if (req.nextUrl.searchParams.get("filters") === "true") {
      const pairs = await prisma.lead.findMany({
        where: { AND: [getLeadFilterForUser(user)], ...(rep ? { assigned_ground_rep_id: rep } : {}) },
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
          ...(rep ? { assigned_ground_rep_id: rep } : {}),
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
        undefined,
        [],
        rep,
      );
      const calling = await prisma.lead.groupBy({
        by: ["pin_code"],
        where: {
          AND: [scope],
          ...(rep ? { assigned_ground_rep_id: rep } : {}),
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
      const visibleRows = rep ? rows : rows.filter((row) => !callingIds.has(row.lead.id));
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
    const rep = await selectedRep(req, user, b.rep_id);
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
    // Workflow markers are server-owned; ordinary drafts cannot opt into revisit rules.
    const areaFilter = { ...b.area_filter };
    delete areaFilter.kind;
    delete areaFilter.rep_id;
    if (rep) { areaFilter.kind = "assigned_revisit"; areaFilter.rep_id = rep; }
    const result = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(928059)`;
        await assertScoped(tx, user, b.lead_ids);
        const leads = await assertEligible(tx, b.lead_ids, undefined, [], rep);
        if (leads.some((l) => !canPlotLead(l)))
          throw new RequestError("Resolve Mapping Issues first");
        const pool = leads.map((l) => ({ id: l.id, lat: l.lat!, lng: l.lng! }));
        const batch = buildRouteBatch(
          pool,
          b.leads_per_route,
          b.single ? 1 : b.route_count,
        );
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
          const remainder = pool
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
        const collectionName =
          typeof b.collection_name === "string" ? b.collection_name.trim() : "";
        if (!collectionName)
          throw new RequestError("Draft collection name is required");
        if (collectionName.length > 80)
          throw new RequestError("Draft collection name must be 80 characters or fewer");
        const batchId = randomUUID();
        const ids: string[] = [];
        // Empty holding route retains a remainder when pool size < N.
        const groups = batch.routes.length ? batch.routes : [[]];
        for (const [i, stops] of groups.entries()) {
          const route = await tx.plannedRoute.create({
            data: {
              name: `${collectionName} ${i + 1}`,
              area_filter: areaFilter,
              target_count: b.leads_per_route,
              created_by: user.id,
              batch_id: batchId,
              remainder_lead_ids: i === 0 && !b.single ? batch.remainder : [],
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

export async function DELETE(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user || !canUserManageLeads(user))
      throw new RequestError("Forbidden", 403);
    const body = await req.json();
    const ids: string[] = Array.isArray(body.ids)
      ? [
          ...new Set<string>(
            (body.ids as unknown[]).filter(
              (id): id is string => typeof id === "string" && id.length > 0,
            ),
          ),
        ]
      : [];
    if (!ids.length || ids.length > 500)
      throw new RequestError("Select between 1 and 500 routes to delete");

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(928059)`;
      const routes = await Promise.all(ids.map((id) => routeById(tx, id, user)));
      const blocked = routes.find(
        (route) =>
          !["draft", "ready"].includes(route.status) || route.visits.length > 0,
      );
      if (blocked)
        throw new RequestError(
          `${blocked.name} cannot be deleted. Only unassigned routes without visit history may be deleted.`,
          409,
        );
      await tx.plannedRoute.deleteMany({ where: { id: { in: ids } } });
    });
    return NextResponse.json({ success: true, deleted: ids.length });
  } catch (e) {
    return failure(e);
  }
}
