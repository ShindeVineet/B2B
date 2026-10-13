import { parseImportDate } from "../import-date";

/** Historical form timestamps without an offset use the business timezone (IST). */
export function parsePartnerImportDate(value: unknown): Date | null {
  if (typeof value !== "string") return parseImportDate(value);
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return parseImportDate(value);
  const [, d, m, y, h, min, sec = "0"] = match;
  const [day, month, year, hour, minute, second] = [d, m, y, h, min, sec].map(Number);
  const local = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (local.getUTCFullYear() !== year || local.getUTCMonth() !== month - 1 ||
      local.getUTCDate() !== day || hour > 23 || minute > 59 || second > 59)
    throw new RangeError("Invalid partner timestamp. Use DD/MM/YYYY HH:mm:ss.");
  return new Date(local.getTime() - 330 * 60_000);
}
