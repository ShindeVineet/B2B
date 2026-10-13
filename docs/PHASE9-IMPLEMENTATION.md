# Phase 8 foundation and Phase 9 implementation

Implemented against PRD sections 37–48. The checkout originally had rep/date snapshots, but no saved Route or RouteLead model. Phase 8 was added with user authorization.

## Rollout status

The migration was applied successfully to the live database on 2026-10-05 after the map API reported the missing `trip_leads.route_id` column. The app and data worker were restarted with the regenerated Prisma client. **Do not apply the migration again to this database.**

Pre-migration backup: `/private/tmp/b2b-db-backups/before-phase9-1791207583478.dump`.

Migration: `prisma/migrations/202610050001_route_workflow/migration.sql`.

Read-only live verification loaded all 108 unique leads and checked the plans, consultations and Route Builder endpoints. Existing leads and consultation records were preserved.

For another deployment that has not received this migration, review the SQL and take a database backup before applying it using that deployment's migration procedure. This checkout's older schema was installed with SQL; do not blindly deploy all historical migrations over it.

After migrating another deployment, regenerate Prisma and restart its app and workers. Route Builder is available in navigation at `/route-planner`. It is restricted to B2B Head and Store Lead. Create an empty calendar from Plans, configure working days/capacity, and publish it before assigning ready routes.

## Behavior and design choices

- Additive `routes` and `route_leads` tables, route references on visits and snapshots, optional unique consultation-to-visit reference, and visit creation timestamp. All existing columns remain intact.
- Existing snapshot rep/date columns stay required, as approved. Draft geometry lives on `routes`; versioned rep/date snapshots are created on assignment and relevant published-route changes.
- Pending visits are **deleted** on route unassignment/removal. Completed/visited visit rows and their consultations remain untouched. Membership remains on route unassignment. Removing a historical stop does not remove its historical visit.
- Assigned-route changes require confirmation. Added stops must fit the published plan's working day and remaining capacity. Completed-route membership edits create no historical visits.
- New routes and Direct Assign share eligibility: mapped coordinates, no reservation/unresolved visit, and no latest visited row unless it has a dated Visit scheduled/Nurturing required consultation. A follow-up always creates a new visit. Older unlinked consultations only establish follow-up eligibility when rep and visit date match the historical visit.
- Consultation form opening and submission both check the specific visit. Submission locks the lead and the database enforces one consultation per linked visit. Visited context is read-only. Ad-hoc first consultations remain possible; later consultations require a new scheduled visit.
- Batch routes use the existing capacitated nearest-neighbor clustering. Ten or more initial routes trigger up to five boundary-swap passes over each route's three nearest neighbors and up to six boundary candidates per side. Route sizes are preserved by swaps; intra-route ordering uses nearest neighbor plus two 2-opt passes.
- Remainders are reserved on one draft holding route. Every route in that batch is blocked from Ready until remainder placement is resolved or explicitly deferred. When the pool is smaller than N, a draft holding record lets the manager create a partial route or defer it.
- Single-route creation only reserves its chosen stops, not every other lead in the filtered pool.
- Managers can edit the preview before saving; the server validates IDs, coordinates, uniqueness, and remainder coverage on save. Saved-route additions use cheapest insertion. Removals re-order remaining stops.
- Calendar drag/edit and explicit re-clustering remain available. Confirmed moved stops leave their saved route and become direct visits; saved route geometry and affected snapshots are updated. Reschedule and working-day redistribution also keep memberships consistent.
- All displayed distances are **haversine straight-line estimates**, not road directions, traffic estimates, or an optimal-route guarantee. Map labels and sidebars show every consecutive leg and the total.

## Validation

- 92 unit tests passed, including exact division, one/several remainder leads, pool smaller than N, explicit K, cheapest insertion, follow-up eligibility, and boundary refinement.
- Production Next.js build passed. TypeScript and targeted ESLint checks passed.
- Isolated API integration passed: duplicate reservation rejection, permission denial, remainder Ready gate, assignment, confirmed assigned-stop add/remove, consultation submission, duplicate/open refusal for a visited visit, unassignment preserving the completed row, new direct follow-up row, empty calendar creation, and confirmed calendar move detaching route membership.
- Headless Chrome passed route-review rendering, map and distance sidebar, desktop page width, and confirmation dialog containment at 1280×800 and 390×640. Screenshot: `/private/tmp/phase9-route-mobile.png`.
- Synthetic refinement example: 10 routes × 5 stops with two deliberately misplaced boundary pairs, **19.22 km → 8.67 km (54.9% reduction)**. All 50 unique leads remain, with five stops per route. This demonstrates the pass working on a constructed fixture, not an expected improvement for real data.

## Every changed or added file

| File | Phase / purpose |
|---|---|
| `prisma/schema.prisma` | Phase 8/9 additive models, relations and visit identity |
| `prisma/migrations/202610050001_route_workflow/migration.sql` | Atomic additive SQL migration |
| `src/lib/routes/geometry.ts` | Items 1, 4, 5, 7: cheapest insertion, batches, refinement and leg distances |
| `src/lib/routes/eligibility.ts` | Items 3, 6: pure visited/follow-up rules |
| `src/lib/routes/pool.ts` | Items 1, 3, 4, 6: scoped candidate eligibility, reservations and concurrency checks |
| `src/lib/routes/service.ts` | Phase 8 and items 1–2: route sequencing, capacity, assignment and pending removal |
| `src/lib/routes/consultation-visit.ts` | Item 3: specific-visit access and duplicate prevention |
| `src/app/api/route-plans/route.ts` | Phase 8 and items 4–5: pools, preview, atomic batch save |
| `src/app/api/route-plans/[id]/route.ts` | Items 1–2, 4: editing, assignment, unassignment and remainder decisions |
| `src/app/api/consultations/open/route.ts` | Item 3: server-side form-open gate |
| `src/app/api/consultations/route.ts` | Item 3: lock, link and close exactly one visit |
| `src/app/api/leads/route.ts` | Item 3: read-only consultation context in lead lists |
| `src/app/api/trips/route.ts` | Item 3: consultation identity in scheduled visit responses |
| `src/app/api/trips/auto-plan/route.ts` | Item 6 and Phase 8: shared eligibility, null route ID for Direct Assign, empty calendars |
| `src/app/api/trips/[id]/publish/route.ts` | Items 3, 6: recheck visit eligibility before publication |
| `src/app/api/trips/[id]/recluster/route.ts` | Items 3, 6: shared eligibility and explicit route detachment for selected visits |
| `src/app/api/trips/[id]/schedule/route.ts` | Calendar compatibility: detach redistributed stops and refresh affected routes/snapshots |
| `src/app/api/visits/[id]/edit/route.ts` | Item 6/calendar compatibility: eligible replacements and confirmed route detachment |
| `src/app/api/visits/[id]/reschedule/route.ts` | Calendar compatibility: preserve route/visit consistency when rescheduling |
| `src/app/api/routes/route.ts` | Item 3: consultation attribution in snapshot history |
| `src/components/routes/RouteBuilder.tsx` | Phase 8 and items 1–7: complete manager workflow, filters/map rectangle, previews, remainder UI and confirmations |
| `src/components/routes/SnapshotMap.tsx` | Item 7: distance labels, safe map lifecycle and rectangle selection |
| `src/app/(workspace)/route-planner/page.tsx` | Authorized Route Builder entry page |
| `src/app/(workspace)/routes/page.tsx` | Items 3, 7: read-only attribution and leg sidebar in history |
| `src/app/(workspace)/plans/page.tsx` | Calendar compatibility: explicit confirmations for moving/re-clustering route visits |
| `src/components/layout/Navbar.tsx` | Phase 8: Route Builder navigation |
| `src/components/leads/MonthlyPlanModal.tsx` | Item 6: eligible selections and empty route-calendar option |
| `src/components/leads/EditVisit.tsx` | Item 6: eligible replacement picker and move confirmation |
| `src/components/rep/ConsultationModal.tsx` | Item 3: visit-specific opening and submission |
| `src/components/rep/GroundRepPortal.tsx` | Item 3: pass visit identity and show completed consultations read-only |
| `tests/route-batch.test.ts` | Requested pure algorithm and eligibility tests |
| `scripts/phase9/prepare-test-db.mjs` | Isolated schema-only migration verification; refuses to overwrite an existing test DB |
| `scripts/phase9/integration.ts` | Isolated API lifecycle regression; refuses a non-test DB |
| `scripts/phase9/browser.mjs` | Isolated browser/viewport checks using Chrome CDP port 9224 and test app port 3002 |
| `next.config.ts` | Optional separate output directory for isolated verification |
| `tsconfig.json` | Exclude isolated build output from normal typechecking |
| `.gitignore` | Ignore isolated build output |
| `docs/PHASE9-IMPLEMENTATION.md` | Review and rollout guide, file inventory and evidence |
| `DEVELOPMENT-LOG.md` | Implementation record |

Prisma Client and Next.js type declarations were regenerated; generated node_modules/build artifacts are not source changes.
