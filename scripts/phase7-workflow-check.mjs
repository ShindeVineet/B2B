import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import { unlink } from "node:fs/promises";
import path from "node:path";
const db = new PrismaClient();
const tag = "phase7-check-" + Date.now();
const users = [],
  leads = [];
async function call(user, url, body, method = body ? "POST" : "GET") {
  const r = await fetch("http://127.0.0.1:3000/api" + url, {
    method,
    headers: {
      Authorization:
        "Bearer " +
        jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: "10m" }),
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, data: await r.json() };
}
try {
  const head = await db.user.findFirstOrThrow({
      where: { role: "b2b_head", active: true },
    }),
    ops = await db.user.findFirstOrThrow({
      where: { role: "analyst", active: true },
    });
  for (let i = 0; i < 2; i++)
    users.push(
      await db.user.create({
        data: {
          name: tag,
          email: `${tag}-${i}@example.test`,
          password_hash: "not-a-login-password",
          role: "ground_rep",
        },
      }),
    );
  const [rep, other] = users;
  const lead = await db.lead.create({
    data: {
      company_name: tag,
      phone_no: "9000012345",
      assigned_ground_rep_id: rep.id,
      geocode_status: "ok",
    },
  });
  leads.push(lead.id);
  assert.match(lead.lead_code, /^LD-\d{6,}$/);
  assert.equal(
    (
      await db.leadPhone.findMany({
        where: { lead_id: lead.id, is_primary: true },
      })
    ).length,
    1,
  );
  await assert.rejects(
    db.lead.update({
      where: { id: lead.id },
      data: { lead_code: "LD-000000" },
    }),
  );
  let r = await call(rep, `/leads/${lead.id}/phones`, {
    phone_number: "9000098765",
    label: "whatsapp",
    is_primary: true,
  });
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.equal(
    (await db.lead.findUnique({ where: { id: lead.id } })).phone_no,
    "9000098765",
  );
  assert.equal(
    await db.leadPhone.count({ where: { lead_id: lead.id, is_primary: true } }),
    1,
  );
  assert.equal((await call(other, `/leads/${lead.id}/phones`)).status, 404);
  await db.lead.update({
    where: { id: lead.id },
    data: { phone_no: "9000055555" },
  });
  assert.equal(
    (
      await db.leadPhone.findFirst({
        where: { lead_id: lead.id, is_primary: true },
      })
    ).phone_number,
    "9000055555",
  );
  await db.consultation.create({
    data: {
      lead_id: lead.id,
      rep_id: rep.id,
      outcome: "On-boarding Done",
      decision_maker_name: "Owner",
      designation: "Director",
    },
  });
  const fields = {
    company_firm_name: tag,
    contact_person_name: "Owner",
    designation: "Director",
    mobile_number: "9000012345",
    office_address: "Test office",
    pincode: "999999",
    city: "Test City",
    state: "Test",
    type_of_professional: "architect",
    years_operating: 4,
    specialized_in: "Homes",
    expected_monthly_order_value: 10000,
    gst_registered: false,
    pan_no: "TESTPAN",
    bank_account_name: "Test account",
    bank_name: "Test Bank",
    branch: "Test branch",
    account_no: "00001234",
    ifsc_code: "TEST000001",
    onboarded_from: "ground_visit",
  };
  r = await call(rep, "/partners/prefill?lead_id=" + lead.id);
  assert.equal(r.status, 200);
  assert.equal(r.data.fields.contact_person_name, "Owner");
  const submissions = await Promise.all(
    Array.from({ length: 4 }, (_, index) =>
      call(rep, "/partners", {
        ...fields,
        contact_person_name: `Owner ${index}`,
        source_lead_id: lead.id,
        additional_phones: "9000077777;9000088888",
      }),
    ),
  );
  for (const s of submissions) assert.equal(s.status, 201, JSON.stringify(s));
  assert.equal(
    new Set(submissions.map((s) => s.data.partner.partner_code)).size,
    4,
  );
  const p = submissions[0].data.partner;
  assert.equal(p.source_lead_code, lead.lead_code);
  assert.equal(await db.partnerPhone.count({ where: { partner_id: p.id } }), 2);
  assert.equal((await call(other, "/partners/" + p.id)).status, 404);
  assert.equal(
    (await call(rep, "/partners/" + p.id, { action: "activate" }, "PATCH"))
      .status,
    403,
  );
  r = await call(
    ops,
    "/partners/" + p.id,
    { action: "reject", rejection_reason: "Fix bank details" },
    "PATCH",
  );
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.equal(
    await db.partnerNotification.count({
      where: { partner_id: p.id, user_id: rep.id },
    }),
    1,
  );
  r = await call(
    rep,
    "/partners/" + p.id,
    { ...fields, action: "resubmit" },
    "PATCH",
  );
  assert.equal(r.status, 200, JSON.stringify(r));
  await db.followUp.create({
    data: {
      lead_id: lead.id,
      rep_id: rep.id,
      due_date: new Date("2026-09-30"),
    },
  });
  r = await call(ops, "/partners/" + p.id, { action: "activate" }, "PATCH");
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.equal(
    (await db.lead.findUnique({ where: { id: lead.id } })).status,
    "onboarded",
  );
  assert.equal(
    (await db.followUp.findUnique({ where: { lead_id: lead.id } })).active,
    false,
  );
  r = await call(head, "/partners", { ...fields, gst_registered: true });
  assert.equal(r.status, 400);
  const historical = {
    ...fields,
    contact_person_name: "Historical contact",
    partner_code: tag + "-H",
    mobile_number: "9000066666",
    form_submitter_email: "test@example.test",
  };
  r = await call(head, "/partners/import", {
    rows: [{ fields: historical }],
    commit: false,
  });
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.equal(r.data.rows[0].matches.length, 0);
  r = await call(head, "/partners/import", {
    rows: [{ fields: historical }],
    commit: true,
  });
  assert.equal(r.status, 200, JSON.stringify(r));
  const h = await db.partner.findUniqueOrThrow({
    where: { partner_code: historical.partner_code },
  });
  assert.equal(h.partner_status, "active");
  assert.equal(h.is_migrated_historical, true);
  assert.equal(h.source_lead_id, null);
  r = await call(head, "/partners/import", {
    rows: [
      {
        fields: {
          ...historical,
          partner_code: tag + "-other",
          business_email_id: "fill@example.test",
        },
      },
    ],
    commit: false,
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.rows[0].matches[0].id, h.id);
  assert.equal(
    r.data.rows[0].merge_preview.business_email_id,
    "fill@example.test",
  );
  r = await call(head, "/partners/import", {
    rows: [
      {
        fields: {
          ...historical,
          partner_code: tag + "-other",
          business_email_id: "fill@example.test",
        },
        decision: "merge",
        merge_id: h.id,
      },
    ],
    commit: true,
  });
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.equal(
    (await db.partner.findUnique({ where: { id: h.id } })).partner_code,
    h.partner_code,
  );

  // Duplicates inside one upload must be visible in preview and explicitly resolved.
  const batchFields = {
    ...fields,
    contact_person_name: "Batch contact",
    mobile_number: "9000033333",
    partner_code: tag + "-batch",
  };
  r = await call(head, "/partners/import", {
    rows: [
      { fields: batchFields },
      { fields: { ...batchFields, partner_code: tag + "-batch2" } },
    ],
    commit: false,
  });
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.equal(r.data.rows[1].matches[0].id, "row:0");
  r = await call(head, "/partners/import", {
    rows: [
      { fields: batchFields },
      {
        fields: { ...batchFields, partner_code: tag + "-batch2" },
        decision: "merge",
        merge_id: "row:0",
      },
    ],
    commit: true,
  });
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.equal(r.data.rows[1].status, "merged");
  // Historical records are hidden from other regions until explicitly assigned.
  const store = await db.store.findFirstOrThrow({ where: { active: true } });
  const manager = await db.user.create({
    data: {
      name: tag,
      email: tag + "-manager@example.test",
      password_hash: "not-a-login-password",
      role: "regional_manager",
      region: store.region,
    },
  });
  users.push(manager);
  assert.equal((await call(manager, "/partners/" + h.id)).status, 404);
  r = await call(
    head,
    "/partners/" + h.id,
    { ...historical, region_override: store.region },
    "PATCH",
  );
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.equal((await call(manager, "/partners/" + h.id)).status, 200);
  assert.equal(
    (await call(manager, "/partners/" + h.id, { ...historical }, "PATCH"))
      .status,
    403,
  );
  // No PIN means no provider calls; import still saves phones and a Mapping Issue.
  r = await call(head, "/leads/bulk-import", {
    rows: [
      {
        company_name: tag + "-bulk",
        phone_no: "9000044444;9000044445,9000044446",
        google_map_link: "https://www.google.com/maps?q=12.9716,77.5946",
      },
    ],
  });
  assert.equal(r.status, 200, JSON.stringify(r));
  const imported = await db.lead.findFirstOrThrow({
    where: { company_name: tag + "-bulk" },
  });
  leads.push(imported.id);
  assert.equal(
    await db.leadPhone.count({ where: { lead_id: imported.id } }),
    3,
  );
  assert.equal(
    await db.leadPhone.count({
      where: { lead_id: imported.id, source: "import" },
    }),
    3,
  );
  assert.equal(imported.phone_no, "9000044444");
  // Document privacy: even another authenticated rep cannot access an unsubmitted upload.
  const fd = new FormData();
  fd.set(
    "file",
    new File([Buffer.from("%PDF-1.4\n%%EOF")], "test.pdf", {
      type: "application/pdf",
    }),
  );
  const upload = await fetch("http://127.0.0.1:3000/api/partner-documents", {
    method: "POST",
    headers: {
      Authorization:
        "Bearer " +
        jwt.sign({ id: rep.id }, process.env.JWT_SECRET, { expiresIn: "10m" }),
    },
    body: fd,
  });
  assert.equal(upload.status, 200);
  const doc = await upload.json();
  const denied = await fetch("http://127.0.0.1:3000" + doc.url, {
    headers: {
      Authorization:
        "Bearer " +
        jwt.sign({ id: other.id }, process.env.JWT_SECRET, {
          expiresIn: "10m",
        }),
    },
  });
  assert.equal(denied.status, 404);
  console.log(
    "Phase 7 workflow passed: concurrent codes, immutable lead codes, phone sync/access, onboarding/review/resubmission, activation queues, GST validation, historical import/merge, private documents.",
  );
} finally {
  const ps = await db.partner.findMany({
      where: { company_firm_name: tag },
      select: { id: true },
    }),
    ids = ps.map((p) => p.id);
  const docs = await db.partnerDocument.findMany({
    where: { owner_id: { in: users.map((u) => u.id) } },
  });
  await db.partnerDocument.deleteMany({
    where: { id: { in: docs.map((d) => d.id) } },
  });
  for (const d of docs)
    await unlink(
      path.join(
        process.env.PHOTO_STORAGE_DIR ||
          path.join(process.cwd(), ".data", "photos"),
        d.filename,
      ),
    ).catch(() => {});
  await db.partnerNotification.deleteMany({
    where: { partner_id: { in: ids } },
  });
  await db.partnerActivity.deleteMany({ where: { partner_id: { in: ids } } });
  await db.partnerPhone.deleteMany({ where: { partner_id: { in: ids } } });
  await db.partner.deleteMany({ where: { id: { in: ids } } });
  const extraLeads = await db.lead.findMany({
    where: { company_name: { startsWith: tag } },
    select: { id: true },
  });
  leads.push(...extraLeads.map((l) => l.id));
  await db.followUp.deleteMany({ where: { lead_id: { in: leads } } });
  await db.lead.deleteMany({ where: { id: { in: leads } } });
  await db.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  await db.$disconnect();
}
