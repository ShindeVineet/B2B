import { StoreVisits } from "@/components/dashboard/StoreVisits";
import { Navbar } from "@/components/layout/Navbar";
import { requirePageUser } from "@/lib/page-auth";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  await requirePageUser();
  return <><Navbar /><main className="flex-1"><StoreVisits />{children}</main></>;
}
