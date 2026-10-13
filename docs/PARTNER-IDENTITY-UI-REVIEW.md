# Partner identity and UI review — 2026-10-01

## Partner duplicate rule

The same company can have separate partners when **either contact person name or designation differs**. Shared phone/GST details do not prevent this. Company/contact/designation comparisons normalize case and whitespace. An identical triple is rejected on portal create/edit and presented for review during historical import (including duplicates within the same file). Partner codes remain unique: changing a contact does not permit reusing an existing code. Other-company phone/GST conflicts still receive import review. Historical merge continues to fill blanks only.

Changed/added:
- `src/lib/partners/duplicates.ts`: shared identity/import matching and database lookup.
- `src/app/api/partners/route.ts`: portal create guard inside the existing sequence/advisory-lock transaction.
- `src/app/api/partners/[id]/route.ts`: edit/resubmit identity guard.
- `src/app/api/partners/import/route.ts`: same rule for persisted and same-file import rows; partners loaded once per import transaction.
- `tests/partner-duplicates.test.ts`: changed contact, changed designation, both changed, normalization, code collisions, unrelated-company conflicts.
- `scripts/partner-identity-check.mjs`: isolated add/edit/import API verification and cleanup.

No company-name unique constraint was introduced; no partner tables/columns were dropped or altered by this change.

## UI

- `src/app/globals.css`: shared orange accents, translucent gradient/glass controls, focus/disabled states, semantic approve/reject styles, clearer input/table/card separation, reduced-motion support.
- `src/app/layout.tsx`: shared theme scope on the app body.
- `src/components/workspace/PageHeader.tsx`: icons on Dashboard, Plans, Routes, Consultations, Mapping Issues and Cold Leads.
- `src/components/layout/Navbar.tsx`: distinct navigation icons; FLORZY B2B remains text-only and navigation does not horizontally scroll.
- `src/components/partners/PartnerForm.tsx`: five icon sections (company, contact/location, business, tax/documents, bank), responsive columns and clear submit/cancel actions. All 27 field IDs are preserved.
- `src/components/partners/PartnerDirectory.tsx`, `PartnerImport.tsx`: action icons, responsive controls and duplicate-rule guidance.
- `scripts/workspace-ui-check.mjs`: all 14 workspace pages, glass controls, desktop overflow, 27-field form, section icons, readable input colors, mobile overflow. Screenshots captured in `/private/tmp/florzy-onboarding-desktop.png` and `/private/tmp/florzy-onboarding-mobile.png` and visually reviewed.

## Validation and pending decisions

- Partner identity unit and API checks passed.
- All 14 workspace UI checks passed; desktop/mobile onboarding reviewed visually.
- TypeScript and production build passed. App regenerated/restarted to clear the stale Prisma client that rejected the newer partner field types.
- User approved retaining optional GST certificate, blank GST defaulting to No, free-text professional type/years and optional onboarding source. Aligned `src/lib/partners/fields.ts`, `validation.ts`, `PartnerForm.tsx`, and import normalization with these rules. Unknown non-blank GST text is rejected rather than silently converted to No. Numeric spreadsheet years are accepted as text. Added `tests/partner-flexible-fields.test.ts` and updated the approved GST tests in `tests/phase7-validation.test.ts`.
- All **66 unit tests**, lint, TypeScript, the full Phase 7 API workflow and final Phase 7 browser checks passed. Added Designation to directory columns/search and contact/designation to import duplicate previews.
- `prisma/migrations/202610020001_partner_flexible_fields/migration.sql` records the approved field types/nullability for other environments; the local database already has these types from the earlier workspace changes. It preserves values and drops no tables/columns.
- Updated `scripts/phase7-workflow-check.mjs` fixtures for the new identity rule and `scripts/phase7-browser-check.mjs` for the 11-column directory/icon buttons.
- Earlier FLZBLR code-sequence/city-prefix, legacy blank-field and approval/linkage questions remain separate pending decisions; no invented numbering or lead-link behavior was introduced here.
- Free-pipeline work and its migration inventory: [FREE-PIPELINE-V2-REVIEW.md](FREE-PIPELINE-V2-REVIEW.md).
