import { addDays, dateOnly, dayName, validDays } from "../phase5/calendar";
export function planWorkingDates(start: string, count: number, days: string[]) {
  if (
    !start ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > 366 ||
    !validDays(days) ||
    !days.length
  )
    return [];
  try {
    dateOnly(start);
  } catch {
    return [];
  }
  const result: string[] = [];
  for (let date = start; result.length < count; date = addDays(date, 1))
    if (days.includes(dayName(date))) result.push(date);
  return result;
}
