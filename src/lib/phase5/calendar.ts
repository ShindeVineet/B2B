export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export const BASE_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat"];
export function dateOnly(value: string | Date) {
  const s = value instanceof Date ? value.toISOString().slice(0, 10) : value;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(s) ||
    !Number.isFinite(new Date(s).getTime()) ||
    new Date(s).toISOString().slice(0, 10) !== s
  )
    throw new RangeError("Invalid calendar date");
  return s;
}
export function todayIndia() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}
export function addDays(date: string, n: number) {
  return new Date(new Date(dateOnly(date)).getTime() + n * 86400000)
    .toISOString()
    .slice(0, 10);
}
export function weekStart(date: string) {
  const d = new Date(dateOnly(date));
  return addDays(date, -((d.getUTCDay() + 6) % 7));
}
export function dayName(date: string) {
  return DAYS[(new Date(dateOnly(date)).getUTCDay() + 6) % 7];
}
export function validDays(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every(
      (v) => typeof v === "string" && (DAYS as readonly string[]).includes(v),
    ) &&
    new Set(value).size === value.length
  );
}
export type Schedule = {
  start: string;
  end: string;
  base: string[];
  weeks: Record<string, string[]>;
  capacity: number;
  capacities: Record<string, number>;
};
export function working(date: string, s: Schedule) {
  return (
    date >= s.start &&
    date <= s.end &&
    (s.weeks[weekStart(date)] ?? s.base).includes(dayName(date))
  );
}
export function spare(
  date: string,
  s: Schedule,
  counts: Record<string, number>,
) {
  return (
    working(date, s) && (counts[date] || 0) < (s.capacities[date] ?? s.capacity)
  );
}
export function nextSlot(
  start: string,
  s: Schedule,
  counts: Record<string, number>,
  end = s.end,
) {
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (spare(d, s, counts)) return d;
  }
  return null;
}
export function redistribute(
  ids: string[],
  start: string,
  end: string,
  s: Schedule,
  counts: Record<string, number>,
) {
  const result: { id: string; date: string }[] = [];
  const used = { ...counts };
  for (const id of ids) {
    const date = nextSlot(start, s, used, end);
    if (!date) return null;
    used[date] = (used[date] || 0) + 1;
    result.push({ id, date });
  }
  return result;
}
