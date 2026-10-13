import type { Prisma } from "@prisma/client";
/** Lead codes are joined for display, never copied into audit payloads. */
export function partnerAuditValue(value: object): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify(
      Object.fromEntries(
        Object.entries(value).filter(([key]) => key !== "source_lead_code"),
      ),
    ),
  );
}
