"use client";
import { GroupCreatedToggle } from "@/components/leads/GroupCreatedToggle";
import { useCallback, useEffect, useState, useRef } from "react";
import { interestBucket, isWonLead } from "@/lib/leads/interest-bucket";
import { LeadHistory } from "@/components/leads/LeadHistory";
import { LeadCall } from "@/components/leads/LeadCall";
import { ScheduleVisitButton } from "@/components/leads/ScheduleVisitButton";
import { type CardLead } from "@/components/leads/LeadCard";
import { LeadNavigate } from "@/components/leads/LeadNavigate";
import { ConsultationCard, type ConsultationRow } from "@/components/consultations/ConsultationCard";
import { ConsultationModal } from "./ConsultationModal";
import { LogRevisit } from "./LogRevisit";
import { RescheduleVisit } from "./RescheduleVisit";
import { RepOnboarding } from "./RepOnboarding";
import { StoreVisits } from "@/components/dashboard/StoreVisits";
import { fetchAllMapLeads } from "@/lib/map-leads";
import { latestByLead } from "@/lib/dashboard/metrics";
import { todayIndia } from "@/lib/phase5/calendar";
import { fullRouteLink, routeLinks, routeLinkStopCount, validRoutePoint } from "@/lib/route-links";
type Lead = CardLead & { consultations?: { id: string }[]; lat?: number | null; lng?: number | null; store?: { lat?: number | null; lng?: number | null } | null; consultation_read_only?: boolean; consultation_visit_id?: string | null; trip_lead_id?: string; latest_consultation_outcome?: string | null };
type Stop = { id: string; lead: Lead; completed: boolean; status: string; consultation?: unknown };
export function GroundRepPortal({ memberId }: { memberId: string }) {
  const [tab,setTab]=useState("My Visits"),[date,setDate]=useState(todayIndia()),[leads,setLeads]=useState<Lead[]>([]),[stops,setStops]=useState<Stop[]>([]),[records,setRecords]=useState<ConsultationRow[]>([]),[error,setError]=useState(""),[loading,setLoading]=useState(true),[search,setSearch]=useState(""),[page,setPage]=useState(1),[consulting,setConsulting]=useState<Lead|null>(null);
  const request = useRef(0);
  const load=useCallback(async()=>{
    const version = ++request.current; setLoading(true);
    try {
      const [all,visits,history]=await Promise.all([
        fetchAllMapLeads<Lead>((url,init)=>fetch(`${url}&rep_id=${memberId}`,init)),
        fetch(`/api/trips?date=${date}&rep_id=${memberId}`).then(async r=>{if(!r.ok)throw Error("Unable to load visits");return r.json();}),
        fetch(`/api/consultations?rep_id=${memberId}`).then(async r=>{if(!r.ok)throw Error("Unable to load consultations");return r.json();}),
      ]);
      if (version !== request.current) return;
      setLeads(all);setStops(visits.dayLeads||[]);setRecords(history.consultations||[]);setError("");
    }catch(e){if(version === request.current)setError((e as Error).message);}finally{if(version === request.current)setLoading(false);}
  },[date,memberId]);
  const invalidate = useCallback(() => { request.current++; }, []);
  useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>{clearTimeout(timer);invalidate();};},[load,invalidate]);
  const latest=latestByLead(records.map(c=>({...c,lead_id:c.lead.id})));
  let dayRouteLinks: string[] = [], dayRouteError = "";
  const routeableStops = stops.filter((stop) => validRoutePoint(stop.lead));
  const skippedRouteStops = stops.length - routeableStops.length;
  try {
    const origin = stops.find((stop) => stop.lead.store?.lat != null && stop.lead.store?.lng != null)?.lead.store;
    dayRouteLinks = routeableStops.length ? routeLinks(routeableStops.map((stop) => stop.lead), origin || undefined) : [];
  } catch (e) {
    dayRouteError = e instanceof Error ? e.message : "Unable to create the Google Maps route.";
  }
  const linkedStopCount = routeLinkStopCount(dayRouteLinks);
  if (!dayRouteError && routeableStops.length && linkedStopCount !== routeableStops.length)
    dayRouteError = `Only ${linkedStopCount} of ${routeableStops.length} routeable stops were included. Refresh the route before navigating.`;
  const completeDayRoute = fullRouteLink(dayRouteLinks);
  const categories = ["Hot Leads", "Warm Leads", "Cold Leads", "Won"];
  const shown = leads.filter(l => (!categories.includes(tab) || interestBucket(l) === tab) && `${l.company_name} ${l.lead_code} ${l.phone_no} ${l.address}`.toLowerCase().includes(search.toLowerCase()));
  const actions=(lead:Lead,stop?:Stop)=><>{lead.lat != null && lead.lng != null && <LeadNavigate lead={lead} />}{!isWonLead(lead) && ((stop ? !!stop.consultation || stop.completed || !!lead.consultations?.length : lead.consultation_read_only || lead.latest_consultation_outcome) ? <LogRevisit leadId={lead.id} onSaved={()=>void load()} /> : (!stop || ["pending","rescheduled"].includes(stop.status)) && <button className="bg-[#ff4500] text-white rounded-lg px-3 py-2 text-xs" onClick={()=>setConsulting({...lead,trip_lead_id:stop?.id || lead.consultation_visit_id || undefined})}>Log consultation</button>)}{stop && !stop.completed && !stop.consultation && <RescheduleVisit id={stop.id} onSaved={()=>void load()} />}</>;
  const visitRow = (lead: Lead, index: number, stop?: Stop) => {
    const won = isWonLead(lead);
    const stage = won ? "Won" : lead.funnel_status || lead.status;
    return <article key={stop?.id || lead.id} data-lead-id={lead.id} data-interest-bucket={interestBucket(lead) || ""} className={`bg-white rounded-2xl border p-4 shadow-xs ${won ? "border-emerald-200" : "border-slate-200"}`}>
      <div className="flex items-start gap-3">
        <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold text-white ${won ? "bg-emerald-600" : "bg-slate-800"}`}>{index + 1}</span>
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-bold">{lead.company_name || lead.owner_name || "Company details pending"}</h2><span className={`text-[10px] font-bold px-2 py-1 rounded-full ${won ? "bg-emerald-50 text-emerald-700" : "bg-orange-50 text-[#ff4500]"}`}>{stage}</span></div>
          <p className="text-xs text-slate-500 mt-1">{lead.lead_code} · {[lead.owner_name, lead.phone_no].filter(Boolean).join(" · ")}</p>
          <p className="text-xs text-slate-500 mt-1">{[lead.address, lead.pin_code].filter(Boolean).join(" · ") || "Address pending"}</p>
          {lead.store_visits?.[0] && <p className="text-xs text-slate-500 mt-1">Store visit: {new Date(lead.store_visits[0].scheduled_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST · {lead.store_visits[0].store.name}</p>}
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-2 text-xs">{!isWonLead(lead)&&<LeadCall leadId={lead.id}/>}<GroupCreatedToggle leadId={lead.id}/><LeadHistory leadId={lead.id}/><ScheduleVisitButton leadId={lead.id} onSaved={()=>void load()}/>{actions(lead,stop)}</div>
    </article>;
  };
  return <div className="min-h-screen bg-slate-50 pb-24 text-slate-900">
    <header className="bg-white border-b border-slate-200">
      <div className="max-w-4xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-sm font-black">My Visits</h1><p className="text-xs text-slate-500">Ground Team Field Portal</p></div>
        <div className="flex items-center gap-2"><button onClick={()=>setDate(todayIndia())} className="px-3 py-2 rounded-xl text-xs font-bold bg-[#ff4500] text-white">Today</button><input aria-label="Visit date" type="date" value={date} onChange={e=>setDate(e.target.value)} className="border rounded-xl px-2 py-1.5 text-xs"/><button onClick={()=>void load()} className="text-xs px-3 py-2 bg-slate-100 rounded-xl">Refresh</button></div>
      </div>
      <nav className="max-w-4xl mx-auto px-4 py-2 flex gap-1 overflow-x-auto border-t border-slate-100" aria-label="My Visits sections">{["My Visits","Assigned",...categories,"Consultations","Onboarding","Visits Today"].map(t=><button key={t} aria-current={tab===t?"page":undefined} className={`px-3 py-2 text-xs font-bold rounded-xl whitespace-nowrap ${tab===t?"bg-orange-50 text-[#ff4500] border border-[#ff4500]/30":"text-slate-600 hover:bg-slate-100"}`} onClick={()=>{setTab(t);setPage(1);}}>{t}{categories.includes(t) ? ` (${leads.filter(l=>interestBucket(l)===t).length})` : ""}</button>)}</nav>
    </header>
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      {error&&<p role="alert" className="text-red-700">{error}</p>}
      {loading?<p role="status">Loading visits…</p>:tab==="Onboarding"?<RepOnboarding leads={leads}/>:tab==="Visits Today"?<StoreVisits today/>:tab==="My Visits"?<>
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Scheduled visits · {date} · {stops.length}</h2>
        {skippedRouteStops > 0 && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{skippedRouteStops} {skippedRouteStops === 1 ? "visit was" : "visits were"} excluded from navigation because the location needs correction. The remaining valid visits are available below.</p>}
        {dayRouteError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">Google Maps route unavailable: {dayRouteError}</p>}
        {!dayRouteError && completeDayRoute && <div><a href={completeDayRoute} target="_blank" rel="noreferrer" className="inline-flex rounded-xl bg-[#ff4500] px-4 py-2 text-xs font-bold text-white">Open complete route in Google Maps</a><p className="mt-1 text-xs text-emerald-700">Verified: all {linkedStopCount} scheduled stops are included.</p></div>}
        {!dayRouteError && !completeDayRoute && dayRouteLinks.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="mb-2 text-xs text-amber-900">Google Maps limits the number of stops in one mobile route. All {linkedStopCount} scheduled stops are included across these connected parts. Open them in order.</p><div className="flex flex-wrap gap-2">{dayRouteLinks.map((href,index)=>{const first=index*4+1,last=Math.min((index+1)*4,linkedStopCount);return <a key={href} href={href} target="_blank" rel="noreferrer" className="rounded-lg bg-[#ff4500] px-3 py-2 text-xs font-bold text-white">Part {index+1}: stops {first}–{last}</a>;})}</div></div>}
        <div className="space-y-3">{stops.map((stop,index)=>visitRow({...stop.lead,...leads.find(l=>l.id===stop.lead.id)},index,stop))}</div>
        {!stops.length&&<div className="bg-white rounded-3xl border border-slate-200 p-8 text-center"><p className="text-sm font-bold">No visits scheduled for this date</p><button onClick={()=>setTab("Assigned")} className="mt-3 px-4 py-2 bg-[#ff4500] text-white text-xs font-bold rounded-xl">View assigned leads</button></div>}
      </>:tab==="Consultations"?<><p className="text-xs text-slate-500">{latest.length} consulted leads · {records.length} consultation records preserved in history.</p><div className="space-y-3">{latest.slice((page-1)*24,page*24).map(c=><ConsultationCard key={c.id} row={c} onSaved={()=>void load()}/>)}</div></>:<>
        <input aria-label="Search assigned leads" placeholder="Search name, phone or address" className="w-full border rounded-2xl px-3 py-2 text-xs" value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}/>
        <p className="text-xs text-slate-500">{shown.length} leads{tab==="Won" ? " · Onboarded partners" : ""}</p>
        <div className="space-y-2">{shown.slice((page-1)*24,page*24).map((lead,index)=>visitRow(lead,(page-1)*24+index))}</div>{!shown.length&&<p className="text-sm">No matching leads.</p>}
      </>}
      {["Assigned",...categories,"Consultations"].includes(tab)&&<div className="flex gap-3 text-sm"><button disabled={page===1} onClick={()=>setPage(p=>p-1)}>Previous</button><span>Page {page}</span><button disabled={page*24 >= (tab==="Consultations"?latest.length:shown.length)} onClick={()=>setPage(p=>p+1)}>Next</button></div>}
    </div>
    {consulting&&<ConsultationModal context="ground" lead={consulting} isOpen onClose={()=>setConsulting(null)} onSuccess={()=>{setConsulting(null);void load();}}/>}
  </div>;
}
