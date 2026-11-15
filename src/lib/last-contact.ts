export function latestContact(...values: (string | Date | null | undefined)[]) {
  const times = values.flatMap((v) => {
    const n = v ? new Date(v).getTime() : NaN;
    return Number.isFinite(n) ? [n] : [];
  });
  return times.length ? new Date(Math.max(...times)).toISOString() : null;
}
export function callingPriority(
  a: {
    id: string;
    last_contact_at?: string | null;
    next_follow_up_date?: string | null;
    latest_interest_level?: string | null;
  },
  b: {
    id: string;
    last_contact_at?: string | null;
    next_follow_up_date?: string | null;
    latest_interest_level?: string | null;
  },
  today: string,
) {
  const rank = (l: typeof a) =>
    l.next_follow_up_date
      ? l.next_follow_up_date.slice(0, 10) <= today
        ? 0
        : 3
      : !l.last_contact_at
        ? 1
        : 2;
  const delta = rank(a) - rank(b);
  if (delta) return delta;
  const interestRank = (l: typeof a) => ({ high: 0, medium: 1, low: 2 }[l.latest_interest_level?.toLowerCase() || ""] ?? 3);
  const value = (l: typeof a) =>
    rank(l) === 0 || rank(l) === 3
      ? l.next_follow_up_date!
      : l.last_contact_at || "";
  return value(a).localeCompare(value(b)) || interestRank(a) - interestRank(b) || a.id.localeCompare(b.id);
}

export function followUpPriority(interest?: string | null) {
  const level = interest?.toLowerCase();
  return level === "high" ? "Hot" : level === "medium" ? "Warm" : level === "low" ? "Cold" : "Standard";
}
