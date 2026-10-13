import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLeadFilterForUser } from "@/lib/permissions";
import { RequestError, failure } from "@/lib/phase5/http";
export async function GET(req: NextRequest) {
  try {
    const u = await getCurrentUser(req);
    if (!u) throw new RequestError("Unauthorized", 401);
    const lead = await prisma.lead.findFirst({
      where: {
        id: req.nextUrl.searchParams.get("lead_id") || "",
        AND: [getLeadFilterForUser(u)],
      },
      include: {
        phones: true,
        consultations: { orderBy: [{ visit_date: "desc" }, { created_at: "desc" }, { id: "desc" }] },
      },
    });
    if (!lead) throw new RequestError("Lead not found", 404);
    const meaningful = (v: string | null | undefined) =>
      !!v?.trim() &&
      !["na", "n/a", "nil", "none"].includes(v.trim().toLowerCase());
    const field = (
      key:
        | "decision_maker_name"
        | "decision_maker_phone"
        | "designation"
        | "email"
        | "alternate_mobile_number",
    ) => lead.consultations.map((c) => c[key]).find(meaningful) || "";
    const imported = (key: string) => {
      const value = (lead.extra_notes || "")
        .split(/\r?\n/)
        .find((line) => line.startsWith(key + ":"))
        ?.slice(key.length + 1)
        .trim();
      return meaningful(value) ? value! : "";
    };
    const original = lead.original_data as Record<string, unknown>;
    // Explicitly corrected lead details take precedence over an older intake consultation.
    const verifiedCompany = meaningful(lead.company_name) && lead.company_name !== original.company_name;
    const verifiedOwner = meaningful(lead.owner_name) && lead.owner_name !== original.owner_name;
    const verifiedPhone = meaningful(lead.phone_no) && lead.phone_no !== original.phone_no;
    const primary = (verifiedPhone ? lead.phone_no : field("decision_maker_phone")) || lead.phone_no || "";
    const numbers = [
      ...new Set(
        [
          ...lead.phones.map((p) => p.phone_number),
          ...lead.consultations.map((c) => c.alternate_mobile_number || ""),
        ].filter(meaningful),
      ),
    ].filter((p) => p.replace(/\D/g, "") !== primary.replace(/\D/g, ""));
    const pin = lead.pin_code
      ? await prisma.pincodeGeocache.findUnique({
          where: { pin_code: lead.pin_code },
        })
      : null;
    return NextResponse.json({
      lead_code: lead.lead_code,
      fields: {
        source_lead_id: lead.id,
        partner_type: lead.partner_type,
        gst_no: lead.gst_no || "",
        gst_registered: !!lead.gst_no,
        whatsapp_group_created: lead.whatsapp_group_created,
        company_firm_name: verifiedCompany ? lead.company_name : lead.consultations.map(c => c.company_name).find(meaningful) || lead.company_name,
        contact_person_name:
          (verifiedOwner ? lead.owner_name : field("decision_maker_name")) || lead.owner_name || imported("contact_name"),
        designation: field("designation"),
        mobile_number: primary,
        additional_phones: numbers.join("; "),
        office_address: lead.address || "",
        pincode: lead.pin_code || "",
        state: pin?.state || "",
        business_email_id: field("email") || imported("email"),
        onboarded_from: "ground_visit",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
