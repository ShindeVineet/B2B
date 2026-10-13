// Repair an already-imported workbook in place. Dry-run default; never deletes or merges identities.
import { PrismaClient } from '@prisma/client';
import XLSX from 'xlsx';
import { assignCaller } from '../src/lib/calling/distribute.ts';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
const db = new PrismaClient();
const workbookPath = '/Users/florzy/Downloads/Leads.xlsx';
const workbook = XLSX.readFile(workbookPath);
const hash = createHash('sha256').update(readFileSync(workbookPath)).digest('hex');
const sheet = name => XLSX.utils.sheet_to_json(workbook.Sheets[name], { raw: false, defval: '' });
const rows = sheet('Consultations');
const mapping = { lead_id: 'Lead_ID', company_name: 'Company name', decision_maker_name: 'Decision Maker Name', decision_maker_phone: 'Mobile Number', notes: 'Notes', outcome: 'Lead Outcome', designation: 'Designation', primary_pain_point: 'Primary Pain Point Observed', competitor_involved: 'Competitor Involved' };
const signature = (row, source) => JSON.stringify(Object.entries(mapping).map(([k,v]) => String(row[source ? v : k] || (k === 'outcome' ? 'Warm' : ''))));
function workbookDate(name, row, column) {
 const cell=workbook.Sheets[name][XLSX.utils.encode_cell({r:row.__rowNum__,c:column})];
 if(cell?.t !== 'n')return null;
 const d=XLSX.SSF.parse_date_code(cell.v);if(!d)return null;
 return new Date(Date.UTC(d.y,d.m-1,d.d,d.H,d.M,Math.round(d.S+d.u))-330*60000);
}
try {
 const [consults, leads, partners, users] = await Promise.all([
  db.$queryRaw`SELECT * FROM consultations`, db.$queryRaw`SELECT * FROM leads`, db.$queryRaw`SELECT * FROM partners`, db.user.findMany({select:{id:true,name:true,role:true,store_id:true}})
 ]);
 const bySig = new Map(); for (const c of consults) { const key=signature(c,false); bySig.set(key,[...(bySig.get(key)||[]),c]); }
 const sourceCounts=new Map(); for(const r of rows){const k=signature(r,true);sourceCounts.set(k,(sourceCounts.get(k)||0)+1);}
 const changes=[], exceptions=[];
 const leadMap=new Map(leads.map(l=>[l.id,l]));
 const teams=new Map();
 for(const [name,team] of [['Walk-in','store'],['Calling','caller'],['Linkedin','caller'],['CDT','caller']]) for(const r of sheet(name)) { if(teams.has(r.Lead_ID)&&teams.get(r.Lead_ID)!==team) throw Error('Conflicting source sheets'); teams.set(r.Lead_ID,team); }
 for (let i=0;i<rows.length;i++) {
  const row=rows[i],key=signature(row,true),candidates=bySig.get(key)||[], date=workbookDate('Consultations',row,1);
  if(candidates.length!==1 || sourceCounts.get(key)!==1 || !date){exceptions.push({sheet:'Consultations',row:i+2,lead:row.Lead_ID,reason:!date?'Invalid timestamp':'Non-unique exact match'});continue;}
  const c=candidates[0]; if(c.responses?.dashboard_reconciliation?.sha256===hash && +new Date(c.visit_date)===+date)continue;
  const executive=users.filter(u=>u.name===row['Name of Ground Executive'].trim());
  if(executive.length!==1){exceptions.push({sheet:'Consultations',row:i+2,lead:row.Lead_ID,reason:'Unknown/ambiguous executive'});continue;}
  const interest=String(row['Interest Level']).trim().toLowerCase();
  const data={visit_date:date,created_at:date,ground_staff_name:row['Name of Ground Executive'],rep_id:executive[0].id,interest_level:({high:'High',medium:'Medium',low:'Low'})[interest]||c.interest_level,interaction_channel:teams.get(row.Lead_ID)||'ground',email:row.Email||null,responses:{...(c.responses||{}),dashboard_reconciliation:{sha256:hash,sheet:'Consultations',row:i+2,raw:row}}};
  changes.push({model:'consultation',id:c.id,lead_id:c.lead_id,data,before:c});
 }
 // Restore source-sheet handling queues without changing immutable origins or assigning people by inference.
 for(const [id,intake_team] of teams){const l=leadMap.get(id);if(l&&l.intake_team!==intake_team)changes.push({model:'lead',id,lead_id:id,data:{intake_team},before:l});}
 const partnerMap=new Map(partners.map(p=>[p.partner_code,p]));
 for(const row of sheet('Onboarded')) {
  const p=partnerMap.get(row['Partner Code']);if(!p||p.source_lead_id!==row.Lead_ID)continue;
  const data={};
  if(['Company','Individual'].includes(row.Partner_type)&&p.partner_type!==row.Partner_type)data.partner_type=row.Partner_type;
  const date=workbookDate('Onboarded',row,2);if(date&&+new Date(p.onboarded_at)!==+date)data.onboarded_at=date;
  const source=row['STUDIO PURPLE'].trim();const sources={'Walk-In':'Walk in (Direct)','Walk In (Direct)':'Walk in (Direct)','Walk In (OnGround)':'Walk in (On Ground)','CDT':'CDT','LinkedIn':'LinkedIN ADS','OnGround Direct Convert':'On Ground Direct Convert','Referral':'Referral'};
  if(source&&!p.lead_gen_source){data.lead_gen_source=sources[source]||'Other';data.lead_gen_source_other=sources[source]?null:source;}
  if(Object.keys(data).length)changes.push({model:'partner',id:p.id,lead_id:p.source_lead_id,data,before:p});
 }
 const summary={sha256:hash,mode:process.argv.includes('--apply')?'apply':'dry-run',changes:changes.reduce((a,c)=>(a[c.model]=(a[c.model]||0)+1,a),{}),exceptions,countsBefore:{leads:leads.length,consultations:consults.length,partners:partners.length}};
 mkdirSync('.data/audits',{recursive:true});
 const stamp=new Date().toISOString().replaceAll(':','-');
 writeFileSync(`.data/audits/dashboard-reconciliation-${stamp}.json`,JSON.stringify({summary,changes},null,2),{mode:0o600});
 if(process.argv.includes('--apply')){
  const actor=users.find(u=>u.role==='b2b_head');if(!actor)throw Error('Missing audit actor');
  await db.$transaction(async tx=>{
   for(const c of changes){await tx[c.model].update({where:{id:c.id},data:c.data});if(c.model==='lead'&&['store','caller'].includes(c.data.intake_team))await assignCaller(tx,c.id);await tx.activityLog.create({data:{lead_id:c.lead_id,actor_id:actor.id,action:'WORKBOOK_DASHBOARD_RECONCILED',old_value:JSON.stringify({model:c.model,id:c.id,visit_date:c.before.visit_date,intake_team:c.before.intake_team,rep_id:c.before.rep_id}),new_value:JSON.stringify({model:c.model,id:c.id,sha256:hash,...c.data})}});}
   const after={leads:await tx.lead.count(),consultations:await tx.consultation.count(),partners:await tx.partner.count()};if(JSON.stringify(after)!==JSON.stringify(summary.countsBefore))throw Error('Unexpected row-count change');
  },{timeout:120000});
 }
 console.log(JSON.stringify(summary,null,2));
} catch(e) { console.error(e.message?.split('\n').at(-1)); process.exitCode=1; } finally { await db.$disconnect(); }
