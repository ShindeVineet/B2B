import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { RequestError, failure } from "@/lib/phase5/http";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser(req);
    if (!user || !["super_admin", "b2b_head", "regional_manager", "store_associate"].includes(user.role))
      throw new RequestError("Only office teams can onboard leads", 403);
    const { id } = await params;
    const body = await req.json();
    const partnerCode = typeof body.partner_code === "string" ? body.partner_code.trim().toUpperCase() : "";
    if (!/^[A-Z0-9][A-Z0-9_-]{2,39}$/.test(partnerCode))
      throw new RequestError("Enter a valid Partner Code");
    const lead = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM leads WHERE id=${id} FOR UPDATE`;
      const current = await tx.lead.findUnique({ where: { id }, include: { consultations: { select: { id: true }, take: 1 }, partners: { select: { partner_status: true } } } });
      if (!current) throw new RequestError("Lead not found", 404);
      if (!current.assigned_store_id && !current.assigned_ground_rep_id && !current.calling_associate_id)
        throw new RequestError("Only assigned leads can use short onboarding", 409);
      if (!current.consultations.length) throw new RequestError("Complete a consultation before onboarding this lead", 409);
      if (current.partners.some(partner => partner.partner_status === "active")) throw new RequestError("This lead is already onboarded", 409);
      const duplicate = await tx.lead.findFirst({ where: { onboarded_partner_code: partnerCode, id: { not: id } }, select: { id: true } });
      if (duplicate) throw new RequestError("This Partner Code is already linked to another lead", 409);
      if (await tx.partner.findUnique({ where: { partner_code: partnerCode }, select: { id: true } }))
        throw new RequestError("This Partner Code already exists", 409);
      const partner = await tx.partner.create({
        data: {
          partner_code: partnerCode,
          source_lead_id: current.id,
          source_lead_code: current.lead_code,
          company_firm_name: current.company_name || "Partner details pending",
          contact_person_name: current.owner_name || "Partner contact pending",
          designation: "Pending verification",
          mobile_number: current.phone_no || "Pending verification",
          office_address: current.address || "Pending verification",
          pincode: current.pin_code || "Pending verification",
          city: "Pending verification",
          state: "Pending verification",
          type_of_professional: "Pending verification",
          years_operating: "Pending verification",
          specialized_in: "Pending verification",
          expected_monthly_order_value: 0,
          gst_registered: false,
          pan_no: "Pending verification",
          bank_account_name: "Pending verification",
          bank_name: "Pending verification",
          branch: "Pending verification",
          account_no: "Pending verification",
          ifsc_code: "Pending verification",
          partner_type: current.partner_type,
          partner_status: "active",
          submitted_by: user.id,
          reviewed_by: user.id,
          reviewed_at: new Date(),
          onboarded_at: new Date(),
          lead_gen_source: current.lead_source || "Other",
          lead_gen_source_other: current.lead_source ? null : "Short-form onboarding",
        },
      });
      const updated = await tx.lead.update({ where: { id }, data: { status: "onboarded", status_entered_at: new Date(), onboarded_partner_code: partnerCode } });
      await tx.followUp.updateMany({ where: { lead_id: id }, data: { active: false } });
      await tx.partnerActivity.create({ data: { partner_id: partner.id, actor_id: user.id, action: "SHORT_ONBOARDED" } });
      await tx.activityLog.create({ data: { lead_id: id, actor_id: user.id, action: "SHORT_ONBOARDING_COMPLETED", old_value: "Assigned", new_value: JSON.stringify({ partner_code: partnerCode, partner_id: partner.id }) } });
      return { ...updated, partner_id: partner.id };
    });
    return NextResponse.json({ lead });
  } catch (error) { return failure(error); }
}
