# Free pipeline v2 review

Implements PRD sections 32v2–36v2, with the user's subsequent instruction to **keep service-PIN priority**, then use the nearest store when there is no service-PIN match. Existing assignments require confirmation.

## Results and remaining decision

A deterministic uniform sample of 20 of the 119 existing leads was evaluated against the free providers, with explicit authorization to send company names and addresses. **19/20 (95%) required Mapping Issues review**: 15 not found and four ambiguous; one was accepted by Nominatim. No provider errors occurred. This small sample suggests a very high manual-resolution workload for similar data, not a guaranteed rate for other cities or datasets. Existing lead coordinates, assignments and published snapshots were not changed by the audit. Full results: [FREE-PIPELINE-SAMPLE.json](FREE-PIPELINE-SAMPLE.json).

The old pipeline used imported Google place links before business search and could infer an area from an unbounded address lookup. The new pipeline requires a local PIN-cache area and tries bounded Nominatim company search, Overpass named POIs, then bounded Nominatim address search. Imported links are now only accepted through the existing explicit manual-resolution action. No paid provider SDK/key dependency was present in the active map/geocoding paths.

**Migration applied:** `prisma/migrations/202610010001_free_pipeline_overpass/migration.sql`, adding Overpass without changing historical provenance. Backup: `/private/tmp/b2b-db-backups/before-free-provider-1790863416806.dump`.

**Pending clarification:** this checkout has `google_link`, `company_search` and `address_search`, not the Google API source values named in the request. Conversion of these legacy labels remains awaiting the user's answer. They are retained temporarily; therefore the enum is not yet restricted to exactly four values. No migration has silently relabeled historical records.

## Item 1 — Free geocoding and progress

- `src/lib/mapping/pipeline.ts`: strict PIN-area gate, company → Overpass → address order, validation, ambiguous/low-confidence review candidates, no imported-link shortcut or centroid plotting.
- `src/lib/mapping/domain.ts`: new successful source types.
- `src/lib/mapping/nominatim.ts`: normalized bounded requests through shared cache.
- `src/lib/mapping/overpass.ts` (new): bounded named-POI query construction, response validation, node/way/relation centers, POI/name validation.
- `src/lib/mapping/query-cache.ts` (new): provider-specific cache keys and database-backed request serialization/cooldowns; cache empty successful results, never provider errors. Public Nominatim is paced at four requests/minute to support recurring jobs; Overpass at least five seconds apart. Respects Retry-After. Endpoints configurable via `NOMINATIM_SEARCH_URL` and `OVERPASS_API_URL`; identifying User-Agent via `GEOCODING_USER_AGENT`.
- `src/lib/mapping/jobs.ts`: delayed transient retries, preserve optimistic location-write check, allotment refresh after accepted writes.
- `src/components/mapping/GeocodeProgress.tsx`: free-provider pacing explanation; existing asynchronous progress retained.
- `prisma/schema.prisma`, migration above: Overpass source support. Other partner schema changes observed in the workspace were made separately and are not part of this revamp.
- `scripts/free-pipeline-sample.ts` (new): repeatable sample audit, no lead writes.
- `scripts/apply-free-provider-migration.mjs` (new): local backup and additive enum migration runner.

Public provider policies: [Nominatim](https://operations.osmfoundation.org/policies/nominatim/), [Overpass](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html). Cached, serialized requests and configurable endpoints are essential; public services are not an unlimited bulk-geocoding service.

## Item 2 — Leaflet surfaces

- `src/components/map/InteractiveLeadMap.tsx`: Leaflet.markercluster added; existing rectangle selection, store-radius circles, status colors and pin detail preserved.
- `package.json`, `package-lock.json`: markercluster and typings.
- `src/components/map/LocationThumbnail.tsx` (new), `src/components/consultations/ConsultationCard.tsx`: Leaflet/OSM consultation thumbnail replaces the OSM iframe; invalid/flagged pins are hidden.
- Existing `src/components/routes/SnapshotMap.tsx` and `src/components/leads/PinPicker.tsx` already use Leaflet/OSM and required no provider replacement.

## Item 3 — One current-coordinate Navigate action

- `src/lib/lead-navigation.ts` and `src/components/leads/LeadNavigate.tsx` (new): click-time authenticated/no-store lead fetch; Google directions deep link from current validated coordinates only; blocked/missing locations cannot navigate.
- `src/components/rep/GroundRepPortal.tsx`: common action for Today/Week/assigned cards; duplicate popup link removed. Multi-stop route links retain their separate purpose.
- `src/components/map/InteractiveLeadMap.tsx`: shared directions button replaces Google search link.
- `src/components/cold/WorkflowInbox.tsx`, `src/components/cold/ColdLeads.tsx`: shared Navigate action on follow-ups and cold leads.
- `src/components/consultations/ConsultationCard.tsx`, `src/app/(workspace)/leads/[id]/page.tsx`: one action per lead surface; detail-page consultation cards suppress duplicates.
- `src/app/api/consultations/route.ts`, `src/app/api/cold-leads/route.ts`, `src/app/api/follow-ups/route.ts`, `src/app/api/trips/route.ts`: include validation/source fields in existing lead projections.
- `src/lib/mapping/visibility.ts`: PIN dataset centroids are not plottable business locations.

## Item 4 — Allotment and planning guards

- `src/lib/assignment/allotment.ts` (new): recompute after location writes; service PINs first, distance fallback; automatically assign only unassigned/resolved leads without published visits/snapshots, within actor scope; otherwise record review-required activity. No published geometry changes.
- `src/lib/assignment/validate.ts`: assignment rejects unresolved locations.
- `src/lib/assignment/store-match.ts`: retained service-PIN precedence and corrected type narrowing.
- `src/app/api/leads/allotment/route.ts` (new): scoped preview, per-lead/bulk explicit confirmation, row locks, stale-version and member/base-store checks.
- `src/components/leads/RecheckAllotment.tsx` (new): review modal and selection controls.
- `src/components/leads/LeadsTable.tsx`, `src/components/map/InteractiveLeadMap.tsx`: Re-check Allotment actions and table change notice.
- `src/app/api/leads/route.ts`, `src/app/api/leads/bulk-import/route.ts`: valid-location-only automatic initial allotment; no assignment of Mapping Issues. Imported caller-supplied store IDs do not bypass validation.
- `src/app/api/leads/bulk-assign/route.ts`: unresolved-location guard and safe unassigned-only auto-allotment.
- `src/app/api/leads/[id]/route.ts`, `src/app/api/leads/[id]/location/route.ts`, `src/app/api/mapping-issues/[id]/route.ts`, `src/lib/mapping/jobs.ts`: location changes refresh allotment in the same transaction.
- `src/components/import/LeadImportWizard.tsx`: describes automatic service-PIN/nearest allocation after location resolution.
- `src/app/api/trips/auto-plan/route.ts`: source metadata and in-transaction location recheck before planning.
- `src/app/api/trips/[id]/schedule/route.ts`, `src/app/api/visits/[id]/edit/route.ts`, `src/app/api/visits/[id]/reschedule/route.ts`: unresolved locations cannot be added or moved into planned visits.

## Verification

- 62 unit tests passed before subsequent partner-identity/UI work, including pipeline order, validation, ambiguity, provider outage handling, Overpass parsing, navigation and service-PIN priority.
- `tests/mapping-pipeline.test.ts` updated; `tests/free-pipeline.test.ts` added.
- `scripts/free-revamp-workflow-check.mjs` passed: assignment blocks, auto-allotment, PIN priority, stale confirmation, role checks, published snapshot preservation.
- `scripts/free-revamp-browser-check.mjs` passed: marker clustering, review dialog, Leaflet thumbnails, fresh-coordinate navigation, no navigation for Mapping Issues, mobile dialog layout.
- TypeScript and lint passed for the revamp before the later concurrent partner validation changes.

## Worker authorization

User explicitly approved ongoing free geocoding on 2026-10-02. The existing data worker was restarted with geocoding enabled. `scripts/data-worker.ts` also supports `GEOCODING_PAUSED=1` to pause geocoding without changing the existing reminder logic. The earlier approval-review rejection has been resolved.
