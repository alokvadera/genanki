import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const DEFAULT_DAILY_LIMIT = 50_000;

function getDayWindowStart(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Checks if the client IP is blocked or has reached their daily token limit.
 * If allowed, updates their rate state record.
 */
export const checkAndLogIp = mutation({
  args: {
    ip: v.string(),
    estimatedTokens: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const dayWindowStart = getDayWindowStart(now);

    // 1. Check IP blocklist
    const rule = await ctx.db
      .query("ipRules")
      .withIndex("by_ip", (q) => q.eq("ip", args.ip))
      .unique();

    if (rule?.isBlocked) {
      return {
        allowed: false,
        reason: "This IP has been blocked by the administrator.",
        retryAfterSeconds: 86400,
      };
    }

    const dailyLimit = rule?.customDailyLimit ?? DEFAULT_DAILY_LIMIT;

    // 2. Check token budget state
    const state = await ctx.db
      .query("ipRateState")
      .withIndex("by_ip", (q) => q.eq("ip", args.ip))
      .unique();

    const isNewDay = !state || dayWindowStart > state.dayWindowStart;
    const dayTokensUsed = isNewDay ? 0 : state.dayTokensUsed;

    if (dayTokensUsed + args.estimatedTokens > dailyLimit) {
      const secondsUntilMidnight = Math.max(
        0,
        Math.ceil((dayWindowStart + 86400000 - now) / 1000)
      );
      return {
        allowed: false,
        reason: `Daily token limit of ${dailyLimit.toLocaleString()} tokens reached.`,
        retryAfterSeconds: secondsUntilMidnight,
      };
    }

    // 3. Log/update request state
    const nextState = {
      ip: args.ip,
      dayWindowStart: isNewDay ? dayWindowStart : state.dayWindowStart,
      dayTokensUsed: dayTokensUsed, // do not deduct yet, only checked/allowed
      totalTokensAllTime: state?.totalTokensAllTime ?? 0,
      totalRequests: (state?.totalRequests ?? 0) + 1,
      lastSeenAt: now,
      firstSeenAt: state?.firstSeenAt ?? now,
      updatedAt: now,
    };

    if (state) {
      await ctx.db.patch(state._id, nextState);
    } else {
      await ctx.db.insert("ipRateState", nextState);
    }

    return { allowed: true, ip: args.ip };
  },
});

/**
 * Deducts consumed tokens from the client IP's daily budget.
 */
export const deductIpTokens = mutation({
  args: {
    ip: v.string(),
    tokens: v.number(),
  },
  handler: async (ctx, args) => {
    const state = await ctx.db
      .query("ipRateState")
      .withIndex("by_ip", (q) => q.eq("ip", args.ip))
      .unique();

    if (!state) return;

    await ctx.db.patch(state._id, {
      dayTokensUsed: state.dayTokensUsed + Math.max(0, Math.round(args.tokens)),
      totalTokensAllTime: state.totalTokensAllTime + Math.max(0, Math.round(args.tokens)),
      updatedAt: Date.now(),
    });
  },
});

/**
 * Admin: List all IPs with rate limits, rules, and aggregated provider/model usage.
 */
export const adminListIps = query({
  args: { adminSecret: v.string() },
  handler: async (ctx, args) => {
    if (args.adminSecret !== process.env.ADMIN_SECRET) {
      throw new Error("Unauthorized: Invalid admin secret");
    }

    const states = await ctx.db.query("ipRateState").collect();
    const rules = await ctx.db.query("ipRules").collect();
    const usageRecords = await ctx.db.query("providerUsage").collect();

    const rulesMap = new Map(rules.map((r) => [r.ip, r]));

    // Join and build IP detail list
    return await Promise.all(
      states.map(async (state) => {
        const rule = rulesMap.get(state.ip);
        
        // Filter usage records for this IP
        const ipUsages = usageRecords.filter((u) => u.ip === state.ip);

        // Aggregate by provider
        const providerMap = new Map<string, { label: string; tokens: number; requests: number }>();
        const modelMap = new Map<string, { name: string; tokens: number; requests: number }>();

        for (const usage of ipUsages) {
          // Provider sum
          const pKey = usage.provider;
          const pData = providerMap.get(pKey) ?? { label: usage.providerLabel, tokens: 0, requests: 0 };
          pData.tokens += usage.totalTokens;
          pData.requests += 1;
          providerMap.set(pKey, pData);

          // Model sum
          const mKey = `${usage.provider}:${usage.model}`;
          const mData = modelMap.get(mKey) ?? { name: usage.model, tokens: 0, requests: 0 };
          mData.tokens += usage.totalTokens;
          mData.requests += 1;
          modelMap.set(mKey, mData);
        }

        return {
          ip: state.ip,
          dayWindowStart: state.dayWindowStart,
          dayTokensUsed: state.dayTokensUsed,
          totalTokensAllTime: state.totalTokensAllTime,
          totalRequests: state.totalRequests,
          lastSeenAt: state.lastSeenAt,
          firstSeenAt: state.firstSeenAt,
          isBlocked: rule?.isBlocked ?? false,
          customDailyLimit: rule?.customDailyLimit,
          note: rule?.note ?? "",
          providersUsed: Array.from(providerMap.values()),
          modelsUsed: Array.from(modelMap.values()),
        };
      })
    );
  },
});

/**
 * Admin: Configure block rules and limits for an IP.
 */
export const adminSetRule = mutation({
  args: {
    adminSecret: v.string(),
    ip: v.string(),
    isBlocked: v.boolean(),
    customDailyLimit: v.optional(v.number()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.adminSecret !== process.env.ADMIN_SECRET) {
      throw new Error("Unauthorized: Invalid admin secret");
    }

    const existing = await ctx.db
      .query("ipRules")
      .withIndex("by_ip", (q) => q.eq("ip", args.ip))
      .unique();

    const now = Date.now();
    const payload = {
      ip: args.ip,
      isBlocked: args.isBlocked,
      customDailyLimit: args.customDailyLimit,
      note: args.note,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
    } else {
      await ctx.db.insert("ipRules", {
        ...payload,
        createdAt: now,
      });
    }
  },
});

/**
 * Admin: Reset today's token counter for an IP.
 */
export const adminResetIpTokens = mutation({
  args: {
    adminSecret: v.string(),
    ip: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.adminSecret !== process.env.ADMIN_SECRET) {
      throw new Error("Unauthorized: Invalid admin secret");
    }

    const state = await ctx.db
      .query("ipRateState")
      .withIndex("by_ip", (q) => q.eq("ip", args.ip))
      .unique();

    if (state) {
      await ctx.db.patch(state._id, {
        dayTokensUsed: 0,
        updatedAt: Date.now(),
      });
    }
  },
});

/**
 * Internal Queries used by Actions
 */
export const listActiveJobsByHash = query({
  args: { creatorIpHash: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("generationJobs")
      .withIndex("by_creatorIpHash_createdAt", (q) => q.eq("creatorIpHash", args.creatorIpHash))
      .order("desc")
      .take(100);

    return rows.filter((job) => job.status === "queued" || job.status === "running");
  },
});

export const listArchivedJobsByHash = query({
  args: { creatorIpHash: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(100, Math.max(1, Math.round(args.limit ?? 50)));
    const rows = await ctx.db
      .query("generationJobs")
      .withIndex("by_creatorIpHash_createdAt", (q) => q.eq("creatorIpHash", args.creatorIpHash))
      .order("desc")
      .take(limit * 3);

    return rows
      .filter((job) => job.status !== "queued" && job.status !== "running")
      .slice(0, limit);
  },
});

export const getJobById = query({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.jobId);
  },
});
