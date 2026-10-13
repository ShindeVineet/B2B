# Simplified routes and calling — 6 October 2026

**Latest update:** Assigned routes now have their own workspace tab. Route size determines capacity; capacity/window inputs are removed. Rep rescheduling requires Head/Store Lead approval and is not bounded by the old end date. Revisits use a short outcome form; the original consultation is retained. See the latest DEVELOPMENT-LOG entry for current behavior; the earlier implementation notes below describe the initial version.

Route Builder now owns creation, preview, assignment and assigned-route editing. The Plans navigation entry is removed; `/plans` redirects to `/route-planner`. Existing trip/assignment records and historical consultations are retained. Internal published schedules are created when a route is assigned, with a selected rep, date, daily capacity, working days and explicit rescheduling end date. Existing capacity limits still apply. Assigned stops can be added/removed with confirmation; pending visits can be rescheduled. Managers can extend the scheduling window on the route page.

Compact route cards show stop count, distance and a schematic route outline; selecting one opens the full Leaflet map. Distances remain straight-line estimates.

Log revisit offers Visit now or Schedule revisit. A new trip-lead record represents each revisit. A pending visit is reused for the same date, while conflicting pending dates must be resolved first. Completed visits remain unchanged; each consultation still links to its specific visit. Revisit actions are restricted to the member currently assigned the lead.

Not-found locations appear in the calling queue, with a session-deduplicated toast. A persistent round-robin cursor assigns storeless leads across all active store associates. Leads with a store use that store's active associates. If no eligible associate exists, Head/Store Lead retain visibility and the worker retries allocation when associates become available. Existing caller ownership is retained when a store is added. Head and managers can also call/update/onboard. Ground reps receive no access merely because a lead is in a calling queue.

LinkedIn CSV/XLSX import uses editable column mapping for the supplied format. All source fields are retained in `linkedin_data`; external `lead_id` is stored separately as unique `linkedin_lead_id`. The application generates its normal internal lead ID/code. Re-importing a populated external ID skips that record. Rows without a source ID cannot be deduplicated by that ID. Imported leads enter the LinkedIn calling tab and round-robin allocation, without assigning a ground visit. The calling page links calls, detail completion and partner onboarding to the internal lead ID.

## Additive migration

`prisma/migrations/202610060001_calling_distribution/migration.sql` adds caller ownership, LinkedIn ID/source data and a persistent rotation table. Applied to the live database after backup at `/private/tmp/b2b-db-backups/before-calling-distribution-1791231901700.dump`. Do not manually reapply this SQL. No existing rows or columns were dropped.

## Main files

- `src/components/routes/RouteBuilder.tsx`, `RoutePreviewCard.tsx`, `RoutePreviewCard.module.css`: planning and assignment on one page; preview cards/map; rescheduling controls.
- `src/lib/routes/direct-schedule.ts`, `src/app/api/route-plans/[id]/route.ts`: direct assignment and capacity/window editing.
- `src/components/layout/Navbar.tsx`, `src/app/(workspace)/plans/page.tsx`: retire separate Plans workflow.
- `src/components/rep/LogRevisit.tsx`, `GroundRepPortal.tsx`, `src/app/api/leads/[id]/revisit/route.ts`: immediate/future revisits.
- `src/lib/calling/distribute.ts`, `src/lib/mapping/jobs.ts`, `scripts/data-worker.ts`: transaction-safe caller allocation and backlog processing.
- `src/lib/permissions.ts`: allocated associate read/edit access, retaining existing ground isolation.
- `src/app/api/calling-locations/route.ts`, `src/components/leads/CallingQueue.tsx`, `LocationQueueToast.tsx`, `src/components/layout/AppProviders.tsx`: caller queue, toast and detail correction.
- `src/app/api/leads/[id]/route.ts`: unsuccessful location correction stays in the not-found calling queue.
- `src/app/api/leads/linkedin-import/route.ts`, `src/components/import/CDTImport.tsx`, `LeadImportWizard.tsx`: LinkedIn intake, source-ID dedupe and column mapping.
- `prisma/schema.prisma` and migration: additive allocation/source metadata.
- `scripts/phase9/calling-revisits.ts`, `scripts/phase9/browser.mjs`: isolated API and browser verification.

Validation: 92 unit tests, existing route integration suite, new caller/revisit/direct-assignment integration suite, TypeScript, targeted ESLint, production build and responsive browser checks.
