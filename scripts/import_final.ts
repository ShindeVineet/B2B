import fs from 'fs';
import Papa from 'papaparse';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log("Deleting old data...");
  // Clear data
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "partners" CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "consultations" CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "leads" CASCADE');
  
  console.log("Data deleted. Reading CSVs...");

  const readCsv = (path: string) => {
    if (!fs.existsSync(path)) return [];
    const content = fs.readFileSync(path, 'utf8');
    const parsed = Papa.parse(content, { header: true, skipEmptyLines: true });
    return parsed.data as any[];
  };

  const onboarded = readCsv('Leads-Onboarded.csv');
  const walkin = readCsv('Leads-Walk-in.csv');
  const referral = readCsv('Leads-Referral.csv');
  const linkedin = readCsv('Leads-Linkedin.csv');
  const leads = readCsv('Leads-Leads.csv');
  const consultations = readCsv('Leads-Consultations.csv');
  const cdt = readCsv('Leads-CDT.csv');
  const calling = readCsv('Leads-Calling.csv');

  // 1. Build uniform lead_types map from Onboarded
  const onboardedLeadTypes = new Map<string, string>();
  for (const row of onboarded) {
    if (row.Lead_ID && row['Type of Professional']) {
      onboardedLeadTypes.set(row.Lead_ID, row['Type of Professional']);
    }
  }

  // Helper to get uniform lead type
  const getLeadType = (leadId: string, currentType: string) => {
    return onboardedLeadTypes.get(leadId) || currentType || 'Other';
  };

  // Combine all leads
  const allLeadsMap = new Map<string, any>();
  
  const processLeadRow = (row: any, source: string) => {
    if (!row.Lead_ID) return;
    const existing = allLeadsMap.get(row.Lead_ID) || {};
    
    // For Leads-Leads.csv, the columns are different
    let companyName = row['Company Name'] || row.firm_name || existing.company_name || 'Unknown Company';
    let contactPerson = row['Contact Person Name'] || row.contact_name || existing.owner_name || null;
    let phone = row['Phone No.'] || row.phone_numbers || existing.phone_no || null;
    let pincode = row['Pin Code'] || row.pincode || existing.pin_code || null;
    let address = row.Address || row.address || existing.address || null;
    let category = getLeadType(row.Lead_ID, row['Lead Type'] || row.professional_type || existing.category);
    let lat = row.Lat ? parseFloat(row.Lat) : existing.lat || null;
    let lng = row.Lng ? parseFloat(row.Lng) : existing.lng || null;
    
    allLeadsMap.set(row.Lead_ID, {
      id: row.Lead_ID,
      lead_code: row.Lead_ID,
      company_name: companyName,
      owner_name: contactPerson,
      phone_no: phone,
      pin_code: pincode,
      address: address,
      category: category,
      lat: lat && !isNaN(lat) ? lat : null,
      lng: lng && !isNaN(lng) ? lng : null,
      lead_source: row.Source || source,
      status: 'New'
    });
  };

  walkin.forEach(r => processLeadRow(r, 'Walk-in'));
  referral.forEach(r => processLeadRow(r, 'Referral'));
  linkedin.forEach(r => processLeadRow(r, 'Linkedin'));
  cdt.forEach(r => processLeadRow(r, 'CDT'));
  calling.forEach(r => processLeadRow(r, 'Calling'));
  leads.forEach(r => processLeadRow(r, 'Google Maps')); // Assuming Leads-Leads is mainly Gmaps

  // Process Consultations
  const allConsultations = [];
  for (const row of consultations) {
    if (!row.Lead_ID) continue;
    
    // If the lead doesn't exist yet (maybe it only exists in consultations?), create a stub
    if (!allLeadsMap.has(row.Lead_ID)) {
      processLeadRow({
        Lead_ID: row.Lead_ID,
        'Company Name': row['Company name'],
        'Contact Person Name': row['Decision Maker Name'],
        'Lead Type': row['Lead Type'],
        'Phone No.': row['Mobile Number'],
        Address: row.Address,
        'Pin Code': row.Pincode,
        Source: 'Consultation'
      }, 'Consultation');
    }
    
    // Default system user for ground rep if none found, we will just pick any user or a dummy one.
    // Wait, let's just find an active ground_rep or create a system user.
    allConsultations.push(row);
  }

  // Also make sure all Onboarded leads exist
  for (const row of onboarded) {
    if (!row.Lead_ID) continue;
    if (!allLeadsMap.has(row.Lead_ID)) {
      processLeadRow({
        Lead_ID: row.Lead_ID,
        'Company Name': row['Company / Firm Name'],
        'Contact Person Name': row['Contact Person Name'],
        'Lead Type': row['Type of Professional'],
        'Phone No.': row['Mobile Number'],
        Address: row['Office Address'],
        'Pin Code': row.Pincode,
        Source: 'Onboarded'
      }, 'Onboarded');
    }
  }

  console.log(`Inserting ${allLeadsMap.size} leads...`);
  // Insert Leads in batches
  const leadsToInsert = Array.from(allLeadsMap.values());
  for (let i = 0; i < leadsToInsert.length; i += 500) {
    await prisma.lead.createMany({
      data: leadsToInsert.slice(i, i + 500),
      skipDuplicates: true
    });
  }

  // Get a fallback rep for consultations
  let systemUser = await prisma.user.findFirst({ where: { role: 'ground_rep' } });
  if (!systemUser) {
    systemUser = await prisma.user.create({
      data: {
        email: 'system.importer@example.com',
        name: 'System Importer',
        password_hash: 'dummy',
        role: 'ground_rep'
      }
    });
  }

  console.log(`Inserting ${allConsultations.length} consultations...`);
  for (const row of allConsultations) {
    try {
      await prisma.consultation.create({
        data: {
          lead_id: row.Lead_ID,
          rep_id: systemUser.id,
          company_name: row['Company name'] || undefined,
          decision_maker_name: row['Decision Maker Name'] || undefined,
          lead_type: getLeadType(row.Lead_ID, row['Lead Type']),
          interest_level: row['Interest Level'] || undefined,
          current_lead_status: row['Current Lead Status'] || undefined,
          outcome: row['Lead Outcome'] || 'Warm',
          notes: row.Notes || undefined,
          designation: row.Designation || undefined,
          primary_pain_point: row['Primary Pain Point Observed'] || undefined,
          competitor_involved: row['Competitor Involved'] || undefined,
          decision_maker_phone: row['Mobile Number'] || undefined
        }
      });
    } catch (e) {
      console.error(`Failed to insert consultation for ${row.Lead_ID}`);
    }
  }

  console.log(`Inserting ${onboarded.length} onboarded partners...`);
  let dummySubmitter = await prisma.user.findFirst({ where: { role: 'b2b_head' } });
  if (!dummySubmitter) dummySubmitter = systemUser;

  for (const row of onboarded) {
    if (!row.Lead_ID || !row['Partner Code']) continue;
    
    // Handle Deboarded
    const status = row['On-boarded from?'] === 'Deboarded' ? 'rejected' : 'active';
    let orderValue = 0;
    try {
      if (row['Expected Monthly Order Value']) {
        orderValue = parseFloat(row['Expected Monthly Order Value'].replace(/,/g, ''));
      }
    } catch(e) {}

    try {
      await prisma.partner.create({
        data: {
          source_lead_id: row.Lead_ID,
          partner_code: row['Partner Code'],
          company_firm_name: row['Company / Firm Name'] || 'Unknown',
          contact_person_name: row['Contact Person Name'] || 'Unknown',
          designation: row.Designation || 'Unknown',
          mobile_number: row['Mobile Number'] || '0000000000',
          business_email_id: row['Email ID'] || undefined,
          office_address: row['Office Address'] || 'Unknown',
          pincode: row.Pincode || '000000',
          city: row.City || 'Unknown',
          state: row.State || 'Unknown',
          type_of_professional: getLeadType(row.Lead_ID, row['Type of Professional']),
          years_operating: row['How many years has your company been operating?'] || '0',
          specialized_in: row['Specialized In:'] || 'Unknown',
          expected_monthly_order_value: isNaN(orderValue) ? 0 : orderValue,
          gst_registered: row['GST Registered'] === 'Yes',
          gst_no: row['GST No.'] || undefined,
          pan_no: row['PAN No'] || 'UNKNOWN',
          bank_account_name: row['Bank Account Name (as per GST Registration)'] || 'Unknown',
          bank_name: row['Bank Name'] || 'Unknown',
          branch: row.Branch || 'Unknown',
          account_no: row['Account No'] || 'Unknown',
          ifsc_code: row['IFSC Code'] || 'Unknown',
          partner_status: status,
          submitted_by: dummySubmitter.id,
        }
      });
    } catch (e: any) {
      console.error(`Failed to insert partner ${row['Partner Code']} for ${row.Lead_ID}:`, e.message);
    }
  }

  console.log("Import completed!");
}

main().catch(console.error).finally(() => prisma.$disconnect());
