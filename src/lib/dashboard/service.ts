import { prisma } from "@/lib/prisma";
import type { AuthUser } from "@/lib/auth";
import { getLeadFilterForUser } from "@/lib/permissions";
import { channelFor, summarizeChannels, latestByLead, onboardingChannel } from "./metrics";
import type { Prisma } from "@prisma/client";
export function dashboardScope(user: AuthUser): Prisma.LeadWhereInput {
  const scope = getLeadFilterForUser(user);
  if (user.role !== "store_associate") return scope;
  return { AND: [scope, { OR: [{ calling_associate_id: user.id }, ...(user.store_id ? [{ assigned_store_id: user.store_id, intake_team: { in: ["store", "caller"] } }] : [])] }] };
}
export async function dashboardOverview(user: AuthUser) {
  const where = dashboardScope(user);
  const [leads, consultations, partners] = await Promise.all([
    prisma.lead.findMany({ where, select: { id: true, intake_team: true, lead_source: true, assigned_ground_rep_id: true, whatsapp_group_created: true } }),
    prisma.consultation.findMany({ where: { lead: where }, include: { lead: { select: { intake_team: true, lead_source: true } }, rep: { select: { role: true } } } }),
    prisma.partner.findMany({ where: { partner_status: { in: ["active", "pending_review"] }, ...(user.role === "store_associate" || user.role === "ground_rep" || user.role === "analyst" ? { OR: [{ source_lead: where }, { submitted_by: user.id }] } : {}) }, include: { source_lead: { select: { intake_team: true, lead_source: true } } } }),
  ]);
  const associate = user.role === "store_associate";
  const records = consultations.map(c => ({ ...c, channel: associate ? (c.interaction_channel !== "caller" && (c.direct_store_meeting || c.lead.intake_team === "store") ? "store" as const : "caller" as const) : channelFor({ ...c, ...c.lead, rep_role: c.rep.role }) }));
  const recent = new Map(latestByLead(records).map(c => [c.lead_id, c]));
  const active = partners.filter(p => p.partner_status === "active").map(p => ({ id: p.id, channel: associate ? (p.source_lead?.intake_team === "caller" ? "caller" as const : "store" as const) : onboardingChannel(p.lead_gen_source, p.lead_gen_source_other, p.source_lead_id && recent.get(p.source_lead_id)?.channel || channelFor(p.source_lead || {})) }));
  const groupIds = new Set(leads.filter(l => l.whatsapp_group_created).map(l => l.id));
  for (const p of partners) if (p.whatsapp_group_created) groupIds.add(p.source_lead_id || `partner:${p.id}`);
  return { ...summarizeChannels(records, active), onboardedWithoutConsultations: partners.filter(p => p.partner_status === "active" && (!p.source_lead_id || !recent.has(p.source_lead_id))).length, groups: groupIds.size, totalLeads: leads.length, assigned: leads.filter(l => l.assigned_ground_rep_id).length, warmLeads: [...recent.values()].filter(c => c.interest_level?.toLowerCase() === "medium").length, callLeads: leads.filter(l => l.intake_team === "caller").length, walkInLeads: leads.filter(l => l.intake_team === "store").length };
}
