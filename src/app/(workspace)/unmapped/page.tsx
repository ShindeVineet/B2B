import { UnmappedQueue } from "@/components/unmapped/UnmappedQueue";
import { requirePageUser } from "@/lib/page-auth";

export default async function Page() {
  await requirePageUser(["b2b_head", "regional_manager"]);
  return <UnmappedQueue />;
}
