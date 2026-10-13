import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { mapBusiness } from "@/lib/mapping/pipeline";
import { failure, RequestError } from "@/lib/phase5/http";
export async function POST(req: NextRequest) {
  try {
    const u = await getCurrentUser(req);
    if (!u || u.role === "analyst") throw new RequestError("Forbidden", 403);
    const b = await req.json();
    if (typeof b.company_name !== "string" || !b.company_name.trim())
      throw new RequestError("Provide the company name");
    return NextResponse.json({ result: await mapBusiness(b) });
  } catch (e) {
    return failure(e);
  }
}
