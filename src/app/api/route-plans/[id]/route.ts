import {
  createRouteCalendar,
  routeDayAvailability,
} from "@/lib/routes/direct-schedule";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canUserManageLeads } from "@/lib/permissions";
import { failure, RequestError } from "@/lib/phase5/http";
import {
  routeById,
  saveGeometry,
  sequenceRemaining,
  removePending,
  assignStops,
  assertScoped,
  capacityFor,
} from "@/lib/routes/service";
import { assertEligible, leadEligibility } from "@/lib/routes/pool";
import { cheapestInsertion, routeLetter } from "@/lib/routes/geometry";
import { dateOnly } from "@/lib/phase5/calendar";
import { snapshotRoutes } from "@/lib/phase5/snapshots";
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const u = await getCurrentUser(req);
    if (!u || !canUserManageLeads(u)) throw new RequestError("Forbidden", 403);
    const { id } = await params,
      b = await req.json();
    const result = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(928059)`;
        const route = await routeById(tx, id, u);
        if (
          typeof b.updated_at !== "string" ||
          b.updated_at !== route.updated_at.toISOString()
        )
          throw new RequestError(
            "Route changed. Refresh and review again.",
            409,
          );
        const stops = route.leads.map((m) => ({
          id: m.lead_id,
          lat: m.lead.lat!,
          lng: m.lead.lng!,
        }));
        if (
          ["add", "remove", "unassign"].includes(b.action) &&
          route.status === "assigned" &&
          b.confirm !== true
        )
          throw new RequestError(
            "Confirm this change to the published route",
            409,
          );
        if (b.action === "ready") {
          if (!["draft", "ready"].includes(route.status))
            throw new RequestError("Only draft routes can be marked ready");
          const batch = await tx.plannedRoute.findMany({
            where: { batch_id: route.batch_id },
          });
          if (
            batch.some(
              (r) =>
                Array.isArray(r.remainder_lead_ids) &&
                r.remainder_lead_ids.length,
            )
          )
            throw new RequestError(
              "Resolve or explicitly defer the batch remainder before marking Ready",
              409,
            );
          if (!stops.length) throw new RequestError("Add at least one stop");
          await assertEligible(
            tx,
            stops.map((p) => p.id),
            id,
          );
          return tx.plannedRoute.update({
            where: { id },
            data: { status: "ready" },
          });
        }
        if (b.action === "assign") {
          if (!["draft", "ready"].includes(route.status))
            throw new RequestError("This route is already assigned");
          if (b.confirm !== true && b.rep_id)
            throw new RequestError("Confirm the route assignment", 409);
          const date = dateOnly(b.date);
          const eligibility = await leadEligibility(
            tx,
            stops.map((p) => p.id),
            id,
          );
          const eligibleIds = new Set(
            eligibility.filter((r) => !r.reason).map((r) => r.lead.id),
          );
          const candidates = stops.filter((p) => eligibleIds.has(p.id));
          const blocked = eligibility.find(
            (r) => r.reason && !r.reason.startsWith("Already visited"),
          );
          if (blocked)
            throw new RequestError(
              `${blocked.lead.company_name}: ${blocked.reason}`,
              409,
            );
          if (!candidates.length)
            throw new RequestError(
              "No pending stops to assign; completed visits remain read-only",
            );
          // Leads outside the saved route stay available in the route pool by
          // default. Clearing the batch marker records that decision without
          // assigning or otherwise changing those leads.
          await tx.plannedRoute.updateMany({
            where: { batch_id: route.batch_id },
            data: { remainder_lead_ids: [] },
          });
          const calendar = b.rep_id
            ? await createRouteCalendar(tx, u, {
                rep_id: b.rep_id,
                date,
                end_date: date,
                capacity: candidates.length,
                working_days: ["mon","tue","wed","thu","fri","sat","sun"],
                name: route.name,
              })
            : null;
          const plan = await assignStops(
            tx,
            u,
            id,
            calendar?.id || String(b.trip_id),
            date,
            candidates,
          );
          await tx.plannedRoute.update({
            where: { id },
            data: {
              status: "assigned",
              ground_rep_id: plan.ground_rep_id,
              route_date: new Date(date),
              assigned_trip_id: plan.id,
            },
          });
          const snapshots = await snapshotRoutes(tx, plan.ground_rep_id, [
            new Date(date),
          ]);
          for (const s of snapshots)
            await tx.routeSnapshot.update({
              where: { id: s.id },
              data: { route_id: id },
            });
          return { success: true };
        }
        if (b.action === "unassign") {
          if (route.status !== "assigned")
            throw new RequestError("Only assigned routes can be unassigned");
          await removePending(tx, u, id);
          return tx.plannedRoute.update({
            where: { id },
            data: {
              status: "ready",
              ground_rep_id: null,
              route_date: null,
              assigned_trip_id: null,
            },
          });
        }
        if (b.action === "planning") {
          if (
            route.status !== "assigned" ||
            !route.assigned_trip_id ||
            !route.route_date ||
            !route.ground_rep_id ||
            b.confirm !== true
          )
            throw new RequestError("Confirm changes to an assigned route", 409);
          const assignment = await tx.tripAssignment.findUnique({
            where: { trip_id: route.assigned_trip_id },
          });
          if (!assignment) throw new RequestError("Schedule not found", 404);
          const end = dateOnly(b.end_date);
          if (end < dateOnly(assignment.end_date))
            throw new RequestError(
              `Rescheduling window already ends ${dateOnly(assignment.end_date)}. Choose that date or a later date.`,
            );
          if (
            !Number.isInteger(b.capacity) ||
            b.capacity < 1 ||
            b.capacity > 100
          )
            throw new RequestError("Daily capacity must be 1–100");
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${route.ground_rep_id}))`;
          const used = await tx.tripLead.count({
            where: {
              trip: {
                ground_rep_id: route.ground_rep_id,
                status: { not: "completed" },
              },
              scheduled_date: route.route_date,
            },
          });
          if (b.capacity < used)
            throw new RequestError(
              `${used} visits already exist on this day; capacity cannot be lower`,
              409,
            );
          await tx.tripAssignment.update({
            where: { id: assignment.id },
            data: {
              end_date: new Date(end),
              assigning_manager_id: assignment.assigning_manager_id || u.id,
            },
          });
          await tx.tripPlan.update({
            where: { id: route.assigned_trip_id },
            data: { end_date: new Date(end) },
          });
          await tx.tripDayCapacity.upsert({
            where: {
              trip_assignment_id_date: {
                trip_assignment_id: assignment.id,
                date: route.route_date,
              },
            },
            create: {
              trip_assignment_id: assignment.id,
              date: route.route_date,
              capacity: b.capacity,
            },
            update: { capacity: b.capacity },
          });
          return tx.plannedRoute.update({
            where: { id },
            data: { updated_at: new Date() },
          });
        }
        if (b.action === "remove") {
          if (!stops.some((p) => p.id === b.lead_id))
            throw new RequestError("Stop not found");
          await tx.routeLead.delete({
            where: { route_id_lead_id: { route_id: id, lead_id: b.lead_id } },
          });
          if (route.status === "assigned")
            await removePending(tx, u, id, b.lead_id);
          await sequenceRemaining(tx, id);
        } else if (b.action === "add") {
          await assertScoped(tx, u, [b.lead_id]);
          const [lead] = await assertEligible(tx, [b.lead_id]);
          const point = { id: lead.id, lat: lead.lat!, lng: lead.lng! };
          const insertion = cheapestInsertion(stops, point);
          if (route.status === "assigned") {
            if (!route.assigned_trip_id || !route.route_date)
              throw new RequestError("Route assignment missing");
            await assignStops(
              tx,
              u,
              id,
              route.assigned_trip_id,
              dateOnly(route.route_date),
              [point],
            );
          }
          await tx.routeLead.create({
            data: { route_id: id, lead_id: lead.id, sequence_order: 1 },
          });
          await saveGeometry(tx, id, insertion.stops);
        } else if (b.action === "remainder") {
          const remainder = Array.isArray(route.remainder_lead_ids)
            ? route.remainder_lead_ids.filter(
                (v): v is string => typeof v === "string",
              )
            : [];
          if (!remainder.length)
            throw new RequestError("No remainder to resolve");
          if (!["defer", "new", "add"].includes(b.choice))
            throw new RequestError("Choose a remainder action");
          if (b.choice !== "defer") {
            const leads = await assertEligible(tx, remainder, id);
            let target = route;
            if (b.choice === "add") {
              target = await routeById(tx, String(b.target_route_id), u);
              if (
                target.batch_id !== route.batch_id ||
                target.status !== "draft"
              )
                throw new RequestError("Choose a draft route from this batch");
            } else {
              const count = await tx.plannedRoute.count({
                where: { batch_id: route.batch_id },
              });
              const newRoute = await tx.plannedRoute.create({
                data: {
                  name: `${String((route.area_filter as { label?: string }).label || "Selected area")} Route ${routeLetter(count)}`,
                  created_by: u.id,
                  batch_id: route.batch_id,
                  area_filter: route.area_filter!,
                  target_count: leads.length,
                  remainder_lead_ids: [],
                },
              });
              target = await routeById(tx, newRoute.id, u);
            }
            let ordered = target.leads.map((m) => ({
              id: m.lead_id,
              lat: m.lead.lat!,
              lng: m.lead.lng!,
            }));
            for (const l of leads) {
              ordered = cheapestInsertion(ordered, {
                id: l.id,
                lat: l.lat!,
                lng: l.lng!,
              }).stops;
              await tx.routeLead.create({
                data: { route_id: target.id, lead_id: l.id, sequence_order: 1 },
              });
            }
            await saveGeometry(tx, target.id, ordered);
          }
          await tx.plannedRoute.update({
            where: { id },
            data: { remainder_lead_ids: [] },
          });
          return { success: true };
        } else if (b.action === "delete") {
          if (!["draft", "ready"].includes(route.status) || route.visits.length)
            throw new RequestError(
              "Only unassigned routes without visit history may be deleted",
            );
          await tx.plannedRoute.delete({ where: { id } });
          return { success: true };
        } else if (b.action === "completed") {
          if (
            route.status !== "assigned" ||
            !route.route_date ||
            dateOnly(route.route_date) >=
              new Date().toLocaleDateString("en-CA", {
                timeZone: "Asia/Kolkata",
              })
          )
            throw new RequestError(
              "Only past assigned routes can be completed",
            );
          if (route.visits.some((v) => v.status === "pending" && !v.completed))
            throw new RequestError(
              "Resolve pending visits before completing the route",
            );
          return tx.plannedRoute.update({
            where: { id },
            data: { status: "completed" },
          });
        } else throw new RequestError("Unknown route action");
        if (
          route.status === "assigned" &&
          route.ground_rep_id &&
          route.route_date
        ) {
          const ordered = await tx.routeLead.findMany({
            where: { route_id: id },
            orderBy: { sequence_order: "asc" },
          });
          for (const m of ordered)
            await tx.tripLead.updateMany({
              where: {
                route_id: id,
                lead_id: m.lead_id,
                status: "pending",
                completed: false,
              },
              data: { sequence_order: m.sequence_order },
            });
          await snapshotRoutes(tx, route.ground_rep_id, [route.route_date]);
        }
        return { success: true };
      },
      { timeout: 120000, isolationLevel: "Serializable" },
    );
    return NextResponse.json(result);
  } catch (e) {
    return failure(e);
  }
}
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const u = await getCurrentUser(req);
    if (!u || !canUserManageLeads(u)) throw new RequestError("Forbidden", 403);
    const { id } = await params;
    if (req.nextUrl.searchParams.has("rep_id")) {
      const availability = await prisma.$transaction((tx) =>
        routeDayAvailability(
          tx,
          u,
          req.nextUrl.searchParams.get("rep_id")!,
          dateOnly(req.nextUrl.searchParams.get("date") || ""),
          Number(req.nextUrl.searchParams.get("capacity") || 10),
        ),
      );
      return NextResponse.json({
        remaining: availability.remaining,
        used: availability.used,
        capacity: availability.capacity,
        existing_limit: availability.existing_limit,
      });
    }
    if (req.nextUrl.searchParams.has("trip_id")) {
      const date = dateOnly(req.nextUrl.searchParams.get("date") || "");
      const capacity = await prisma.$transaction((tx) =>
        capacityFor(tx, u, req.nextUrl.searchParams.get("trip_id")!, date, 0),
      );
      return NextResponse.json({ remaining: capacity.remaining });
    }
    const route = await routeById(prisma, id, u);
    if (req.nextUrl.searchParams.get("remainder") === "true")
      return NextResponse.json({
        leads: await prisma.lead.findMany({
          where: {
            id: {
              in: Array.isArray(route.remainder_lead_ids)
                ? route.remainder_lead_ids.filter(
                    (v): v is string => typeof v === "string",
                  )
                : [],
            },
          },
        }),
      });
    return NextResponse.json(route);
  } catch (e) {
    return failure(e);
  }
}
