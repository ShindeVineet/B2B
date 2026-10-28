import { completeDueFollowUp } from "@/lib/follow-ups/service";
import { channelFor } from "@/lib/dashboard/metrics";
import { parseStoreVisit, saveStoreVisit } from "@/lib/consultations/store-visit";
import { consultationVisit } from "@/lib/routes/consultation-visit";
import { validateResponses } from "@/lib/consultations/validation";
import type { FieldDefinition } from "@/lib/consultations/fields";
import {
  evaluateCold,
  notifyWorkflow,
  managerRecipients,
} from "@/lib/cold/service";
import { RequestError } from "@/lib/phase5/http";
import type { Prisma, Lead } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";

export async function saveGroundConsultation(tx: Prisma.TransactionClient, user: AuthUser, lead: Lead, raw: Record<string, unknown>, tripLeadId?: string | null) {
    const definitions = await tx.formField.findMany({
      where: { active: true },
      orderBy: { display_order: "asc" },
    });
    if (!definitions.length) throw new RequestError("Consultation fields have not been installed. Apply the migration.", 503);
    const storeVisit = parseStoreVisit(raw);
    const responses = validateResponses(
      definitions.map((f) => ({
        ...f,
        type: ["primary_pain_point", "competitor_involved"].includes(f.key)
          ? "multi_select"
          : f.type,
        max_files: f.max_files ?? undefined,
        options: Array.isArray(f.options) ? (f.options as string[]) : undefined,
        required: f.key === "next_follow_up_date" ? false : f.required,
        required_when: f.key === "next_follow_up_date" ? undefined : f.required_when as FieldDefinition["required_when"],
      })),
      raw,
      user.name,
      user.role === "b2b_head",
    );
    const text = (key: string) =>
      typeof responses[key] === "string" ? (responses[key] as string) : "";
    const multiText = (key: string) =>
      Array.isArray(responses[key]) ? (responses[key] as string[]).join(", ") : text(key);
    const photos = [
      ...((responses.site_photos as string[]) || []),
      ...((responses.visiting_card_photos as string[]) || []),
    ];
    const photoIds = [...new Set(photos.map((url) => url.split("/").at(-1)!))];
    if (
      (await tx.photoAsset.count({
        where: {
          id: { in: photoIds },
          lead_id: lead.id,
          ...(user.role === "b2b_head" ? {} : { owner_id: user.id }),
        },
      })) !== photoIds.length
    )
      throw new RequestError("A photo does not belong to this lead or uploader");
    const outcome = text("outcome");
    const status: Record<string, string> = {
      "On-boarding Done": "onboarded",
      "Visit scheduled": "Active — Visit Scheduled",
      "Nurturing required": "Active — Nurturing",
      "Dont want commission": "Needs Manager Review",
      "Lost Lead - (does not do tiles business)": "Closed-Lost",
      "Wrong location": "Needs Data Correction",
      "Office closed": "Assigned",
      "Wrong Location/Office closed": "Needs Data Correction",
    };
    if (!status[outcome])
      throw new RequestError("Choose a valid Lead Outcome");
      await tx.$queryRaw`SELECT id FROM leads WHERE id=${lead.id} FOR UPDATE`;
      const visit = await consultationVisit(
        tx,
        user,
        lead.id,
        tripLeadId,
      );
      const record = await tx.consultation.create({
        data: {
          lead_id: lead.id,
          interaction_channel: channelFor({ ...lead, trip_lead_id: visit?.id, direct_store_meeting: raw.direct_store_meeting === true || raw.direct_store_meeting === "true", rep_role: user.role }),
          direct_store_meeting: raw.direct_store_meeting === true || raw.direct_store_meeting === "true",
          trip_lead_id: visit?.id || null,
          rep_id: user.id,
          company_name: text("company_name"),
          decision_maker_name: text("decision_maker_name"),
          decision_maker_phone: text("decision_maker_phone"),
          alternate_mobile_number: text("alternate_mobile_number") || null,
          designation: text("designation"),
          lead_type: text("lead_type"),
          email: text("email") || null,
          interest_level: text("interest_level"),
          current_lead_status: text("current_lead_status"),
          outcome,
          visit_date: new Date(text("visit_date") + "T12:00:00+05:30"),
          primary_pain_point: multiText("primary_pain_point") || null,
          competitor_involved: multiText("competitor_involved") || null,
          site_photos: responses.site_photos || [],
          visiting_card_photos: responses.visiting_card_photos || [],
          checklist: responses.checklist || [],
          notes: text("notes") || null,
          ground_staff_name: text("ground_staff_name"),
          next_follow_up_date: text("next_follow_up_date")
            ? new Date(text("next_follow_up_date"))
            : null,
          responses: { ...responses, ...(storeVisit ? { visit_scheduled: "true", visit_store_id: storeVisit.store_id, visit_scheduled_at: storeVisit.scheduled_at.toISOString() } : {}) },
        },
      });
      await saveStoreVisit(tx, raw, lead.id, record.id);
      const updated = await tx.lead.update({
        where: { id: lead.id },
        data: {
          status: status[outcome],
          outcome,
          call_outcome: outcome,
          assigned_visit_date: new Date(text("visit_date")),
          ...(["Wrong location", "Wrong Location/Office closed"].includes(outcome)
            ? {
                geocode_status: "mapping_issue" as const,
                geocode_issue_reason: "not_found",
                geocode_flagged_at: new Date(),
              }
            : {}),
        },
      });
      if (text("next_follow_up_date"))
        await tx.followUp.upsert({
          where: { lead_id: lead.id },
          create: {
            lead_id: lead.id,
            rep_id: lead.assigned_ground_rep_id || user.id,
            due_date: new Date(text("next_follow_up_date")),
          },
          update: {
            rep_id: lead.assigned_ground_rep_id || user.id,
            due_date: new Date(text("next_follow_up_date")),
            active: true,
          },
        });
      else if (!["Wrong location", "Office closed", "Wrong Location/Office closed"].includes(outcome))
        await completeDueFollowUp(tx, lead.id, text("visit_date").slice(0, 10));
      if (visit)
        await tx.tripLead.update({
          where: { id: visit.id },
          data: { completed: true, status: "visited" },
        });
      await evaluateCold(tx, updated, record);
      if (["Wrong location", "Wrong Location/Office closed"].includes(outcome))
        await notifyWorkflow(
          tx,
          lead.id,
          "data_correction_needed",
          `correction:${record.id}`,
          `${updated.company_name} needs a location correction`,
          await managerRecipients(tx, updated),
        );
      await tx.activityLog.create({
        data: {
          lead_id: lead.id,
          actor_id: user.id,
          action: "CONSULTATION_LOGGED",
          old_value: lead.status,
          new_value: outcome,
        },
      });
      return record;
}
