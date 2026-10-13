import type { Prisma } from "@prisma/client";
import type { AuthUser } from "../auth";
import { getLeadFilterForUser } from "../permissions";
import { closedVisit } from "./eligibility";
import { RequestError } from "../phase5/http";
export async function consultationVisit(
  tx: Prisma.TransactionClient,
  user: AuthUser,
  leadId: string,
  visitId?: string | null,
) {
  const lead = await tx.lead.findFirst({
    where: { id: leadId, AND: [getLeadFilterForUser(user)] },
  });
  if (!lead) throw new RequestError("Lead not found", 404);
  const visits = await tx.tripLead.findMany({
    where: { lead_id: leadId, ...(visitId ? { id: visitId } : {}) },
    include: {
      trip: true,
      consultation: { include: { rep: { select: { name: true } } } },
    },
    orderBy: [
      { created_at: "desc" },
      { scheduled_date: "desc" },
      { id: "desc" },
    ],
  });
  const visit = visitId
    ? visits[0]
    : visits.find(
        (v) =>
          !closedVisit(v) &&
          ["pending", "rescheduled"].includes(v.status) &&
          v.trip.ground_rep_id === user.id &&
          ["active", "published"].includes(v.trip.status),
      ) || visits[0];
  if (visitId && !visit) throw new RequestError("Visit not found", 404);
  if (visit && closedVisit(visit)) {
    const record =
      visit.consultation ||
      (await tx.consultation.findFirst({
        where: { lead_id: leadId, rep_id: visit.trip.ground_rep_id },
        include: { rep: { select: { name: true } } },
        orderBy: { created_at: "desc" },
      }));
    throw new RequestError(
      `Already visited — consultation filed by ${record?.rep.name || "the assigned rep"} on ${(record?.visit_date || visit.scheduled_date).toISOString().slice(0, 10)}. Schedule a new eligible follow-up visit.`,
      409,
    );
  }
  if (
    visit &&
    (!["pending", "rescheduled"].includes(visit.status) ||
      !["active", "published"].includes(visit.trip.status))
  )
    throw new RequestError("This visit is not currently actionable", 409);
  if (visit && visit.trip.ground_rep_id !== user.id)
    throw new RequestError(
      "Only the assigned rep can file this visit consultation",
      403,
    );
  // Caller/store/head owners can append a fuller consultation after minimal intake.
  if (!visit && lead.calling_associate_id === user.id && ["caller", "store", "head"].includes(lead.intake_team)) return null;
  // Ad-hoc consultations remain available for never-visited assigned leads.
  if (!visit && (await tx.consultation.count({ where: { lead_id: leadId } })))
    throw new RequestError(
      "A consultation is already filed. Schedule a new eligible follow-up visit.",
      409,
    );
  return visit || null;
}
