import { isWonLead } from "@/lib/leads/interest-bucket";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { failure, RequestError } from "@/lib/phase5/http";
import { todayIndia, dateOnly } from "@/lib/phase5/calendar";
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser(req);
    if (
      !user ||
      ![
        "ground_rep",
        "regional_manager",
        "b2b_head",
        "store_associate",
      ].includes(user.role)
    )
      throw new RequestError("Forbidden", 403);
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const target = body.date ? dateOnly(body.date) : todayIndia();
    if (target < todayIndia())
      throw new RequestError("Choose today or a future date");
    const outcomes = [
      "Ready for onboarding",
      "Follow-up needed",
      "Not interested",
      "Couldn't meet",
    ];
    if (
      body.outcome &&
      (!outcomes.includes(body.outcome) || target !== todayIndia())
    )
      throw new RequestError("Choose a valid outcome for today’s revisit");
    if (
      body.notes != null &&
      (typeof body.notes !== "string" || body.notes.length > 2000)
    )
      throw new RequestError("Notes must be at most 2,000 characters");
    const followDate = body.next_follow_up_date
      ? dateOnly(body.next_follow_up_date)
      : null;
    if (followDate && followDate < todayIndia())
      throw new RequestError("Choose today or a future follow-up date");
    if (body.outcome === "Follow-up needed" && !followDate)
      throw new RequestError("Choose the next follow-up date");
    const visit = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM leads WHERE id=${id} FOR UPDATE`;
      const lead = await tx.lead.findFirst({
        include: { partners: { select: { partner_status: true } } },
        where: {
          id,
          OR: [
            { assigned_ground_rep_id: user.id },
            { intake_team: { in: ["store", "head", "caller"] }, calling_associate_id: user.id },
          ],
        },
      });
      if (!lead)
        throw new RequestError(
          "Only the team member currently assigned this lead can log a revisit",
          403,
        );
      if (isWonLead(lead)) throw new RequestError("Onboarded leads cannot log revisits", 409);
      const previous = await tx.consultation.findFirst({
        where: { lead_id: id },
        orderBy: { created_at: "desc" },
      });
      if (!previous)
        throw new RequestError(
          "Use the consultation form for the first visit",
          409,
        );
      // Store walk-in follow-ups are consultations/reminders, not ground route visits.
      if (
        ["store", "head", "caller"].includes(lead.intake_team) &&
        lead.calling_associate_id === user.id &&
        lead.assigned_ground_rep_id !== user.id
      ) {
        if (target === todayIndia() && !body.outcome)
          throw new RequestError("Choose a revisit outcome");
        if (target === todayIndia())
          await tx.consultation.create({
            data: {
              lead_id: id,
              rep_id: user.id,
              company_name: lead.company_name,
              ground_staff_name: user.name,
              decision_maker_name: previous.decision_maker_name,
              decision_maker_phone: previous.decision_maker_phone,
              interest_level: previous.interest_level,
              outcome: body.outcome,
              notes: body.notes?.trim() || null,
              next_follow_up_date: followDate ? new Date(followDate) : null,
              responses: { kind: "revisit", channel: "walk_in" },
            },
          });
        const due = target > todayIndia() ? target : followDate;
        if (due)
          await tx.followUp.upsert({
            where: { lead_id: id },
            create: {
              lead_id: id,
              rep_id: user.id,
              due_date: new Date(due),
              active: true,
            },
            update: { rep_id: user.id, due_date: new Date(due), active: true },
          });
        await tx.activityLog.create({
          data: {
            lead_id: id,
            actor_id: user.id,
            action:
              target > todayIndia() ? "REVISIT_SCHEDULED" : "REVISIT_LOGGED",
            new_value: JSON.stringify({
              channel: "walk_in",
              date: target,
              outcome: body.outcome,
              notes: body.notes || null,
            }),
          },
        });
        return { id: null };
      }
      const finish = async (v: { id: string }) => {
        if (!body.outcome) return v;
        await tx.consultation.create({
          data: {
            lead_id: id,
            rep_id: user.id,
            trip_lead_id: v.id,
            visit_date: new Date(),
            outcome: body.outcome,
            notes: body.notes?.trim() || null,
            interest_level: previous.interest_level,
            decision_maker_name: previous.decision_maker_name,
            decision_maker_phone: previous.decision_maker_phone,
            designation: previous.designation,
            email: previous.email,
            lead_type: previous.lead_type,
            company_name: lead.company_name,
            next_follow_up_date: followDate ? new Date(followDate) : null,
            responses: {
              kind: "revisit",
              outcome: body.outcome,
              notes: body.notes?.trim() || "",
            },
          },
        });
        await tx.tripLead.update({
          where: { id: v.id },
          data: { completed: true, status: "visited" },
        });
        if (followDate)
          await tx.followUp.upsert({
            where: { lead_id: id },
            create: {
              lead_id: id,
              rep_id: user.id,
              due_date: new Date(followDate),
            },
            update: {
              rep_id: user.id,
              due_date: new Date(followDate),
              active: true,
            },
          });
        await tx.activityLog.create({
          data: {
            lead_id: id,
            actor_id: user.id,
            action: "REVISIT_LOGGED",
            old_value: v.id,
            new_value: JSON.stringify({
              outcome: body.outcome,
              notes: body.notes || null,
              next_follow_up_date: followDate,
            }),
          },
        });
        return v;
      };
      const today = target;
      const pending = await tx.tripLead.findFirst({
        where: {
          lead_id: id,
          completed: false,
          status: { in: ["pending", "rescheduled"] },
        },
        include: { trip: true },
        orderBy: { created_at: "desc" },
      });
      if (pending) {
        if (
          pending.trip.ground_rep_id === user.id &&
          dateOnly(pending.scheduled_date) === today &&
          ["active", "published"].includes(pending.trip.status)
        )
          return finish(pending);
        throw new RequestError(
          `A visit is already scheduled for ${dateOnly(pending.scheduled_date)}. Use or reschedule that visit first.`,
          409,
        );
      }
      if (!(await tx.consultation.count({ where: { lead_id: id } })))
        throw new RequestError(
          "No previous consultation exists. Use Log Visit for the first visit.",
          409,
        );
      const plan = await tx.tripPlan.create({
        data: {
          name: `Revisit — ${lead.company_name}`,
          ground_rep_id: user.id,
          start_date: new Date(today),
          end_date: new Date(today),
          leads_per_day: 1,
          status: "active",
        },
      });
      const created = await tx.tripLead.create({
        data: {
          trip_id: plan.id,
          lead_id: id,
          route_id: null,
          scheduled_date: new Date(today),
          sequence_order: 1,
        },
      });
      await tx.lead.update({
        where: { id },
        data: { assigned_visit_date: new Date(target) },
      });
      await tx.activityLog.create({
        data: {
          lead_id: id,
          actor_id: user.id,
          action:
            target === todayIndia() ? "REVISIT_STARTED" : "REVISIT_SCHEDULED",
          new_value: JSON.stringify({ trip_lead_id: created.id, date: today }),
        },
      });
      return finish(created);
    });
    return NextResponse.json({ trip_lead_id: visit.id, date: target });
  } catch (e) {
    return failure(e);
  }
}
