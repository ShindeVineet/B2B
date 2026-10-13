import { requirePageUser } from "@/lib/page-auth";
import { RouteBuilder } from "@/components/routes/RouteBuilder";
export default async function Page() {
  await requirePageUser(["b2b_head", "regional_manager"]);
  return <RouteBuilder />;
}
