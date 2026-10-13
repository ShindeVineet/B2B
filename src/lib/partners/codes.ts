import type { Prisma } from "@prisma/client";
export function formatPartnerCode(
  sequence: bigint | number,
  prefix = "FLZ-P-",
) {
  if (!/^[A-Za-z0-9_-]{1,30}$/.test(prefix))
    throw new RangeError("Invalid partner code prefix");
  return prefix + String(sequence).padStart(4, "0");
}
export async function nextPartnerCode(tx: Prisma.TransactionClient) {
  const [row] = await tx.$queryRaw<{ code: string }[]>`SELECT next_partner_code() AS code`;
  return row.code;
}
