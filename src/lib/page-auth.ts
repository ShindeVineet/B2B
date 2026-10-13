import { redirect } from "next/navigation";
import { getCurrentUser, type AuthUser } from "./auth";

export async function requirePageUser(roles?: AuthUser["role"][]) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (roles && !roles.includes(user.role)) {
    // super_admin can access all pages
    if (user.role === "super_admin") return user;
    redirect(user.role === "ground_rep" ? "/rep-portal" : "/dashboard");
  }
  return user;
}
