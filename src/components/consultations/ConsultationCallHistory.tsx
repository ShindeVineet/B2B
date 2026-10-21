import type { ConsultationCall } from '@/lib/consultations/call-history';
export function ConsultationCallHistory({ calls }: { calls?: ConsultationCall[] }) {
  if (!calls?.length) return null;
  return <section className="border-t pt-3 mt-3 space-y-3"><h3 className="font-semibold">Follow-up calls ({calls.length})</h3>{calls.map(call => <article key={call.call_id} className="border-l-2 border-orange-300 pl-3 text-sm space-y-1">
    <p className="font-medium">{new Date(call.called_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST · {call.caller}</p>
    <p>{call.outcome}{call.interest_level ? ` · ${call.interest_level} interest` : ''}</p>
    <p className="whitespace-pre-wrap">{call.notes}</p>
    {call.next_follow_up_date && <p>Follow-up: {call.next_follow_up_date.slice(0, 10)}</p>}
  </article>)}</section>;
}
