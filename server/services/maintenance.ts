/**
 * Maintenance sweep — replaces the Convex crons in src/convex/crons.ts:
 *
 *  - cleanupTelemetry / cleanupUsage / cleanupIpState (daily, batched deletes)
 *  - optimus health check (every 5 min)
 *  - provider advisor (every 6 h)
 *
 * Convex's scheduler doesn't exist on a Neon Function, so these run via an
 * opportunistic in-process interval (see app.ts `startMaintenanceLoop`).
 * Batched deletes keep each pass short; state persists in Postgres.
 */
import { cleanupOldTelemetry } from "./telemetry";
import { cleanupOldUsage } from "./usage";
import { cleanupStaleIpState } from "./ipRateLimiter";
import { runHealthCheck } from "./optimus";
import { maybeRunAdvisor } from "../providerAdvisor";
import { logger } from "../logger";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

const HEALTH_CHECK_INTERVAL_MS = 5 * 60 * 1000;
const ADVISOR_INTERVAL_MS = 6 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;

let timer: ReturnType<typeof setInterval> | null = null;
let lastCleanupAt = 0;
let lastAdvisorAt = 0;

async function sweep(): Promise<void> {
  const now = Date.now();

  try {
    await runHealthCheck();
  } catch (err) {
    logger.warn("Health check sweep failed", { error: String(err) });
  }

  if (now - lastCleanupAt >= CLEANUP_INTERVAL_MS) {
    lastCleanupAt = now;
    try {
      const [telemetry, usage, ipState] = await Promise.all([
        cleanupOldTelemetry(THIRTY_DAYS_MS),
        cleanupOldUsage(THIRTY_DAYS_MS),
        cleanupStaleIpState(NINETY_DAYS_MS),
      ]);
      if (telemetry + usage + ipState > 0) {
        logger.info("Maintenance sweep deleted old rows", { telemetry, usage, ipState });
      }
    } catch (err) {
      logger.warn("Cleanup sweep failed", { error: String(err) });
    }
  }

  if (now - lastAdvisorAt >= ADVISOR_INTERVAL_MS) {
    lastAdvisorAt = now;
    try {
      const result = await maybeRunAdvisor();
      logger.info("Advisor sweep result", { status: result.status, totalCalls: result.totalCalls });
    } catch (err) {
      logger.warn("Advisor sweep failed", { error: String(err) });
    }
  }
}

/** Start the opportunistic maintenance loop (no-op if already running). */
export function startMaintenanceLoop(): void {
  if (timer) return;
  // First pass shortly after boot, then on a fixed interval. `unref` keeps the
  // timer from holding the isolate open when idle (scale-to-zero friendly).
  timer = setInterval(() => {
    void sweep();
  }, HEALTH_CHECK_INTERVAL_MS);
  timer.unref?.();
  void sweep();
}

export const _test = { sweep };
