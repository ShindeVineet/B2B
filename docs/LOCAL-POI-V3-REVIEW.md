# Local POI index and reliable queue (v3)

## Data and lookup

- Source: [Geofabrik India OSM PBF](https://download.geofabrik.de/asia/india.html), licensed under OSM ODbL. Existing map OSM attribution remains; downloaded extract/index must retain OSM attribution when distributed.
- `scripts/refresh-osm-poi.py`: streams named business/place nodes, ways and multipolygon relations using pyosmium. Extracts address tags and representative coordinates. Uses staging, an advisory refresh lock, minimum-size validation and an atomic publish; a failed refresh preserves the prior index. Validates downloaded PBF checksum. Refresh status records source timestamp, row count and last failure.
- `scripts/refresh-osm-poi.mjs`: launcher using `.cache/osm/venv/bin/python` (override `OSM_PYTHON`). Python dependencies: osmium and psycopg[binary]. Downloads and node-location cache stay under ignored `.cache/osm`.
- `scripts/data-worker.ts`: checks refresh due dates hourly; refreshes after one calendar month using a separate child process. A database lock prevents multiple refreshes. Restarting the app does not reset the refresh date. Worker must be running for the monthly task to execute.
- `src/lib/mapping/local-poi.ts`: bounded local SQL trigram lookup, using the existing PIN-centroid area. Name/precision/distance validation and ambiguity handling remain in `pipeline.ts`. Index unavailability raises a transient failure instead of sending the entire batch externally.
- `src/lib/mapping/pipeline.ts`, `domain.ts`: local-first source `osm_local`; `localOnly` mode proves audits cannot call external providers. Public providers run only after a local miss.

## Queue

- `src/lib/mapping/jobs.ts`: one transaction-held advisory worker lock; local stage has priority over external stage, so slow external misses do not delay the rest of an import's local matches. Provider failures do not write Mapping Issues or erase coordinates.
- `src/lib/mapping/retry.ts`: 30-second exponential backoff, capped at one hour, respecting provider cooldown. Eight attempts per burst; after exhaustion a 24-hour recovery retry starts another bounded burst. Exposed as “Temporarily unavailable — will retry,” with no permanent transient-error bucket.
- `src/lib/mapping/query-cache.ts`: caches successes/empty results, never outages. Globally serializes external requests at a maximum of one per second, persists cooldowns, and retains the stricter public Nominatim recurring-job rate of four/minute. See [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/). Overpass retains five-second spacing.
- `src/app/api/geocoding/jobs/route.ts`, `GeocodeProgress.tsx`: Mapped, Needs Review, Retrying plus queued counts and next retry time. Final successes/issues/skipped are processed; scheduled retries are not falsely counted complete.
- `scripts/requeue-legacy-geocoding.mjs`: recovers historical permanent error records into scheduled local-first retries.

## Audit and re-run

`scripts/audit-local-poi.ts --job=<id>` tests the exact persisted job membership and writes `docs/LOCAL-POI-AUDIT.json` before any external requests. Local misses are counted as *external fallback needed*, not falsely classified as not found everywhere. No-area/ambiguous records are separately counted as Needs Review. `--apply` applies local-only results and queues misses, preserving verified/concurrently changed leads and existing allotment safeguards. Run with the worker's geocoding paused.

## Map toolbar

`InteractiveLeadMap.tsx`: category, region, display toggles, catchment, allotment review, bulk geocoding and city jumps live under one **… Actions** menu. Search, store, area selection, Fit Leads and status controls remain visible.

## Migration and checks

- Additive migration: `prisma/migrations/202610030001_local_poi_queue/migration.sql` (pg_trgm, POI index/refresh tables, osm_local source, queue stage/retry fields). Prisma schema updated to match.
- Applied with database backup by `scripts/apply-local-poi-migration.mjs`.
- `tests/local-poi-pipeline.test.ts`: local match, local-only miss, unavailable index, ambiguous/distant candidates, bounded exponential recovery.
- `scripts/v3-queue-check.ts`: local mock 429 provider verifies serialized processing, persisted cooldown, no false Mapping Issue, bounded attempts and scheduled recovery; no synthetic lead data leaves the machine.
- `scripts/v3-map-browser-check.mjs`: collapsed advanced controls, re-run actions and Retrying UI.

## Completed live audit (2026-10-03)

Loaded 807,292 POIs from the checksum-verified India extract (source timestamp 2026-09-30T20:22:42Z). A reference-complete POI subset avoids building an India-wide node cache on this 8 GB machine. Monthly refresh uses the same atomic staging process while the data worker runs.

The exact original 3,035-item batch, with zero public-provider requests during audit: 111 local matches (3.66%), 2,496 needing external fallback, and 428 Needs Review (402 missing usable area centroids; 26 ambiguous local matches). The indexed audit took 55.6 seconds. See LOCAL-POI-AUDIT.json. Local OSM coverage is limited; fallback volume is still substantial.

Applied local results, consolidated overlapping queues into the newer 3,122-item job, removed 2,507 duplicate queued tasks without deleting leads, and resumed the serialized worker. Confirmed live progress beyond zero. External misses continue in the background under provider pacing and automatic transient recovery.
