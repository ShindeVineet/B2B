import { readFileSync } from "node:fs";
import Papa from "papaparse";
import { prisma as db } from "../src/lib/prisma";
import {
  LEGACY_BATCH,
  normalName,
  mobile,
  parseLegacyRow,
  type LegacyRow,
} from "../src/lib/legacy/consultations";

async function main() {
  const file = process.argv.find((a) => a.endsWith(".csv"));
  if (!file)
    throw Error(
      "Provide the consultation CSV path; add --apply only after reviewing the dry run.",
    );
  const apply = process.argv.includes("--apply");
  const parsed = Papa.parse<LegacyRow>(
    readFileSync(file, "utf8").replace(/^\uFEFF/, ""),
    { header: true, skipEmptyLines: "greedy" },
  );
  if (parsed.errors.length)
    throw Error("CSV parsing errors: " + JSON.stringify(parsed.errors));
  const records = parsed.data.map((raw, i) => parseLegacyRow(raw, i + 2));
  if (records.some((r) => !r.timestamp || !r.executiveName))
    throw Error(
      "Unresolved timestamp/executive; no changes made. Review source rows.",
    );
  const users = await db.user.findMany({ where: { active: true } });
  const head = users.find((u) => u.role === "b2b_head");
  if (!head) throw Error("Missing B2B Head");
  for (const r of records)
    if (!users.some((u) => u.name === r.executiveName))
      throw Error("Missing executive account: " + r.executiveName);
  const leads = await db.lead.findMany({
    include: { consultations: { orderBy: { created_at: "desc" }, take: 1 } },
  });
  const partners = await db.partner.findMany();
  const seen = new Set(
    (
      await db.consultation.findMany({
        where: { id: { in: records.map((r) => r.id) } },
        select: { id: true },
      })
    ).map((c) => c.id),
  );
  const report = {
    rows: records.length,
    alreadyImported: 0,
    newLeads: 0,
    matchedLeads: 0,
    consultations: 0,
    partnerLinks: 0,
    issueRows: 0,
    issues: {} as Record<string, number>,
  };
  const states: Record<string, string> = {
    "Visit scheduled": "Active — Visit Scheduled",
    "Nurturing required": "Active — Nurturing",
    "Dont want commission": "Needs Manager Review",
    "Lost Lead - (does not do tiles business)": "Closed-Lost",
    "Wrong Location/Office closed": "Needs Data Correction",
  };
  for (const r of records.sort(
    (a, b) =>
      a.timestamp!.getTime() - b.timestamp!.getTime() ||
      a.rowNumber - b.rowNumber,
  )) {
    if (seen.has(r.id)) {
      report.alreadyImported++;
      continue;
    }
    const rep = users.find((u) => u.name === r.executiveName)!;
    const get = (key: string) => (r.raw[key] || "").trim();
    const name = normalName(r.company);
    // Require exact company plus phone, or exact company/address when phone is absent.
    const candidates = leads.filter(
      (l) =>
        name &&
        normalName(l.company_name) === name &&
        (r.phone
          ? mobile(l.phone_no) === r.phone
          : !mobile(l.phone_no) &&
            get("Address") &&
            normalName(l.address) === normalName(get("Address"))),
    );
    let lead = candidates.length === 1 ? candidates[0] : undefined;
    if (candidates.length > 1)
      r.issues.push("Ambiguous existing lead match; kept separate for review");
    if (!lead && leads.some((l) => name && normalName(l.company_name) === name))
      r.issues.push(
        "Same company has different or missing contact details; review possible duplicate",
      );
    if (lead?.assigned_ground_rep_id && lead.assigned_ground_rep_id !== rep.id)
      r.issues.push(
        "Executive differs from current assignee; assignment preserved",
      );
    let matches = partners.filter(
      (p) =>
        name &&
        normalName(p.company_firm_name) === name &&
        ((r.phone && mobile(p.mobile_number) === r.phone) ||
          (normalName(get("Decision Maker Name")) &&
            normalName(p.contact_person_name) ===
              normalName(get("Decision Maker Name")))),
    );
    if (lead) {
      const linked = partners.filter((p) => p.source_lead_id === lead!.id);
      if (linked.length) matches = linked;
    }
    const partner = matches.length === 1 ? matches[0] : undefined;
    const canLink =
      partner &&
      (!partner.source_lead_id || partner.source_lead_id === lead?.id);
    if (matches.length > 1)
      r.issues.push("Multiple partner matches; manual reconciliation required");
    if (partner && !canLink)
      r.issues.push("Matching partner already linked to another lead");
    if (
      !partner &&
      partners.some((p) => name && normalName(p.company_firm_name) === name)
    )
      r.issues.push(
        "Partner company matches but contact identity differs; not auto-linked",
      );
    if (r.onboarded && (!canLink || partner?.partner_status !== "active"))
      r.issues.push(
        "Historical onboarding claim has no confirmed active partner link",
      );
    const newId = "legacy_lead_" + r.id.replace("legacy_consult_", "");
    const newData = {
      id: newId,
      company_name: r.company || `NA — historical row ${r.rowNumber}`,
      phone_no: r.phone,
      pin_code: r.pin,
      address: get("Address") || null,
      category: get("Lead Type") || null,
      lead_source: "old_data",
      region: rep.region,
      assigned_store_id: rep.store_id,
      assigned_ground_rep_id: rep.id,
      status:
        canLink && partner?.partner_status === "active"
          ? "onboarded"
          : states[r.outcome] || "Visited",
      outcome: r.outcome,
      notes: get("Notes") || null,
      created_at: r.timestamp!,
      geocode_status: "mapping_issue" as const,
      geocode_issue_reason: "not_found",
      geocode_flagged_at: new Date(),
      calling_associate_id:
        users.find(
          (u) => u.role === "store_associate" && u.store_id === rep.store_id,
        )?.id || null,
    };
    const isNew = !lead;
    if (!lead) report.newLeads++;
    else report.matchedLeads++;
    report.consultations++;
    if (canLink && !partner!.source_lead_id) report.partnerLinks++;
    if (r.issues.length) report.issueRows++;
    for (const issue of r.issues)
      report.issues[issue] = (report.issues[issue] || 0) + 1;
    if (apply) {
      const existing = lead;
      const isLatest =
        !existing?.consultations[0] ||
        existing.consultations[0].created_at <= r.timestamp!;
      const result = await db.$transaction(async (tx) => {
        const l = existing
          ? await tx.lead.update({
              where: { id: existing.id },
              data: {
                lead_source: "old_data",
                ...(isLatest && existing.status !== "onboarded"
                  ? {
                      outcome: r.outcome,
                      status: states[r.outcome] || "Visited",
                    }
                  : {}),
                ...(!existing.assigned_ground_rep_id
                  ? { assigned_ground_rep_id: rep.id }
                  : {}),
                ...(!existing.assigned_store_id
                  ? { assigned_store_id: rep.store_id }
                  : {}),
                ...(!existing.address && get("Address")
                  ? { address: get("Address") }
                  : {}),
                ...(!existing.pin_code && r.pin ? { pin_code: r.pin } : {}),
                ...(canLink && partner?.partner_status === "active"
                  ? { status: "onboarded" }
                  : {}),
              },
            })
          : await tx.lead.create({ data: newData });
        await tx.consultation.create({
          data: {
            id: r.id,
            lead_id: l.id,
            rep_id: rep.id,
            created_at: r.timestamp!,
            visit_date: r.timestamp!,
            company_name: r.company || "NA",
            ground_staff_name: r.originalExecutive || "NA",
            interest_level: r.interest,
            outcome: r.outcome,
            decision_maker_name: get("Decision Maker Name") || "NA",
            decision_maker_phone: r.phone,
            alternate_mobile_number: r.phones[1] || null,
            designation: get("Designation") || "NA",
            email: get("Email") || null,
            lead_type: get("Lead Type") || "NA",
            current_lead_status: get("Current Lead Status") || "NA",
            primary_pain_point: get("Primary Pain Point Observed") || "NA",
            competitor_involved: get("Competitor Involved") || "NA",
            notes: get("Notes") || "NA",
            next_follow_up_date: r.followup
              ? new Date(
                  get("Next Follow-up Date").split("/").reverse().join("-") +
                    "T00:00:00Z",
                )
              : null,
            responses: {
              legacy_batch: LEGACY_BATCH,
              source_row: r.rowNumber,
              raw: r.raw,
              issues: r.issues,
              historical_onboarding_claim: r.onboarded,
            },
            site_photos: [],
          },
        });
        for (const phone of r.phones.slice(1))
          await tx.leadPhone.upsert({
            where: {
              lead_id_phone_number: { lead_id: l.id, phone_number: phone },
            },
            create: {
              lead_id: l.id,
              phone_number: phone,
              label: "alternate",
              source: "import",
            },
            update: {},
          });
        if (canLink && !partner!.source_lead_id) {
          await tx.partner.update({
            where: { id: partner!.id },
            data: { source_lead_id: l.id, source_lead_code: l.lead_code },
          });
          await tx.partnerActivity.create({
            data: {
              partner_id: partner!.id,
              actor_id: head.id,
              action: "LEGACY_LEAD_LINKED",
              new_value: l.id,
            },
          });
        }
        await tx.activityLog.create({
          data: {
            lead_id: l.id,
            actor_id: head.id,
            action: "OLD_DATA_IMPORTED",
            old_value: existing?.lead_source || null,
            new_value: JSON.stringify({
              batch: LEGACY_BATCH,
              row: r.rowNumber,
              consultation_id: r.id,
              issues: r.issues,
            }),
          },
        });
        if (
          isLatest &&
          r.followup &&
          l.status !== "onboarded" &&
          ["Visit scheduled", "Nurturing required"].includes(r.outcome)
        ) {
          const due_date = new Date(
            Date.UTC(
              r.followup.getUTCFullYear(),
              r.followup.getUTCMonth(),
              r.followup.getUTCDate(),
            ) + 86400000,
          );
          await tx.followUp.upsert({
            where: { lead_id: l.id },
            create: {
              lead_id: l.id,
              rep_id: l.assigned_ground_rep_id || rep.id,
              due_date,
              active: true,
            },
            update: {
              due_date,
              rep_id: l.assigned_ground_rep_id || rep.id,
              active: true,
            },
          });
        }
        return l;
      });
      if (canLink) partner!.source_lead_id = result.id;
      if (isNew) leads.push({ ...result, consultations: [] });
      else Object.assign(lead!, result);
    } else {
      if (isNew) {
        lead = {
          ...newData,
          consultations: [],
        } as unknown as (typeof leads)[number];
        leads.push(lead);
      }
      if (canLink) partner!.source_lead_id = lead!.id;
    }
  }
  console.log(
    JSON.stringify({ mode: apply ? "applied" : "dry_run", ...report }, null, 2),
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
