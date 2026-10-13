"use client";
import { useEffect, useState } from "react";
import { LeadCard, type CardLead } from "./LeadCard";
export function WarmLeads() {
  const [leads,setLeads]=useState<CardLead[]>([]),[error,setError]=useState(""),[loading,setLoading]=useState(true),[page,setPage]=useState(1);
  useEffect(() => { let active=true; const load=async()=>{try{const r=await fetch("/api/warm-leads");const d=await r.json();if(!r.ok)throw Error(d.error);if(active){setLeads(d.leads);setLoading(false);}}catch(e){if(active){setError((e as Error).message);setLoading(false);}}};void load();window.addEventListener("store-visits-updated",load);return()=>{active=false;window.removeEventListener("store-visits-updated",load);};},[]);
  return <section className="space-y-4"><p className="text-sm text-slate-600">{leads.length} warm leads · Latest consultation has Medium interest; onboarded leads are excluded.</p>{error&&<p role="alert">{error}</p>}{loading?<p>Loading…</p>:<div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">{leads.slice((page-1)*24,page*24).map(l=><LeadCard key={l.id} lead={l}/>)}</div>}{!loading&&!leads.length&&<p>No warm leads in your scope.</p>}<div className="flex gap-3"><button disabled={page===1} onClick={()=>setPage(p=>p-1)}>Previous</button><span>Page {page} / {Math.max(1,Math.ceil(leads.length/24))}</span><button disabled={page*24>=leads.length} onClick={()=>setPage(p=>p+1)}>Next</button></div></section>;
}
