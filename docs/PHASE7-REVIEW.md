# Phase 7 review — onboarding, partners and lead identifiers

Implemented PRD sections 26–31. Approved additions: partner-specific audit/documents/notifications, submitted_by, historical region override and explicit city mappings, partner_phones. Duplicate Merge preserves the existing code and non-empty values, filling blanks only after preview.

## Behavior

- PostgreSQL generates immutable LD-000001-style identifiers, with no truncation after six digits. IDs are joined into existing lead displays, route history, notifications and activity history; they are not copied into snapshots or notification messages. The allowed source_lead_code copy is retained on partners.
- Lead phone columns accept comma/semicolon lists and additional mapped columns. Backward-compatible database triggers keep the primary number and leads.phone_no synchronized. Lead detail/map panels support adding numbers, relabeling and changing primary. Existing call actions and consultation cards use a number picker when needed.
- Partners supports all 27 specified onboarding fields, optional extra mobile numbers, lead/consultation prefills, walk-ins, GST conditional validation, private camera/gallery/PDF documents and pending review. Head/Ops activate or reject; rejected submissions notify the actual authenticated submitter and may be corrected/resubmitted.
- Activation sets the originating lead to onboarded and closes active follow-up/cold entries transactionally. Existing consultation routing already used onboarded for On-boarding Done; that earlier routing and SLA jobs were retained.
- CSV/XLSX historical import maps columns explicitly, preserves supplied codes, generates codes if absent, imports active historical rows without an originating lead, and previews existing and same-file duplicates. Skip/import-anyway/merge require explicit choices; duplicate partner codes cannot be imported anyway.
- Directory filters every specified list column and searches company/mobile/GST/code. Detail includes documents, original lead consultations, trip/route appearances and audit history. Head/Ops edit active records. Regional access follows source-lead store region, or historical PIN/city matching. Ambiguous matches remain unassigned for Head/Ops correction. Submitters can inspect their own submissions for correction; other reps cannot.
- Historical region matching: exact store address PIN first; conflicting matches stay unassigned. Otherwise use an explicit normalized city mapping. A historical manual region override must name a known store region. For sourced partners, the source store remains authoritative.

## Migration and configuration

`prisma/migrations/202609290002_phase7_partners/migration.sql` was applied locally after backup at `/private/tmp/b2b-db-backups/before-phase7-1790693449075.dump`.

The migration adds tables/columns/types/sequences/triggers only. All 119 original leads received codes; 69 non-empty legacy phone values were backfilled, preserving original values. Leads without a number have no invented phone row. No old columns or tables were dropped. Sequence gaps after rolled-back transactions/test fixtures are expected.

`PARTNER_CODE_PREFIX` defaults to `FLZ-P-`. Generated partner codes use at least four digits. Manually provided/imported codes are preserved and uniqueness is enforced in PostgreSQL. Private documents reuse the existing photo storage directory (`PHOTO_STORAGE_DIR`, default `.data/photos`), image compression/signature checks and shared capture/gallery control; PDF support is added for partner documents. Historical document URLs must use HTTPS and remain at their original host.

## File inventory

New:
- `src/lib/partners/{access,audit,codes,documents,fields,regions,validation}.ts`: permission scoping, code generation, schema-aligned fields, validation, documents and audit payloads.
- `src/lib/leads/phones.ts`: multi-column/delimited number parsing.
- `src/app/api/partners/route.ts`, `[id]/route.ts`, `prefill/route.ts`, `import/route.ts`, `regions/route.ts`: onboarding, review, edits/history, import and mappings.
- `src/app/api/partner-documents/route.ts`, `[id]/route.ts`: authenticated document upload/read.
- `src/app/api/leads/[id]/phones/route.ts`: scoped number management.
- `src/components/partners/{PartnerDirectory,PartnerForm,PartnerImport}.tsx`, `src/app/(workspace)/partners/page.tsx`: new Partners UI.
- `src/components/leads/LeadCall.tsx`: call picker and phone editor.
- `src/components/shared/PhotoFilePicker.tsx`: shared capture/gallery control extracted from the consultation form.
- `tests/phase7-validation.test.ts`, `scripts/phase7-workflow-check.mjs`, `scripts/phase7-browser-check.mjs`: validation, real database/API and browser checks.
- This review and the migration above.

Updated:
- `prisma/schema.prisma`: additive models/relations reflecting the migration.
- `src/app/api/leads/{route,bulk-import/route}.ts`: phone writes, lead codes/search and latest consultation outcome.
- `src/app/api/{consultations,cold-leads,follow-ups,at-risk,routes,missed-visits,notifications}/route.ts`: joined codes; partner notifications.
- `src/app/api/trips/{route,auto-plan/route}.ts` and `src/app/api/leads/bulk-assign/route.ts`: codes in existing selected lead payloads.
- `src/components/import/LeadImportWizard.tsx`: additional phone columns.
- `src/components/leads/{LeadsTable,EditVisit,MonthlyPlanModal}.tsx`, `src/components/map/InteractiveLeadMap.tsx`, `src/components/unmapped/UnmappedQueue.tsx`, `src/components/rep/{GroundRepPortal,ConsultationModal}.tsx`: lead codes, call picker, onboarding entry points and shared upload control.
- `src/components/consultations/ConsultationCard.tsx`, `src/components/cold/{ColdLeads,WorkflowInbox}.tsx`, `src/components/dashboard/Phase5Panels.tsx`, `src/components/routes/SnapshotMap.tsx`: identifiers, call actions and notices.
- `src/app/(workspace)/{leads/[id],mapping-issues,consultations,plans,routes}/page.tsx`: identifiers/history and onboarding entry.
- `src/components/layout/Navbar.tsx`: Partners navigation.
- `DEVELOPMENT-LOG.md`: implementation/validation record.

## Validation

Unit tests cover GST conditional requirements, phone parsing, code padding/uniqueness and historical region matching. The isolated workflow check exercises concurrent generated codes, immutable lead codes, primary-number synchronization in both directions, cross-user access denial, submission/rejection/resubmission/activation, queue removal, historical imports/merges (including same-file duplicates), regional access, multi-number lead import and private document reads. Browser checks cover directory filters, all 27 form fields, camera controls, conditional GST requirements, mobile layout and import entry. Tests remove their own records and uploaded files.
