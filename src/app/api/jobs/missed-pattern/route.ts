import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { checkMissedPatterns } from "@/lib/phase5/missed-pattern";
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET,
    token = req.headers.get("authorization") || "";
  if (!secret)
    return NextResponse.json(
      { error: "Job secret is not configured" },
      { status: 503 },
    );
  const expected = Buffer.from("Bearer " + secret),
    actual = Buffer.from(token);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await checkMissedPatterns(prisma));
}
