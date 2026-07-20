import { query, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { getUtcDayString, CLOUDFLARE_DAILY_BUDGET, NEAR_EXHAUSTION_RATIO } from "./budget";

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

        healthStatuses[key] = {
          provider: providerId,
          model: modelId,
          status,
          reason,
          cooldownRemaining
        };
      }
    }

    return Object.values(healthStatuses);
  },
});

export const rankCandidates = internalQuery({
  args: {
    candidates: v.array(v.object({
      provider: v.string(),
      providerLabel: v.string(),
      providerIndex: v.number(),
      modelId: v.string(),
      modelName: v.string(),
      supportsJsonMode: v.boolean(),
      baseUrl: v.string(),
      headers: v.any(),
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

    // Map each candidate to a score
    const scored = args.candidates.map((candidate: any) => {
      // Skip malformed candidates (missing provider or modelId)
      if (!candidate.provider || !candidate.modelId) {
        return { candidate, score: 0 };
      }

      const key = keyFor(candidate.provider, candidate.modelId);
      const state = stateByKey.get(key);
      const perf = perfByKey.get(key);
      
      let score = 100; // Base healthy score
      
      if (state) {
        if (state.cooldownUntil && state.cooldownUntil > now) {
          score = 0; // Exhausted
        } else if (
          (state.remainingRequests !== undefined && state.remainingRequests <= 2 && state.resetAt && state.resetAt > now) ||
          (state.remainingTokens !== undefined && state.remainingTokens <= 15000 && state.resetAt && state.resetAt > now)
        ) {
          score = 50; // Near exhaustion
        }
      }

      if (candidate.provider === "cloudflare") {
        const used = cfBudget?.neuronsUsed ?? 0;
        if (used >= CLOUDFLARE_DAILY_BUDGET) score = 0;
        else if (used >= Math.round(CLOUDFLARE_DAILY_BUDGET * NEAR_EXHAUSTION_RATIO)) score = 50;
      }

      // Adjust score by performance
      if (perf && score > 0) {
        const successRate = perf.calls > 0 ? perf.successes / perf.calls : 1;
        // Boost reliable models
        score += successRate * 20;
        
        // Penalize extremely slow models
        if (perf.averageLatencyMs > 20000) score -= 10;
        else if (perf.averageLatencyMs < 5000) score += 10;
      }

      // Provider tier adjustments
      if (candidate.provider === "groq" && score > 0) score += 15; // Groq preferred

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
