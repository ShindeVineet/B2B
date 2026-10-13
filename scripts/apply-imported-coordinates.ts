import fs from 'node:fs';
import Papa from 'papaparse';
import {PrismaClient} from '@prisma/client';
import {importLocation} from '../src/lib/import-location';
const db=new PrismaClient();
async function main(){
const rows=Papa.parse<Record<string,string>>(fs.readFileSync('/Users/florzy/Downloads/Untitled spreadsheet - Sheet3.csv','utf8'),{header:true,skipEmptyLines:true}).data;
const leads=await db.lead.findMany();
const updates=rows.map(row=>{
 const matches=leads.filter(l=>l.company_name.trim()===row.firm_name.trim() && l.pin_code===row.pincode.trim());
 if(matches.length!==1)throw Error(`Expected one match for ${row.firm_name}, found ${matches.length}`);
 const location=importLocation({company_name:row.firm_name,matched_name:row.MatchedName,lat:row.Lat,lng:row.Lng});
 if(!location?.valid)throw Error(`Invalid coordinates for ${row.firm_name}`);
 return {lead:matches[0],row,location};
});
if(new Set(updates.map(u=>u.lead.id)).size!==updates.length)throw Error('Duplicate matches');
console.log({matched:updates.length,review:updates.filter(u=>u.location.mismatch).map(u=>({firm:u.row.firm_name,matched:u.row.MatchedName}))});
if(!process.argv.includes('--apply'))return;
const backup='/private/tmp/lead-coordinates-before-'+Date.now()+'.json';fs.writeFileSync(backup,JSON.stringify(leads,null,2),{mode:0o600});
await db.$transaction(async tx=>{
for(const {lead,row,location} of updates){
 await tx.lead.update({where:{id:lead.id},data:{lat:location.lat,lng:location.lng,google_map_link:row.GoogleMapsLink,geocode_source:'google_link',geocode_status:location.mismatch?'mismatch_flagged':'ok',geocode_confidence:'high',geocode_issue_reason:location.mismatch?'Imported matched name differs from firm; confirm location':null,location_verified:!location.mismatch,extra_notes:[lead.extra_notes,...['PlaceId','MatchedName','FormattedAddress','email','contact_name'].map(k=>`${k}: ${row[k]}`)].filter(Boolean).join('\n')}});
 await tx.geocodeJobItem.updateMany({where:{lead_id:lead.id},data:{status:location.mismatch?'issue':'accepted',error:null,lease_until:null,next_attempt_at:null}});
 await tx.activityLog.create({data:{lead_id:lead.id,action:'IMPORTED_COORDINATES_APPLIED',old_value:JSON.stringify({lat:lead.lat,lng:lead.lng}),new_value:JSON.stringify({lat:location.lat,lng:location.lng,source:'Sheet3.csv'})}});
}
});
console.log({updated:updates.length,backup,totalLeads:await db.lead.count(),coordinates:await db.lead.count({where:{lat:{not:null},lng:{not:null}}})});
}
main().finally(()=>db.$disconnect());
