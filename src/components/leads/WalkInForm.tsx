"use client";
import { PageHeader } from "@/components/workspace/PageHeader";
import { LeadIntakeForm } from "./LeadIntakeForm";
export function WalkInForm() {
  return <div className="workspace-page"><PageHeader title="Walk-in lead & consultation" description="Only the partner name and phone number are required for a walk-in." /><LeadIntakeForm initialSource="Walk-in" /></div>;
}
