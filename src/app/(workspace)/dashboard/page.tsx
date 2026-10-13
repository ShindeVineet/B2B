import { redirect } from "next/navigation";
import { PageHeader } from "@/components/workspace/PageHeader";
import { RoleDashboard } from "@/components/dashboard/RoleDashboard";
import { requirePageUser } from "@/lib/page-auth";
export default async function DashboardPage() {
  const user = await requirePageUser();
  if (user.role === "ground_rep") redirect("/rep-portal");
  return <div className="workspace-page space-y-5"><PageHeader title="Dashboard" description={user.role === "store_associate" ? `Welcome, ${user.name}. Manage calls, walk-ins and expected store visits.` : `Welcome, ${user.name}. Track consultations, onboarding and scheduled visits.`} /><RoleDashboard role={user.role} /></div>;
}
