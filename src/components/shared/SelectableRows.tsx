"use client";
import { useEffect, useRef, useState, type ReactNode, type PointerEvent } from "react";
export function SelectableRows({children, selectedIds, onSelectionChange}:{children:ReactNode;selectedIds?:Set<string>;onSelectionChange?:(ids:Set<string>)=>void}) {
  const root=useRef<HTMLDivElement>(null);
  const [local,setLocal]=useState(new Set<string>());
  const selected=selectedIds??local;
  const current=useRef(selected);useEffect(()=>{current.current=selected},[selected]);
  const dragging=useRef<boolean|null>(null);
  const update=onSelectionChange??setLocal;
  useEffect(()=>{const stop=()=>{dragging.current=null};window.addEventListener("pointerup",stop);window.addEventListener("pointercancel",stop);window.addEventListener("blur",stop);return()=>{window.removeEventListener("pointerup",stop);window.removeEventListener("pointercancel",stop);window.removeEventListener("blur",stop)}},[]);
  useEffect(()=>{root.current?.querySelectorAll("tbody tr").forEach((row,i)=>{row.setAttribute("aria-selected",String(selected.has((row as HTMLElement).dataset.rowId??String(i))));});},[selected,children]);
  function rowAt(target:EventTarget|null){if(!(target instanceof Element))return null;const row=target.closest("tbody tr") as HTMLElement|null;if(!row||!root.current?.contains(row))return null;return row.dataset.rowId??String([...root.current.querySelectorAll("tbody tr")].indexOf(row));}
  function choose(id:string,add:boolean){const next=new Set(current.current);if(add)next.add(id);else next.delete(id);current.current=next;update(next);}
  function down(e:PointerEvent){if(e.button!==0||(e.target as Element).closest("button,a,input,select,textarea"))return;const id=rowAt(e.target);if(id===null)return;e.preventDefault();dragging.current=!current.current.has(id);choose(id,dragging.current);}
  return <div ref={root} onPointerDown={down} onPointerOver={e=>{if(dragging.current===null||e.buttons!==1)return;const id=rowAt(e.target);if(id!==null)choose(id,dragging.current)}} className="selectable-rows"><p className="p-2 text-xs text-slate-500">Click or drag across rows to select. {selected.size} selected.</p>{children}</div>;
}
