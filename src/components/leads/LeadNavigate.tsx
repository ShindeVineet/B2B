"use client";
import { useState } from "react";
import {
  navigationUrl,
  openLeadNavigation,
  type NavigableLead,
} from "@/lib/lead-navigation";
export function LeadNavigate({
  lead,
  className = "rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800",
  children,
}: {
  lead: NavigableLead;
  className?: string;
  children?: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (!navigationUrl(lead)) return null;
  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        disabled={busy}
        className={className}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={async (e) => {
          e.stopPropagation();
          setBusy(true);
          setError("");
          try {
            await openLeadNavigation(lead.id);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Navigation unavailable");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Checking location…" : children || "Navigate"}
      </button>
      {error && (
        <span role="alert" className="text-xs text-red-700">
          {error}
        </span>
      )}
    </span>
  );
}
