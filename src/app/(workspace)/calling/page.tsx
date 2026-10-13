import {requirePageUser} from '@/lib/page-auth';
import {CallingQueue} from '@/components/leads/CallingQueue';
export default async function Page(){await requirePageUser(['b2b_head','regional_manager','store_associate']);return <CallingQueue/>;}
