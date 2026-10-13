"use client";
import { useEffect, useRef } from "react";
import { DialogOverlay } from "./DialogOverlay";
export function WorkspaceDialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = setTimeout(() => panel.current?.querySelector<HTMLButtonElement>("button")?.focus(), 0);
    return () => { clearTimeout(timer); document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  return <DialogOverlay aria-label={title} className="fixed inset-0 bg-black/50 flex items-center justify-center p-3 sm:p-6" onClick={e => { if (e.target === e.currentTarget) onClose(); }} onKeyDown={e => {
    if (e.key === "Escape") { e.stopPropagation(); onClose(); }
    if (e.key === "Tab") { const elements = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"],summary') || []).filter(el => el.getClientRects().length > 0); const first = elements[0], last = elements.at(-1); if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); } }
  }}><div ref={panel} className="w-full max-w-5xl max-h-[90dvh] flex flex-col rounded-xl border-2 border-[#ff4500] bg-white shadow-xl">
    <div className="flex items-center justify-between gap-3 border-b-4 border-[#ff4500] p-4"><h2 className="font-bold text-lg">{title}</h2><button aria-label="Close dialog" className="border rounded-lg px-3 py-1" onClick={onClose}>Close ×</button></div>
    <div className="overflow-y-auto p-4 space-y-4">{children}</div>
  </div></DialogOverlay>;
}
