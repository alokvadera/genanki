import { query, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

import { PROVIDER_NAMES } from "./aiProviders";
import { getUtcDayString, CLOUDFLARE_DAILY_BUDGET, NEAR_EXHAUSTION_RATIO } from "./budget";
import { scoreCandidate, type PerformanceRow } from "../lib/routing";

// A status type to indicate provider health
export type ProviderStatus = "healthy" | "near-exhaustion" | "exhausted";

function keyFor(provider: string, model: string): string {
  return `${provider}:${model}`;
}

export const getNetworkHealth = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const rateStates = await ctx.db.query("providerRateState").collect();
    const catalog = await ctx.db.query("providerCatalog").collect();
    
    // Build O(1) lookup maps
    const stateByKey = new Map(rateStates.map(s => [keyFor(s.provider, s.model), s]));
    
    // Cloudflare budget
    const utcDay = getUtcDayString(now);
    const cfBudget = await ctx.db
      .query("cloudflareNeuronBudget")
      .withIndex("by_utcDay", (q) => q.eq("utcDay", utcDay))
      .unique();

    const healthStatuses: Record<string, {
      provider: string;
      model: string;
      status: ProviderStatus;
      reason?: string;
      cooldownRemaining?: number;
    }> = {};

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
            (state.remainingRequests !== undefined && state.remainingRequests <= 2 && state.resetAt && state.resetAt > now) ||
            (state.remainingTokens !== undefined && state.remainingTokens <= 15000 && state.resetAt && state.resetAt > now)
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

        const entry: { provider: string; model: string; status: ProviderStatus; reason?: string; cooldownRemaining?: number } = {
          provider: providerId,
          model: modelId,
          status,
        };
        if (reason !== undefined) entry.reason = reason;
        if (cooldownRemaining > 0) entry.cooldownRemaining = cooldownRemaining;
        healthStatuses[key] = entry;
      }
    }

    return Object.values(healthStatuses);
  },
});

export const rankCandidates = internalQuery({
  args: {
    candidates: v.array(v.object({
      provider: v.union(...PROVIDER_NAMES.map((p) => v.literal(p))),
      providerLabel: v.string(),
      providerIndex: v.number(),
      modelId: v.string(),
      modelName: v.string(),
      supportsJsonMode: v.boolean(),
      baseUrl: v.string(),
      headers: v.record(v.string(), v.string()),
    })),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const rateStates = await ctx.db.query("providerRateState").collect();
    const performance = await ctx.db.query("providerPerformance").collect();
    
    // Build O(1) lookup maps
    const stateByKey = new Map(rateStates.map(s => [keyFor(s.provider, s.model), s]));
    const perfByKey = new Map(performance.map(p => [keyFor(p.provider, p.model), p]));
    
    const utcDay = getUtcDayString(now);
    const cfBudget = await ctx.db
      .query("cloudflareNeuronBudget")
      .withIndex("by_utcDay", (q) => q.eq("utcDay", utcDay))
      .unique();

    // Map each candidate to a score using the unified routing score function
    const scored = args.candidates.map((candidate) => {
      if (!candidate.provider || !candidate.modelId) {
        return { candidate, score: Number.NEGATIVE_INFINITY };
      }

      const key = keyFor(candidate.provider, candidate.modelId);
      const state = stateByKey.get(key);
      const perfRow = perfByKey.get(key);

      // Convex doc shape matches PerformanceRow — safe to spread
      const perf: PerformanceRow | undefined = perfRow ? { ...perfRow } : undefined;

      // Start with the unified routing score
      let score = scoreCandidate(perf, { provider: candidate.provider, modelId: candidate.modelId });

      // Layer real-time rate-limit state on top (not captured by performance alone)
      if (state) {
        if (state.cooldownUntil && state.cooldownUntil > now) {
          score = Number.NEGATIVE_INFINITY; // Cooldown = exhausted
        } else if (
          (state.remainingRequests !== undefined && state.remainingRequests <= 2 && state.resetAt && state.resetAt > now) ||
          (state.remainingTokens !== undefined && state.remainingTokens <= 15000 && state.resetAt && state.resetAt > now)
        ) {
          // Near exhaustion — penalize but keep in rotation with a floor of 5
          score = Math.max(5, score - 60);
        }
      }

      // Cloudflare budget gate: fully exhausted = remove from rotation
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

    // Filter out completely exhausted and sort descending
    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(s => s.candidate);
  },
});

export const runHealthCheck = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const rateStates = await ctx.db.query("providerRateState").collect();
    
    let exhausted = 0;
    let nearExhaustion = 0;
    let healthy = 0;

    for (const state of rateStates) {
      if (state.cooldownUntil && state.cooldownUntil > now) {
        exhausted++;
      } else if (
        (state.remainingRequests !== undefined && state.remainingRequests <= 2 && state.resetAt && state.resetAt > now) ||
        (state.remainingTokens !== undefined && state.remainingTokens <= 15000 && state.resetAt && state.resetAt > now)
      ) {
        nearExhaustion++;
      } else {
        healthy++;
      }
    }

    await ctx.db.insert("systemInsights", {
      kind: "optimus-health-check",
      status: "polled",
      summary: `Network Health: ${healthy} healthy, ${nearExhaustion} near exhaustion, ${exhausted} exhausted.`,
      recommendation: "Optimus Auto-Router is actively managing traffic.",
      triggerCalls: rateStates.length,
      createdAt: now,
    });
  },
});
