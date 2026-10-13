import type { Prisma } from "@prisma/client";
type Identity = {
  company_firm_name?: unknown;
  contact_person_name?: unknown;
  designation?: unknown;
  partner_code?: unknown;
  mobile_number?: unknown;
  gst_no?: unknown;
};
const normalized = (value: unknown) =>
  typeof value === "string"
    ? value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase()
    : "";
function sameCompany(a: Identity, b: Identity) {
  const name = normalized(a.company_firm_name);
  const gst = normalized(a.gst_no);
  return (!!name && name === normalized(b.company_firm_name)) || (!!gst && gst === normalized(b.gst_no));
}
export function samePartnerIdentity(a: Identity, b: Identity) {
  return sameCompany(a, b) && ["contact_person_name", "designation"].every(key => {
    const value = normalized(a[key as keyof Identity]);
    return !!value && value === normalized(b[key as keyof Identity]);
  });
}
export function isPartnerImportDuplicate(a: Identity, b: Identity) {
  // Codes identify a record, regardless of contact changes. Never reuse a code.
  if (a.partner_code && a.partner_code === b.partner_code) return true;
  if (sameCompany(a, b))
    return samePartnerIdentity(a, b);
  return (
    (!!a.mobile_number && a.mobile_number === b.mobile_number) ||
    (!!a.gst_no && a.gst_no === b.gst_no)
  );
}
export async function findPartnerIdentityDuplicate(
  tx: Prisma.TransactionClient,
  input: Identity,
  excludeId?: string,
) {
  const partners = await tx.partner.findMany({
    where: excludeId ? { id: { not: excludeId } } : {},
    select: {
      id: true,
      company_firm_name: true,
      contact_person_name: true,
      designation: true,
      gst_no: true,
    },
  });
  return partners.find((p) => samePartnerIdentity(input, p));
}
