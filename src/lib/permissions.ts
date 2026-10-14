import { Role, Prisma } from "@prisma/client";
import { AuthUser } from "./auth";

/** super_admin and b2b_head are top-level roles with full read access */
function isHeadOrAbove(role: Role) {
  return role === Role.super_admin || role === Role.b2b_head || role === Role.regional_manager;
}

/**
 * Builds Prisma where filter for leads based on user role and permissions
 */
export function getLeadFilterForUser(user: AuthUser | null): Prisma.LeadWhereInput {
  if (!user) {
    // Deny all if not logged in
    return { id: "never_match" };
  }

  if (isHeadOrAbove(user.role as Role)) return {};
  if (user.role === Role.ground_rep) return {assigned_ground_rep_id: user.id};
  return {OR: [
    {assigned_ground_rep_id:user.id},
    {calling_associate_id:user.id},
    {ground_rep:{role:"ground_rep"}},
    {activity_logs:{some:{actor_id:user.id, action:{in:["CDT_IMPORTED","LEAD_IMPORTED","LEAD_CREATED"]}}}},
    ...(user.store_id ? [{assigned_store_id:user.store_id}, {store_visits:{some:{store_id:user.store_id,status:"scheduled"}}}] : []),
  ]};

}

/**
 * Builds Prisma where filter for stores based on user role and permissions
 */
export function getStoreFilterForUser(user: AuthUser | null): Prisma.StoreWhereInput {
  if (!user) {
    return { id: "never_match" };
  }

  if (isHeadOrAbove(user.role as Role)) return {};
  return user.store_id ? {id:user.store_id} : {id:{in:[]}};

}

/**
 * Can user edit/assign leads
 */
export function canUserManageLeads(user: AuthUser | null): boolean {
  if (!user) return false;
  return user.role === Role.super_admin || user.role === Role.b2b_head || user.role === Role.regional_manager;
}

/** Lead ownership/store/rep assignments are controlled only by the B2B Head. */
export function canAssignLeads(user: AuthUser | null): boolean {
  return !!user && user.role === Role.b2b_head;
}

/**
 * Can user manage stores
 */
export function canUserManageStores(user: AuthUser | null): boolean {
  if (!user) return false;
  return user.role === Role.super_admin || user.role === Role.b2b_head;
}

/** Only super_admin can switch personas in the UI */
export function canSwitchPersonas(user: AuthUser | null): boolean {
  if (!user) return false;
  return user.role === Role.super_admin;
}

export function getUserFilterForUser(user: AuthUser): Prisma.UserWhereInput {
  if (isHeadOrAbove(user.role as Role)) return {};
  if (user.role === Role.ground_rep) return {id:user.id};
  return {OR:[{id:user.id},{role:"ground_rep"}]};
}

/** Shared ground-team records are readable; editing original details stays with owners/store staff. */
export function getLeadEditFilterForUser(user: AuthUser): Prisma.LeadWhereInput {
 if (canUserManageLeads(user)) return {};
 if (user.role !== Role.store_associate) return {id:{in:[]}};
 return {OR:[{assigned_ground_rep_id:user.id},
    {calling_associate_id:user.id},...(user.store_id ? [{assigned_store_id:user.store_id}] : []),{activity_logs:{some:{actor_id:user.id,action:{in:["CDT_IMPORTED","LEAD_IMPORTED","LEAD_CREATED"]}}}}]};
}
