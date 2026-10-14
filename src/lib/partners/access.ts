import { prisma } from "@/lib/prisma";
import type { AuthUser } from "@/lib/auth";
import { matchPartnerRegion } from "./regions";
import { RequestError } from "@/lib/phase5/http";
export const partnerInclude = {
  phones: true,
  referred_by: { select: { partner_code: true, company_firm_name: true, contact_person_name: true } },
  source_lead: { select: { company_name: true, owner_name: true, store: { select: { region: true } } } },
} as const;
export const canAdministerPartners = (u: AuthUser) =>
  ["b2b_head", "analyst"].includes(u.role);
export const canReviewPartners = (u: AuthUser) =>
  ["b2b_head", "regional_manager"].includes(u.role);
export async function visiblePartners(u: AuthUser) {
  const [partners, stores, cities] = await Promise.all([
    prisma.partner.findMany({
      include: partnerInclude,
      orderBy: { created_at: "desc" },
    }),
    prisma.store.findMany({ select: { pin_code: true, region: true } }),
    prisma.partnerCityRegion.findMany(),
  ]);
  return partners
    .map((p) => ({
      ...p,
      matched_region: matchPartnerRegion(p, stores, cities),
    }))
    .filter(
      (p) =>
        ["b2b_head", "regional_manager"].includes(u.role) ||
        p.submitted_by === u.id ||
        (["ground_rep", "store_associate"].includes(u.role) &&
          p.partner_status === "active"),
    );
}
export async function requirePartner(u: AuthUser, id: string) {
  const p = (await visiblePartners(u)).find((p) => p.id === id);
  if (!p) {
    const own = await prisma.partner.findFirst({
      where: {
        id,
        submitted_by: u.id,
        partner_status: { in: ["pending_review", "rejected"] },
      },
      include: partnerInclude,
    });
    if (own && u.role !== "regional_manager")
      return { ...own, matched_region: null };
  }
  if (!p) throw new RequestError("Partner not found", 404);
  return p;
}
