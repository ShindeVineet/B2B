import test from "node:test";
import assert from "node:assert/strict";
import { latestContact, callingPriority } from "../src/lib/last-contact";
test("last contact chooses latest actual record and handles no contact", () => {
  assert.equal(latestContact(null, undefined), null);
  assert.equal(
    latestContact("2026-10-01", "2026-10-03", "invalid"),
    "2026-10-03T00:00:00.000Z",
  );
});
test("calling prioritises due reminders, never contacted, oldest contact, then future reminders", () => {
  const leads = [
    { id: "recent", last_contact_at: "2026-10-06" },
    { id: "future", next_follow_up_date: "2026-10-10" },
    { id: "never" },
    { id: "old", last_contact_at: "2026-09-01" },
    { id: "due", next_follow_up_date: "2026-10-05" },
  ];
  assert.deepEqual(
    leads.sort((a, b) => callingPriority(a, b, "2026-10-07")).map((l) => l.id),
    ["due", "never", "old", "recent", "future"],
  );
});
