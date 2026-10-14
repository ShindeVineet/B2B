import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { contactEditFilter } from '@/lib/calling/access';
import { getLeadFilterForUser } from '@/lib/permissions';
import { failure, RequestError } from '@/lib/phase5/http';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) throw new RequestError('Unauthorized', 401);
    const { id } = await params;
    const lead = await prisma.lead.findFirst({ where: { id, AND: [getLeadFilterForUser(user)] }, select: { whatsapp_group_created: true } });
    if (!lead) throw new RequestError('Lead not found', 404);
    const editable = user.role !== 'analyst' && !!await prisma.lead.findFirst({ where: { id, AND: [contactEditFilter(user)] }, select: { id: true } });
    return NextResponse.json({ ...lead, editable });
  } catch (error) { return failure(error); }
}
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser(req);
    if (!user || user.role === 'analyst') throw new RequestError('Forbidden', 403);
    const { id } = await params;
    const body = await req.json();
    if (typeof body.whatsapp_group_created !== 'boolean' || typeof body.previous !== 'boolean') throw new RequestError('Invalid group selection');
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM leads WHERE id=${id} FOR UPDATE`;
      const lead = await tx.lead.findFirst({ where: { id, AND: [contactEditFilter(user)] } });
      if (!lead) throw new RequestError('Lead not found', 404);
      if (lead.whatsapp_group_created !== body.previous) throw new RequestError('Group status changed. Refresh before applying your change.', 409);
      if (lead.whatsapp_group_created === body.whatsapp_group_created) return;
      await tx.lead.update({ where: { id }, data: { whatsapp_group_created: body.whatsapp_group_created } });
      await tx.activityLog.create({ data: { lead_id: id, actor_id: user.id, action: 'GROUP_CREATED_UPDATED', old_value: String(lead.whatsapp_group_created), new_value: String(body.whatsapp_group_created) } });
    });
    return NextResponse.json({ whatsapp_group_created: body.whatsapp_group_created });
  } catch (error) { return failure(error); }
}
