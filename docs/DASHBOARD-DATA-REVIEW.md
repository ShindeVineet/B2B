# Dashboard and imported-data review — 2026-10-11

The existing imported dataset was reviewed, not replaced. No lead, consultation or partner record was deleted or merged.

## Why consultations exceeded assignments

There are 1,302 ground-assigned leads and 1,311 consultation records on 1,302 lead IDs. Six IDs have multiple records: LD-000293 (4), LD-000322 (3), LD-000016, LD-000620, LD-000910 and LD-000911 (2 each). That is nine additional records, not nine additional assigned leads. Some historical entries have different executives and company names; these must not be silently merged or deleted as duplicates. Original IDs remain authoritative until separately reconciled by the business.

Dashboard and ground-portal counters now show unique consulted leads within the current assignment/read scope, using latest visit date, creation date, then ID for deterministic selection. Full history retains all records. The consultations history page explicitly labels its total as records. Historical consultations by an executive need not equal that executive's current assignments; the import's prior `updateMany` had incorrectly overwritten all authors on repeated IDs.

## Repairs applied

- A full PostgreSQL custom-format backup was saved at `.data/backups/dashboard-2026-10-11T09-29-59.782Z.dump` (restricted file permissions).
- Only `202610110001_dashboard_workflows` was executed and marked applied. Older migration history remains incomplete; do not run all migrations blindly.
- Every one of the 1,311 workbook consultation rows matched exactly on lead ID and the previously imported company, decision maker, phone, notes, outcome, designation, pain point and competitor fields. Restored actual consultation timestamps from numeric Excel dates in IST (mixed display date formats are not parsed as ambiguous strings), executive attribution, canonical High/Medium/Low ratings, handling channel and email. Retained the full source row and workbook SHA-256 in response provenance.
- Restored handling queues for 140 Walk-in and 33 Calling/CDT/LinkedIn leads. Existing caller rotation assigned all 173; immutable lead sources were not rewritten. No ground assignments or user identities were changed.
- Recovered available partner onboarding dates, explicit Company/Individual values and acquisition sources. Legal names were not guessed from bank or GST documents.
- Workbook hash: `e8df91ffe9aa78ebb21918f0a5d2295e8e7c2216275af1bca390008c380ae1a5`. Changes are transactional, audited, idempotent and backed by private before/after plans under `.data/audits/`. Run `node --import tsx --env-file=.env scripts/reconcile-dashboard-data.mjs` to preview; `--apply` writes corrections. It never truncates or deletes data.

Counts remain **1,477 leads / 1,311 consultation records / 234 partner codes**, including **233 active** partners and the retained imported deboarded/rejected code. There are **196 active partners without a linked consultation record**; the dashboard discloses this rather than inventing consultation activity. The source workbook does not provide consultation records for every walk-in/call onboarding. Multiple codes under one lead remain distinct people/partner identities.

## Workflow changes

- Every role has Warm Leads navigation. Latest Medium-interest consultation determines inclusion; Store Associate uses its call/store scope.
- Store Associate lands on a call/walk-in dashboard. Head sees Ground Team, Store Walk-in, Inbound Calls and Head/Other when present, with H/W/C counts, active onboarding totals and deduplicated WhatsApp groups.
- Head summaries use consultation interaction channel and recorded partner acquisition source for onboarding attribution. Store Associate summarizes its scoped work as calls/walk-ins. Missing interest is shown explicitly.
- Standalone store appointments require an active store and future timestamp; they have no consultation FK and never fabricate consultation activity. Per-lead scheduling actions, visit dates and IST Visits Today are available. Completion/cancellation remains Manager/Head or receiving-store only.
- Optional onboarding legal company name, editable Company/Individual classification (GST-based default), walk-in Partner name/company fields, direct-store-meeting toggle, pipeline WhatsApp marker, compact assigned cards, and accessible orange full-history dialog.
- No email transport exists. Partner details provide an onboarding email draft in the user's mail client, using legal name if supplied, otherwise linked lead name, then partner company. Nothing is automatically sent.

## Validation

All 116 unit tests pass and cover distinct/latest counts, channels, explicit partner-type overrides and email naming. Production build and TypeScript checks pass. `scripts/dashboard-workflow-smoke.mjs` verifies API permissions, original-data preservation, atomic intake, standalone scheduling with unchanged consultation counts, duplicate booking rejection, IST receiving-store filters, all-role Warm Leads, manager-only partner edits, legal-name persistence, browser dialogs, desktop and mobile dashboards. Temporary test rows are removed in `finally`.

The existing development web server was restarted on port 3000 and its login endpoint verified healthy. Restart other web/worker processes after Prisma client generation to load the new fields. The Neon migration itself remains pending.
