import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
const db = new PrismaClient(),
  tag = "partner-identity-check-" + Date.now();
try {
  const head = await db.user.findFirstOrThrow({
    where: { role: "b2b_head", active: true },
  });
  async function call(path, body, method = "POST") {
    const r = await fetch("http://127.0.0.1:3000/api" + path, {
      method,
      headers: {
        Authorization:
          "Bearer " +
          jwt.sign({ id: head.id }, process.env.JWT_SECRET, {
            expiresIn: "10m",
          }),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    return { status: r.status, data: await r.json() };
  }
  const fields = {
    company_firm_name: tag,
    contact_person_name: "Alex",
    designation: "Director",
    mobile_number: "9000011223",
    office_address: "Synthetic office",
    pincode: "560001",
    city: "BLR",
    state: "KA",
    type_of_professional: "builder",
    years_operating: "5",
    specialized_in: "Both",
    expected_monthly_order_value: 100,
    gst_registered: false,
    pan_no: "TESTPAN",
    bank_account_name: tag,
    bank_name: "Test",
    branch: "Test",
    account_no: "0000123",
    ifsc_code: "TEST00001",
    onboarded_from: "ground_visit",
  };
  const variants = [
    {},
    { contact_person_name: "Sam" },
    { designation: "Manager" },
    { contact_person_name: "Sam", designation: "Manager" },
  ];
  const created = [];
  for (const v of variants) {
    const r = await call("/partners", { ...fields, ...v });
    assert.equal(r.status, 201, JSON.stringify(r));
    created.push(r.data.partner);
  }
  let r = await call("/partners", {
    ...fields,
    company_firm_name: " " + tag.toUpperCase() + " ",
    contact_person_name: " ALEX ",
    designation: " director ",
  });
  assert.equal(r.status, 409, JSON.stringify(r));
  r = await call("/partners/" + created[1].id, { action: "activate" }, "PATCH");
  assert.equal(r.status, 200, JSON.stringify(r));
  r = await call(
    "/partners/" + created[1].id,
    { ...fields, partner_code: created[1].partner_code },
    "PATCH",
  );
  assert.equal(r.status, 409, JSON.stringify(r));
  const code = tag + "-import";
  const importRows = [
    { ...fields, contact_person_name: "Import One", partner_code: code },
    { ...fields, contact_person_name: "Import Two", partner_code: code + "2" },
    {
      ...fields,
      contact_person_name: "Import One",
      designation: "Other",
      partner_code: code + "3",
    },
  ].map((fields) => ({ fields }));
  r = await call("/partners/import", { rows: importRows });
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.ok(
    r.data.rows.every((row) => !row.error && !row.matches.length),
    JSON.stringify(r),
  );
  r = await call("/partners/import", { commit: true, rows: importRows });
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.equal(
    r.data.rows.filter((row) => row.status === "imported").length,
    3,
  );
  r = await call("/partners/import", {
    rows: [{ fields: { ...importRows[0].fields, partner_code: code + "new" } }],
  });
  assert.equal(r.data.rows[0].matches.length, 1);
  r = await call("/partners/import", {
    rows: [
      {
        fields: {
          ...fields,
          contact_person_name: "Another",
          partner_code: code,
        },
      },
    ],
  });
  assert.equal(
    r.data.rows[0].matches.length,
    1,
    "Existing partner code must remain a conflict",
  );
  r = await call("/partners/import", {
    rows: [
      {
        fields: {
          ...fields,
          contact_person_name: "New in sheet",
          partner_code: code + "4",
        },
      },
      {
        fields: {
          ...fields,
          contact_person_name: "New in sheet",
          partner_code: code + "5",
        },
      },
    ],
  });
  assert.equal(r.data.rows[1].matches[0].id, "row:0");
  console.log(
    "Partner identity checks passed: company reuse with contact/designation changes, shared phone/GST allowed, exact duplicates rejected on add/edit, database and same-file import duplicate review, unique codes retained.",
  );
} finally {
  const ids = (
    await db.partner.findMany({
      where: { company_firm_name: { equals: tag, mode: "insensitive" } },
      select: { id: true },
    })
  ).map((p) => p.id);
  await db.partnerActivity.deleteMany({ where: { partner_id: { in: ids } } });
  await db.partnerPhone.deleteMany({ where: { partner_id: { in: ids } } });
  await db.partnerNotification.deleteMany({
    where: { partner_id: { in: ids } },
  });
  await db.partner.deleteMany({ where: { id: { in: ids } } });
  await db.$disconnect();
}
