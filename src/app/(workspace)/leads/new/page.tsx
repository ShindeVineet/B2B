import { requirePageUser } from "@/lib/page-auth";
import { LeadIntakeForm } from "@/components/leads/LeadIntakeForm";
import { PageHeader } from "@/components/workspace/PageHeader";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ source?: string | string[] }>;
}) {
  await requirePageUser(["b2b_head", "regional_manager", "store_associate"]);
  const requestedSource = (await searchParams).source;
  const initialSource = requestedSource === "Walk-in" ? "Walk-in" : undefined;
  return <div className="workspace-page"><PageHeader title="New lead" description="Choose a source to see the required details and responsible team." /><LeadIntakeForm initialSource={initialSource} /></div>;
}
