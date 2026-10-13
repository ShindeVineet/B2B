import { requirePageUser } from "@/lib/page-auth";
import { LegacyData } from "@/components/legacy/LegacyData";
export default async function Page() {
  await requirePageUser(["b2b_head"]);
  return <LegacyData />;
}
