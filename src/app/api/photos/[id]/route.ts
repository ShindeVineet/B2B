import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getLeadFilterForUser } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { readStorageFile } from "@/lib/storage/s3";
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const u = await getCurrentUser(req);
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const asset = await prisma.photoAsset.findFirst({
    where: { id, lead: getLeadFilterForUser(u) },
  });
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const fileData = await readStorageFile(asset.filename, "photos");
  if (!fileData) {
    return NextResponse.json({ error: "Photo unavailable" }, { status: 404 });
  }
  return new Response(new Uint8Array(fileData.bytes), {
    headers: {
      "Content-Type": asset.mime_type,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}
