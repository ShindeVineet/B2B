export const MAX_RETRY_ATTEMPTS = 8;
export function retrySchedule(attempt: number, cooldownMs = 0) {
  const exhausted = attempt >= MAX_RETRY_ATTEMPTS;
  return {
    exhausted,
    delayMs: Math.max(
      cooldownMs,
      exhausted
        ? 24 * 60 * 60 * 1000
        : Math.min(60 * 60 * 1000, 30_000 * 2 ** Math.max(0, attempt - 1)),
    ),
  };
}
