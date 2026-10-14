// One-time account correction; dry run by default. Run after user_designation migration.
import { PrismaClient } from '@prisma/client';
import { mkdirSync, writeFileSync } from 'node:fs';
const db = new PrismaClient();
const labels = {b2b_head:'B2B Head',ground_rep:'Ground Team',regional_manager:'Regional Manager',store_associate:'Store Associate',analyst:'Analyst',super_admin:'Super Admin'};
try {
 const users = await db.user.findMany();
 const head = users.find(u => u.role === 'b2b_head' && u.name === 'Vineet Shinde' && u.active);
 const duplicate = users.find(u => u.name === 'Vineet' && u.role === 'ground_rep');
 if (!head || !duplicate) throw Error('Expected Vineet Head and duplicate accounts');
 const changes = users.map(u => {
  const name = u.name.replace(/\s*\([^)]*\)/g,'').trim();
  const designation = u.designation || u.name.match(/\(([^)]+)\)/)?.[1] || labels[u.role];
  const local = u.id === duplicate.id ? 'vineet.duplicate' : u.role === 'super_admin' ? 'superadmin' : name.split(/\s+/)[0].toLowerCase();
  return {id:u.id,name,designation,email:`${local}@adorzy.com`,active:u.id === duplicate.id ? false : u.active};
 });
 if(new Set(changes.map(u=>u.email)).size !== users.length) throw Error('Email collision');
 const consultations = await db.consultation.findMany({where:{rep_id:duplicate.id}});
 const leads = await db.lead.findMany({where:{assigned_ground_rep_id:duplicate.id}});
 const counts = async tx => [await tx.user.count(),await tx.lead.count(),await tx.consultation.count(),await tx.partner.count()];
 const beforeCounts = await counts(db);
 console.log(JSON.stringify({apply:process.argv.includes('--apply'),users:changes,consultationsToHead:consultations.length,leadsToHead:leads.length},null,2));
 if(process.argv.includes('--apply')) {
  mkdirSync('.data/backups',{recursive:true});
  const backup = `.data/backups/team-normalization-${Date.now()}.json`;
  writeFileSync(backup,JSON.stringify({users:users.map(({password_hash,...u})=>u),consultations,leads},null,2),{mode:0o600});
  await db.$transaction(async tx => {
   // Release the canonical email first on reruns or partially corrected datasets.
   const ordered = [...changes].sort((a,b)=>Number(b.id===duplicate.id)-Number(a.id===duplicate.id));
   for(const {id,...data} of ordered) await tx.user.update({where:{id},data});
   for(const c of consultations) {
    await tx.consultation.update({where:{id:c.id},data:{rep_id:head.id,ground_staff_name:head.name,responses:{...(c.responses||{}),ground_staff_name:head.name}}});
    await tx.activityLog.create({data:{lead_id:c.lead_id,actor_id:head.id,action:'CONSULTATION_AUTHOR_CORRECTED',old_value:JSON.stringify({consultation_id:c.id,rep_id:c.rep_id,ground_staff_name:c.ground_staff_name}),new_value:JSON.stringify({rep_id:head.id,ground_staff_name:head.name,reason:'Duplicate Vineet ground account was the B2B Head'})}});
   }
   await tx.lead.updateMany({where:{assigned_ground_rep_id:duplicate.id},data:{assigned_ground_rep_id:head.id}});
   await tx.followUp.updateMany({where:{rep_id:duplicate.id},data:{rep_id:head.id}});
   const after = await tx.user.findMany();
   if(after.some(u=>u.password_hash !== users.find(old=>old.id===u.id)?.password_hash)) throw Error('Password changed unexpectedly');
   if(JSON.stringify(await counts(tx))!==JSON.stringify(beforeCounts)) throw Error('Row counts changed');
  },{timeout:60000});
  console.log(`Applied; backup: ${backup}; all passwords and row counts preserved.`);
 }
} catch(e) {console.error(e.message);process.exitCode=1} finally {await db.$disconnect()}
