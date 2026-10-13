"use client";
import { useEffect, useState } from "react";
export function LastContact({
  leadId,
  value,
}: {
  leadId: string;
  value?: string | null;
}) {
  const [recent, setRecent] = useState<string | null>(null);
  useEffect(() => {
    const update = (e: Event) => {
      const detail = (e as CustomEvent<{ leadId: string; date: string }>)
        .detail;
      if (detail?.leadId === leadId) setRecent(detail.date);
    };
    window.addEventListener("lead-contact-updated", update);
    return () => window.removeEventListener("lead-contact-updated", update);
  }, [leadId]);
  const date = recent || value;
  return (
    <span
      className="float-right ml-2 rounded-md bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-600"
      title="Latest recorded call or completed consultation/revisit; not a future scheduled visit"
    >
      Last contact:{" "}
      {date
        ? new Date(date).toLocaleDateString("en-IN", {
            timeZone: "Asia/Kolkata",
            day: "2-digit",
            month: "short",
            year: "numeric",
          })
        : "Not recorded"}
    </span>
  );
}
