import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import type { Candidate } from "./domain";
export const geocodingAgent = () =>
  process.env.GEOCODING_USER_AGENT ||
  "Florzy-B2B-LeadMap/3.0 (business visit planning; contact: admin@florzy.com)";
export function normalizedQuery(query: string) {
  return query.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
}
export class ProviderError extends Error {
  constructor(
    message: string,
    public cooldownMs = 60_000,
  ) {
    super(message);
  }
}
/** Persist rate-limit state even after failed requests; never cache failures as empty results. */
export async function cachedQuery(
  provider: "nominatim" | "overpass",
  identity: string,
  request: () => Promise<Candidate[]>,
) {
  const key = createHash("sha256")
    .update(`${provider}:v2:${identity}`)
    .digest("hex");
  const cached = await prisma.geocodeQueryCache.findUnique({ where: { key } });
  if (cached) return cached.results as Candidate[];
  const result = await prisma.$transaction(
    async (tx) => {
      // Serialize all external providers globally at no more than one request/second.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(928033)`;
      // Shared lock with legacy Nominatim callers. All workers serialize per provider.
      if (provider === "nominatim")
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(928031)`;
      else await tx.$executeRaw`SELECT pg_advisory_xact_lock(928032)`;
      const again = await tx.geocodeQueryCache.findUnique({ where: { key } });
      if (again) return again.results as Candidate[];
      const state = await tx.geocodeProviderState.findUnique({
        where: { name: provider },
      });
      // Four/minute supports recurring public-Nominatim jobs, not just one-off imports.
      const interval = provider === "nominatim" ? 15_000 : 5_000;
      const globalState = await tx.geocodeProviderState.findUnique({
        where: { name: "external_global" },
      });
      const delay = Math.max(
        0,
        state ? state.last_request_at.getTime() + interval - Date.now() : 0,
        globalState
          ? globalState.last_request_at.getTime() + 1000 - Date.now()
          : 0,
      );
      if (delay > 20_000)
        return {
          error: `${provider} is cooling down; retry later`,
          cooldownMs: delay,
        };
      if (delay) await new Promise((r) => setTimeout(r, delay));
      await tx.geocodeProviderState.upsert({
        where: { name: "external_global" },
        create: { name: "external_global", last_request_at: new Date() },
        update: { last_request_at: new Date() },
      });
      await tx.geocodeProviderState.upsert({
        where: { name: provider },
        create: { name: provider, last_request_at: new Date() },
        update: { last_request_at: new Date() },
      });
      try {
        const results = await request();
        await tx.geocodeQueryCache.create({
          data: { key, results: results as unknown as Prisma.InputJsonValue },
        });
        return results;
      } catch (e) {
        await tx.geocodeProviderState.update({
          where: { name: provider },
          data: {
            last_request_at: new Date(
              Date.now() + (e instanceof ProviderError ? e.cooldownMs : 60_000),
            ),
          },
        });
        return {
          error: e instanceof Error ? e.message : `${provider} unavailable`,
          cooldownMs: e instanceof ProviderError ? e.cooldownMs : 60_000,
        };
      }
    },
    { maxWait: 60000, timeout: 90000 },
  );
  if (!Array.isArray(result))
    throw new ProviderError(result.error, result.cooldownMs);
  return result;
}
export function checkProviderResponse(response: Response) {
  if (response.ok) return;
  const retry = response.headers.get("retry-after");
  const ms = retry
    ? /^\d+$/.test(retry)
      ? Number(retry) * 1000
      : Date.parse(retry) - Date.now()
    : 60000;
  throw new ProviderError(
    `Geocoder unavailable (${response.status}); retry later`,
    Number.isFinite(ms) ? Math.max(60000, ms) : 60000,
  );
}
