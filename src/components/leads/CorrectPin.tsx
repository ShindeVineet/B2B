"use client";
import { WorkspaceDialog } from "@/components/shared/WorkspaceDialog";
import dynamic from "next/dynamic";
import { useState } from "react";
const PinPicker = dynamic(() => import("./PinPicker"), { ssr: false });
type LocationLead = { id: string; lat: number | null; lng: number | null; address?: string | null; pin_code?: string | null };
export function CorrectPin({lead,onSaved}: {lead:LocationLead;onSaved:(lead?:LocationLead)=>void}) {
  const [open,setOpen]=useState(false),[lat,setLat]=useState(""),[lng,setLng]=useState(""),[address,setAddress]=useState(""),[pin,setPin]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  return <><button type="button" className="px-3 py-2 rounded-lg border border-[#ff4500] text-[#ff4500] text-sm font-semibold" onClick={()=>{setLat(String(lead.lat??""));setLng(String(lead.lng??""));setAddress(lead.address||"");setPin(lead.pin_code||"");setError("");setOpen(true);}}>Edit location</button>
    {open&&<WorkspaceDialog title="Edit lead location" onClose={()=>{if(!busy)setOpen(false);}}><form className="space-y-4" onSubmit={async e=>{
      e.preventDefault();setBusy(true);setError("");
      try {const r=await fetch(`/api/leads/${lead.id}/location`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({lat:Number(lat),lng:Number(lng),address,pin_code:pin})});const d=await r.json();if(!r.ok)throw Error(d.error);setOpen(false);onSaved(d.lead);}catch(e){setError((e as Error).message);}finally{setBusy(false);}
    }}><p className="text-sm text-slate-600">Drag the orange pin or click the map to mark the correct office location. You can also enter coordinates and correct the address below.</p><fieldset disabled={busy} className="space-y-4"><PinPicker point={{lat:lat?Number(lat):12.9716,lng:lng?Number(lng):77.5946}} onChange={p=>{setLat(p.lat.toFixed(7));setLng(p.lng.toFixed(7));}}/>
      <div className="grid sm:grid-cols-2 gap-3"><label className="text-sm">Latitude<input required type="number" min="6" max="38" step="any" className="block border rounded-lg p-2 w-full" value={lat} onChange={e=>setLat(e.target.value)}/></label><label className="text-sm">Longitude<input required type="number" min="68" max="98" step="any" className="block border rounded-lg p-2 w-full" value={lng} onChange={e=>setLng(e.target.value)}/></label><label className="text-sm">Address<input maxLength={2000} className="block border rounded-lg p-2 w-full" value={address} onChange={e=>setAddress(e.target.value)}/></label><label className="text-sm">PIN code<input pattern="[1-9][0-9]{5}" maxLength={6} inputMode="numeric" className="block border rounded-lg p-2 w-full" value={pin} onChange={e=>setPin(e.target.value)}/></label></div></fieldset>
      {error&&<p role="alert" className="text-red-700">{error}</p>}<button disabled={busy} className="bg-[#ff4500] text-white px-4 py-2 rounded-lg">{busy?"Saving…":"Save location"}</button>
    </form></WorkspaceDialog>}
  </>;
}
