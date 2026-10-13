# Phase 5 implementation review

The implementation covers the six Phase 5 items in build-prompt order. **Deployment update, 2026-09-27:** following the request to fix map/leads loading and restart, the additive migration was applied transactionally to the local database after a backup. The server was restarted; all 119 leads remain. Do not rerun the SQL on this database. The original implementation review was completed before application.

Backup: `/private/tmp/b2b-db-backups/before-phase5-1790515513964.dump` (local, owner-only access).

## Migration and compatibility

Migration applied locally: `prisma/migrations/202609270001_phase5_additive/migration.sql`. Review before applying to any other database. The migration adds columns, enum types, tables, indexes, foreign keys and a status-entry timestamp trigger. It does not drop, rename or change the type of any old column, or rewrite existing lead coordinates/outcomes/statuses. Backfills only classify new geocode/status fields, map the old `completed` flag into the new visit-status column, and create assignment rows for existing plans. The SQL is transactional.

This checkout had `trip_plans`, `trip_leads.completed` and a generic consultation model, but no `trip_assignments`, notifications, six-outcome Phase 3 engine, configurable form/photo-upload storage, or 48-hour SLA job. With the user's approval, Phase 5 adds the supporting tables/nullable consultation fields alongside those existing models. Existing generic outcome routing is preserved; **this change does not reconstruct the missing Phase 3 engine, form builder or SLA job**. The at-risk panel reads the exact requested statuses when present and is empty when there are none. Historical status-entry times remain unknown; future entries are timestamped by an additive trigger which does not change status or send alerts.

Frozen snapshots additionally store named coordinates and exact trip-lead IDs, as approved. Weekly schedules use Monday-start date-only calendars and Asia/Kolkata for “today” and visit-date handling. Missing historical geocode provenance stays null. Legacy/head-created plans with no assigning manager must be claimed by a regional manager before rescheduling. No move is permitted beyond plan end until a manager explicitly extends it.

This repository had no existing migration history. Do not use `db push` or reset the database to apply this change. For the already-existing database, after reviewing/backing up through your normal process, the additive SQL can be applied with:

```sh
npx prisma db execute --schema prisma/schema.prisma --file prisma/migrations/202609270001_phase5_additive/migration.sql
npx prisma generate
```

Restart the app only after applying the migration. New Prisma fields require the migration; the new screens are not compatible with the old database schema. Establish a baseline migration history separately before using `prisma migrate deploy` for this formerly unmanaged database.

## Operating the new flows

- **Needs Geocode Fix / lead details:** correct any pin numerically. See `PHASE5-MAP-AUDIT.md` for diagnosis and the three reported leads; their true office coordinates still need verification.
- **Consultations:** scoped list, filters, search, table/grid, full cards, explicit CSV export and full activity history. Old rows show missing information honestly. The compatibility API accepts nullable additional consultation fields/photo URLs; the absent Phase 3 upload/form system is not replaced.
- **Plans:** new plans are drafts; publish or republish explicitly. Existing active plans stay visible. Publishing saves immutable per-rep/day geometry with incrementing versions; Route History refreshes live visit colors every 15 seconds.
- **Working days:** choose base pattern during creation, change base or weekly override in the calendar, revert overrides, set day capacity and explicitly extend plan dates. Occupied days require a this-week/next-week choice; insufficient capacity rolls back the entire change. Rep-wide occupancy is checked and concurrent writes use serializable transactions plus per-rep locks.
- **Misses:** reps choose reason/note and explicitly confirm a suggested or manually chosen available day. A historical event and manager notification are committed atomically. Dashboards show misses and visit notifications.
- **Pattern scheduler:** after migration, run `npm run phase5:worker` as a supervised worker alongside the app. It checks the trailing seven days once per minute. Alternatively, schedule authenticated POSTs to `/api/jobs/missed-pattern` using `Authorization: Bearer <CRON_SECRET>`. The secret must be configured for the HTTP option; no secret was added to `.env`. Only one of these deployment options is needed. This worker was not started against the unmigrated database.
- **At-risk:** the Head/Ops dashboard always includes the read-only region/manager grouping and age. No SLA/escalation notifications are created by this view.

Outcome badge palette: onboarding green, visit scheduled blue, nurturing amber, commission objection purple, lost grey, wrong location red; legacy outcomes grey. This mapping was proposed for the unspecified palette and explicitly communicated while awaiting any alternative.

## Validation

Prisma client generation, TypeScript, ESLint, production build and 16 tests passed during implementation. Tests cover existing role scope, all-page map loading, coordinate order/bounds, route-link stop preservation, frozen snapshot versions, weekly overrides, capacity and all-or-nothing redistribution, and third-miss notification deduplication. Snapshot/job tests use controlled repository doubles, not the application database. Full migrated-database/browser workflows remain to be checked after migration review/application. Google Maps visual validation could not be completed through the browsing tool.

## File-by-file change map

| File | Phase 5 item | Change |
| --- | --- | --- |
| `DEVELOPMENT-LOG.md` | 1–6 | Records Phase 5 delivery, diagnosis, validation and unapplied migration. |
| `docs/PHASE5-MAP-AUDIT.md` | 1 | Audit findings, named lead evidence, limitations and correction rationale. |
| `docs/PHASE5-REVIEW.md` | 1–6 | Migration/deployment instructions, validation limits and this complete file manifest. |
| `package.json` | 5 | Adds the missed-pattern worker command. |
| `prisma/migrations/202609270001_phase5_additive/migration.sql` | 1–6 | Transactional additive SQL (now applied locally), compatibility backfills and status-entry trigger. |
| `prisma/schema.prisma` | 1–6 | Prisma representation of additive Phase 5 and approved compatibility fields/models. |
| `prisma/seed.ts` | 1 | Reads PIN CSV coordinates by header with proper quoted-field parsing. |
| `scripts/phase5-worker.ts` | 5 | Supervised minute-by-minute missed-pattern worker entry point. |
| `src/app/(workspace)/consultations/page.tsx` | 2 | Search, filters, sorting, table/grid, explicit filtered CSV. |
| `src/app/(workspace)/dashboard/page.tsx` | 5, 6 | Mounts the missed-visit and always-on at-risk panels. |
| `src/app/(workspace)/geocode-fixes/page.tsx` | 1 | Needs Geocode Fix screen. |
| `src/app/(workspace)/leads/[id]/page.tsx` | 1, 2 | Lead details, pin correction, consultation cards and full history. |
| `src/app/(workspace)/plans/page.tsx` | 3–5 | Plan calendar, publish, weekly overrides, redistribution choice, capacity and manager rescheduling controls. |
| `src/app/(workspace)/routes/page.tsx` | 3 | Rep/date/version Route History with refreshed live colors. |
| `src/app/api/at-risk/route.ts` | 6 | Head/Ops read-only exact-status query with manager/region and entry time. |
| `src/app/api/consultations/route.ts` | 1, 2, 3 | Visit GPS/mismatch checks, searchable filtered list, nullable detail fields and visited status; preserves old outcome routing. |
| `src/app/api/geocode-fixes/route.ts` | 1 | Scoped invalid/mismatch review queue. |
| `src/app/api/jobs/missed-pattern/route.ts` | 5 | Secret-protected scheduler endpoint. |
| `src/app/api/leads/[id]/history/route.ts` | 2 | Scoped complete activity history. |
| `src/app/api/leads/[id]/location/route.ts` | 1 | Scoped location update with provenance, validity and manager verification. |
| `src/app/api/leads/[id]/route.ts` | 1 | Refreshes metadata on address change; invalidates failed replacements. |
| `src/app/api/leads/bulk-import/route.ts` | 1 | Persists imported/geocoded coordinate status and known source. |
| `src/app/api/leads/route.ts` | 1 | Persists geocode metadata on lead creation; guards proximity use. |
| `src/app/api/missed-visits/route.ts` | 5 | Manager/Head miss list filtered by rep and date. |
| `src/app/api/notifications/route.ts` | 5 | Authenticated recipient-only visit notifications. |
| `src/app/api/routes/route.ts` | 3 | Scoped snapshot/version selection and current visit statuses. |
| `src/app/api/trips/[id]/publish/route.ts` | 3 | Scoped atomic publish/republish with snapshot creation. |
| `src/app/api/trips/[id]/schedule/route.ts` | 4, 5 | Explicit override redistribution, capacity, extension and assigning-manager claim. |
| `src/app/api/trips/auto-plan/route.ts` | 3, 4 | Creates draft plans/assignments with base days; validates coordinates and concurrent capacity. |
| `src/app/api/trips/route.ts` | 3, 4 | Returns schedule details; reps see active/published plans. |
| `src/app/api/visits/[id]/reschedule/route.ts` | 5 | Scoped suggestion and atomic missed-event/date/manager-notification write. |
| `src/components/consultations/ConsultationCard.tsx` | 2 | Complete consultation card, badges, thumbnail, tags, photo lightbox and history link. |
| `src/components/dashboard/Phase5Panels.tsx` | 5, 6 | Filtered miss table, notification list and grouped read-only at-risk table. |
| `src/components/layout/Navbar.tsx` | 1–4 | Role-scoped navigation to correction queue, consultations, routes and plans. |
| `src/components/leads/CorrectPin.tsx` | 1 | Verified numeric pin correction dialog. |
| `src/components/leads/LeadsTable.tsx` | 1, 2 | Links company names to location correction and full lead history. |
| `src/components/leads/MonthlyPlanModal.tsx` | 4 | Base working-day picker and explicit draft/publish guidance. |
| `src/components/map/InteractiveLeadMap.tsx` | 1 | India-valid pins, named Leaflet coordinates and Correct Pin control. |
| `src/components/rep/ConsultationModal.tsx` | 1 | Requests GPS on open and submits matching-lead coordinates gracefully. |
| `src/components/rep/GroundRepPortal.tsx` | 1, 5 | Bounds-checks route pins and adds missed/reschedule actions. |
| `src/components/rep/RescheduleVisit.tsx` | 5 | Structured reason/note, capacity suggestion and explicit confirmation modal. |
| `src/components/routes/SnapshotMap.tsx` | 3 | Frozen numbered markers/polyline with live status colors. |
| `src/lib/geo.ts` | 1 | Changes polygon/bounding-box helpers to named coordinates. |
| `src/lib/location.ts` | 1, 3 | Named coordinates, India bounds, provenance mapping and haversine distance. |
| `src/lib/map-leads.ts` | 1 | Uses India bounds for valid map coordinates. |
| `src/lib/phase5/calendar.ts` | 4, 5 | Date-only working-day, week, capacity and redistribution calculations. |
| `src/lib/phase5/http.ts` | 3–5 | Consistent validation and concurrency-conflict responses. |
| `src/lib/phase5/missed-pattern.ts` | 5 | Trailing-seven-day threshold and idempotent Head alerts. |
| `src/lib/phase5/schedule.ts` | 4, 5 | Builds effective schedules and aggregate rep occupancy. |
| `src/lib/phase5/snapshots.ts` | 3 | Versioned frozen geometry and exact visit-ID snapshots. |
| `src/lib/prisma.ts` | 1–6 | Refreshes stale development Prisma clients missing Phase 5 delegates. |
| `src/lib/route-links.ts` | 1 | Rejects invalid/outside-India stops before external navigation. |
| `tests/map-leads.test.ts` | 1 | Updates coordinate expectations for the India-only map. |
| `tests/phase5.test.ts` | 1, 3–5 | Geometry, date/capacity, snapshot immutability/versioning and alert-deduplication tests. |
| `tests/route-links.test.ts` | 1 | Rejects outside-India navigation stops. |
