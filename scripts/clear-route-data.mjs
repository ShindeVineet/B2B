// One-time, user-requested route reset. Dry run unless --apply is passed.
import { PrismaClient } from '@prisma/client';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const db = new PrismaClient();
const models = ['notification','missedVisit','routeSnapshot','routeLead','tripWeekOverride','tripDayCapacity','tripAssignment','tripLead','plannedRoute','tripPlan'];
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function protectedData(tx) {
  const [leads, consultations, partners, appointments] = await Promise.all([
    tx.lead.findMany({orderBy:{id:'asc'}}), tx.consultation.findMany({orderBy:{id:'asc'}}),
    tx.partner.findMany({orderBy:{id:'asc'}}), tx.storeVisit.findMany({orderBy:{id:'asc'}}),
  ]);
  return {counts:{leads:leads.length,consultations:consultations.length,partners:partners.length,appointments:appointments.length},
    hash:digest({leads,consultations:consultations.map(({trip_lead_id,...c})=>c),partners,appointments})};
}
try {
  if (!process.argv.includes('--apply')) {
    const counts = {};
    for (const model of models) counts[model] = await db[model].count();
    console.log(JSON.stringify({dryRun:true,routeRecords:counts,linkedConsultations:await db.consultation.count({where:{trip_lead_id:{not:null}}}),protected:(await protectedData(db)).counts}));
  } else {
    const result = await db.$transaction(async tx => {
      // Keep route writers and consultation writers out until backup/reset/checks finish.
      await tx.$executeRawUnsafe('LOCK TABLE routes, route_leads, route_snapshots, trip_plans, trip_leads, trip_assignments, trip_week_overrides, trip_day_capacities, missed_visits, notifications, consultations, leads, partners, store_visits IN ACCESS EXCLUSIVE MODE');
      const before=await protectedData(tx), backup={};
      for(const model of models) backup[model]=await tx[model].findMany();
      backup.consultationLinks=await tx.consultation.findMany({where:{trip_lead_id:{not:null}},select:{id:true,trip_lead_id:true}});
      mkdirSync('.data/backups',{recursive:true});
      const path=`.data/backups/route-reset-${new Date().toISOString().replaceAll(':','-')}.json`;
      writeFileSync(path,JSON.stringify({createdAt:new Date().toISOString(),protected:before,...backup},null,2),{mode:0o600,flag:'wx'});
      await tx.consultation.updateMany({where:{trip_lead_id:{not:null}},data:{trip_lead_id:null}});
      const removed={};
      for(const model of models) removed[model]=(await tx[model].deleteMany()).count;
      const after=await protectedData(tx);
      assert.equal(after.hash,before.hash,'Leads, consultations, partners and appointments must be unchanged except detached route links');
      for(const model of models)assert.equal(await tx[model].count(),0);
      return {backup:path,removed,detachedConsultationLinks:backup.consultationLinks.length,preserved:after.counts};
    },{timeout:120000,isolationLevel:'Serializable'});
    console.log(JSON.stringify(result));
  }
} finally {await db.$disconnect();}
