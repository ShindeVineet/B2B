import { requirePageUser } from "@/lib/page-auth";
import { WalkInForm } from "@/components/leads/WalkInForm";
export default async function Page() {
  await requirePageUser(["store_associate", "regional_manager", "b2b_head"]);
  return <WalkInForm />;
}
