import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { estimateNeurons, getUtcDayString, getWaitSecondsUntilUtcMidnight, CLOUDFLARE_DAILY_BUDGET } from "./budget";


const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * 60_000;

type ProviderPolicy = {
  requestsPerMinute: number;
  tokensPerMinute: number;
  requestsPerDay?: number;
};

function getProviderPolicy(provider: string, model: string): ProviderPolicy {
  if (provider === "groq") {
    if (model === "qwen/qwen3-32b") return { requestsPerMinute: 50, tokensPerMinute: 5_000 };
    if (model === "llama-3.3-70b-versatile") return { requestsPerMinute: 25, tokensPerMinute: 10_000 };
    return { requestsPerMinute: 25, tokensPerMinute: 5_000 };
  }
  if (provider === "cerebras") return { requestsPerMinute: 25, tokensPerMinute: 50_000 };
  if (provider === "kilo") return { requestsPerMinute: 3, tokensPerMinute: 20_000 };
  if (provider === "cloudflare") {
    // Cloudflare Workers AI free tier: 300 req/min text-generation cap and an
    // account-wide 10,000 Neurons/day allocation shared across all models.
    // We approximate the daily Neuron budget with a conservative per-model
    // daily request cap so the free pool can't be silently exhausted, and cap
    // per-minute tokens well under the shared budget.
    return { requestsPerMinute: 60, tokensPerMinute: 30_000, requestsPerDay: 60 };
  }
  return { requestsPerMinute: 15, tokensPerMinute: 20_000, requestsPerDay: 45 };
}

export const reserveProviderCapacity = mutation({
  args: {
    provider: v.string(),
    model: v.string(),
    estimatedTokens: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    
    const policy = getProviderPolicy(args.provider, args.model);
    const existing = await ctx.db
      .query("providerRateState")
      .withIndex("by_provider_model", (q) => q.eq("provider", args.provider).eq("model", args.model))
      .unique();

    const inNewMinute = !existing || now - existing.windowStartedAt >= MINUTE_MS;
    const inNewDay = !existing || now - existing.dayStartedAt >= DAY_MS;
    const windowStartedAt = inNewMinute ? now : existing.windowStartedAt;
    const requestsUsed = inNewMinute ? 0 : existing.requestsUsed;
    const tokensUsed = inNewMinute ? 0 : existing.tokensUsed;
    const dayStartedAt = inNewDay ? now : existing.dayStartedAt;
    const dayRequestsUsed = inNewDay ? 0 : existing.dayRequestsUsed;
    const estimatedTokens = Math.max(1, Math.round(args.estimatedTokens));
    const cooldownUntil = existing?.cooldownUntil ?? 0;

    const waitUntil = Math.max(
      cooldownUntil,
      requestsUsed >= policy.requestsPerMinute ? windowStartedAt + MINUTE_MS : 0,
      tokensUsed + estimatedTokens > policy.tokensPerMinute ? windowStartedAt + MINUTE_MS : 0,
      policy.requestsPerDay && dayRequestsUsed >= policy.requestsPerDay ? dayStartedAt + DAY_MS : 0,
    );

    if (waitUntil > now) {
      return { allowed: false, waitSeconds: Math.ceil((waitUntil - now) / 1000) };
    }

    if (args.provider === "cloudflare") {
      const budgetEnvStr = process.env.CLOUDFLARE_DAILY_NEURON_BUDGET;
      const dailyBudget = budgetEnvStr ? Math.max(1, parseInt(budgetEnvStr, 10) || CLOUDFLARE_DAILY_BUDGET) : CLOUDFLARE_DAILY_BUDGET;
      const utcDay = getUtcDayString(now);
      const budgetRecord = await ctx.db
        .query("cloudflareNeuronBudget")
        .withIndex("by_utcDay", (q) => q.eq("utcDay", utcDay))
        .unique();
      const currentUsed = budgetRecord?.neuronsUsed ?? 0;
      const projectedNeurons = estimateNeurons(args.model, args.estimatedTokens, args.estimatedTokens);

      if (currentUsed + projectedNeurons > dailyBudget) {
        return { allowed: false, waitSeconds: getWaitSecondsUntilUtcMidnight(now) };
      }

      if (budgetRecord) {
        await ctx.db.patch(budgetRecord._id, { neuronsUsed: currentUsed + projectedNeurons, updatedAt: now });
      } else {
        await ctx.db.insert("cloudflareNeuronBudget", { utcDay, neuronsUsed: projectedNeurons, updatedAt: now });
      }
    }

    const nextState = {
      provider: args.provider,
      model: args.model,
      windowStartedAt,
      requestsUsed: requestsUsed + 1,
      tokensUsed: tokensUsed + estimatedTokens,
      dayStartedAt,
      dayRequestsUsed: dayRequestsUsed + 1,
      cooldownUntil: 0,
      lastStatus: existing?.lastStatus,
      remainingRequests: Math.max(0, policy.requestsPerMinute - requestsUsed - 1),
      remainingTokens: Math.max(0, policy.tokensPerMinute - tokensUsed - estimatedTokens),
      resetAt: windowStartedAt + MINUTE_MS,
      updatedAt: now,
    };

    if (existing) await ctx.db.patch(existing._id, nextState);
    else await ctx.db.insert("providerRateState", nextState);
    return { allowed: true, waitSeconds: 0 };
  },
});

export const reportProviderResult = mutation({
  args: {
    provider: v.string(),
    model: v.string(),
    status: v.number(),
    cooldownSeconds: v.optional(v.number()),
    remainingRequests: v.optional(v.number()),
    remainingTokens: v.optional(v.number()),
    resetSeconds: v.optional(v.number()),
    // new fields for budget reconciliation
    projectedNeurons: v.optional(v.number()),
    actualNeurons: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    if (args.provider === "cloudflare" && args.projectedNeurons !== undefined && args.actualNeurons !== undefined) {
      const utcDay = getUtcDayString(now);
      const budgetRecord = await ctx.db
        .query("cloudflareNeuronBudget")
        .withIndex("by_utcDay", (q) => q.eq("utcDay", utcDay))
        .unique();
      
      if (budgetRecord) {
        // We reserved projectedNeurons, but actually used actualNeurons.
        // Refund the difference (can be negative if we used more than projected)
        const diff = args.projectedNeurons - args.actualNeurons;
        await ctx.db.patch(budgetRecord._id, {
          neuronsUsed: Math.max(0, budgetRecord.neuronsUsed - diff),
          updatedAt: now,
        });
      }
    }

    const existing = await ctx.db
      .query("providerRateState")
      .withIndex("by_provider_model", (q) => q.eq("provider", args.provider).eq("model", args.model))
      .unique();
    const cooldownSeconds = Math.max(0, Math.round(args.cooldownSeconds ?? 0));
    const resetSeconds = Math.max(0, Math.round(args.resetSeconds ?? 0));
    const patch = {
      lastStatus: args.status,
      cooldownUntil: Math.max(existing?.cooldownUntil ?? 0, now + cooldownSeconds * 1000),
      remainingRequests: args.remainingRequests ?? existing?.remainingRequests,
      remainingTokens: args.remainingTokens ?? existing?.remainingTokens,
      resetAt: resetSeconds > 0 ? now + resetSeconds * 1000 : existing?.resetAt,
      updatedAt: now,
    };
    if (existing) await ctx.db.patch(existing._id, patch);
    else {
      await ctx.db.insert("providerRateState", {
        provider: args.provider,
        model: args.model,
        windowStartedAt: now,
        requestsUsed: 0,
        tokensUsed: 0,
        dayStartedAt: now,
        dayRequestsUsed: 0,
        ...patch,
      });
    }
  },
});

export const providerStates = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("providerRateState").withIndex("by_updatedAt").order("desc").take(100);
  },
});

export const recordPerformance = mutation({
  args: {
    provider: v.string(),
    model: v.string(),
    success: v.boolean(),
    timedOut: v.boolean(),
    latencyMs: v.number(),
    tokens: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("providerPerformance")
      .withIndex("by_provider_model", (q) => q.eq("provider", args.provider).eq("model", args.model))
      .unique();
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
    if (existing) await ctx.db.patch(existing._id, next);
    else await ctx.db.insert("providerPerformance", next);
  },
});

export const performanceSnapshot = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("providerPerformance").collect();
  },
});

export const adaptiveSettings = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("adaptiveSettings")
      .withIndex("by_key", (q) => q.eq("key", "generation"))
      .unique();
  },
});

export const latestInsight = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("systemInsights")
      .withIndex("by_createdAt")
      .order("desc")
      .first();
  },
});

export const applyAdvisorSettings = mutation({
  args: {
    summary: v.string(),
    recommendation: v.string(),
    triggerCalls: v.number(),
    documentMaxChunks: v.number(),
    completionPasses: v.number(),
  },
  handler: async (ctx, args) => {
    const documentMaxChunks = Math.min(12, Math.max(4, Math.round(args.documentMaxChunks)));
    const completionPasses = Math.min(4, Math.max(1, Math.round(args.completionPasses)));
    const now = Date.now();
    const existing = await ctx.db
      .query("adaptiveSettings")
      .withIndex("by_key", (q) => q.eq("key", "generation"))
      .unique();
    const settings = {
      key: "generation",
      documentMaxChunks,
      completionPasses,
      updatedAt: now,
      source: "validated-groq-advisor",
    };
    if (existing) await ctx.db.patch(existing._id, settings);
    else await ctx.db.insert("adaptiveSettings", settings);
    await ctx.db.insert("systemInsights", {
      kind: "provider-routing",
      status: "applied",
      summary: args.summary.slice(0, 1000),
      recommendation: args.recommendation.slice(0, 4000),
      triggerCalls: Math.max(0, Math.round(args.triggerCalls)),
      createdAt: now,
    });
    return settings;
  },
});

export const cloudflareBudget = query({
  args: {},
  handler: async (ctx) => {
    const utcDay = getUtcDayString(Date.now());
    return await ctx.db
      .query("cloudflareNeuronBudget")
      .withIndex("by_utcDay", (q) => q.eq("utcDay", utcDay))
      .unique();
  },
});
