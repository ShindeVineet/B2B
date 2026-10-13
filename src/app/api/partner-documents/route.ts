import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { imageMime } from "@/lib/consultations/photos";
import { saveStorageFile, deleteStorageFile } from "@/lib/storage/s3";
import { RequestError, failure } from "@/lib/phase5/http";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  try {
    const u = await getCurrentUser(req);
    if (!u) throw new RequestError("Forbidden", 403);
    if (Number(req.headers.get("content-length") || 0) > 11 * 1024 * 1024)
      throw new RequestError("Photo exceeds 10 MB", 413);
    const form = await req.formData(),
      file = form.get("file");
    if (!(file instanceof File) || !file.size || file.size > 10 * 1024 * 1024)
      throw new RequestError("Choose an image under 10 MB");
    const bytes = Buffer.from(await file.arrayBuffer()),
      mime =
        imageMime(bytes) ||
        (bytes.subarray(0, 5).toString() === "%PDF-"
          ? "application/pdf"
          : null);
    if (!mime) throw new RequestError("Use a JPEG, PNG, WebP or PDF document");
    const filename = randomUUID();
    await saveStorageFile(filename, bytes, mime, "documents");
    try {
      const asset = await prisma.partnerDocument.create({
        data: {
          owner_id: u.id,
          filename,
          mime_type: mime,
          size_bytes: file.size,
        },
      });
      return NextResponse.json({ url: "/api/partner-documents/" + asset.id });
    } catch (e) {
      await deleteStorageFile(filename, "documents");
      throw e;
    }
  } catch (e) {
    return failure(e);
  }
}
