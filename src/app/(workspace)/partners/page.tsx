import { requirePageUser } from '@/lib/page-auth';
import { PartnerDirectory } from '@/components/partners/PartnerDirectory';
export default async function PartnersPage(){const user=await requirePageUser();return <PartnerDirectory role={user.role}/>;}
