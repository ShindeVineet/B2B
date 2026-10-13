import { NextRequest } from "next/server";
import { POST as createLead } from "../route";
import { failure } from "@/lib/phase5/http";
export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    return createLead(new NextRequest(req.url, { method: "POST", headers: req.headers, body: JSON.stringify({ ...b, lead_source: "Walk-in", owner_name: b.customer_name || b.owner_name, company_name: b.company_name || "", consultation: b.consultation || { notes: b.notes, lead_type: b.lead_type, interest_level: b.interest_level, next_follow_up_date: b.next_follow_up_date, visit_scheduled: b.visit_scheduled, visit_store_id: b.visit_store_id, visit_scheduled_at: b.visit_scheduled_at } }) }));
  } catch (e) { return failure(e); }
}
