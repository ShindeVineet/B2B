import test from "node:test";
import assert from "node:assert/strict";
import { parsePartnerImportDate } from "../src/lib/partners/import-date";

test("Historical partner form timestamps preserve India local time", () => {
  assert.equal(parsePartnerImportDate("21/01/2026 16:40:00")?.toISOString(), "2026-01-21T11:10:00.000Z");
  assert.equal(parsePartnerImportDate("21/01/2026 16:40")?.toISOString(), "2026-01-21T11:10:00.000Z");
  assert.equal(parsePartnerImportDate("2026-01-21T11:10:00Z")?.toISOString(), "2026-01-21T11:10:00.000Z");
  assert.equal(parsePartnerImportDate("") , null);
});

test("Invalid historical timestamps are rejected instead of rolling over", () => {
  for (const value of ["31/02/2026 16:40:00", "21/01/2026 24:00:00", "21/01/2026 16:60:00"])
    assert.throws(() => parsePartnerImportDate(value));
});
