import {assignCaller} from "../calling/distribute";
import { canConfirmImportedLocation } from "./saved-location";
import { resolveGoogleMapsLink } from "../maps-place";
import { inIndia } from "../location";
import type { MappingResult } from "./domain";
import { ProviderError } from "./query-cache";
import { retrySchedule } from "./retry";
import { refreshAllotment } from "../assignment/allotment";
import type { AuthUser } from "../auth";
import { prisma } from "../prisma";
import { getLeadFilterForUser } from "../permissions";
import { mappingFields } from "./pipeline";
export async function queueGeocoding(user: AuthUser, ids?: string[]) {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(928052)`;
      const leads = await tx.lead.findMany({
        where: {
          AND: [getLeadFilterForUser(user)],
          ...(ids ? { id: { in: ids } } : {}),
          location_verified: false,
        },
        select: { id: true },
      });
      if (!leads.length) throw new RangeError("No unverified leads selected");
      const active = await tx.geocodeJobItem.findMany({
        where: {
          lead_id: { in: leads.map((l) => l.id) },
          job: { status: { in: ["queued", "running", "paused"] } },
        },
        select: { lead_id: true, job: true },
      });
      const queued = new Set(active.map((item) => item.lead_id));
      const fresh = leads.filter((lead) => !queued.has(lead.id));
      if (!fresh.length) {
        const ownJob = active.find(
          (item) => item.job.created_by === user.id,
        )?.job;
        if (ownJob) return ownJob;
        throw new RangeError(
          "These leads are already being processed; no duplicate job was created",
        );
      }
      return tx.geocodeJob.create({
        data: {
          created_by: user.id,
          items: { create: fresh.map((l) => ({ lead_id: l.id })) },
        },
      });
    },
    { timeout: 30000 },
  );
}

export async function processNextGeocode() {
  // A transaction-held global lock serializes workers, including across restarts.
  return prisma.$transaction(
    async (tx) => {
      const [lock] = await tx.$queryRaw<
        Array<{ locked: boolean }>
      >`SELECT pg_try_advisory_xact_lock(928050) AS locked`;
      if (!lock.locked) return false;
      return processOne();
    },
    { maxWait: 10000, timeout: 600000 },
  );
}
async function processOne() {
  await prisma.geocodeJob.updateMany({
    where: {
      status: { in: ["queued", "running"] },
      items: {
        none: { status: { in: ["pending", "processing", "retrying"] } },
      },
    },
    data: { status: "completed", finished_at: new Date() },
  });
  const item = await prisma.geocodeJobItem.findFirst({
    where: {
      job: { status: { in: ["queued", "running"] } },
      OR: [
        { status: "pending" },
        { status: "retrying", next_attempt_at: { lte: new Date() } },
        { status: "processing", lease_until: { lt: new Date() } },
      ],
    },
    orderBy: [{ search_stage: "desc" }, { id: "asc" }],
    include: { job: true },
  });
  if (!item) return false;
  const claim = await prisma.geocodeJobItem.updateMany({
    where: {
      id: item.id,
      attempts: item.attempts,
      OR: [
        { status: "pending" },
        { status: "retrying", next_attempt_at: { lte: new Date() } },
        { status: "processing", lease_until: { lt: new Date() } },
      ],
    },
    data: {
      status: "processing",
      attempts: { increment: 1 },
      lease_until: new Date(Date.now() + 600000),
    },
  });
  if (!claim.count) return true;
  await prisma.geocodeJob.update({
    where: { id: item.job_id },
    data: { status: "running" },
  });
  try {
    const lead = await prisma.lead.findUniqueOrThrow({
      where: { id: item.lead_id },
    });
    if (lead.location_verified) {
      await prisma.geocodeJobItem.update({
        where: { id: item.id },
        data: { status: "skipped", lease_until: null },
      });
    } else if (canConfirmImportedLocation(lead)) {
      // A name mismatch needs human review, not another coordinate lookup.
      await prisma.geocodeJobItem.update({
        where: { id: item.id },
        data: {
          status: "issue",
          lease_until: null,
          next_attempt_at: null,
          error: null,
        },
      });
    } else {
      const point = await resolveGoogleMapsLink(lead.google_map_link);
      const result: MappingResult =
        point && inIndia(point)
          ? { status: "ok", point, source: "google_link", confidence: "high" }
          : { status: "mapping_issue", reason: "not_found", candidates: [] };
      await prisma.$transaction(async (tx) => {
        const write = await tx.lead.updateMany({
          where: {
            id: lead.id,
            updated_at: lead.updated_at,
            location_verified: false,
          },
          data: mappingFields(result),
        });
        await tx.geocodeJobItem.update({
          where: { id: item.id },
          data: {
            status: write.count
              ? result.status === "ok"
                ? "accepted"
                : "issue"
              : "skipped",
            lease_until: null,
            next_attempt_at: null,
            error: null,
          },
        });
        if (write.count && result.status === "mapping_issue" && result.reason === "not_found") await assignCaller(tx,lead.id);
        if (write.count)
          await refreshAllotment(tx, lead.id, item.job.created_by);
        if (write.count)
          await tx.activityLog.create({
            data: {
              lead_id: lead.id,
              actor_id: item.job.created_by,
              action: "GEOCODING_REPROCESSED",
              old_value: JSON.stringify({ lat: lead.lat, lng: lead.lng }),
              new_value: JSON.stringify(result),
            },
          });
      });
    }
  } catch (error) {
    const retry = retrySchedule(
      item.attempts + 1,
      error instanceof ProviderError ? error.cooldownMs : 0,
    );
    await prisma.geocodeJobItem.update({
      where: { id: item.id },
      data: {
        status: "retrying",
        lease_until: null,
        next_attempt_at: new Date(Date.now() + retry.delayMs),
        ...(retry.exhausted
          ? { attempts: 0, retry_cycles: { increment: 1 } }
          : {}),
        error: retry.exhausted
          ? "Temporarily unavailable — will retry after recovery interval"
          : error instanceof Error
            ? error.message
            : "Geocoder temporarily unavailable",
      },
    });
  }
  const remaining = await prisma.geocodeJobItem.count({
    where: {
      job_id: item.job_id,
      status: { in: ["pending", "processing", "retrying"] },
    },
  });
  if (!remaining)
    await prisma.geocodeJob.update({
      where: { id: item.job_id },
      data: { status: "completed", finished_at: new Date() },
    });
  return true;
}
