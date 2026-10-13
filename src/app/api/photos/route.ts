import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getCurrentUser } from "@/lib/auth";
import { getLeadFilterForUser } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { imageMime } from "@/lib/consultations/photos";
import { saveStorageFile, deleteStorageFile } from "@/lib/storage/s3";
import { RequestError, failure } from "@/lib/phase5/http";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  try {
    const u = await getCurrentUser(req);
    if (!u || u.role === "analyst") throw new RequestError("Forbidden", 403);
    if (Number(req.headers.get("content-length") || 0) > 11 * 1024 * 1024)
      throw new RequestError("Photo exceeds 10 MB", 413);
    const form = await req.formData(),
      leadId = form.get("lead_id"),
      file = form.get("file");
    if (
      typeof leadId !== "string" ||
      !(file instanceof File) ||
      !file.size ||
      file.size > 10 * 1024 * 1024
    )
      throw new RequestError("Choose an image under 10 MB");
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, AND: [getLeadFilterForUser(u)] },
      select: { id: true },
    });
    if (!lead) throw new RequestError("Lead not found", 404);
    const bytes = Buffer.from(await file.arrayBuffer()),
      mime = imageMime(bytes);
    if (!mime) throw new RequestError("Use a JPEG, PNG or WebP image");
    const filename = randomUUID();
    await saveStorageFile(filename, bytes, mime, "photos");
    try {
      const asset = await prisma.photoAsset.create({
        data: {
          lead_id: lead.id,
          owner_id: u.id,
          filename,
          mime_type: mime,
          size_bytes: file.size,
        },
      });
      return NextResponse.json({ url: "/api/photos/" + asset.id });
    } catch (e) {
      await deleteStorageFile(filename, "photos");
      throw e;
    }
  } catch (e) {
    return failure(e);
  }
}
