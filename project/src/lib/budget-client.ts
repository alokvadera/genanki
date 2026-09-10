/**
 * Client-side copy of the Cloudflare neuron budget helpers that used to live
 * Budget math used by the frontend. The server has its own copy at server/budget.ts;
 * this one exists so frontend components don't import backend code.
 */

/** Cloudflare Workers AI free-tier daily neuron budget (shared across all models). */
export const CLOUDFLARE_DAILY_BUDGET = 10_000;

/** Ratio at which we consider the daily budget "near exhaustion" (8000 / 10000). */
export const NEAR_EXHAUSTION_RATIO = 0.8;

export function getWaitSecondsUntilUtcMidnight(timestampMs: number): number {
  const d = new Date(timestampMs);
  if (
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0
  ) {
    return 0;
  }
  const nextMidnight = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1),
  );
  return Math.max(0, Math.ceil((nextMidnight.getTime() - timestampMs) / 1000));
}

/** Human-readable time-until-midnight string (e.g. "3h 42m", "15m", "<1m"). */
export function formatTimeUntilMidnight(timestampMs: number): string {
  const seconds = getWaitSecondsUntilUtcMidnight(timestampMs);
  if (seconds <= 0) return "now";
  if (seconds < 60) return "<1m";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}
