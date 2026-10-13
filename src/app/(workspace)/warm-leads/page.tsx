import { requirePageUser } from "@/lib/page-auth";
import { PageHeader } from "@/components/workspace/PageHeader";
import { WarmLeads } from "@/components/leads/WarmLeads";
export default async function Page(){await requirePageUser();return <div className="workspace-page"><PageHeader title="Warm Leads" description="Follow up on partners showing interest."/><WarmLeads/></div>;}
