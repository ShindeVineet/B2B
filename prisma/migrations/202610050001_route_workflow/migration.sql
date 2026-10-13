BEGIN;
-- Additive Phase 8 foundation and Phase 9. No historical visit is reopened.
CREATE TYPE "PlannedRouteStatus" AS ENUM ('draft','ready','assigned','completed');
CREATE TABLE "routes" (
 "id" TEXT PRIMARY KEY, "name" TEXT NOT NULL,
 "status" "PlannedRouteStatus" NOT NULL DEFAULT 'draft', "area_filter" JSONB NOT NULL,
 "target_count" INTEGER NOT NULL, "created_by" TEXT NOT NULL REFERENCES "users"("id"),
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
 "batch_id" TEXT NOT NULL, "remainder_lead_ids" JSONB,
 "total_distance_km" DOUBLE PRECISION NOT NULL DEFAULT 0, "coordinates" JSONB NOT NULL DEFAULT '[]',
 "ground_rep_id" TEXT REFERENCES "users"("id"), "route_date" DATE, "assigned_trip_id" TEXT
);
CREATE INDEX "routes_batch_id_idx" ON "routes"("batch_id");
CREATE TABLE "route_leads" (
 "id" TEXT PRIMARY KEY, "route_id" TEXT NOT NULL REFERENCES "routes"("id") ON DELETE CASCADE,
 "lead_id" TEXT NOT NULL REFERENCES "leads"("id") ON DELETE RESTRICT, "sequence_order" INTEGER NOT NULL
);
CREATE UNIQUE INDEX "route_leads_route_id_lead_id_key" ON "route_leads"("route_id","lead_id");
CREATE INDEX "route_leads_lead_id_idx" ON "route_leads"("lead_id");
ALTER TABLE "trip_leads" ADD COLUMN "route_id" TEXT REFERENCES "routes"("id") ON DELETE RESTRICT;
ALTER TABLE "trip_leads" ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "route_snapshots" ADD COLUMN "route_id" TEXT REFERENCES "routes"("id") ON DELETE SET NULL;
ALTER TABLE "consultations" ADD COLUMN "trip_lead_id" TEXT REFERENCES "trip_leads"("id") ON DELETE RESTRICT;
CREATE UNIQUE INDEX "consultations_trip_lead_id_key" ON "consultations"("trip_lead_id");

COMMIT;
