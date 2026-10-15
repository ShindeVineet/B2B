import test from "node:test";
import assert from "node:assert/strict";
import {
  CONSULTATION_FIELDS,
  CHECKLIST,
} from "../src/lib/consultations/fields";
import { validateResponses } from "../src/lib/consultations/validation";
import {
  coldReasons,
  DEFAULT_COLD_CONFIG,
  EXCLUDED_OUTCOMES,
} from "../src/lib/cold/rules";
const raw = {
  decision_maker_name: "Owner",
  company_name: "Company",
  decision_maker_phone: "1234567890",
  designation: "Director",
  lead_type: "Architect",
  interest_level: "High",
  current_lead_status: "Fresh Lead - After Pre-qualification",
  outcome: "Dont want commission",
  visit_date: "2026-09-28",
  site_photos: ["/api/photos/abc123"],
  ground_staff_name: "Spoofed",
  checklist: [CHECKLIST[0]],
};
test("Updated 16 fields, staff identity enforced and nullable legacy fields allowed", () => {
  assert.equal(CONSULTATION_FIELDS.length, 16);
  const r = validateResponses(CONSULTATION_FIELDS, raw, "Rajesh Kumar", false);
  assert.equal(r.ground_staff_name, "Rajesh Kumar");
  assert.deepEqual(r.visiting_card_photos, []);
  assert.equal(r.notes, "");
});
test("Site photo requirements are enforced; follow-ups are independent from store appointments", () => {
  for (const patch of [
    { site_photos: [] },
    {
      visiting_card_photos: ["/api/photos/a", "/api/photos/b", "/api/photos/c"],
    },
  ])
    assert.throws(() =>
      validateResponses(
        CONSULTATION_FIELDS,
        { ...raw, ...patch },
        "Sumesh",
        false,
      ),
    );
  assert.doesNotThrow(() =>
    validateResponses(
      CONSULTATION_FIELDS,
      { ...raw, outcome: "Visit scheduled", next_follow_up_date: "2099-10-01" },
      "Sumesh",
      false,
    ),
  );
});
test("Cold rules are OR-ed, configurable and final/data correction outcomes excluded", () => {
  assert.equal(
    coldReasons(
      { outcome: "Visit scheduled", interest_level: "Low", checklist: null },
      DEFAULT_COLD_CONFIG,
    ).length,
    1,
  );
  assert.equal(
    coldReasons(
      {
        outcome: "Visit scheduled",
        interest_level: "High",
        checklist: [CHECKLIST[9]],
      },
      DEFAULT_COLD_CONFIG,
    ).length,
    1,
  );
  for (const outcome of EXCLUDED_OUTCOMES)
    assert.deepEqual(
      coldReasons(
        { outcome, interest_level: "Low", checklist: [CHECKLIST[9]] },
        DEFAULT_COLD_CONFIG,
      ),
      [],
    );
  assert.deepEqual(
    coldReasons(
      {
        outcome: "Dont want commission",
        interest_level: "Low",
        checklist: [CHECKLIST[9]],
      },
      { outcome_rule: false, checklist_rule: false, low_interest_rule: false },
    ),
    [],
  );
});

test("Removed fields are not submitted; nurturing follow-ups are retained and onboarding outcome is rejected", () => {
 const r = validateResponses(CONSULTATION_FIELDS, {...raw, outcome: "Nurturing required", next_follow_up_date: "2026-12-01"}, "Rep", false);
 assert.equal(r.next_follow_up_date, "2026-12-01");
 for (const key of ["email", "current_lead_status", "checklist"]) assert.equal(r[key], undefined);
 assert.throws(() => validateResponses(CONSULTATION_FIELDS, {...raw, outcome: "On-boarding Done"}, "Rep", false));
});

test("optional alternate mobile validates and persists separately",()=>{
 assert.equal(validateResponses(CONSULTATION_FIELDS,{...raw,alternate_mobile_number:"+91 9876543210"},"Rep",false).alternate_mobile_number,"+91 9876543210");
 assert.throws(()=>validateResponses(CONSULTATION_FIELDS,{...raw,alternate_mobile_number:"abc"},"Rep",false));
});

test("pain points and competitors accept multiple known selections", () => {
  const result = validateResponses(
    CONSULTATION_FIELDS,
    {
      ...raw,
      primary_pain_point: ["Delivery delay", "High price"],
      competitor_involved: ["Kajaria", "Somany"],
    },
    "Rep",
    false,
  );
  assert.deepEqual(result.primary_pain_point, ["Delivery delay", "High price"]);
  assert.deepEqual(result.competitor_involved, ["Kajaria", "Somany"]);
  assert.throws(() => validateResponses(
    CONSULTATION_FIELDS,
    { ...raw, competitor_involved: ["Unknown competitor"] },
    "Rep",
    false,
  ));
});
