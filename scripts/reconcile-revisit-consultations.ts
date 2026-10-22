/** Dry run by default; --apply preserves before-images and visit IDs before merging. */
import { PrismaClient } from '@prisma/client';
import { mkdir, writeFile } from 'node:fs/promises';
import { appendRevisit, type RevisitEntry } from '../src/lib/consultations/revisit-history';
import { appendConsultationCall, type ConsultationCall } from '../src/lib/consultations/call-history';
const db = new PrismaClient();
async function main() {
 try {
  const apply = process.argv.includes('--apply');
  await db.$transaction(async tx => {
    if (apply) await tx.$queryRaw`SELECT id FROM leads WHERE id IN (SELECT lead_id FROM consultations WHERE responses->>'kind' = 'revisit') ORDER BY id FOR UPDATE`;
    const rows = await tx.consultation.findMany({ orderBy: [{ created_at: 'asc' }, { id: 'asc' }], include: { lead: { select: { lead_code: true, call_date: true, call_outcome: true } }, rep: { select: { name: true } }, store_visit: { select: { id: true } } } });
    const events = await tx.activityLog.findMany({ where: { action: { in: ['REVISIT_LOGGED', 'CALLING_CONSULTATION_LOGGED'] } } });
    const prior = new Map<string, typeof rows>();
    const repairs = [];
    for (const row of rows) {
      const retained = prior.get(row.lead_id) || [];
      const parent = [...retained].filter(c => c.visit_date <= row.visit_date).sort((a,b) => b.visit_date.getTime()-a.visit_date.getTime() || b.created_at.getTime()-a.created_at.getTime())[0];
      const response = row.responses as Record<string, unknown> | null;
      const matching = events.filter(e => {
        if (e.action !== 'REVISIT_LOGGED' || e.lead_id !== row.lead_id || e.actor_id !== row.rep_id) return false;
        try { const data=JSON.parse(e.new_value || '{}'); return data.outcome === row.outcome && (data.notes || '').trim() === (row.notes || '').trim() && (row.trip_lead_id ? e.old_value === row.trip_lead_id : Math.abs(e.created_at.getTime()-row.created_at.getTime()) < 5000); } catch { return false; }
      });
      if (response?.kind === 'revisit' && parent && !row.store_visit && matching.length === 1) repairs.push({ parent, duplicate: row, event: matching[0] });
      else { retained.push(row); prior.set(row.lead_id,retained); }
    }
    console.log(JSON.stringify({mode:apply?'apply':'dry-run',revisitRows:rows.filter(c=>(c.responses as {kind?:string})?.kind==='revisit').length,repairs:repairs.map(r=>({lead:r.duplicate.lead.lead_code,parent:r.parent.id,duplicate:r.duplicate.id,visit:r.duplicate.trip_lead_id}))},null,2));
    if (!apply || !repairs.length) return;
    const followUps=await tx.followUp.findMany({where:{lead_id:{in:repairs.map(r=>r.duplicate.lead_id)}}});
    const coldCases=await tx.coldLeadCase.findMany({where:{consultation_id:{in:repairs.map(r=>r.duplicate.id)}}});
    const backup=`.data/audits/revisit-consultation-repair-${new Date().toISOString().replaceAll(':','-')}.json`;
    await mkdir('.data/audits',{recursive:true});
    await writeFile(backup,JSON.stringify({repairs,coldCases,events,followUps},null,2),{mode:0o600,flag:'wx'});
    for (const {parent:original,duplicate,event} of repairs) {
      let parent=await tx.consultation.findUniqueOrThrow({where:{id:original.id}});
      const response=duplicate.responses as Record<string, unknown>;
      const entries: RevisitEntry[] = [{id:duplicate.id,visited_at:duplicate.visit_date.toISOString(),actor_id:duplicate.rep_id,staff_name:duplicate.rep.name,trip_lead_id:duplicate.trip_lead_id,channel:typeof response.channel==='string'?response.channel:'ground',outcome:duplicate.outcome,notes:duplicate.notes || '',next_follow_up_date:duplicate.next_follow_up_date?.toISOString().slice(0,10) || null}, ...((response.revisits || []) as RevisitEntry[])];
      for(const entry of entries) parent=await tx.consultation.update({where:{id:parent.id},data:appendRevisit(parent,entry)});
      for(const call of (response.follow_up_calls || []) as ConsultationCall[]) parent=await tx.consultation.update({where:{id:parent.id},data:appendConsultationCall(parent,call)});
      // Preserve last-contact badges without moving the consultation's original date.
      await tx.lead.updateMany({ where: { id: duplicate.lead_id, OR: [{ call_date: null }, { call_date: { lt: duplicate.visit_date } }] }, data: { call_date: duplicate.visit_date, call_outcome: duplicate.outcome } });
      const laterActivity = await tx.activityLog.count({ where: { lead_id: duplicate.lead_id, created_at: { gt: event.created_at }, action: { not: 'REVISIT_CONSULTATION_CONSOLIDATED' } } });
      if (!laterActivity && !duplicate.next_follow_up_date && duplicate.outcome !== "Couldn't meet") {
        const day = duplicate.visit_date.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
        await tx.followUp.updateMany({ where: { lead_id: duplicate.lead_id, active: true, due_date: { lte: new Date(day) } }, data: { active: false } });
      }
      await tx.coldLeadCase.updateMany({where:{consultation_id:duplicate.id},data:{consultation_id:parent.id}});
      for(const e of events) {
        let data;try{data=JSON.parse(e.new_value || '{}')}catch{continue}
        if(e.id===event.id || data.consultation_id===duplicate.id) await tx.activityLog.update({where:{id:e.id},data:{new_value:JSON.stringify({...data,consultation_id:parent.id,original_consultation_id:duplicate.id})}});
      }
      await tx.activityLog.create({data:{lead_id:duplicate.lead_id,actor_id:null,action:'REVISIT_CONSULTATION_CONSOLIDATED',old_value:JSON.stringify({duplicate,parent:original,event}),new_value:JSON.stringify({consultation_id:parent.id,archived_consultation_id:duplicate.id,trip_lead_id:duplicate.trip_lead_id})}});
      await tx.consultation.delete({where:{id:duplicate.id}});
    }
    console.log(`Consolidated ${repairs.length} revisits; archived before-images in ${backup}`);
  }, {timeout:60000});
 } catch(e) { console.error(e instanceof Error?e.message:'Repair failed');process.exitCode=1; }
 finally { await db.$disconnect(); }
}
void main();
