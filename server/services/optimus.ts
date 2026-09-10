/**
 * Optimus network health + candidate ranking — ported from src/convex/optimus.ts.
 */
import { eq } from "drizzle-orm";

import { db } from "../db";
import {
  cloudflareNeuronBudget,
  providerCatalog,
  providerPerformance,
  providerRateState,
  systemInsights,
} from "../db/schema";
import { PROVIDER_NAMES, type ProviderName } from "../aiProviders";
import { CLOUDFLARE_DAILY_BUDGET, NEAR_EXHAUSTION_RATIO, getUtcDayString } from "../budget";
import { scoreCandidate, type PerformanceRow } from "../lib/routing";

export type ProviderStatus = "healthy" | "near-exhaustion" | "exhausted";

function keyFor(provider: string, model: string): string {
  return `${provider}:${model}`;
}

export type HealthEntry = {
  provider: string;
  model: string;
  status: ProviderStatus;
  reason?: string;
  cooldownRemaining?: number;
};

export async function getNetworkHealth(): Promise<HealthEntry[]> {
  const now = Date.now();
  const rateStates = await db.select().from(providerRateState);
  const catalog = await db.select().from(providerCatalog);

  const stateByKey = new Map(rateStates.map((s) => [keyFor(s.provider, s.model), s]));

  const utcDay = getUtcDayString(now);
  const budgetRows = await db
    .select()
    .from(cloudflareNeuronBudget)
    .where(eq(cloudflareNeuronBudget.utcDay, utcDay))
    .limit(1);
  const cfBudget = budgetRows[0] ?? null;

  const healthStatuses: Record<string, HealthEntry> = {};

  for (const catalogProvider of catalog) {
    if (!catalogProvider.models) continue;

    for (const modelDef of catalogProvider.models) {
      const providerId = catalogProvider.provider;
      const modelId = modelDef.id;
      const key = keyFor(providerId, modelId);

      const state = stateByKey.get(key);

      let status: ProviderStatus = "healthy";
      let reason: string | undefined = undefined;
      let cooldownRemaining = 0;

      if (state) {
        // 1. Check strict cooldowns
        if (state.cooldownUntil && state.cooldownUntil > now) {
          status = "exhausted";
          reason = "On Cooldown";
          cooldownRemaining = Math.ceil((state.cooldownUntil - now) / 1000);
        }
        // 2. Check remaining requests/tokens from API headers
        else if (
          (state.remainingRequests !== null &&
            state.remainingRequests !== undefined &&
            state.remainingRequests <= 2 &&
            state.resetAt &&
            state.resetAt > now) ||
          (state.remainingTokens !== null &&
            state.remainingTokens !== undefined &&
            state.remainingTokens <= 15000 &&
            state.resetAt &&
            state.resetAt > now)
        ) {
          status = "near-exhaustion";
          reason = "API Limits Low";
        }
      }

      // 3. Check Cloudflare budget specifically
      if (providerId === "cloudflare" && status !== "exhausted") {
        const used = cfBudget?.neuronsUsed ?? 0;
        if (used >= CLOUDFLARE_DAILY_BUDGET) {
          status = "exhausted";
          reason = "Daily Budget Exceeded";
        } else if (used >= Math.round(CLOUDFLARE_DAILY_BUDGET * NEAR_EXHAUSTION_RATIO) && status !== "near-exhaustion") {
          status = "near-exhaustion";
          reason = "Daily Budget Low";
        }
      }

      const entry: HealthEntry = { provider: providerId, model: modelId, status };
      if (reason !== undefined) entry.reason = reason;
      if (cooldownRemaining > 0) entry.cooldownRemaining = cooldownRemaining;
      healthStatuses[key] = entry;
    }
  }

  return Object.values(healthStatuses);
}

export type RankableCandidate = {
  provider: ProviderName;
  providerLabel: string;
  providerIndex: number;
  modelId: string;
  modelName: string;
  supportsJsonMode: boolean;
  baseUrl: string;
  headers: Record<string, string>;
};

/**
 * Rank candidates by unified routing score + real-time rate-limit state.
 * Returns only candidates with a positive score, best first.
 */
export async function rankCandidates(candidates: RankableCandidate[]): Promise<RankableCandidate[]> {
  const now = Date.now();
  const rateStates = await db.select().from(providerRateState);
  const performance = await db.select().from(providerPerformance);

  const stateByKey = new Map(rateStates.map((s) => [keyFor(s.provider, s.model), s]));
  const perfByKey = new Map(performance.map((p) => [keyFor(p.provider, p.model), p]));

  const utcDay = getUtcDayString(now);
  const budgetRows = await db
    .select()
    .from(cloudflareNeuronBudget)
    .where(eq(cloudflareNeuronBudget.utcDay, utcDay))
    .limit(1);
  const cfBudget = budgetRows[0] ?? null;

  const scored = candidates.map((candidate) => {
    if (!candidate.provider || !candidate.modelId) {
      return { candidate, score: Number.NEGATIVE_INFINITY };
    }

    const key = keyFor(candidate.provider, candidate.modelId);
    const state = stateByKey.get(key);
    const perfRow = perfByKey.get(key);

    const perf: PerformanceRow | undefined = perfRow
      ? {
          provider: perfRow.provider,
          model: perfRow.model,
          calls: perfRow.calls,
          successes: perfRow.successes,
          failures: perfRow.failures,
          timeouts: perfRow.timeouts,
          averageLatencyMs: perfRow.averageLatencyMs,
          averageTokens: perfRow.averageTokens,
          updatedAt: perfRow.updatedAt,
        }
      : undefined;

    let score = scoreCandidate(perf, { provider: candidate.provider, modelId: candidate.modelId });

    if (state) {
      if (state.cooldownUntil && state.cooldownUntil > now) {
        score = Number.NEGATIVE_INFINITY; // Cooldown = exhausted
      } else if (
        (state.remainingRequests !== null &&
          state.remainingRequests !== undefined &&
          state.remainingRequests <= 2 &&
          state.resetAt &&
          state.resetAt > now) ||
        (state.remainingTokens !== null &&
          state.remainingTokens !== undefined &&
          state.remainingTokens <= 15000 &&
          state.resetAt &&
          state.resetAt > now)
      ) {
        // Near exhaustion — penalize but keep in rotation with a floor of 5
        score = Math.max(5, score - 60);
      }
    }

    if (candidate.provider === "cloudflare") {
      const used = cfBudget?.neuronsUsed ?? 0;
      if (used >= CLOUDFLARE_DAILY_BUDGET) {
        score = Number.NEGATIVE_INFINITY;
      } else if (used >= Math.round(CLOUDFLARE_DAILY_BUDGET * NEAR_EXHAUSTION_RATIO)) {
        score -= 50;
      }
    }

    return { candidate, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.candidate);
}

/** Cron equivalent: poll provider state and record a health insight. */
export async function runHealthCheck(): Promise<void> {
  const now = Date.now();
  const rateStates = await db.select().from(providerRateState);

  let exhausted = 0;
  let nearExhaustion = 0;
  let healthy = 0;

  for (const state of rateStates) {
    if (state.cooldownUntil && state.cooldownUntil > now) {
      exhausted++;
    } else if (
      (state.remainingRequests !== null &&
        state.remainingRequests !== undefined &&
        state.remainingRequests <= 2 &&
        state.resetAt &&
        state.resetAt > now) ||
      (state.remainingTokens !== null &&
        state.remainingTokens !== undefined &&
        state.remainingTokens <= 15000 &&
        state.resetAt &&
        state.resetAt > now)
    ) {
      nearExhaustion++;
    } else {
      healthy++;
    }
  }

  await db.insert(systemInsights).values({
    kind: "optimus-health-check",
    status: "polled",
    summary: `Network Health: ${healthy} healthy, ${nearExhaustion} near exhaustion, ${exhausted} exhausted.`,
    recommendation: "Optimus Auto-Router is actively managing traffic.",
    triggerCalls: rateStates.length,
    createdAt: now,
  });
}

export const _providers = PROVIDER_NAMES;
