import type { RevisitEntry } from '@/lib/consultations/revisit-history';
export function RevisitHistory({ revisits }: { revisits?: RevisitEntry[] }) {
  if (!revisits?.length) return null;
  return <section className="border-t pt-3 mt-3 space-y-3"><h3 className="font-semibold">Revisit history ({revisits.length})</h3>{revisits.map(visit => <article key={visit.id} className="border-l-2 border-orange-300 pl-3 text-sm space-y-1">
    <p className="font-medium">{new Date(visit.visited_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST · {visit.staff_name}</p>
    <p>{visit.outcome}</p><p className="whitespace-pre-wrap">{visit.notes}</p>
    {visit.next_follow_up_date && <p>Follow-up: {visit.next_follow_up_date.slice(0, 10)}</p>}
  </article>)}</section>;
}
