CREATE EXTENSION IF NOT EXISTS pg_trgm;
ALTER TYPE "GeocodeSource" ADD VALUE IF NOT EXISTS 'osm_local';
CREATE TABLE IF NOT EXISTS osm_poi_index (
 osm_id TEXT PRIMARY KEY, name TEXT NOT NULL, normalized_name TEXT NOT NULL,
 lat DOUBLE PRECISION NOT NULL, lng DOUBLE PRECISION NOT NULL, address TEXT NOT NULL DEFAULT '',
 kind TEXT NOT NULL, imported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS osm_poi_name_trgm ON osm_poi_index USING gin (normalized_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS osm_poi_location ON osm_poi_index (lat, lng);
CREATE TABLE IF NOT EXISTS osm_poi_refresh (
 id TEXT PRIMARY KEY DEFAULT 'india', source_url TEXT NOT NULL, refreshed_at TIMESTAMPTZ,
 poi_count INTEGER NOT NULL DEFAULT 0, source_timestamp TEXT, last_error TEXT
);
ALTER TABLE geocode_job_items ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ;
ALTER TABLE geocode_job_items ADD COLUMN IF NOT EXISTS retry_cycles INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS geocode_retry_due ON geocode_job_items (status, next_attempt_at);
ALTER TABLE geocode_job_items ADD COLUMN IF NOT EXISTS search_stage TEXT NOT NULL DEFAULT 'local';
