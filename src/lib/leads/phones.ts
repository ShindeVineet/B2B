/** Split mapped phone columns in their selected order, retaining the first as primary.
 * Preserve formatting and country codes; ignore punctuation only for deduplication.
 */
export function parseLeadPhones(columns: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const phones: string[] = [];
  for (const column of columns) {
    if (column == null || column === "") continue;
    if (typeof column !== "string" && typeof column !== "number")
      throw new RangeError("Phone columns must contain text or numbers");
    if (
      typeof column === "number" &&
      (!Number.isSafeInteger(column) || column < 0)
    )
      throw new RangeError(
        "Invalid numeric phone cell; import the number as text",
      );
    for (const part of String(column).split(/[,;]/)) {
      const phone = part.trim();
      if (!phone) continue;
      if (!/^\+?[\d\s().-]+$/.test(phone) || !/\d/.test(phone))
        throw new RangeError(`Invalid phone number: ${phone}`);
      const key = phone.replace(/\D/g, "");
      if (!seen.has(key)) {
        seen.add(key);
        phones.push(phone);
      }
    }
  }
  return phones;
}
