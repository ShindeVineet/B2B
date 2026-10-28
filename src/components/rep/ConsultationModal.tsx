"use client";
import { CallingConsultationModal } from "@/components/consultations/CallingConsultationModal";
import { OriginalLead } from "@/components/leads/OriginalLead";
import { ConsultationFields } from "@/components/consultations/ConsultationFields";
import { DialogOverlay } from "@/components/shared/DialogOverlay";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { FieldDefinition } from "@/lib/consultations/fields";
import { compressPhoto } from "@/lib/consultations/compress";
import { todayIndia } from "@/lib/phase5/calendar";
type Lead = {
  id: string;
  trip_lead_id?: string;
  lead_code?: string;
  company_name: string;
  phone_no?: string | null;
};
export function ConsultationModal(props: Parameters<typeof ConsultationForm>[0]) {
  if (props.isOpen && props.context === "calling") {
    return (
      <CallingConsultationModal
        leadId={props.lead.id}
        onClose={props.onClose}
        onSuccess={props.onSuccess}
      />
    );
  }
  return props.isOpen ? <ConsultationForm key={`${props.lead.id}:${props.lead.trip_lead_id || ""}:${props.context || ""}`} {...props} /> : null;
}
function ConsultationForm({
  lead,
  isOpen,
  onClose,
  onSuccess,
  context,
}: {
  lead: Lead;
  context?: "ground" | "calling";
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const [mode, setMode] = useState("ground");
  const [visitId, setVisitId] = useState<string | null>(null);
  const [verifiedFor, setVerifiedFor] = useState("");
  const visitKey = `${lead.id}:${lead.trip_lead_id || ""}`;
  const allowed = verifiedFor === visitKey;
  const [fields, setFields] = useState<FieldDefinition[]>([]),
    [values, setValues] = useState<Record<string, string | string[]>>({}),
    [staff, setStaff] = useState(""),
    [admin, setAdmin] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false);
  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    fetch(
      "/api/consultations/open?" +
        new URLSearchParams({
          lead_id: lead.id,
          ...(context ? { context } : {}),
          ...(lead.trip_lead_id ? { trip_lead_id: lead.trip_lead_id } : {}),
        }),
    )
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        if (active) {
          setMode(d.mode || "ground");
          setVisitId(d.trip_lead_id);
          setVerifiedFor(visitKey);
        }
        if (d.mode === "calling") return null;
        return fetch("/api/form-fields");
      })
      .then(async (r) => {
        if (!r) return;
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        if (active) {
          setFields(d.fields);
          setStaff(d.staff_name);
          setAdmin(d.can_edit_staff);
          setValues({
            company_name: lead.company_name,
            decision_maker_phone: lead.phone_no || "",
            visit_date: todayIndia(),
            ground_staff_name: d.staff_name,
          });
        }
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [
    isOpen,
    lead.id,
    lead.company_name,
    lead.phone_no,
    lead.trip_lead_id,
    visitKey,
    context,
  ]);
  if (!isOpen) return null;
  if (mode === "calling" && allowed) return <CallingConsultationModal key={lead.id} leadId={lead.id} onClose={onClose} onSuccess={onSuccess} />;
  const set = (key: string, value: string | string[]) =>
    setValues((v) => ({ ...v, [key]: value }));
  async function upload(field: FieldDefinition, files: FileList | File[] | null) {
    if (!files?.length) return;
    const current = Array.isArray(values[field.key])
      ? (values[field.key] as string[])
      : [];
    if (current.length + files.length > (field.max_files || 5)) {
      setError(`${field.label}: maximum ${field.max_files || 5} photos.`);
      return;
    }
    setUploading(true);
    setError("");
    const uploaded: string[] = [];
    try {
      for (const file of files) {
        const compressed = await compressPhoto(file);
        const form = new FormData();
        form.set("lead_id", lead.id);
        form.set("file", compressed);
        const r = await fetch("/api/photos", { method: "POST", body: form });
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        uploaded.push(d.url);
        set(field.key, [...current, ...uploaded]);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setUploading(false);
    }
  }
  return (
    <DialogOverlay
      role="dialog"
      aria-modal="true"
      aria-label="Consultation form"
      className="fixed inset-0 z-[100] bg-slate-950/50 flex items-center justify-center sm:p-4"
    >
      <div className="w-full max-w-xl bg-white sm:rounded-2xl shadow-xl max-h-[100dvh] sm:max-h-[92dvh] flex flex-col">
        <header className="flex items-start justify-between p-5 border-b">
          <div>
            <h2 className="text-lg font-bold">Log consultation</h2>
            <p className="text-sm text-slate-500">
              {lead.lead_code} {lead.company_name}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close consultation"
            disabled={busy || uploading}
            onClick={onClose}
            className="p-3"
          >
            <X size={20} />
          </button>
        </header>
        <form
          className="p-5 overflow-y-auto space-y-5"
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              fields.some(
                (f) =>
                  f.type === "multi_select" &&
                  f.required &&
                  !(values[f.key] as string[] | undefined)?.length,
              )
            ) {
              setError("Select at least one CheckList item.");
              return;
            }
            setBusy(true);
            setError("");
            try {
              const r = await fetch("/api/consultations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  lead_id: lead.id,
                  trip_lead_id: visitId,
                  responses: values,
                }),
              });
              const d = await r.json();
              if (!r.ok) throw Error(d.error);
              window.dispatchEvent(new Event("store-visits-updated"));
          onSuccess?.();
              onClose();
            } catch (e) {
              setError(String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <OriginalLead leadId={lead.id} />
          {!allowed && <p role="alert">{error || "Checking visit eligibility…"}</p>}
          {!fields.length && <p>Loading consultation fields…</p>}
          <ConsultationFields fields={allowed ? fields : []} values={values} set={set} staff={staff} admin={admin} disabled={!allowed || busy || uploading} context={context} upload={upload} />
          {uploading && (
            <p role="status" className="text-sm text-orange-700">
              Compressing and uploading photos…
            </p>
          )}
          {error && (
            <p
              role="alert"
              className="rounded-xl bg-rose-50 text-rose-700 p-3 text-sm"
            >
              {error}
            </p>
          )}
          <button
            disabled={!allowed || busy || uploading || !fields.length}
            className="w-full rounded-xl bg-orange-600 text-white p-4 font-semibold disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save consultation"}
          </button>
        </form>
      </div>
    </DialogOverlay>
  );
}
