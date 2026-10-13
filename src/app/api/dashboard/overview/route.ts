import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { dashboardOverview } from "@/lib/dashboard/service";
import { failure, RequestError } from "@/lib/phase5/http";
export async function GET(req: NextRequest) {
  try { const user = await getCurrentUser(req); if (!user) throw new RequestError("Unauthorized", 401); return NextResponse.json(await dashboardOverview(user)); } catch (e) { return failure(e); }
}
