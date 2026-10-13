/** Bound each app/worker pool while preserving explicit deployment settings. */
export function databaseUrl(value: string | undefined) {
  if (!value) return undefined;
  const url = new URL(value);
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") return value;
  if (!url.searchParams.has("connection_limit")) url.searchParams.set("connection_limit", "5");
  if (!url.searchParams.has("pool_timeout")) url.searchParams.set("pool_timeout", "10");
  return url.toString();
}
