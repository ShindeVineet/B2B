export const LEAD_TYPES = [
  "Architect",
  "Interior Designer",
  "Builder",
  "Contractor",
  "Other",
];
export const LEAD_OUTCOMES = [
  "Visit scheduled",
  "Nurturing required",
  "Dont want commission",
  "Lost Lead - (does not do tiles business)",
  "Wrong location",
  "Office closed",
];
export const CHECKLIST = [
  "Florzy Pitched",
  "Florzy USP's Pitched",
  "Partnership Benefits Pitched",
  "Shared Catelogue on their WA",
  "Shared On boarding Form on their WA",
  "Given our Florzy Visiting Card",
  "Taken Physical Visiting Card",
  "Referral Contact Received from Prospect",
  "SKU requirement asked/recieved by the client on spot",
  "Removed from office/Not interested",
];
export type FieldDefinition = {
  key: string;
  label: string;
  type: string;
  required: boolean;
  options?: string[];
  max_files?: number;
  required_when?: { field: string; values: string[] };
};
export const CONSULTATION_FIELDS: FieldDefinition[] = [
  {
    key: "alternate_mobile_number",
    label: "Alternate Mobile Number",
    type: "text",
    required: false,
  },
  {
    key: "decision_maker_name",
    label: "Decision Maker Name",
    type: "text",
    required: true,
  },
  { key: "company_name", label: "Company name", type: "text", required: true },
  {
    key: "decision_maker_phone",
    label: "Mobile Number",
    type: "text",
    required: true,
  },
  { key: "designation", label: "Designation", type: "text", required: true },
  {
    key: "lead_type",
    label: "Lead Type",
    type: "select",
    required: true,
    options: LEAD_TYPES,
  },
  {
    key: "interest_level",
    label: "Interest Level",
    type: "select",
    required: true,
    options: ["High", "Medium", "Low"],
  },
  {
    key: "outcome",
    label: "Lead Outcome",
    type: "select",
    required: true,
    options: LEAD_OUTCOMES,
  },
  { key: "visit_date", label: "Shop Visit date", type: "date", required: true },
  {
    key: "primary_pain_point",
    label: "Primary Pain Point Observed",
    type: "multi_select",
    required: false,
    options: [
      "Delivery delay",
      "High price",
      "Limited designs",
      "Poor service",
      "No credit support",
      "Already Partner with other companies (Add company name in notes)",
      "Other",
    ],
  },
  {
    key: "competitor_involved",
    label: "Competitor Involved",
    type: "multi_select",
    required: false,
    options: [
      "Kajaria",
      "Mytiles",
      "Material Depot",
      "Somany",
      "Nitco",
      "Johnson",
      "Others",
    ],
  },
  {
    key: "site_photos",
    label: "Site Photo",
    type: "photo",
    required: true,
    max_files: 5,
  },
  {
    key: "ground_staff_name",
    label: "Name of Ground Staff",
    type: "select",
    required: true,
    options: ["Sumesh", "Indranil", "Shinoy", "Vineet", "Navjot"],
  },
  { key: "notes", label: "Notes", type: "long_text", required: false },
  {
    key: "visiting_card_photos",
    label: "Visiting Card Photo",
    type: "photo",
    required: false,
    max_files: 2,
  },
  {
    key: "next_follow_up_date",
    label: "Next Follow-up Date",
    type: "date",
    required: false,

  },
];
