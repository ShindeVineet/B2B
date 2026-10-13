"use client";
import {useState} from 'react';
export function TeamRoleSelect({id,role}:{id:string;role:string}){
 const [value,setValue]=useState(role),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 return <div><select aria-label="Team role" disabled={busy} value={value} onChange={async e=>{const next=e.target.value;setBusy(true);setError('');try{const r=await fetch('/api/users',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,role:next})});const d=await r.json();if(!r.ok)throw Error(d.error);setValue(next);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>{[['b2b_head','B2B Head'],['regional_manager','Store Lead'],['store_associate','Store Associate'],['ground_rep','Ground Team'],['analyst','Analyst (read only)']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>{error&&<p role="alert">{error}</p>}</div>;
}
