import {PrismaClient} from '@prisma/client';
import {readFileSync,mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const p=new PrismaClient();
try {
 const seed=readFileSync('prisma/seed.ts','utf8').split('const leadsData = [')[1].split('for (const lead of leadsData)')[0];
 const fixtures=[...seed.matchAll(/company_name: "([^"]+)"[\s\S]*?phone_no: "([^"]+)"[\s\S]*?pin_code: "([^"]+)"/g)].map(m=>({company_name:m[1],phone_no:m[2],pin_code:m[3]}));
 const leads=await p.lead.findMany({where:{OR:fixtures},select:{id:true,company_name:true}});
 console.log('Exact seed matches:',JSON.stringify(leads));
 if(!process.argv.includes('--apply'))process.exitCode=0;
 else {
  const url=new URL(process.env.DATABASE_URL);mkdirSync('/private/tmp/b2b-db-backups',{recursive:true});const backup='/private/tmp/b2b-db-backups/before-test-cleanup-'+Date.now()+'.dump';
  const env={...process.env,PGHOST:url.hostname,PGPORT:url.port||'5432',PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGDATABASE:decodeURIComponent(url.pathname.slice(1))};
  if(spawnSync('/opt/homebrew/bin/pg_dump',['--format=custom','--file',backup],{env}).status!==0)throw Error('Backup failed');
  const ids=leads.map(l=>l.id);
  const partners=await p.partner.count({where:{source_lead_id:{in:ids}}});if(partners)throw Error('Seed lead linked to partner; review required');
  await p.$transaction(async tx=>{
   const visits=await tx.tripLead.findMany({where:{lead_id:{in:ids}},select:{id:true}});
   const missed=await tx.missedVisit.findMany({where:{trip_lead_id:{in:visits.map(v=>v.id)}},select:{id:true}});
   await tx.notification.deleteMany({where:{missed_visit_id:{in:missed.map(v=>v.id)}}});
   await tx.missedVisit.deleteMany({where:{id:{in:missed.map(v=>v.id)}}});
   for(const model of ['geocodeJobItem','photoAsset','coldLeadCase','callLog','followUp','workflowNotification'])await tx[model].deleteMany({where:{lead_id:{in:ids}}});
   const snapshots=await tx.routeSnapshot.findMany();
   for(const snapshot of snapshots){const members=snapshot.ordered_lead_ids;if(Array.isArray(members)&&members.length&&members.every(id=>ids.includes(id)))await tx.routeSnapshot.delete({where:{id:snapshot.id}});}
   await tx.lead.deleteMany({where:{id:{in:ids}}});
  },{timeout:60000});
  console.log('Deleted seed leads:',ids.length,'Backup:',backup);
 }
}finally{await p.$disconnect()}
