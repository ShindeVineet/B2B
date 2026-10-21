import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { addDays, dateOnly, todayIndia } from "@/lib/phase5/calendar";
import { channelFor, CHANNELS } from "@/lib/dashboard/metrics";
import { failure, RequestError } from "@/lib/phase5/http";

const PAGE_SIZE = 25;
const range = (date: string) => ({
  gte: new Date(`${date}T00:00:00+05:30`),
  lt: new Date(`${addDays(date, 1)}T00:00:00+05:30`),
});
const level = (value?: string | null) => {
  const normalized = value?.toLowerCase();
  return normalized === "high" ? "hot" : normalized === "medium" ? "warm" : normalized === "low" ? "cold" : "unclassified";
};
const groupCreated = (row: { action: string; old_value: string | null; new_value: string | null }) => {
  if (row.action === "GROUP_CREATED_UPDATED") return row.old_value !== "true" && row.new_value === "true";
  if (row.action !== "CALLING_CONSULTATION_LOGGED") return false;
  try {
    const before = JSON.parse(row.old_value || "{}"), after = JSON.parse(row.new_value || "{}");
    return before.whatsapp_group_created !== true && after.whatsapp_group_created === true;
  } catch { return false; }
};

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user || !["b2b_head", "super_admin"].includes(user.role)) throw new RequestError("Forbidden", 403);
    const date = dateOnly(req.nextUrl.searchParams.get("date") || todayIndia());
    const day = range(date);
    const section = req.nextUrl.searchParams.get("section");
    const page = Math.max(1, Math.floor(Number(req.nextUrl.searchParams.get("page"))) || 1);
    const pagination = { skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE };

    if (section === "leads") {
      const where = { created_at: day };
      const [rows, total] = await Promise.all([
        prisma.lead.findMany({ where, select: { id: true, lead_code: true, company_name: true, owner_name: true, phone_no: true, lead_source: true, intake_team: true, status: true, created_at: true }, orderBy: [{ created_at: "desc" }, { id: "desc" }], ...pagination }),
        prisma.lead.count({ where }),
      ]);
      return NextResponse.json({ date, section, rows, total, page, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) });
    }
    if (section === "consultations") {
      const where = { created_at: day };
      const [records, total] = await Promise.all([
        prisma.consultation.findMany({ where, include: { lead: { select: { lead_code: true, company_name: true, lead_source: true, intake_team: true } }, rep: { select: { name: true, role: true } } }, orderBy: [{ created_at: "desc" }, { id: "desc" }], ...pagination }),
        prisma.consultation.count({ where }),
      ]);
      const rows = records.map(row => ({ id: row.id, lead_id: row.lead_id, lead_code: row.lead.lead_code, company_name: row.lead.company_name, staff: row.rep.name, channel: channelFor({ ...row, ...row.lead, rep_role: row.rep.role }), interest_level: row.interest_level, outcome: row.outcome, created_at: row.created_at }));
      return NextResponse.json({ date, section, rows, total, page, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) });
    }
    if (section === "calls") {
      const where = { created_at: day };
      const [rows, total] = await Promise.all([
        prisma.callLog.findMany({ where, select: { id: true, lead_id: true, outcome: true, notes: true, created_at: true, actor: { select: { name: true } }, lead: { select: { lead_code: true, company_name: true } } }, orderBy: [{ created_at: "desc" }, { id: "desc" }], ...pagination }),
        prisma.callLog.count({ where }),
      ]);
      return NextResponse.json({ date, section, rows: rows.map(row => ({ ...row, staff: row.actor.name, lead_code: row.lead.lead_code, company_name: row.lead.company_name })), total, page, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) });
    }
    if (section === "groups") {
      const events = (await prisma.activityLog.findMany({ where: { created_at: day, action: { in: ["GROUP_CREATED_UPDATED", "CALLING_CONSULTATION_LOGGED"] } }, select: { id: true, lead_id: true, action: true, old_value: true, new_value: true, created_at: true, actor: { select: { name: true } }, lead: { select: { lead_code: true, company_name: true } } }, orderBy: [{ created_at: "desc" }, { id: "desc" }] })).filter(groupCreated);
      const rows = events.slice(pagination.skip, pagination.skip + PAGE_SIZE);
      return NextResponse.json({ date, section, rows: rows.map(row => ({ ...row, staff: row.actor?.name || "System", lead_code: row.lead.lead_code, company_name: row.lead.company_name })), total: events.length, page, totalPages: Math.max(1, Math.ceil(events.length / PAGE_SIZE)) });
    }
    if (section === "onboarded") {
      const where = { partner_status: "active" as const, OR: [{ created_at: day }, { reviewed_at: day }] };
      const [rows, total] = await Promise.all([
        prisma.partner.findMany({ where, select: { id: true, partner_code: true, company_firm_name: true, contact_person_name: true, lead_gen_source: true, created_at: true, reviewed_at: true, submitter: { select: { name: true } }, reviewer: { select: { name: true } } }, orderBy: [{ updated_at: "desc" }, { id: "desc" }], ...pagination }),
        prisma.partner.count({ where }),
      ]);
      return NextResponse.json({ date, section, rows, total, page, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) });
    }

    const [totalLeads, sources, consultations, calls, groupEvents, onboarded] = await Promise.all([
      prisma.lead.count({ where: { created_at: day } }),
      prisma.lead.groupBy({ by: ["lead_source"], where: { created_at: day }, _count: { _all: true }, orderBy: { _count: { lead_source: "desc" } } }),
      prisma.consultation.findMany({ where: { created_at: day }, select: { id: true, lead_id: true, interest_level: true, interaction_channel: true, direct_store_meeting: true, trip_lead_id: true, rep: { select: { id: true, name: true, role: true } }, lead: { select: { lead_source: true, intake_team: true } } } }),
      prisma.callLog.findMany({ where: { created_at: day }, select: { outcome: true, actor: { select: { id: true, name: true } } } }),
      prisma.activityLog.findMany({ where: { created_at: day, action: { in: ["GROUP_CREATED_UPDATED", "CALLING_CONSULTATION_LOGGED"] } }, select: { action: true, old_value: true, new_value: true } }),
      prisma.partner.count({ where: { partner_status: "active", OR: [{ created_at: day }, { reviewed_at: day }] } }),
    ]);
    const channelRows = Object.entries(CHANNELS).map(([key, label]) => ({ key, label, total: 0, hot: 0, warm: 0, cold: 0, unclassified: 0 }));
    const staff = new Map<string, { id: string; name: string; total: number; hot: number; warm: number; cold: number; unclassified: number }>();
    for (const record of consultations) {
      const channel = channelFor({ ...record, ...record.lead, rep_role: record.rep.role });
      const channelRow = channelRows.find(row => row.key === channel)!;
      const bucket = level(record.interest_level);
      channelRow.total++; channelRow[bucket]++;
      const person = staff.get(record.rep.id) || { id: record.rep.id, name: record.rep.name, total: 0, hot: 0, warm: 0, cold: 0, unclassified: 0 };
      person.total++; person[bucket]++; staff.set(record.rep.id, person);
    }
    const callStaff = new Map<string, { id: string; name: string; called: number; picked: number }>();
    for (const call of calls) {
      const person = callStaff.get(call.actor.id) || { id: call.actor.id, name: call.actor.name, called: 0, picked: 0 };
      person.called++; if (call.outcome === "Call picked") person.picked++; callStaff.set(call.actor.id, person);
    }
    // Call outcomes belong to the day of the call, even when the consultation is older.
    const callerInterest = { key: "caller", label: CHANNELS.caller, total: 0, hot: 0, warm: 0, cold: 0, unclassified: 0 };
    for (const event of groupEvents) {
      if (event.action !== "CALLING_CONSULTATION_LOGGED") continue;
      try {
        const value = JSON.parse(event.new_value || "{}");
        callerInterest.total++; callerInterest[level(value.interest_level)]++;
      } catch { /* Preserve malformed historical audit records without counting them. */ }
    }
    return NextResponse.json({ date, totals: { leads: totalLeads, consultations: consultations.length, calls: calls.length, callsPicked: calls.filter(call => call.outcome === "Call picked").length, groups: groupEvents.filter(groupCreated).length, onboarded }, sources: sources.map(row => ({ source: row.lead_source || "Not recorded", count: row._count._all })), channels: channelRows.filter(row => ["ground", "store", "caller"].includes(row.key)), staff: [...staff.values()].sort((a, b) => b.total - a.total), callStaff: [...callStaff.values()].sort((a, b) => b.called - a.called), callerInterest, rates: { picked: calls.length ? Math.round(calls.filter(call => call.outcome === "Call picked").length / calls.length * 100) : 0, consultationToOnboarded: consultations.length ? Math.round(onboarded / consultations.length * 100) : 0 } });
  } catch (error) { return failure(error); }
}
