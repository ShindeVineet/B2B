BEGIN;

-- CreateEnum
CREATE TYPE "GeocodeSource" AS ENUM ('pincode_dataset', 'nominatim', 'manual');

-- CreateEnum
CREATE TYPE "GeocodeStatus" AS ENUM ('ok', 'invalid', 'mismatch_flagged');

-- CreateEnum
CREATE TYPE "MissedReason" AS ENUM ('personal', 'traffic_weather', 'office_closed', 'unreachable', 'other');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('visit_missed', 'rep_missed_pattern');

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "geocode_source" "GeocodeSource",
ADD COLUMN     "geocode_status" "GeocodeStatus",
ADD COLUMN     "location_verified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "status_entered_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "consultations" ADD COLUMN     "competitor_involved" TEXT,
ADD COLUMN     "current_lead_status" TEXT,
ADD COLUMN     "designation" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "lead_type" TEXT,
ADD COLUMN     "next_follow_up_date" DATE,
ADD COLUMN     "primary_pain_point" TEXT,
ADD COLUMN     "site_photos" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "visit_lat" DOUBLE PRECISION,
ADD COLUMN     "visit_lng" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "trip_leads" ADD COLUMN     "missed_reason" "MissedReason",
ADD COLUMN     "missed_reason_note" TEXT,
ADD COLUMN     "original_scheduled_date" DATE,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'pending';

-- CreateTable
CREATE TABLE "route_snapshots" (
    "id" TEXT NOT NULL,
    "ground_rep_id" TEXT NOT NULL,
    "route_date" DATE NOT NULL,
    "ordered_lead_ids" JSONB NOT NULL,
    "coordinates" JSONB NOT NULL,
    "trip_lead_ids" JSONB NOT NULL,
    "total_distance_km" DOUBLE PRECISION NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "route_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_assignments" (
    "id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "ground_rep_id" TEXT NOT NULL,
    "assigning_manager_id" TEXT,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "leads_per_day_default" INTEGER NOT NULL,
    "base_working_days" JSONB NOT NULL DEFAULT '["mon","tue","wed","thu","fri","sat"]',

    CONSTRAINT "trip_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_week_overrides" (
    "id" TEXT NOT NULL,
    "trip_assignment_id" TEXT NOT NULL,
    "week_start_date" DATE NOT NULL,
    "working_days" JSONB NOT NULL,

    CONSTRAINT "trip_week_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_day_capacities" (
    "id" TEXT NOT NULL,
    "trip_assignment_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "capacity" INTEGER NOT NULL,

    CONSTRAINT "trip_day_capacities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "missed_visits" (
    "id" TEXT NOT NULL,
    "trip_lead_id" TEXT NOT NULL,
    "reason" "MissedReason" NOT NULL,
    "note" TEXT,
    "original_date" DATE NOT NULL,
    "new_date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "missed_visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "missed_visit_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMP(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "route_snapshots_ground_rep_id_route_date_version_key" ON "route_snapshots"("ground_rep_id", "route_date", "version");

-- CreateIndex
CREATE UNIQUE INDEX "trip_assignments_trip_id_key" ON "trip_assignments"("trip_id");

-- CreateIndex
CREATE UNIQUE INDEX "trip_week_overrides_trip_assignment_id_week_start_date_key" ON "trip_week_overrides"("trip_assignment_id", "week_start_date");

-- CreateIndex
CREATE UNIQUE INDEX "trip_day_capacities_trip_assignment_id_date_key" ON "trip_day_capacities"("trip_assignment_id", "date");

-- CreateIndex
CREATE INDEX "missed_visits_created_at_idx" ON "missed_visits"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_user_id_type_missed_visit_id_key" ON "notifications"("user_id", "type", "missed_visit_id");

-- AddForeignKey
ALTER TABLE "route_snapshots" ADD CONSTRAINT "route_snapshots_ground_rep_id_fkey" FOREIGN KEY ("ground_rep_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_assignments" ADD CONSTRAINT "trip_assignments_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trip_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_assignments" ADD CONSTRAINT "trip_assignments_ground_rep_id_fkey" FOREIGN KEY ("ground_rep_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_assignments" ADD CONSTRAINT "trip_assignments_assigning_manager_id_fkey" FOREIGN KEY ("assigning_manager_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_week_overrides" ADD CONSTRAINT "trip_week_overrides_trip_assignment_id_fkey" FOREIGN KEY ("trip_assignment_id") REFERENCES "trip_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_day_capacities" ADD CONSTRAINT "trip_day_capacities_trip_assignment_id_fkey" FOREIGN KEY ("trip_assignment_id") REFERENCES "trip_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "missed_visits" ADD CONSTRAINT "missed_visits_trip_lead_id_fkey" FOREIGN KEY ("trip_lead_id") REFERENCES "trip_leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_missed_visit_id_fkey" FOREIGN KEY ("missed_visit_id") REFERENCES "missed_visits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Classify existing coordinates without guessing their provenance or moving pins.
UPDATE leads SET geocode_status = CASE WHEN lat BETWEEN 6 AND 38 AND lng BETWEEN 68 AND 98 THEN 'ok'::"GeocodeStatus" ELSE 'invalid'::"GeocodeStatus" END;
UPDATE trip_leads SET status = 'visited' WHERE completed = true;
-- Historical assigning managers are unknown and must be explicitly claimed.
INSERT INTO trip_assignments(id,trip_id,ground_rep_id,start_date,end_date,leads_per_day_default)
SELECT 'legacy-' || id,id,ground_rep_id,start_date::date,end_date::date,leads_per_day FROM trip_plans;

-- Record future status-entry times without changing outcome routing or creating alerts.
CREATE FUNCTION phase5_track_status_entry() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_entered_at := CURRENT_TIMESTAMP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER phase5_status_entry BEFORE INSERT OR UPDATE OF status ON leads
FOR EACH ROW EXECUTE FUNCTION phase5_track_status_entry();

COMMIT;
