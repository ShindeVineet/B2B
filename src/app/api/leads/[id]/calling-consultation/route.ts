import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { contactEditFilter } from '@/lib/calling/access';
import { parseCallingConsultation } from '@/lib/consultations/calling';
import { attachConsultationCall } from '@/lib/consultations/call-history';
import { evaluateCold } from '@/lib/cold/service';
import { isWonLead } from '@/lib/leads/interest-bucket';
import { failure, RequestError } from '@/lib/phase5/http';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser(req);
    if (!user || user.role === 'analyst') throw new RequestError('Forbidden', 403);
    const { id } = await params;
    const input = parseCallingConsultation(await req.json());
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM leads WHERE id=${id} FOR UPDATE`;
      const lead = await tx.lead.findFirst({ where: { id, AND: [contactEditFilter(user)] }, include: { partners: { select: { partner_status: true } } } });
      if (!lead) throw new RequestError('Lead not found', 404);
      if (isWonLead(lead) || ['Closed-Lost', 'Lost', 'Closed-Won'].includes(lead.status)) throw new RequestError('Closed leads cannot receive calling consultations', 409);
      const now = new Date();
      const date = input.followUp ? new Date(input.followUp) : null;
      const call = await tx.callLog.create({ data: { lead_id: id, actor_id: user.id, outcome: input.picked ? 'Call picked' : 'Call not picked', notes: input.notes, next_follow_up_date: date } });
      const attached = await attachConsultationCall(tx, id, { call_id: call.id, called_at: call.created_at.toISOString(), caller: user.name, actor_id: user.id, outcome: call.outcome, notes: input.notes, next_follow_up_date: input.followUp, ...(input.picked ? { interest_level: input.interest, whatsapp_group_created: input.group } : {}) });
      const consultation = attached || (input.picked ? await tx.consultation.create({ data: {
        lead_id: id, rep_id: user.id, interaction_channel: 'caller', visit_date: now,
        company_name: lead.company_name, decision_maker_name: lead.owner_name,
        decision_maker_phone: lead.phone_no, ground_staff_name: user.name,
        interest_level: input.interest, outcome: 'Nurturing required', next_follow_up_date: date, notes: input.notes,
        responses: { kind: 'calling', call_picked: true, interest_level: input.interest, next_follow_up_date: input.followUp, whatsapp_group_created: input.group!, notes: input.notes },
      } }) : null);
      const updatedLead = await tx.lead.update({ where: { id }, data: { call_date: now, call_outcome: call.outcome, ...(input.picked ? { whatsapp_group_created: input.group, status: 'Active — Nurturing' } : {}) } });
      if (date) await tx.followUp.upsert({ where: { lead_id: id }, create: { lead_id: id, rep_id: user.id, due_date: date }, update: { rep_id: user.id, due_date: date, active: true } });
      else await tx.followUp.updateMany({ where: { lead_id: id, rep_id: user.id, active: true }, data: { active: false } });
      if (consultation && input.picked) await evaluateCold(tx, updatedLead, consultation, Boolean(attached));
      await tx.activityLog.create({ data: { lead_id: id, actor_id: user.id, action: input.picked ? 'CALLING_CONSULTATION_LOGGED' : 'CALL_NOT_PICKED', old_value: JSON.stringify({ whatsapp_group_created: lead.whatsapp_group_created }), new_value: JSON.stringify({ call_id: call.id, consultation_id: consultation?.id, next_follow_up_date: input.followUp, notes: input.notes, ...(input.picked ? { interest_level: input.interest, whatsapp_group_created: input.group } : {}) }) } });
      return { call, consultation, next_follow_up_date: input.followUp };
    });
    return NextResponse.json(result);
  } catch (error) { return failure(error); }
}
