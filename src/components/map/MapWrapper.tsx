"use client";

import dynamic from "next/dynamic";
import React from "react";
import { Loader2 } from "lucide-react";

const InteractiveLeadMap = dynamic(
  () => import("./InteractiveLeadMap").then((mod) => mod.InteractiveLeadMap),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-[calc(100vh-64px)] flex flex-col items-center justify-center bg-white text-slate-600 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-[#ff4500]" />
        <p className="text-sm font-semibold">Initializing FLORZY B2B Map & Geo-layers...</p>
      </div>
    ),
  }
);

export function MapWrapper() {
  return <InteractiveLeadMap />;
}
