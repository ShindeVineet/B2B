import { canPlotLead } from "../mapping/visibility";
import { prisma } from "@/lib/prisma";
import { getStoreFilterForUser, getUserFilterForUser } from "@/lib/permissions";
import type { AuthUser } from "@/lib/auth";
import { RequestError } from "@/lib/phase5/http";
export const ASSIGNABLE_ROLES = [
  "ground_rep",
  "regional_manager",
  "b2b_head",
] as const;
export async function resolveAssignment(
  user: AuthUser,
  repId: unknown,
  storeId: unknown,
  leads: readonly {
    lat?: number | null;
    lng?: number | null;
    geocode_status?: string | null;
    geocode_source?: string | null;
    assigned_store_id: string | null;
    assigned_ground_rep_id: string | null;
  }[],
) {
  if ((repId || storeId) && leads.some((l) => !canPlotLead(l)))
    throw new RequestError(
      "Resolve Mapping Issues before assigning stores or team members",
      409,
    );
  let targetStore = storeId as string | null | undefined;
  if (repId) {
    if (typeof repId !== "string")
      throw new RequestError("Choose a team member");
    const member = await prisma.user.findFirst({
      where: {
        id: repId,
        active: true,
        role: { in: [...ASSIGNABLE_ROLES] },
        AND: [getUserFilterForUser(user)],
      },
      include: { assigned_store: true },
    });
    if (!member) throw new RequestError("Invalid team member", 403);
    if (!member.assigned_store?.active)
      throw new RequestError(
        "Assign this team member an active base store on the Ground Team page first",
        409,
      );
    if (storeId !== undefined && storeId !== member.store_id)
      throw new RequestError(
        "The lead store must match the selected member’s base store",
        409,
      );
    if (
      storeId === undefined &&
      leads.some(
        (l) => l.assigned_store_id && l.assigned_store_id !== member.store_id,
      )
    )
      throw new RequestError(
        "Some leads belong to another store. Explicitly assign them to the selected member’s store first, or choose a member from their store",
        409,
      );
    targetStore = member.store_id;
  }
  if (targetStore) {
    if (
      !(await prisma.store.findFirst({
        where: {
          id: targetStore,
          active: true,
          AND: [getStoreFilterForUser(user)],
        },
      }))
    )
      throw new RequestError("Store is outside your scope", 403);
  }
  if (storeId !== undefined && repId === undefined) {
    const members = await prisma.user.findMany({
      where: {
        id: {
          in: [
            ...new Set(
              leads
                .map((l) => l.assigned_ground_rep_id)
                .filter((id): id is string => !!id),
            ),
          ],
        },
      },
      select: { store_id: true },
    });
    if (members.some((m) => m.store_id !== targetStore))
      throw new RequestError(
        "Reassign or clear the current team member before changing the lead store",
        409,
      );
  }
  return targetStore;
}
