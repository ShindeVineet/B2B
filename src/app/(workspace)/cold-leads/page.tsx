"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/workspace/PageHeader";
import { ColdLeads } from "@/components/cold/ColdLeads";
import type { ColdConfig } from "@/lib/cold/rules";
export default function Page() {
  const { user } = useAuth();
  const [config, setConfig] = useState<ColdConfig | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [version, setVersion] = useState(0);
  useEffect(() => {
    if (user?.role === "b2b_head")
      fetch("/api/cold-leads/config")
        .then((r) => r.json())
        .then((d) => setConfig(d.config))
        .catch((e) => setError(String(e)));
  }, [user]);
  return (
    <main className="workspace-page space-y-5">
      <PageHeader
        title="Cold Leads"
        description="Turn field feedback into a clear next step. Managers see their region; the Head and Ops see all regions."
      />
      {config && (
        <details className="workspace-card">
          <summary className="cursor-pointer font-semibold">
            Cold-lead rules · Admin settings
          </summary>
          <div className="mt-4 space-y-3">
            {[
              ["outcome_rule", "Outcome is Dont want commission"],
              [
                "checklist_rule",
                "Checklist includes Removed from office/Not interested",
              ],
              ["low_interest_rule", "Interest level is Low"],
            ].map(([key, label]) => (
              <label className="block" key={key}>
                <input
                  type="checkbox"
                  checked={config[key as keyof ColdConfig]}
                  onChange={(e) =>
                    setConfig({ ...config, [key]: e.target.checked })
                  }
                />
                {label}
              </label>
            ))}
            <p className="text-xs text-slate-500">
              Onboarded, lost and data-correction outcomes are always excluded.
              Saving reevaluates the latest consultation for existing leads.
            </p>
            <button
              className="bg-orange-600 text-white"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const r = await fetch("/api/cold-leads/config", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(config),
                  });
                  const d = await r.json();
                  if (!r.ok) throw Error(d.error);
                  setVersion((v) => v + 1);
                } catch (e) {
                  setError(String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Save rules
            </button>
            <p role="alert">{error}</p>
          </div>
        </details>
      )}
      <ColdLeads key={version} />
    </main>
  );
}
