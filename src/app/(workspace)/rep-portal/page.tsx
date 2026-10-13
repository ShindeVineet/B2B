import { GroundRepPortal } from "@/components/rep/GroundRepPortal";
import { requirePageUser } from "@/lib/page-auth";

export default async function Page() {
  const user=await requirePageUser(["ground_rep","regional_manager","b2b_head"]);
  return <GroundRepPortal memberId={user.id}/>;
}
