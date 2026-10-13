# Database schema overview

Source of truth: `prisma/schema.prisma` (PostgreSQL, Prisma ORM).

| Area | Tables / relationships |
| --- | --- |
| People and stores | `users`, `stores`, `store_service_pincodes`; users have roles and optional store/region assignments. |
| Leads | `leads`: internal primary key `id`, unique database-generated `lead_code`, company/contact/address/PIN, coordinates and mapping status, store/assignee foreign keys. `lead_phones` holds extra numbers. |
| Visits and plans | `trip_plans` → `trip_leads` → `leads`; `trip_assignments`, weekly overrides and daily capacities configure scheduling. `missed_visits` tracks missed events. |
| Routes | `route_snapshots` stores versioned daily routes, lead ID order, frozen coordinates and cluster span. |
| Consultations | `consultations.lead_id` → `leads.id`; `rep_id` identifies the submitting user. Typed fields plus JSON responses; `form_fields` defines form configuration; `photo_assets` links uploads to leads/users. |
| Follow-ups and calls | `follow_ups.lead_id` → lead, `rep_id` → responsible user; `call_logs` records lead, actor, notes and optional next date. `cold_lead_cases`, configuration and workflow notifications support escalation. |
| Partners | `partners.id` is the internal primary key; `partner_code` is unique. `source_lead_id` → `leads.id`; `source_lead_code` is a readable reference. Submission/reviewer IDs and pending_review/active/rejected status support approval. Contact, business, tax and banking fields are stored here. |
| Partner support | `partner_phones`, `partner_documents`, `partner_activity`, `partner_notifications`, `partner_city_regions`. |
| Mapping | PIN/address/query caches, provider state, geocoding jobs/items, local `osm_poi_index` and refresh metadata. |
| Audit/alerts | `activity_log`, `notifications`, `workflow_notifications`, plus partner-specific history. |

## Lead identity

Every successfully inserted lead has a non-null unique `id`. The Prisma default generates a CUID where callers do not supply an ID; some imported records use UUIDs. Independently, PostgreSQL `next_lead_code()` generates the unique human-readable `lead_code`. Skipped duplicate or rejected import rows are not new leads and do not receive new records.

Live check on 2026-10-03: 3,124 leads, none missing `id` or `lead_code`.

## Partner codes and lead linkage

`next_partner_code()` now generates `FLZ-P-` plus a sequence number padded to at least four digits, via the existing PostgreSQL sequence and an advisory lock/collision check. The database column has this function as its default. Portal creation does not accept a caller-supplied code; edits/resubmissions preserve the existing code. Sequences are incremental but may have gaps after failed/rolled-back transactions.

Historical CSV imports retain supplied partner codes. Imports without a code call the same database generator. Existing codes are unchanged. No portal input is provided for partner codes.

A partner created from a lead retains `source_lead_id`. This field remains nullable for historical/standalone onboarding; therefore not every existing partner necessarily has an originating lead. Lead-based onboarding prefill and API creation preserve the foreign key. Approval status is separate from code allocation: a new submission receives its code while pending review.

Migration: `prisma/migrations/202610030002_partner_code_default/migration.sql`; applied after database backup. No tables or existing records were dropped.
