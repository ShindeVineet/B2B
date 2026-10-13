import {PrismaClient} from '@prisma/client';
import {mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const p=new PrismaClient();
try {
 const url=new URL(process.env.DATABASE_URL);mkdirSync('/private/tmp/b2b-db-backups',{recursive:true});
 const backup='/private/tmp/b2b-db-backups/before-all-leads-delete-'+Date.now()+'.dump';
 const env={...process.env,PGHOST:url.hostname,PGPORT:url.port||'5432',PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGDATABASE:decodeURIComponent(url.pathname.slice(1))};
 if(spawnSync('/opt/homebrew/bin/pg_dump',['--format=custom','--file',backup],{env}).status!==0)throw Error('Backup failed');
 const before={leads:await p.lead.count(),consultations:await p.consultation.count(),partners:await p.partner.count(),users:await p.user.count(),stores:await p.store.count()};
 const result=await p.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(928050)`;
  await tx.$executeRaw`LOCK TABLE leads IN ACCESS EXCLUSIVE MODE`;
  for(const model of ['notification','missedVisit','geocodeJobItem','geocodeJob','photoAsset','coldLeadCase','callLog','followUp','workflowNotification','routeSnapshot']) await tx[model].deleteMany();
  return tx.lead.deleteMany();
 },{timeout:120000,maxWait:120000});
 console.log({before,deleted:result.count,remainingLeads:await p.lead.count(),remainingConsultations:await p.consultation.count(),partnersPreserved:await p.partner.count(),usersPreserved:await p.user.count(),storesPreserved:await p.store.count(),backup});
}finally{await p.$disconnect();}
