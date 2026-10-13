"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
type Reminder = {
  id: string;
  lead_code: string;
  company_name: string;
  status: string;
  href: string;
};
export function OnboardingReminders() {
  const [rows, setRows] = useState<Reminder[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const r = await fetch("/api/onboarding-reminders", {
          cache: "no-store",
        });
        if (!r.ok) throw Error("Unable to load onboarding reminders.");
        const data = await r.json();
        if (live) {
          setRows(data.reminders);
          setError("");
        }
      } catch (e) {
        if (live) setError((e as Error).message);
      }
    };
    const refresh = () => void load();
    refresh();
    window.addEventListener("onboarding-updated", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      live = false;
      window.removeEventListener("onboarding-updated", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  if (error)
    return (
      <p role="alert" className="text-sm text-red-700">
        {error}
      </p>
    );
  if (!rows.length) return null;
  return (
    <section className="rounded-2xl border border-orange-200 bg-orange-50/50 p-4 space-y-3">
      <h2 className="flex items-center gap-2 font-semibold text-slate-900">
        <ClipboardCheck size={20} className="text-orange-600" />
        Ready for onboarding{" "}
        <span className="text-sm text-orange-700">({rows.length})</span>
      </h2>
      <p className="text-sm text-slate-600">
        Collect documents and complete onboarding whenever ready. These
        reminders stay until onboarding is approved.
      </p>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 max-h-80 overflow-y-auto">
        {rows.map((row) => (
          <Link
            key={row.id}
            href={row.href}
            className="rounded-xl border border-orange-100 bg-white p-3 hover:border-orange-400"
          >
            <div className="text-xs text-slate-500">{row.lead_code}</div>
            <div className="font-semibold text-sm break-words">
              {row.company_name}
            </div>
            <div className="mt-2 text-xs text-orange-800">
              {row.status === "pending_review"
                ? "Awaiting approval · View application"
                : row.status === "rejected"
                  ? "Changes needed · View application"
                  : "Documents pending · Onboard when ready"}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
