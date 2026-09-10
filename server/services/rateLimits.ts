/**
 * Provider rate limiting + performance — ported from src/convex/rateLimits.ts.
 */
import { desc, eq, sql } from "drizzle-orm";

import { db } from "../db";
import {
  adaptiveSettings,
  cloudflareNeuronBudget,
  providerPerformance,
  providerRateState,
  systemInsights,
} from "../db/schema";
import {
  CLOUDFLARE_DAILY_BUDGET,
  estimateNeurons,
  getUtcDayString,
  getWaitSecondsUntilUtcMidnight,
} from "../budget";

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * 60_000;

type ProviderPolicy = {
  requestsPerMinute: number;
  tokensPerMinute: number;
  requestsPerDay?: number;
};

export function getProviderPolicy(provider: string, model: string): ProviderPolicy {
  // Free tier limits based on 2026 provider documentation
  // See: FREE_TIER_SUMMARY.md for details
  
  if (provider === "groq") {
    // Groq free tier (no credit card):
    // - llama-3.1-8b-instant: 30 RPM, 6,000 TPM, 14,400 RPD
    // - llama-3.3-70b: 30 RPM, 12,000 TPM, 1,000 RPD
    // - llama-4-scout: 30 RPM, 30,000 TPM, 1,000 RPD
    // - qwen3-32b: 60 RPM, 6,000 TPM, 1,000 RPD
    // - gpt-oss models: 30 RPM, 8,000 TPM, 1,000 RPD
    if (model === "qwen/qwen3-32b") return { requestsPerMinute: 50, tokensPerMinute: 5_000, requestsPerDay: 1000 };
    if (model === "llama-3.3-70b-versatile") return { requestsPerMinute: 25, tokensPerMinute: 10_000, requestsPerDay: 1000 };
    if (model === "meta-llama/llama-4-scout-17b-16e-instruct") return { requestsPerMinute: 25, tokensPerMinute: 25_000, requestsPerDay: 1000 };
    if (model === "openai/gpt-oss-120b" || model === "openai/gpt-oss-20b") return { requestsPerMinute: 25, tokensPerMinute: 7_000, requestsPerDay: 1000 };
    // Default: llama-3.1-8b-instant (most permissive)
    return { requestsPerMinute: 25, tokensPerMinute: 5_000, requestsPerDay: 14000 };
  }
  
  if (provider === "cerebras") {
    // Cerebras free tier: 1M tokens/day, ~5 RPM, 30K TPM
    // 8,192 token context cap on free tier
    return { requestsPerMinute: 5, tokensPerMinute: 30_000, requestsPerDay: 1000 };
  }
  
  if (provider === "kilo") {
    // Kilo free tier: anonymous users get 200 req/hr per IP
    // kilo-auto/free and :free models available
    return { requestsPerMinute: 3, tokensPerMinute: 20_000, requestsPerDay: 50 };
  }
  
  if (provider === "cloudflare") {
    // Cloudflare Workers AI free tier: 10,000 Neurons/day
    // ~300 req/min text-generation cap
    // Using conservative limits to stay well within budget
    return { requestsPerMinute: 30, tokensPerMinute: 25_000, requestsPerDay: 60 };
  }
  
  // OpenRouter free tier: 20 RPM on :free models
  // 50 free-model req/day (no credits) or 1,000/day (with $10+ credits)
  if (provider === "openrouter") {
    return { requestsPerMinute: 15, tokensPerMinute: 20_000, requestsPerDay: 50 };
  }
  
  return { requestsPerMinute: 15, tokensPerMinute: 20_000, requestsPerDay: 45 };
}

export type CapacityDecision = { allowed: true; waitSeconds: 0 } | { allowed: false; waitSeconds: number };

/**
 * Atomically reserve capacity for one provider/model call. Runs in a
 * transaction with a row-level lock so concurrent sections of the same run
 * (or concurrent runs) cannot overspend the window.
 */
export async function reserveProviderCapacity(
  provider: string,
  model: string,
  estimatedTokensRaw: number,
): Promise<CapacityDecision> {
  return db.transaction(async (tx) => {
    const now = Date.now();
    const policy = getProviderPolicy(provider, model);

    // Lock the existing row (if any) so concurrent reservations serialize.
    await tx.execute(sql`
      SELECT id FROM provider_rate_state
      WHERE provider = ${provider} AND model = ${model}
      FOR UPDATE
    `);
    const existingRows = await tx
      .select()
      .from(providerRateState)
      .where(sql`${providerRateState.provider} = ${provider} AND ${providerRateState.model} = ${model}`)
      .limit(1);
    const existing = existingRows[0] ?? null;

    const inNewMinute = !existing || now - existing.windowStartedAt >= MINUTE_MS;
    const inNewDay = !existing || now - existing.dayStartedAt >= DAY_MS;
    const windowStartedAt = inNewMinute ? now : existing.windowStartedAt;
    const requestsUsed = inNewMinute ? 0 : existing.requestsUsed;
    const tokensUsed = inNewMinute ? 0 : existing.tokensUsed;
    const dayStartedAt = inNewDay ? now : existing.dayStartedAt;
    const dayRequestsUsed = inNewDay ? 0 : existing.dayRequestsUsed;
    const estimatedTokens = Math.max(1, Math.round(estimatedTokensRaw));
    const cooldownUntil = existing?.cooldownUntil ?? 0;

    const waitUntil = Math.max(
      cooldownUntil,
      requestsUsed >= policy.requestsPerMinute ? windowStartedAt + MINUTE_MS : 0,
      tokensUsed + estimatedTokens > policy.tokensPerMinute ? windowStartedAt + MINUTE_MS : 0,
      policy.requestsPerDay && dayRequestsUsed >= policy.requestsPerDay ? dayStartedAt + DAY_MS : 0,
    );

    if (waitUntil > now) {
      return { allowed: false, waitSeconds: Math.ceil((waitUntil - now) / 1000) } as CapacityDecision;
    }

    if (provider === "cloudflare") {
      const budgetEnvStr = process.env.CLOUDFLARE_DAILY_NEURON_BUDGET;
      const dailyBudget = budgetEnvStr
        ? Math.max(1, parseInt(budgetEnvStr, 10) || CLOUDFLARE_DAILY_BUDGET)
        : CLOUDFLARE_DAILY_BUDGET;
      const utcDay = getUtcDayString(now);

      const budgetRows = await tx
        .select()
        .from(cloudflareNeuronBudget)
        .where(eq(cloudflareNeuronBudget.utcDay, utcDay))
        .limit(1)
        .for("update");
      const budgetRecord = budgetRows[0] ?? null;
      const currentUsed = budgetRecord?.neuronsUsed ?? 0;
      const projectedNeurons = estimateNeurons(model, estimatedTokensRaw, estimatedTokensRaw);

      if (currentUsed + projectedNeurons > dailyBudget) {
        return { allowed: false, waitSeconds: getWaitSecondsUntilUtcMidnight(now) } as CapacityDecision;
      }

      if (budgetRecord) {
        await tx
          .update(cloudflareNeuronBudget)
          .set({ neuronsUsed: currentUsed + projectedNeurons, updatedAt: now })
          .where(eq(cloudflareNeuronBudget.utcDay, utcDay));
      } else {
        await tx
          .insert(cloudflareNeuronBudget)
          .values({ utcDay, neuronsUsed: projectedNeurons, updatedAt: now });
      }
    }

    const nextState = {
      provider,
      model,
      windowStartedAt,
      requestsUsed: requestsUsed + 1,
      tokensUsed: tokensUsed + estimatedTokens,
      dayStartedAt,
      dayRequestsUsed: dayRequestsUsed + 1,
      cooldownUntil: 0,
      lastStatus: existing?.lastStatus ?? null,
      remainingRequests: Math.max(0, policy.requestsPerMinute - requestsUsed - 1),
      remainingTokens: Math.max(0, policy.tokensPerMinute - tokensUsed - estimatedTokens),
      resetAt: windowStartedAt + MINUTE_MS,
      updatedAt: now,
    };

    if (existing) {
      await tx.update(providerRateState).set(nextState).where(eq(providerRateState.id, existing.id));
    } else {
      await tx.insert(providerRateState).values(nextState);
    }
    return { allowed: true, waitSeconds: 0 } as CapacityDecision;
  });
}

export type ProviderResultReport = {
  provider: string;
  model: string;
  status: number;
  cooldownSeconds?: number;
  remainingRequests?: number;
  remainingTokens?: number;
  resetSeconds?: number;
  /** Budget reconciliation: neurons reserved at reservation time. */
  projectedNeurons?: number;
  /** Budget reconciliation: neurons actually consumed. */
  actualNeurons?: number;
};

export async function reportProviderResult(args: ProviderResultReport): Promise<void> {
  const now = Date.now();

  if (args.provider === "cloudflare" && args.projectedNeurons !== undefined && args.actualNeurons !== undefined) {
    const utcDay = getUtcDayString(now);
    await db.transaction(async (tx) => {
      const budgetRows = await tx
        .select()
        .from(cloudflareNeuronBudget)
        .where(eq(cloudflareNeuronBudget.utcDay, utcDay))
        .limit(1)
        .for("update");
      const budgetRecord = budgetRows[0] ?? null;
      if (budgetRecord) {
        // We reserved projectedNeurons, but actually used actualNeurons.
        // Refund the difference (can be negative if we used more than projected).
        const diff = args.projectedNeurons! - args.actualNeurons!;
        await tx
          .update(cloudflareNeuronBudget)
          .set({ neuronsUsed: Math.max(0, budgetRecord.neuronsUsed - diff), updatedAt: now })
          .where(eq(cloudflareNeuronBudget.utcDay, utcDay));
      }
    });
  }

  await db.transaction(async (tx) => {
    await tx.execute(sql`
      SELECT id FROM provider_rate_state
      WHERE provider = ${args.provider} AND model = ${args.model}
      FOR UPDATE
    `);
    const existingRows = await tx
      .select()
      .from(providerRateState)
      .where(sql`${providerRateState.provider} = ${args.provider} AND ${providerRateState.model} = ${args.model}`)
      .limit(1);
    const existing = existingRows[0] ?? null;

    const cooldownSeconds = Math.max(0, Math.round(args.cooldownSeconds ?? 0));
    const resetSeconds = Math.max(0, Math.round(args.resetSeconds ?? 0));
    const rr = args.remainingRequests ?? existing?.remainingRequests ?? null;
    const rt = args.remainingTokens ?? existing?.remainingTokens ?? null;
    const ra = resetSeconds > 0 ? now + resetSeconds * 1000 : (existing?.resetAt ?? null);
    const sharedFields = {
      lastStatus: args.status,
      cooldownUntil: Math.max(existing?.cooldownUntil ?? 0, now + cooldownSeconds * 1000),
      updatedAt: now,
      remainingRequests: rr,
      remainingTokens: rt,
      resetAt: ra,
    };
    if (existing) {
      await tx.update(providerRateState).set(sharedFields).where(eq(providerRateState.id, existing.id));
    } else {
      await tx.insert(providerRateState).values({
        provider: args.provider,
        model: args.model,
        windowStartedAt: now,
        requestsUsed: 0,
        tokensUsed: 0,
        dayStartedAt: now,
        dayRequestsUsed: 0,
        ...sharedFields,
      });
    }
  });
}

/** Most recent rate states (for the Live Capacity Grid). */
export async function providerStates(limit = 100) {
  return db
    .select()
    .from(providerRateState)
    .orderBy(desc(providerRateState.updatedAt))
    .limit(Math.min(100, Math.max(1, limit)));
}

export async function recordPerformance(args: {
  provider: string;
  model: string;
  success: boolean;
  timedOut: boolean;
  latencyMs: number;
  tokens: number;
}): Promise<void> {
  const now = Date.now();
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      SELECT id FROM provider_performance
      WHERE provider = ${args.provider} AND model = ${args.model}
      FOR UPDATE
    `);
    const existingRows = await tx
      .select()
      .from(providerPerformance)
      .where(sql`${providerPerformance.provider} = ${args.provider} AND ${providerPerformance.model} = ${args.model}`)
      .limit(1);
    const existing = existingRows[0] ?? null;

    const calls = (existing?.calls ?? 0) + 1;
    const alpha = 0.25;
    const averageLatencyMs = existing
      ? existing.averageLatencyMs * (1 - alpha) + Math.max(0, args.latencyMs) * alpha
      : Math.max(0, args.latencyMs);
    const averageTokens = existing
      ? existing.averageTokens * (1 - alpha) + Math.max(0, args.tokens) * alpha
      : Math.max(0, args.tokens);

    const next = {
      provider: args.provider,
      model: args.model,
      calls,
      successes: (existing?.successes ?? 0) + (args.success ? 1 : 0),
      failures: (existing?.failures ?? 0) + (args.success ? 0 : 1),
      timeouts: (existing?.timeouts ?? 0) + (args.timedOut ? 1 : 0),
      averageLatencyMs,
      averageTokens,
      updatedAt: now,
    };
    if (existing) {
      await tx.update(providerPerformance).set(next).where(eq(providerPerformance.id, existing.id));
    } else {
      await tx.insert(providerPerformance).values(next);
    }
  });
}

export async function performanceSnapshot() {
  return db.select().from(providerPerformance);
}

export async function getAdaptiveSettings() {
  const rows = await db
    .select()
    .from(adaptiveSettings)
    .where(eq(adaptiveSettings.key, "generation"))
    .limit(1);
  return rows[0] ?? null;
}

export async function latestInsight() {
  const rows = await db
    .select()
    .from(systemInsights)
    .orderBy(desc(systemInsights.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export type AdvisorSettingsInput = {
  summary: string;
  recommendation: string;
  triggerCalls: number;
  documentMaxChunks: number;
  completionPasses: number;
};

export async function applyAdvisorSettings(args: AdvisorSettingsInput) {
  const documentMaxChunks = Math.min(12, Math.max(4, Math.round(args.documentMaxChunks)));
  const completionPasses = Math.min(4, Math.max(1, Math.round(args.completionPasses)));
  const now = Date.now();
  const settings = {
    key: "generation",
    documentMaxChunks,
    completionPasses,
    updatedAt: now,
    source: "validated-groq-advisor",
  };
  await db.transaction(async (tx) => {
    const existingRows = await tx
      .select()
      .from(adaptiveSettings)
      .where(eq(adaptiveSettings.key, "generation"))
      .limit(1);
    const existing = existingRows[0] ?? null;
    if (existing) {
      await tx.update(adaptiveSettings).set(settings).where(eq(adaptiveSettings.key, "generation"));
    } else {
      await tx.insert(adaptiveSettings).values(settings);
    }
    await tx.insert(systemInsights).values({
      kind: "provider-routing",
      status: "applied",
      summary: args.summary.slice(0, 1000),
      recommendation: args.recommendation.slice(0, 4000),
      triggerCalls: Math.max(0, Math.round(args.triggerCalls)),
      createdAt: now,
    });
  });
  return settings;
}

export async function cloudflareBudget() {
  const utcDay = getUtcDayString(Date.now());
  const rows = await db
    .select()
    .from(cloudflareNeuronBudget)
    .where(eq(cloudflareNeuronBudget.utcDay, utcDay))
    .limit(1);
  return rows[0] ?? null;
}
