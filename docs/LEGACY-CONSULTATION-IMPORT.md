# Historical consultation import — 2026-10-06

Source: `Combined Consult - Combined Leads.csv`; batch `combined-consult-2026-v1`.

| Result | Count |
|---|---:|
| Imported consultations | 1,308 |
| Distinct linked leads (`old_data`) | 1,231 |
| New leads | 1,226 |
| Existing leads reused | 5 |
| Existing active partners linked | 18 |
| Leads without confirmed active partner | 1,213 |
| Leads with import-time issues | 312 |
| Source rows with issues (can repeat a lead) | 321 |

## Access and interpretation
Head: **More → Data Issues (old_data)** (`/legacy-data`). Tabs: Data issues, Not yet onboarded, Onboarded, All imported; 24 records per page. Each card links the lead, its consultations and any partner. No partner was created or approved by this import. Historical onboarding claims without an active partner remain unconfirmed (31 source rows).

Regular leads, consultation history, interest tabs and calling queues use the same lead/consultation IDs. Interest levels normalise to High/Medium/Low (four missing values become NA and are flagged). Original executive names remain on consultations; typo variants map to the correct user. Joint Vineet/Navjot entries link to Vineet, retaining joint credit and a review flag, as authorised.

## Matching and preservation
- Require company + matching valid phone, or company + matching address when both lack a valid phone. Ambiguous/contact-conflicting records remain separate and are flagged rather than silently merged.
- Partner links require exact normalised company plus phone or contact person and an unambiguous eligible partner. Existing partner links and lead assignments are preserved.
- Missing optional text becomes NA where appropriate; dates, coordinates and invalid phones remain null, never fabricated. Multiple valid mobiles are stored as primary/alternate numbers. Original values, photos/link text, project information, checklist and onboarding labels remain in `consultations.responses.raw`, accessible under View details.
- Consultation date and creation time use the original submission timestamp in India time. ShopVisit date is retained separately in raw source data; it is not presumed to be the date the rep submitted the consultation. Explicit follow-up dates populate follow-ups; missing dates are not invented.
- No external geocoding requests or photo downloads were made. New leads have no verified coordinates and are available for location calling; existing locations remain intact.
- Deterministic consultation IDs make an identical rerun idempotent. Do not edit/reorder the source file and blindly rerun: changes alter row identity and require a reviewed reconciliation plan. Import runs a transaction per row and can resume after interruption.
- Review flags describe import-time anomalies; the linked lead shows current editable data. Flags are retained as audit evidence.

## Operation and validation
Importer: `node --env-file=.env --import tsx scripts/import-legacy-consultations.ts <csv-path>` (read-only). Add `--apply` only after reviewing and backing up. No schema migration.

Pre-import backup: `/private/tmp/b2b-db-backups/before-legacy-consultations-1791310891955.dump` (secure local temporary storage; copy to durable protected storage before machine cleanup).

Validated: 99 unit tests; isolated import regression (history, key fields, follow-up dates, rerun deduplication, admin-only access); running API counts/pagination; browser checks for tabs, desktop/mobile layout and original source details. Read-only rerun found all 1,308 already imported and proposed zero new records.
