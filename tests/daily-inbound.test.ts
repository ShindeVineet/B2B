import test from "node:test";
import assert from "node:assert/strict";
import { dailyInbound, dailyReportRange } from "../src/lib/dashboard/daily-inbound";
const at = "2026-10-26T06:00:00Z";
const call = (id: string) => ({ id, lead_id: "lead", created_at: at });
const event = (call_id: string, consultation_id: string, interest_level = "High") => ({ action: "CALLING_CONSULTATION_LOGGED", new_value: JSON.stringify({ call_id, consultation_id, interest_level }) });
test("inbound includes today's repeat calls on older consultations using the call's recorded interest", () => {
  const rows = dailyInbound([], [call("first"), call("second"), call("missed")], [event("first", "old", "High"), event("second", "old", "Low")]);
  assert.equal(rows.length, 3);
  assert.equal(rows.find(r => r.id === "first")?.interest_level, "High");
  assert.equal(rows.find(r => r.id === "second")?.interest_level, "Low");
  assert.equal(rows.find(r => r.id === "missed")?.interest_level, null);
});
test("a call and its new consultation count once; standalone calling consultations remain included", () => {
  const consultations = [
    { ...call("new"), channel: "caller", interest_level: "High" },
    { ...call("standalone"), channel: "caller", interest_level: "Medium" },
    { ...call("ground"), channel: "ground", interest_level: "High" },
  ];
  const rows = dailyInbound(consultations, [call("logged")], [event("logged", "new")]);
  assert.deepEqual(new Set(rows.map(r => r.id)), new Set(["logged", "standalone"]));
  assert.equal(rows.find(r => r.id === "standalone")?.interest_level, "Medium");
});
test("legacy office calls and malformed audit records still count without borrowing current interest", () => {
  const rows = dailyInbound([], [call("office"), call("bad-audit")], [
    { action: "OFFICE_CALL_LOGGED", new_value: JSON.stringify({ call_id: "office", consultation_id: "old" }) },
    { action: "CALLING_CONSULTATION_LOGGED", new_value: "{" },
  ]);
  assert.equal(rows.length, 2);
  assert.ok(rows.every(row => row.interest_level === null));
});
test("an unrelated audit cannot remove a standalone consultation", () => {
  assert.equal(dailyInbound([{ ...call("standalone"), channel: "caller" }], [], [event("missing-call", "standalone")]).length, 1);
});
test("daily calls use IST midnight inclusive and next midnight exclusive", () => {
  const range = dailyReportRange("2026-10-26");
  assert.equal(range.gte.toISOString(), "2026-10-25T18:30:00.000Z");
  assert.equal(range.lt.toISOString(), "2026-10-26T18:30:00.000Z");
});
