export type VisitEligibility = {
  status: string;
  completed: boolean;
  consultation?: {
    outcome: string;
    next_follow_up_date: Date | string | null;
  } | null;
};
export function closedVisit(visit: { status: string; completed: boolean }) {
  return visit.status === "visited" || visit.completed;
}
export function permitsFollowUp(visit: VisitEligibility) {
  return (
    closedVisit(visit) &&
    !!visit.consultation?.next_follow_up_date &&
    ["Visit scheduled", "Nurturing required", "Follow-up needed", "Couldn't meet"].includes(
      visit.consultation.outcome,
    )
  );
}
export function visitPoolReason(
  latest: VisitEligibility | null,
  unresolved: boolean,
  reserved: boolean,
) {
  if (reserved) return "Reserved in another route";
  if (unresolved) return "An unresolved visit already exists";
  if (latest && closedVisit(latest) && !permitsFollowUp(latest))
    return "Already visited — no dated follow-up requested";
  return null;
}
