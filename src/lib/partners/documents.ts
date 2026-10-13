import type { Prisma } from "@prisma/client";
import { RequestError } from "@/lib/phase5/http";
export async function attachPartnerDocuments(
  tx: Prisma.TransactionClient,
  partnerId: string,
  ownerId: string,
  urls: (string | null)[],
  historical = false,
) {
  for (const url of urls) {
    if (!url) continue;
    if (historical && /^https:\/\//.test(url)) continue;
    const id = /^\/api\/partner-documents\/([a-z0-9-]+)$/i.exec(url)?.[1];
    if (!id) throw new RequestError("Upload a valid partner document");
    const doc = await tx.partnerDocument.findFirst({
      where: {
        id,
        OR: [
          { partner_id: partnerId },
          { partner_id: null, owner_id: ownerId },
        ],
      },
    });
    if (!doc)
      throw new RequestError(
        "Document is unavailable or belongs to another submission",
      );
    await tx.partnerDocument.update({
      where: { id },
      data: { partner_id: partnerId },
    });
  }
}
