import {CONSULTATION_FIELDS} from "../src/lib/consultations/fields";
import {Prisma} from "@prisma/client";
import Papa from "papaparse";
import { PrismaClient, Role, User, Store } from "@prisma/client";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

async function main() {
  for(const [i,f] of CONSULTATION_FIELDS.entries()){
    const data={label:f.label,type:f.type,required:f.required,options:f.options||Prisma.DbNull,display_order:i+1,active:true,max_files:f.max_files??null,required_when:f.required_when||Prisma.DbNull};
    await prisma.formField.upsert({where:{key:f.key},create:{key:f.key,...data},update:data});
  }
  await prisma.coldLeadConfig.upsert({where:{id:'default'},create:{id:'default'},update:{}});

  console.log("🌱 Starting LeadMap database seeding...");

  // 1. Seed IndiaPIN Pincode Geocache
  const rawCsvPath = path.join(process.cwd(), "prisma/data/pincode_raw.csv");
  if (fs.existsSync(rawCsvPath)) {
    console.log("📍 Processing IndiaPIN dataset...");
    const rows = Papa.parse<Record<string, string>>(
      fs.readFileSync(rawCsvPath, "utf8"),
      { header: true, skipEmptyLines: true },
    ).data;
    const pincodeMap = new Map<
      string,
      { lat: number; lng: number; district: string; state: string }
    >();
    for (const row of rows) {
      const pincode = row.Pincode?.trim(),
        lat = Number(row.Latitude),
        lng = Number(row.Longitude);
      if (
        pincode?.length === 6 &&
        Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        !pincodeMap.has(pincode)
      ) {
        pincodeMap.set(pincode, {
          lat,
          lng,
          district: row.District || "",
          state: row.StateName || "",
        });
      }
    }

    console.log(
      `Parsed ${pincodeMap.size} unique Indian pincodes. Loading into database...`,
    );

    const existingCount = await prisma.pincodeGeocache.count();
    if (existingCount < 10000) {
      const records = Array.from(pincodeMap.entries()).map(
        ([pin_code, data]) => ({
          pin_code,
          lat: data.lat,
          lng: data.lng,
          district: data.district,
          state: data.state,
        }),
      );

      // Insert in batches of 2000
      const batchSize = 2000;
      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        await prisma.pincodeGeocache.createMany({
          data: batch,
          skipDuplicates: true,
        });
        process.stdout.write(
          `Loaded ${Math.min(i + batchSize, records.length)}/${records.length} pincodes...\r`,
        );
      }
      console.log("\n✅ IndiaPIN geocache seeded successfully!");
    } else {
      console.log(
        `✅ Pincode geocache already populated (${existingCount} records). Skipping.`,
      );
    }
  }

  // 2. Seed Users
  console.log("👤 Seeding system users across roles...");
  const hashedPassword = await bcrypt.hash("LeadMap@123", 10);

  const usersData = [
    {
      email: "vineet@adorzy.com",
      name: "Vineet Shinde",
      designation: "B2B Head",
      role: Role.b2b_head,
      phone: "+91 98765 43210",
      region: "All",
    },
    {
      email: "ananya@adorzy.com",
      name: "Ananya Iyer",
      designation: "South Manager",
      role: Role.regional_manager,
      phone: "+91 98765 43211",
      region: "South",
    },
    {
      email: "kunal@adorzy.com",
      name: "Kunal Shah",
      designation: "West Manager",
      role: Role.regional_manager,
      phone: "+91 98765 43212",
      region: "West",
    },
    {
      email: "sanjay@adorzy.com",
      name: "Sanjay Sharma",
      designation: "North Manager",
      role: Role.regional_manager,
      phone: "+91 98765 43213",
      region: "North",
    },
    {
      email: "shinoy@adorzy.com",
      name: "Shinoy",
      designation: "South Rep",
      role: Role.ground_rep,
      phone: "+91 98765 43220",
      region: "South",
    },
    {
      email: "priya@adorzy.com",
      name: "Priya Nair",
      designation: "South Rep",
      role: Role.ground_rep,
      phone: "+91 98765 43221",
      region: "South",
    },
    {
      email: "amit@adorzy.com",
      name: "Amit Patel",
      designation: "West Rep",
      role: Role.ground_rep,
      phone: "+91 98765 43222",
      region: "West",
    },
    {
      email: "rohit@adorzy.com",
      name: "Rohit Verma",
      designation: "North Rep",
      role: Role.ground_rep,
      phone: "+91 98765 43223",
      region: "North",
    },
    {
      email: "neha@adorzy.com",
      name: "Neha Sen",
      designation: "Operations Analyst",
      role: Role.analyst,
      phone: "+91 98765 43230",
      region: "All",
    },
  ];

  const userMap = new Map<string, User>();
  for (const u of usersData) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        designation: u.designation,
        role: u.role,
        region: u.region,
        phone: u.phone,
        password_hash: hashedPassword,
      },
      create: {
        email: u.email,
        name: u.name,
        designation: u.designation,
        role: u.role,
        region: u.region,
        phone: u.phone,
        password_hash: hashedPassword,
        active: true,
      },
    });
    userMap.set(u.email, user);
  }
  console.log(`✅ Seeded ${userMap.size} users.`);

  // 3. Seed Stores
  console.log("🏬 Seeding 5 flagship stores...");
  const storesData = [
    {
      name: "Indiranagar Flagship Store",
      address: "100 Feet Rd, Indiranagar, Bengaluru, Karnataka",
      pin_code: "560038",
      lat: 12.9719,
      lng: 77.6412,
      radius_km: 10,
      region: "South",
      manager_id: userMap.get("ananya@adorzy.com")?.id,
    },
    {
      name: "Koramangala Experience Hub",
      address: "80 Feet Rd, 4th Block, Koramangala, Bengaluru, Karnataka",
      pin_code: "560034",
      lat: 12.9352,
      lng: 77.6245,
      radius_km: 8,
      region: "South",
      manager_id: userMap.get("ananya@adorzy.com")?.id,
    },
    {
      name: "Andheri Commercial Hub",
      address: "Link Road, Andheri West, Mumbai, Maharashtra",
      pin_code: "400053",
      lat: 19.1363,
      lng: 72.8277,
      radius_km: 12,
      region: "West",
      manager_id: userMap.get("kunal@adorzy.com")?.id,
    },
    {
      name: "Connaught Place Store",
      address: "Inner Circle, Connaught Place, New Delhi",
      pin_code: "110001",
      lat: 28.6315,
      lng: 77.2167,
      radius_km: 15,
      region: "North",
      manager_id: userMap.get("sanjay@adorzy.com")?.id,
    },
    {
      name: "Hitec City Tech Park Store",
      address: "Madhapur, Hitec City, Hyderabad, Telangana",
      pin_code: "500081",
      lat: 17.4483,
      lng: 78.3742,
      radius_km: 10,
      region: "South",
      manager_id: userMap.get("ananya@adorzy.com")?.id,
    },
  ];

  const storeMap = new Map<string, Store>();
  for (const s of storesData) {
    const existing = await prisma.store.findFirst({ where: { name: s.name } });
    if (existing) {
      const updated = await prisma.store.update({
        where: { id: existing.id },
        data: s,
      });
      storeMap.set(s.name, updated);
    } else {
      const created = await prisma.store.create({ data: s });
      storeMap.set(s.name, created);
    }
  }
  console.log(`✅ Seeded ${storeMap.size} stores.`);

  // Link some reps to their primary store
  const indiranagarStore = storeMap.get("Indiranagar Flagship Store");
  const andheriStore = storeMap.get("Andheri Commercial Hub");
  const cpStore = storeMap.get("Connaught Place Store");

  if (indiranagarStore) {
    await prisma.user.update({
      where: { email: "shinoy@adorzy.com" },
      data: { store_id: indiranagarStore.id },
    });
    await prisma.user.update({
      where: { email: "priya@adorzy.com" },
      data: { store_id: indiranagarStore.id },
    });
  }
  if (andheriStore) {
    await prisma.user.update({
      where: { email: "amit@adorzy.com" },
      data: { store_id: andheriStore.id },
    });
  }
  if (cpStore) {
    await prisma.user.update({
      where: { email: "rohit@adorzy.com" },
      data: { store_id: cpStore.id },
    });
  }

  // 4. Seed 30 Sample Leads
  console.log("🏢 Seeding 30 sample leads across categories and statuses...");

  const leadsData = [
    // South / Bangalore - Indiranagar Catchment (within ~5-8km)
    {
      company_name: "NexTech Enterprises Pvt Ltd",
      category: "Information Technology",
      lead_source: "Google Maps Scrape",
      phone_no: "+91 98450 11001",
      pin_code: "560038",
      address: "12th Main, HAL 2nd Stage, Indiranagar, Bengaluru",
      lat: 12.9698,
      lng: 77.6432,
      status: "Assigned",
      region: "South",
      website: "https://nextech.example.com",
      reviews_count: 84,
      assigned_store_id: indiranagarStore?.id,
      assigned_ground_rep_id: userMap.get("shinoy@adorzy.com")?.id,
      call_outcome: "Interested",
      call_date: new Date(),
      notes: "Looking for 50 enterprise office desks and ergonomic chairs.",
    },
    {
      company_name: "Urban Living Interiors",
      category: "Interior Design",
      lead_source: "JustDial B2B",
      phone_no: "+91 98450 11002",
      pin_code: "560008",
      address: "Cambridge Layout, Ulsoor, Bengaluru",
      lat: 12.9745,
      lng: 77.6289,
      status: "Hot",
      region: "South",
      website: "https://urbanliving.example.com",
      reviews_count: 142,
      assigned_store_id: indiranagarStore?.id,
      assigned_ground_rep_id: userMap.get("shinoy@adorzy.com")?.id,
      call_outcome: "Demo Requested",
      notes:
        "High intent, planning wholesale furniture procurement for luxury apartments.",
    },
    {
      company_name: "Bean & Brew Cafe Chain",
      category: "Hospitality",
      lead_source: "Instagram Lead Form",
      phone_no: "+91 98450 11003",
      pin_code: "560075",
      address: "New Thippasandra Main Road, Bengaluru",
      lat: 12.973,
      lng: 77.658,
      status: "New",
      region: "South",
      website: "https://beanandbrew.example.com",
      reviews_count: 310,
      notes: "Opening 3 new outlets, needs bulk commercial fixtures.",
    },
    {
      company_name: "CloudScale Systems",
      category: "Software Services",
      lead_source: "LinkedIn Sales Nav",
      phone_no: "+91 98450 11004",
      pin_code: "560037",
      address: "Outer Ring Road, Marathahalli, Bengaluru",
      lat: 12.956,
      lng: 77.698,
      status: "Converted",
      region: "South",
      website: "https://cloudscale.example.com",
      reviews_count: 45,
      assigned_store_id: indiranagarStore?.id,
      assigned_ground_rep_id: userMap.get("priya@adorzy.com")?.id,
      call_outcome: "Won",
      notes: "Contract signed for floor 3 and 4 fitout.",
    },
    {
      company_name: "Apex Diagnostics Center",
      category: "Healthcare",
      lead_source: "Industry Directory",
      phone_no: "+91 98450 11005",
      pin_code: "560007",
      address: "Airport Road, Kodihalli, Bengaluru",
      lat: 12.962,
      lng: 77.648,
      status: "Cold",
      region: "South",
      website: "https://apexdiagnostics.example.com",
      reviews_count: 19,
      assigned_store_id: indiranagarStore?.id,
      assigned_ground_rep_id: userMap.get("priya@adorzy.com")?.id,
      call_outcome: "Budget Postponed",
      notes: "Fiscal freeze until next quarter.",
    },

    // Bangalore - Koramangala Hub
    {
      company_name: "FinPulse Labs",
      category: "Fintech",
      lead_source: "Apollo.io",
      phone_no: "+91 98450 11006",
      pin_code: "560034",
      address: "1st Main, 5th Block, Koramangala, Bengaluru",
      lat: 12.934,
      lng: 77.621,
      status: "Hot",
      region: "South",
      website: "https://finpulse.example.com",
      reviews_count: 67,
      assigned_store_id: storeMap.get("Koramangala Experience Hub")?.id,
      assigned_ground_rep_id: userMap.get("priya@adorzy.com")?.id,
      call_outcome: "Site Visit Scheduled",
      notes: "Expanding team from 40 to 120 members.",
    },
    {
      company_name: "Saffron Spices Pvt Ltd",
      category: "FMCG / Food",
      lead_source: "Trade India",
      phone_no: "+91 98450 11007",
      pin_code: "560095",
      address: "Tavarekere Main Road, Bengaluru",
      lat: 12.924,
      lng: 77.616,
      status: "Assigned",
      region: "South",
      website: "https://saffronspices.example.com",
      reviews_count: 12,
      assigned_store_id: storeMap.get("Koramangala Experience Hub")?.id,
      assigned_ground_rep_id: userMap.get("priya@adorzy.com")?.id,
      notes: "Corporate headquarters redesign.",
    },
    {
      company_name: "GreenLeaf Co-working",
      category: "Real Estate",
      lead_source: "Referral",
      phone_no: "+91 98450 11008",
      pin_code: "560047",
      address: "Austin Town, Neelasandra, Bengaluru",
      lat: 12.951,
      lng: 77.613,
      status: "New",
      region: "South",
      website: "https://greenleafwork.example.com",
      reviews_count: 55,
      notes: "Seeking modular workstations for 80 seats.",
    },
    {
      company_name: "Stride Sports Academy",
      category: "Fitness & Sports",
      lead_source: "Google Scrape",
      phone_no: "+91 98450 11009",
      pin_code: "560068",
      address: "Madiwala Silk Board junction, Bengaluru",
      lat: 12.917,
      lng: 77.623,
      status: "New",
      region: "South",
      notes: "Needs reception counter and executive suite setup.",
    },
    {
      company_name: "Zenith Robotics",
      category: "Manufacturing",
      lead_source: "Industry Expo",
      phone_no: "+91 98450 11010",
      pin_code: "560100",
      address: "Electronic City Phase 1, Bengaluru",
      lat: 12.845,
      lng: 77.665,
      status: "New", // outside Indiranagar/Koramangala catchment (~14km away)
      region: "South",
      notes: "R&D lab setup, requires anti-static workstations.",
    },

    // West / Mumbai - Andheri Hub
    {
      company_name: "PrimeFrame Media Works",
      category: "Media & Production",
      lead_source: "Google Maps Scrape",
      phone_no: "+91 98200 22001",
      pin_code: "400053",
      address: "Laxmi Industrial Estate, Andheri West, Mumbai",
      lat: 19.138,
      lng: 72.831,
      status: "Hot",
      region: "West",
      website: "https://primeframe.example.com",
      reviews_count: 112,
      assigned_store_id: andheriStore?.id,
      assigned_ground_rep_id: userMap.get("amit@adorzy.com")?.id,
      notes: "Sound-dampened meeting pods and edit suites.",
    },
    {
      company_name: "Oceanic Freight Logistics",
      category: "Logistics",
      lead_source: "IndiaMART",
      phone_no: "+91 98200 22002",
      pin_code: "400099",
      address: "Sahar Cargo Complex, Andheri East, Mumbai",
      lat: 19.105,
      lng: 72.868,
      status: "Assigned",
      region: "West",
      website: "https://oceanicfreight.example.com",
      reviews_count: 48,
      assigned_store_id: andheriStore?.id,
      assigned_ground_rep_id: userMap.get("amit@adorzy.com")?.id,
      notes: "Dispatch center ergonomic chairs order.",
    },
    {
      company_name: "Zenith Diamond Exporters",
      category: "Retail / Luxury",
      lead_source: "B2B Directory",
      phone_no: "+91 98200 22003",
      pin_code: "400051",
      address: "Bandra Kurla Complex (BKC), G Block, Mumbai",
      lat: 19.065,
      lng: 72.866,
      status: "Converted",
      region: "West",
      website: "https://zenithdiamonds.example.com",
      reviews_count: 76,
      assigned_store_id: andheriStore?.id,
      assigned_ground_rep_id: userMap.get("amit@adorzy.com")?.id,
      notes: "Bespoke executive boardroom completed.",
    },
    {
      company_name: "Silverline Hospital Care",
      category: "Healthcare",
      lead_source: "Cold Outreach",
      phone_no: "+91 98200 22004",
      pin_code: "400058",
      address: "S.V. Road, Andheri West, Mumbai",
      lat: 19.121,
      lng: 72.842,
      status: "New",
      region: "West",
      notes: "Waiting lounge seating consultation.",
    },
    {
      company_name: "Marigold Fine Dine & Banquets",
      category: "Hospitality",
      lead_source: "JustDial B2B",
      phone_no: "+91 98200 22005",
      pin_code: "400049",
      address: "Juhu Tara Road, Juhu, Mumbai",
      lat: 19.098,
      lng: 72.826,
      status: "Hot",
      region: "West",
      reviews_count: 420,
      notes: "Banquet chairs and banquet tables wholesale enquiry.",
    },
    {
      company_name: "BlueAnchor Shipping Ltd",
      category: "Logistics",
      lead_source: "Company Website Inbound",
      phone_no: "+91 98200 22006",
      pin_code: "400001",
      address: "Fort, Ballard Estate, Mumbai",
      lat: 18.938,
      lng: 72.841,
      status: "New", // South Mumbai, ~23km away from Andheri -> outside radius!
      region: "West",
      notes: "Branch relocation, pending store assignment review.",
    },

    // North / Delhi - Connaught Place Hub
    {
      company_name: "Vanguard Law Chambers",
      category: "Legal & Professional",
      lead_source: "Bar Council Directory",
      phone_no: "+91 98110 33001",
      pin_code: "110001",
      address: "Barakhamba Road, Connaught Place, New Delhi",
      lat: 28.629,
      lng: 77.228,
      status: "Hot",
      region: "North",
      website: "https://vanguardlaw.example.com",
      reviews_count: 53,
      assigned_store_id: cpStore?.id,
      assigned_ground_rep_id: userMap.get("rohit@adorzy.com")?.id,
      notes: "High end mahogany conference tables and library shelving.",
    },
    {
      company_name: "NorthStar Educational Trust",
      category: "Education",
      lead_source: "Government Tender / Lead",
      phone_no: "+91 98110 33002",
      pin_code: "110002",
      address: "Daryaganj, Old Delhi, New Delhi",
      lat: 28.644,
      lng: 77.241,
      status: "Assigned",
      region: "North",
      assigned_store_id: cpStore?.id,
      assigned_ground_rep_id: userMap.get("rohit@adorzy.com")?.id,
      notes: "Institutional classroom benches and lab counters.",
    },
    {
      company_name: "Capital Wealth Advisory",
      category: "Financial Services",
      lead_source: "LinkedIn",
      phone_no: "+91 98110 33003",
      pin_code: "110003",
      address: "Lodhi Road, Institutional Area, New Delhi",
      lat: 28.588,
      lng: 77.225,
      status: "New",
      region: "North",
      website: "https://capitalwealth.example.com",
      reviews_count: 39,
      notes: "Executive suite upgrades.",
    },
    {
      company_name: "CyberSecurity Frontier",
      category: "Cybersecurity",
      lead_source: "Google Search",
      phone_no: "+91 98110 33004",
      pin_code: "110005",
      address: "Karol Bagh commercial zone, New Delhi",
      lat: 28.648,
      lng: 77.191,
      status: "Lost",
      region: "North",
      notes: "Competitor offered lower quotes.",
    },
    {
      company_name: "Grand Palace Banquets",
      category: "Hospitality",
      lead_source: "JustDial",
      phone_no: "+91 98110 33005",
      pin_code: "110019",
      address: "Nehru Place, New Delhi",
      lat: 28.549,
      lng: 77.251,
      status: "New",
      region: "North",
      notes: "Seating for 350 conference participants.",
    },

    // South / Hyderabad - Hitec City Hub
    {
      company_name: "InfraPulse Cloud Tech",
      category: "Cloud Computing",
      lead_source: "Sales Nav",
      phone_no: "+91 98660 44001",
      pin_code: "500081",
      address: "Mindspace IT Park, Hitec City, Hyderabad",
      lat: 17.442,
      lng: 78.382,
      status: "Hot",
      region: "South",
      website: "https://infrapulse.example.com",
      reviews_count: 89,
      assigned_store_id: storeMap.get("Hitec City Tech Park Store")?.id,
      notes: "Need 200 ergonomic chairs and height-adjustable desks.",
    },
    {
      company_name: "PharmaCore Life Sciences",
      category: "Pharmaceuticals",
      lead_source: "Trade Fair",
      phone_no: "+91 98660 44002",
      pin_code: "500072",
      address: "Kukatpally Housing Board, Hyderabad",
      lat: 17.492,
      lng: 78.401,
      status: "Assigned",
      region: "South",
      assigned_store_id: storeMap.get("Hitec City Tech Park Store")?.id,
      notes: "Lab storage racks and clean-room seating.",
    },
    {
      company_name: "BioGen Research Labs",
      category: "Biotechnology",
      lead_source: "Directory",
      phone_no: "+91 98660 44003",
      pin_code: "500084",
      address: "Kondapur, Hyderabad",
      lat: 17.468,
      lng: 78.362,
      status: "New",
      region: "South",
      notes: "New facility fitout.",
    },

    // Unmapped / Outside Catchment Leads (For testing the Unmapped Review & Proximity Logic!)
    {
      company_name: "Heritage Silks & Sarees",
      category: "Retail / Textiles",
      lead_source: "Scraped Data",
      phone_no: "+91 98800 55001",
      pin_code: "570001",
      address: "Sayyaji Rao Road, Mysore, Karnataka",
      lat: 12.311,
      lng: 76.654,
      status: "New", // ~140 km from Bangalore -> clearly Unmapped!
      region: "South",
      notes:
        "Mysore retail showroom revamp, looking for nearest hub or direct dispatch.",
    },
    {
      company_name: "Pune Precision Auto Components",
      category: "Automotive / Manufacturing",
      lead_source: "Industry Scrape",
      phone_no: "+91 98900 66001",
      pin_code: "411057",
      address: "Hinjewadi Phase 2, Pune, Maharashtra",
      lat: 18.591,
      lng: 73.738,
      status: "New", // ~120 km from Mumbai Andheri -> Unmapped!
      region: "West",
      notes:
        "Expansion of Pune office, needs store assignment override or new store coverage.",
    },
    {
      company_name: "PinkCity Gemstone Exports",
      category: "Jewellery & Exports",
      lead_source: "Export Council",
      phone_no: "+91 98290 77001",
      pin_code: "302001",
      address: "Johari Bazar, Jaipur, Rajasthan",
      lat: 26.921,
      lng: 75.826,
      status: "New", // ~260 km from Delhi -> Unmapped!
      region: "North",
      notes: "Showroom display vitrines and velvet consultation seating.",
    },
    {
      company_name: "Coimbatore Textile Mills Ltd",
      category: "Textiles",
      lead_source: "Trade Directory",
      phone_no: "+91 98420 88001",
      pin_code: "641001",
      address: "Avanashi Road, Coimbatore, Tamil Nadu",
      lat: 11.016,
      lng: 76.955,
      status: "New", // Tamil Nadu South -> Unmapped!
      region: "South",
      notes: "Admin building renovation.",
    },
    {
      company_name: "Ahmedabad Chemical Polymers",
      category: "Chemicals",
      lead_source: "Chemical Directory",
      phone_no: "+91 98250 99001",
      pin_code: "380009",
      address: "Navrangpura, Ahmedabad, Gujarat",
      lat: 23.036,
      lng: 72.561,
      status: "New", // Gujarat -> Unmapped!
      region: "West",
      notes: "Factory manager offices furniture.",
    },
    {
      company_name: "Kolkata Riverfront Logistics",
      category: "Logistics",
      lead_source: "Maritime Trade",
      phone_no: "+91 98300 00111",
      pin_code: "700001",
      address: "Strand Road, BBD Bagh, Kolkata, West Bengal",
      lat: 22.573,
      lng: 88.351,
      status: "New", // East region -> Unmapped!
      region: "East",
      notes: "Headquarters reception and boardrooms.",
    },
  ];

  for (const lead of leadsData) {
    const existing = await prisma.lead.findFirst({
      where: {
        phone_no: lead.phone_no,
        pin_code: lead.pin_code,
      },
    });
    if (!existing) {
      await prisma.lead.create({
        data: {
          company_name: lead.company_name,
          category: lead.category,
          lead_source: lead.lead_source,
          phone_no: lead.phone_no,
          pin_code: lead.pin_code,
          address: lead.address,
          lat: lead.lat,
          lng: lead.lng,
          status: lead.status,
          region: lead.region,
          website: lead.website || null,
          reviews_count: lead.reviews_count || 0,
          assigned_store_id: lead.assigned_store_id || null,
          assigned_ground_rep_id: lead.assigned_ground_rep_id || null,
          call_outcome: lead.call_outcome || null,
          call_date: lead.call_date || null,
          notes: lead.notes || null,
          scraped_date: new Date(),
        },
      });
    }
  }

  console.log(`✅ Seeded ${leadsData.length} leads successfully!`);
  console.log("\n🎉 Database initialization and seeding complete!");
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
