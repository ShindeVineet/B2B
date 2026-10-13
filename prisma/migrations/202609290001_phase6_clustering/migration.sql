BEGIN;
CREATE TYPE "ClusteringMode" AS ENUM ('compact_sequential', 'spread_coverage');
ALTER TABLE "trip_assignments" ADD COLUMN "clustering_mode" "ClusteringMode" NOT NULL DEFAULT 'compact_sequential';
ALTER TABLE "route_snapshots" ADD COLUMN "cluster_span_km" DOUBLE PRECISION;
COMMIT;
