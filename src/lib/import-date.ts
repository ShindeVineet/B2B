// Excel serial dates and Indian day/month/year CSV dates are common in lead sheets.
export function parseImportDate(value: unknown): Date | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number") {
    const date = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
    if (Number.isFinite(date.getTime())) return date;
  }
  if (typeof value === "string") {
    const match = value.trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (match) {
      const [, day, month, year] = match.map(Number);
      const date = new Date(Date.UTC(year, month - 1, day));
      if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) return date;
    } else {
      const date = new Date(value);
      if (Number.isFinite(date.getTime())) return date;
    }
  }
  throw new Error("Invalid scraped date. Use DD/MM/YYYY or YYYY-MM-DD.");
}
