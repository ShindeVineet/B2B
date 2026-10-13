# Store, member and daily route assignment review — 2026-09-30

## Findings and approved rules

The initial database audit found 119 leads, four ground reps with no base store, 53 leads assigned to a rep without a store and 54 leads whose store differed from their rep's stored base. The Team page had no base-store editor. Phase 6 intentionally chose a farthest first seed and continued from yesterday's last stop. Those rules did not match the latest requested store-based daily work.

The user confirmed:
1. Explicit store service-PIN lists take priority. No-match cases get nearest-store suggestions; overlaps require a manager's choice.
2. Ground reps, regional managers and the B2B Head can all receive leads and plans. Analyst remains read-only outside the approved Phase 7 partner workflows.
3. Every day starts at the member's base store and selects the closest N remaining leads.

## Implementation

- Store Hub edits service PIN lists. A unique match can auto-map a lead even before its precise business coordinates are known. Overlaps are listed for explicit selection. Unmatched PINs use exact lead coordinates or, if necessary, an explicitly approximate PIN-area point for store suggestions only. This never writes PIN centroids into lead lat/lng or makes an unresolved lead route-ready.
- Team page assigns an active base store to a member and synchronizes their region. It reports existing assigned leads needing store review. Existing member/store choices are not inferred from incomplete data.
- All recipient pickers include Head/managers/reps. Bulk/single assignment and new plans check member/store consistency; a lead cannot silently move to a different member's store. A store switch can be made explicitly with a compatible member.
- Planning requires an active base store with valid coordinates. The default `compact_sequential` mode is displayed as **Closest to Store** and picks each day's closest remaining capacity from that store. Intra-day nearest-neighbor and optional two-pass 2-opt still order the chosen batch. Daily capacities, custom working-day counts, overflow, manual calendar edits and published-day protection remain supported. Spread Coverage remains a separately selected alternative mode.
- My Visits is available to Head/managers/reps and explicitly loads the signed-in member's own leads, plans, consultations and follow-ups. Its base point comes from the member's assigned store, not an arbitrary lead's store.
- Existing published routes are not automatically re-clustered. Managers must explicitly select existing visits through the established Re-cluster workflow.

## Setup for the existing data

Use **Store Hub → Edit → Service PIN codes**, then **Ground Team → Base Store → Save**. The four existing reps require a deliberate base-store choice. Review existing lead/store mismatches through the map or lead table; use Auto-map Service PINs or explicitly choose a suggested store, then choose a member from that store. Configure N visits per day and the desired number of working days when creating a plan.

## Additive migration

`prisma/migrations/202609300001_store_service_pincodes/migration.sql` adds `store_service_pincodes` with a composite store/PIN key. Multiple stores may serve one PIN so overlaps can be reviewed. Applied locally after backup `/private/tmp/b2b-db-backups/before-store-service-pins-1790769286418.dump`. No existing coverage lists were guessed or legacy published routes rewritten.

## Files

- New `src/lib/assignment/store-match.ts`, `validate.ts`: deterministic PIN/proximity matching and member/store consistency.
- New `src/components/shared/TeamStoreAssignment.tsx`: base-store editor.
- New `tests/store-assignment.test.ts`, `scripts/assignment-workflow-check.mjs`: rule and real workflow checks.
- Migration and additive relation in `prisma/schema.prisma`.
- `src/lib/clustering/cluster-leads.ts`, `tests/clustering.test.ts`: revised store-start daily batching and regression coverage.
- `src/app/api/stores/route.ts`, `[id]/route.ts`, `src/components/stores/StoreManagement.tsx`: coverage lists.
- `src/app/api/users/route.ts`, `src/app/(workspace)/reps/page.tsx`: base stores and eligible recipients.
- `src/app/api/leads/{route,bulk-import/route,bulk-assign/route,[id]/route}.ts`: service matching, suggestions, assignment checks.
- `src/app/api/trips/auto-plan/route.ts`, `[id]/recluster/route.ts`, `src/app/api/visits/[id]/edit/route.ts`: base-store and store consistency checks.
- `src/components/leads/{MonthlyPlanModal,LeadsTable}.tsx`, `src/components/map/InteractiveLeadMap.tsx`, `src/components/unmapped/UnmappedQueue.tsx`, `src/components/import/LeadImportWizard.tsx`: flexible capacity, recipient selection, coverage review/labels.
- `src/components/rep/GroundRepPortal.tsx`, `src/app/(workspace)/rep-portal/page.tsx`, `src/app/api/auth/me/route.ts`, `src/app/api/follow-ups/route.ts`, `src/components/cold/WorkflowInbox.tsx`: own-visit portal and correct store origin for all eligible roles.
- `src/components/layout/Navbar.tsx`, `src/app/(workspace)/{plans,routes,consultations}/page.tsx`, `src/components/dashboard/Phase5Panels.tsx`: recipient selectors/navigation.
- `src/lib/geo.ts`: explicit unavailable-distance text when matching a service PIN without coordinates.
- `scripts/phase6-browser-check.mjs`: fixture base store and updated mode label.
