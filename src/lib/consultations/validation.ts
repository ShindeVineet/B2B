import { dateOnly, todayIndia } from "../phase5/calendar";
import type { FieldDefinition } from "./fields";
export function validateResponses(
  fields: FieldDefinition[],
  raw: Record<string, unknown>,
  staffName: string,
  admin: boolean,
) {
  const responses: Record<string, string | string[]> = {};
  for (const f of fields) {
    let value = raw[f.key];
    if (f.key === "ground_staff_name" && !admin) value = staffName;
    const required =
      f.required ||
      !!(
        f.required_when &&
        f.required_when.values.includes(
          String(raw[f.required_when.field] || ""),
        )
      );
    if (f.type === "multi_select" || f.type === "photo") {
      if (value === undefined || value === null) value = [];
      if (
        !Array.isArray(value) ||
        value.some((v) => typeof v !== "string") ||
        new Set(value).size !== value.length
      )
        throw new RangeError(`${f.label}: invalid selection`);
      if (required && !value.length)
        throw new RangeError(`${f.label} is required`);
      if (
        f.type === "multi_select" &&
        value.some((v) => !f.options?.includes(v))
      )
        throw new RangeError(`${f.label}: unknown selection`);
      if (
        f.type === "photo" &&
        (value.length > (f.max_files || 5) ||
          value.some((v) => !/^\/api\/photos\/[a-z0-9-]+$/i.test(v)))
      )
        throw new RangeError(`${f.label}: invalid photo attachment`);
      responses[f.key] = value;
    } else {
      if (value == null) value = "";
      if (typeof value !== "string" || value.length > 10000)
        throw new RangeError(`${f.label}: invalid value`);
      const stringValue = value.trim();
      if (f.key === "alternate_mobile_number" && stringValue && (!/^\+?[\d\s().-]+$/.test(stringValue) || !/^\d{7,15}$/.test(stringValue.replace(/\D/g,""))))
        throw new RangeError("Enter a valid alternate mobile number (7–15 digits)");
      if (required && !stringValue)
        throw new RangeError(`${f.label} is required`);
      if (
        stringValue &&
        f.type === "select" &&
        !f.options?.includes(stringValue) &&
        !(f.key === "ground_staff_name" && stringValue === staffName)
      )
        throw new RangeError(`${f.label}: choose an available option`);
      if (stringValue && f.type === "date") dateOnly(stringValue);
      if (f.key === "next_follow_up_date" && stringValue && stringValue < todayIndia()) throw new RangeError("Follow-up date must be today or later");
      responses[f.key] = stringValue;
    }
  }
  return responses;
}
