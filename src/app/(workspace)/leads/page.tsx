import { LeadsTable } from "@/components/leads/LeadsTable";
import { requirePageUser } from "@/lib/page-auth";

export default async function Page() {
  await requirePageUser(["b2b_head", "regional_manager", "store_associate", "analyst"]);
  return <LeadsTable />;
}
