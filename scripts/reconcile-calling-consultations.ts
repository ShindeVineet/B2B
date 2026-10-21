/** Dry run by default. --apply archives exact before-images before consolidating proven call duplicates. */
import { PrismaClient } from '@prisma/client';
import { mkdir, writeFile } from 'node:fs/promises';
import { appendConsultationCall } from '../src/lib/consultations/call-history';
const db = new PrismaClient();
const apply = process.argv.includes('--apply');
async function main() {
try {
  await db.$transaction(async tx => {
    // Serialize with both call endpoints. Lock only leads with multiple consultations.
    if (apply) await tx.$queryRaw`SELECT id FROM leads WHERE id IN (SELECT lead_id FROM consultations GROUP BY lead_id HAVING count(*) > 1) ORDER BY id FOR UPDATE`;
    const rows = await tx.consultation.findMany({ orderBy: [{ created_at: 'asc' }, { id: 'asc' }], include: { lead: { select: { lead_code: true } }, rep: { select: { name: true } }, store_visit: { select: { id: true } } } });
    const events = await tx.activityLog.findMany({ where: { action: 'CALLING_CONSULTATION_LOGGED' } });
    const calls = await tx.callLog.findMany({ where: { outcome: 'Call picked' } });
    const retained = new Map<string, typeof rows>();
    const repairs = [];
    for (const row of rows) {
      const prior = retained.get(row.lead_id) || [];
      const parent = [...prior].filter(c => c.visit_date <= row.visit_date).sort((a,b) => b.visit_date.getTime()-a.visit_date.getTime() || b.created_at.getTime()-a.created_at.getTime())[0];
      const response = row.responses as Record<string, unknown> | null;
      const event = events.find(e => { try { return e.lead_id === row.lead_id && JSON.parse(e.new_value || '{}').consultation_id === row.id; } catch { return false; } });
      const data = event ? JSON.parse(event.new_value || '{}') : null;
      const call = data && calls.find(c => c.id === data.call_id && c.lead_id === row.lead_id && c.actor_id === row.rep_id && c.notes === row.notes);
      if (!parent || response?.kind !== 'calling' || row.trip_lead_id || row.store_visit || !event || !call) {
        prior.push(row); retained.set(row.lead_id, prior); continue;
      }
      repairs.push({ code: row.lead.lead_code, duplicate: row, parent, event, call });
    }
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', repairs: repairs.map(r => ({ lead: r.code, original: r.parent.id, duplicate: r.duplicate.id })) }, null, 2));
    if (!apply || !repairs.length) return;
    const coldCases = await tx.coldLeadCase.findMany({ where: { consultation_id: { in: repairs.map(r => r.duplicate.id) } } });
    const backup = `.data/audits/calling-consultation-repair-${new Date().toISOString().replaceAll(':','-')}.json`;
    await mkdir('.data/audits', { recursive: true });
    await writeFile(backup, JSON.stringify({ repairs, coldCases }, null, 2), { mode: 0o600, flag: 'wx' });
    for (const repair of repairs) {
      const { duplicate, call, event } = repair;
      const parent = await tx.consultation.findUniqueOrThrow({ where: { id: repair.parent.id } });
      await tx.consultation.update({ where: { id: parent.id }, data: appendConsultationCall(parent, {
        call_id: call.id, called_at: call.created_at.toISOString(), caller: duplicate.rep.name, actor_id: call.actor_id,
        outcome: call.outcome, notes: call.notes, interest_level: duplicate.interest_level,
        next_follow_up_date: duplicate.next_follow_up_date?.toISOString().slice(0,10) || null,
        ...(typeof (duplicate.responses as Record<string, unknown>)?.whatsapp_group_created === 'boolean' ? { whatsapp_group_created: (duplicate.responses as {whatsapp_group_created:boolean}).whatsapp_group_created } : {}),
      }) });
      await tx.coldLeadCase.updateMany({ where: { consultation_id: duplicate.id }, data: { consultation_id: parent.id } });
      await tx.activityLog.update({ where: { id: event.id }, data: { new_value: JSON.stringify({ ...JSON.parse(event.new_value!), consultation_id: parent.id, original_consultation_id: duplicate.id }) } });
      await tx.activityLog.create({ data: { lead_id: duplicate.lead_id, actor_id: null, action: 'CALL_CONSULTATION_CONSOLIDATED', old_value: JSON.stringify({ consultation: duplicate, parent, event }), new_value: JSON.stringify({ consultation_id: parent.id, call_id: call.id, archived_consultation_id: duplicate.id }) } });
      await tx.consultation.delete({ where: { id: duplicate.id } });
    }
    console.log(`Archived and consolidated ${repairs.length} call-created duplicates. Backup: ${backup}`);
  }, { timeout: 60000 });
} catch (e) { console.error(e instanceof Error ? e.message : 'Repair failed'); process.exitCode = 1; }
finally { await db.$disconnect(); }

}
void main();
