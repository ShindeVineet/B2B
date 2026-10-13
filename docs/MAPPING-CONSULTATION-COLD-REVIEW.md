# Mapping, consultation and cold-lead implementation review

## Outcome and diagnosis

The audit found **PIN-level precision and ignored Google place coordinates, not a latitude/longitude swap**. The cache contains representative postal points; these are not office entrances. The prior lead pipeline could return that coarse point before checking the address or saved Google link.

The completed background run processed all **119 existing leads: 83 accepted locations, 36 Mapping Issues, zero processing errors**. All 119 leads and four pre-existing consultations were retained. MSP Interiors, TimberCraft and Deejos now use the exact place coordinates from their saved Google links, with `geocode_source=google_link`. They passed India and local-area validation; they are not described as field-verified manual locations.

## A: mapping behavior

Google-link extraction precedes bounded company searches and precise-address fallback. Area validation applies to Google coordinates too. Place-coordinate data takes priority over a Google URL's camera position. Short-link redirects are checked against allowed Google hosts. Unaccepted results have no plotted business coordinate and appear in Mapping Issues; flagged/invalid locations are also blocked from routes. Manual candidate/link/dragged-pin corrections are manager/head actions, audited and marked verified. “Cannot locate” remains visible and blocked. Unmapped Queue retains its assignment meaning.

Nominatim calls share a database lock and at least 1.1 seconds between requests across app and worker processes. Query results, including empty results, are cached. This follows the [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/) and its [bounded-search API](https://nominatim.org/release-docs/latest/api/Search/). The provider interface supports replacement later. Transient provider failures produce retryable job errors rather than fabricated coordinates. Existing manually verified locations are preserved during bulk reruns.

## B: consultation behavior

The migration and seed define the requested 18 fields. Both rendering and server validation use `form_fields`. Conditional follow-up dates, required checklist/site photos and attachment limits are enforced. Typed columns and `responses` are written together. Existing `notes` and all older consultation data are preserved. The current rep's actual name can be auto-filled alongside the five configured staff choices; only Head can edit it.

Camera and gallery are separate controls. Images are resized/compressed before upload; accepted JPEG/PNG/WebP files are stored privately under `.data/photos` (or `PHOTO_STORAGE_DIR`) and served through authenticated, lead-scoped API routes. Back up this directory with the database and use persistent storage when deploying. Site and visiting-card images have separate thumbnail rows with enlargement; checklist and notes appear on consultation cards and lead history. Older null values are supported.

## C: cold leads

Admin can enable/disable the three requested default rules. Final and data-correction outcomes are excluded. Region-scoped queues, navigation/dashboard counts, full consultation context, call history and all four call outcomes are implemented. Reactivation creates a dated rep follow-up, callbacks create reminders, and conversion sets `onboarded`. Ops cannot write.

This checkout did not contain the Phase 3 SLA worker described in the PRD. The new worker supplies the requested deduplicated 48-hour Head alert and callback/follow-up reminders in-app. Existing Phase 5 missed-visit notification/pattern logic remains separate and unchanged. No email service was added. Four historical consultation histories were evaluated without changing their consultation records.

## Follow-up: route order, capacity editing and contrast

Rep route previews, numbered itineraries, navigation links, and newly published route snapshots use the same nearest-next-stop ordering. The starting point is the rep's store when available; without a store, a stable westernmost starting stop is used. This uses geographic distance, not road traffic or a guaranteed globally shortest driving route. Historical route snapshots stay frozen; republishing creates a new ordered version.

Capacity conflicts return HTTP 409 with the affected visits. The plan builder and Plans screen provide **Edit visit / lead** to move a visit or replace its lead. Working days, regional access, daily capacity, completed visits, duplicate same-day lead visits and concurrent changes are checked server-side. Moving outside a plan still requires explicitly extending it first. Edits are audited and do not create missed-visit events. Republish after editing to save new route-history geometry.

Branding is only FLORZY B2B. Navigation uses a menu at narrower widths rather than horizontal scrolling. Plans, Route History, Consultations and Dashboard use consistent spacing and controls. Blue-grey filter/table surfaces, darker labels and stronger borders improve contrast.

## Migration and runtime

Migration: `prisma/migrations/202609280001_mapping_consultation_cold/migration.sql`.

It adds columns, enum values and new tables only; it does not drop or rename existing columns/tables. `notes` already existed and was retained. Prisma schema and client were updated to match. The migration was applied to the local database transactionally after backup. Do not reapply its SQL to this already-migrated database. This checkout lacks a complete Prisma migration-history baseline, so no reset or `db push` was used.

Local backup: `/private/tmp/b2b-db-backups/before-abc-1790589269037.dump`.

To reprocess leads again:

1. Keep the app running with `npm run dev` (or the production server).
2. Run **one** persistent worker using `npm run data:worker`. It handles geocoding and cold/callback/follow-up reminders. It is currently running locally.
3. In **Mapping Issues** or **Leads Funnel**, use **Re-run geocoding — all unverified leads**, or select rows and use **Re-run selected**. Manual verified pins are preserved.
4. Watch processed/accepted/issues/error counts; reload Map View when complete. Resolve remaining issues via a candidate, Google link or Correct Pin.

The historical cold-case compatibility script is `node --import tsx scripts/backfill-cold-leads.ts`. It is idempotent for an already handled consultation and was run locally. The existing Phase 5 worker (`npm run phase5:worker`) remains the separate missed-pattern job.

## Validation

- 29 unit/regression tests passed, including map validation, no-centroid fallback, routing order, consultation rules and existing Phase 5 behavior.
- TypeScript, ESLint and production build passed.
- `node --import tsx scripts/abc-workflow-check.mjs`: real API/database test of upload, consultation, typed/JSON synchronization, cold routing, 48-hour alert deduplication, scope enforcement, callbacks, reactivation and onboarding. Temporary data/files are cleaned up.
- `node scripts/plan-edit-check.mjs`: real capacity conflict, full-day/end-date rejection, move/replace, successful retry and no false missed event. Temporary data is cleaned up.
- Browser checks at 1600, 1440 and 390 pixels covered the requested screens, mapping issues and cold leads; no horizontal document overflow was found.

## File inventory

Paths below include shared files in more than one section where they implement multiple parts.

### A — Mapping

- [src/lib/mapping/domain.ts](../src/lib/mapping/domain.ts)
- [src/lib/mapping/provider.ts](../src/lib/mapping/provider.ts)
- [src/lib/mapping/nominatim.ts](../src/lib/mapping/nominatim.ts)
- [src/lib/mapping/google-link.ts](../src/lib/mapping/google-link.ts)
- [src/lib/mapping/pipeline.ts](../src/lib/mapping/pipeline.ts)
- [src/lib/mapping/jobs.ts](../src/lib/mapping/jobs.ts)
- [src/lib/mapping/visibility.ts](../src/lib/mapping/visibility.ts)
- [src/lib/maps-place.ts](../src/lib/maps-place.ts)
- [src/lib/geocoding/service.ts](../src/lib/geocoding/service.ts)
- [src/lib/geocoding/nominatim-provider.ts](../src/lib/geocoding/nominatim-provider.ts)
- [src/lib/map-leads.ts](../src/lib/map-leads.ts)
- [src/lib/route-links.ts](../src/lib/route-links.ts)
- [src/lib/phase5/snapshots.ts](../src/lib/phase5/snapshots.ts)
- [src/app/api/geocode/route.ts](../src/app/api/geocode/route.ts)
- [src/app/api/geocoding/jobs/route.ts](../src/app/api/geocoding/jobs/route.ts)
- [src/app/api/mapping-issues/route.ts](../src/app/api/mapping-issues/route.ts)
- [src/app/api/mapping-issues/[id]/route.ts](../src/app/api/mapping-issues/[id]/route.ts)
- [src/app/api/leads/route.ts](../src/app/api/leads/route.ts)
- [src/app/api/leads/[id]/route.ts](../src/app/api/leads/[id]/route.ts)
- [src/app/api/leads/[id]/location/route.ts](../src/app/api/leads/[id]/location/route.ts)
- [src/app/api/leads/bulk-import/route.ts](../src/app/api/leads/bulk-import/route.ts)
- [src/app/api/trips/route.ts](../src/app/api/trips/route.ts)
- [src/app/api/trips/auto-plan/route.ts](../src/app/api/trips/auto-plan/route.ts)
- [src/app/(workspace)/mapping-issues/page.tsx](../src/app/(workspace)/mapping-issues/page.tsx)
- [src/app/(workspace)/geocode-fixes/page.tsx](../src/app/(workspace)/geocode-fixes/page.tsx)
- [src/components/mapping/GeocodeProgress.tsx](../src/components/mapping/GeocodeProgress.tsx)
- [src/components/map/InteractiveLeadMap.tsx](../src/components/map/InteractiveLeadMap.tsx)
- [src/components/leads/CorrectPin.tsx](../src/components/leads/CorrectPin.tsx)
- [src/components/leads/PinPicker.tsx](../src/components/leads/PinPicker.tsx)
- [src/components/leads/LeadsTable.tsx](../src/components/leads/LeadsTable.tsx)
- [tests/mapping-pipeline.test.ts](../tests/mapping-pipeline.test.ts)
- [tests/maps-place.test.ts](../tests/maps-place.test.ts)
- [tests/geocoding.test.ts](../tests/geocoding.test.ts)
- [docs/PHASE5-MAP-AUDIT.md](../docs/PHASE5-MAP-AUDIT.md)

### B — Consultation form

- [src/lib/consultations/fields.ts](../src/lib/consultations/fields.ts)
- [src/lib/consultations/validation.ts](../src/lib/consultations/validation.ts)
- [src/lib/consultations/compress.ts](../src/lib/consultations/compress.ts)
- [src/lib/consultations/photos.ts](../src/lib/consultations/photos.ts)
- [src/app/api/form-fields/route.ts](../src/app/api/form-fields/route.ts)
- [src/app/api/photos/route.ts](../src/app/api/photos/route.ts)
- [src/app/api/photos/[id]/route.ts](../src/app/api/photos/[id]/route.ts)
- [src/app/api/consultations/route.ts](../src/app/api/consultations/route.ts)
- [src/components/rep/ConsultationModal.tsx](../src/components/rep/ConsultationModal.tsx)
- [src/components/consultations/ConsultationCard.tsx](../src/components/consultations/ConsultationCard.tsx)
- [src/app/(workspace)/leads/[id]/page.tsx](../src/app/(workspace)/leads/[id]/page.tsx)
- [src/components/rep/GroundRepPortal.tsx](../src/components/rep/GroundRepPortal.tsx)
- [prisma/seed.ts](../prisma/seed.ts)
- [.gitignore](../.gitignore)

### C — Cold leads

- [src/lib/cold/rules.ts](../src/lib/cold/rules.ts)
- [src/lib/cold/service.ts](../src/lib/cold/service.ts)
- [src/lib/cold/jobs.ts](../src/lib/cold/jobs.ts)
- [src/app/api/cold-leads/route.ts](../src/app/api/cold-leads/route.ts)
- [src/app/api/cold-leads/config/route.ts](../src/app/api/cold-leads/config/route.ts)
- [src/app/api/cold-leads/[id]/calls/route.ts](../src/app/api/cold-leads/[id]/calls/route.ts)
- [src/app/api/follow-ups/route.ts](../src/app/api/follow-ups/route.ts)
- [src/app/api/notifications/route.ts](../src/app/api/notifications/route.ts)
- [src/components/cold/ColdLeads.tsx](../src/components/cold/ColdLeads.tsx)
- [src/components/cold/CallHistory.tsx](../src/components/cold/CallHistory.tsx)
- [src/components/cold/WorkflowInbox.tsx](../src/components/cold/WorkflowInbox.tsx)
- [src/app/(workspace)/cold-leads/page.tsx](../src/app/(workspace)/cold-leads/page.tsx)
- [src/lib/lead-status.ts](../src/lib/lead-status.ts)
- [scripts/backfill-cold-leads.ts](../scripts/backfill-cold-leads.ts)
- [tests/consultation-cold.test.ts](../tests/consultation-cold.test.ts)
- [scripts/abc-workflow-check.mjs](../scripts/abc-workflow-check.mjs)

### Shared schema, navigation, UI and background processing

- [prisma/schema.prisma](../prisma/schema.prisma)
- [prisma/migrations/202609280001_mapping_consultation_cold/migration.sql](../prisma/migrations/202609280001_mapping_consultation_cold/migration.sql)
- [package.json](../package.json)
- [scripts/data-worker.ts](../scripts/data-worker.ts)
- [src/components/layout/Navbar.tsx](../src/components/layout/Navbar.tsx)
- [src/components/workspace/PageHeader.tsx](../src/components/workspace/PageHeader.tsx)
- [src/app/globals.css](../src/app/globals.css)
- [src/app/(workspace)/dashboard/page.tsx](../src/app/(workspace)/dashboard/page.tsx)
- [src/app/(workspace)/plans/page.tsx](../src/app/(workspace)/plans/page.tsx)
- [src/app/(workspace)/routes/page.tsx](../src/app/(workspace)/routes/page.tsx)
- [src/app/(workspace)/consultations/page.tsx](../src/app/(workspace)/consultations/page.tsx)
- [src/components/dashboard/Phase5Panels.tsx](../src/components/dashboard/Phase5Panels.tsx)

### Follow-up — proximity routes and editable visits

- [src/lib/route-order.ts](../src/lib/route-order.ts)
- [src/lib/phase5/snapshots.ts](../src/lib/phase5/snapshots.ts)
- [src/components/rep/GroundRepPortal.tsx](../src/components/rep/GroundRepPortal.tsx)
- [src/app/api/visits/[id]/edit/route.ts](../src/app/api/visits/[id]/edit/route.ts)
- [src/app/api/trips/auto-plan/route.ts](../src/app/api/trips/auto-plan/route.ts)
- [src/components/leads/EditVisit.tsx](../src/components/leads/EditVisit.tsx)
- [src/components/leads/MonthlyPlanModal.tsx](../src/components/leads/MonthlyPlanModal.tsx)
- [src/app/(workspace)/plans/page.tsx](../src/app/(workspace)/plans/page.tsx)
- [src/app/globals.css](../src/app/globals.css)
- [tests/route-order.test.ts](../tests/route-order.test.ts)
- [tests/phase5.test.ts](../tests/phase5.test.ts)
- [scripts/plan-edit-check.mjs](../scripts/plan-edit-check.mjs)

- [docs/MAPPING-CONSULTATION-COLD-REVIEW.md](MAPPING-CONSULTATION-COLD-REVIEW.md): this implementation report and file inventory.
