export function clusteringConfig() {
  const threshold = Number(process.env.CLUSTER_SPARSE_THRESHOLD_KM ?? 15);
  return {
    sparse_threshold_km:
      Number.isFinite(threshold) && threshold > 0 ? threshold : 15,
    two_opt_passes: process.env.CLUSTER_TWO_OPT_PASSES === "0" ? 0 : 2,
  };
}
