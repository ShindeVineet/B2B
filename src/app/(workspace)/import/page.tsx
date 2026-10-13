import { LeadImportWizard } from "@/components/import/LeadImportWizard";
import { requirePageUser } from "@/lib/page-auth";

export default async function Page() {
  await requirePageUser(["b2b_head"]);
  return <LeadImportWizard />;
}
