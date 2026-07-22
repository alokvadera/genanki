import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

const DEFAULT_DAILY_LIMIT = 50_000;

export function getDayWindowStart(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export async function checkAndLogIpHandler(
  ctx: MutationCtx,
  args: { ip: string; estimatedTokens: number; deviceIdHash?: string }
) {
  const now = Date.now();
  const dayWindowStart = getDayWindowStart(now);

  // 1. Check IP blocklist
  let rule: Doc<"ipRules"> | null = null;
  if (args.deviceIdHash) {
    rule = await ctx.db
      .query("ipRules")
      .withIndex("by_deviceIdHash", (q) => q.eq("deviceIdHash", args.deviceIdHash))
      .unique();
  }
  if (!rule) {
    rule = await ctx.db
      .query("ipRules")
      .withIndex("by_ip", (q) => q.eq("ip", args.ip))
      .unique();
  }

  if (rule?.isBlocked) {
    return {
      allowed: false,
      reason: "This visitor has been blocked by the administrator.",
      retryAfterSeconds: 86400,
    };
  }

  const dailyLimit = rule?.customDailyLimit ?? DEFAULT_DAILY_LIMIT;

  // 2. Check token budget state
  let state: Doc<"ipRateState"> | null = null;
  if (args.deviceIdHash) {
    state = await ctx.db
      .query("ipRateState")
      .withIndex("by_deviceIdHash", (q) => q.eq("deviceIdHash", args.deviceIdHash))
      .unique();
  }
  if (!state) {
    state = await ctx.db
      .query("ipRateState")
      .withIndex("by_ip", (q) => q.eq("ip", args.ip))
      .unique();
  }

  const isNewDay = state === null || dayWindowStart > state.dayWindowStart;
  // Invariant: isNewDay===false implies state!==null (see definition above), but
  // TS can't narrow through a boolean variable. The ?? 0 is unreachable on this branch.
  const dayTokensUsed = isNewDay ? 0 : (state?.dayTokensUsed ?? 0);

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
  const currentIps = state?.associatedIps ?? [args.ip];
  if (!currentIps.includes(args.ip)) {
    currentIps.push(args.ip);
  }

  const nextState = {
    ...(args.deviceIdHash !== undefined ? { deviceIdHash: args.deviceIdHash } : state?.deviceIdHash !== undefined && { deviceIdHash: state.deviceIdHash }),
    associatedIps: currentIps,
    ip: args.ip,
    // Same invariant as above: state is guaranteed non-null when isNewDay is false.
    dayWindowStart: isNewDay ? dayWindowStart : (state?.dayWindowStart ?? dayWindowStart),
    dayTokensUsed: dayTokensUsed,
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
}

/**
 * Checks if the client IP is blocked or has reached their daily token limit.
 * If allowed, updates their rate state record.
 */
export const checkAndLogIp = mutation({
  args: {
    ip: v.string(),
    estimatedTokens: v.number(),
    deviceIdHash: v.optional(v.string()),
  },
  handler: checkAndLogIpHandler,
});

export async function deductIpTokensHandler(
  ctx: MutationCtx,
  args: { ip: string; tokens: number; deviceIdHash?: string }
) {
  let state: Doc<"ipRateState"> | null = null;
  if (args.deviceIdHash) {
    state = await ctx.db
      .query("ipRateState")
      .withIndex("by_deviceIdHash", (q) => q.eq("deviceIdHash", args.deviceIdHash))
      .unique();
  }
  if (!state) {
    state = await ctx.db
      .query("ipRateState")
      .withIndex("by_ip", (q) => q.eq("ip", args.ip))
      .unique();
  }

  if (!state) return;

  await ctx.db.patch(state._id, {
    dayTokensUsed: state.dayTokensUsed + Math.max(0, Math.round(args.tokens)),
    totalTokensAllTime: state.totalTokensAllTime + Math.max(0, Math.round(args.tokens)),
    updatedAt: Date.now(),
  });
}

/**
 * Deducts consumed tokens from the client IP's daily budget.
 */
export const deductIpTokens = mutation({
  args: {
    ip: v.string(),
    tokens: v.number(),
    deviceIdHash: v.optional(v.string()),
  },
  handler: deductIpTokensHandler,
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

    // Group rules by deviceIdHash (fallback to raw ip)
    const deviceRulesMap = new Map(
      rules.filter((r) => r.deviceIdHash).map((r) => [r.deviceIdHash!, r])
    );
    const ipRulesMap = new Map(
      rules.filter((r) => !r.deviceIdHash).map((r) => [r.ip, r])
    );

    // Join and build IP detail list
    return await Promise.all(
      states.map(async (state) => {
        // Find rule by deviceIdHash first, then by IP
        const rule = (state.deviceIdHash && deviceRulesMap.get(state.deviceIdHash))
          || ipRulesMap.get(state.ip);
        
        // Filter usage records matching any of the associated IPs
        const ipList = state.associatedIps ?? [state.ip];
        const ipUsages = usageRecords.filter((u) => u.ip && ipList.includes(u.ip));

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
          ...(state.deviceIdHash !== undefined && { deviceIdHash: state.deviceIdHash }),
          associatedIps: ipList,
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
 * Admin: Configure block rules and limits for an IP or device.
 */
export const adminSetRule = mutation({
  args: {
    adminSecret: v.string(),
    ip: v.string(),
    deviceIdHash: v.optional(v.string()),
    isBlocked: v.boolean(),
    customDailyLimit: v.optional(v.number()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.adminSecret !== process.env.ADMIN_SECRET) {
      throw new Error("Unauthorized: Invalid admin secret");
    }

    const existing = args.deviceIdHash
      ? await ctx.db
          .query("ipRules")
          .withIndex("by_deviceIdHash", (q) => q.eq("deviceIdHash", args.deviceIdHash!))
          .unique()
      : await ctx.db
          .query("ipRules")
          .withIndex("by_ip", (q) => q.eq("ip", args.ip))
          .unique();

    const now = Date.now();
    const payload = {
      ip: args.ip,
      deviceIdHash: args.deviceIdHash,
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
 * Admin: Reset today's token counter for an IP or device.
 */
export const adminResetIpTokens = mutation({
  args: {
    adminSecret: v.string(),
    ip: v.string(),
    deviceIdHash: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.adminSecret !== process.env.ADMIN_SECRET) {
      throw new Error("Unauthorized: Invalid admin secret");
    }

    const state = args.deviceIdHash
      ? await ctx.db
          .query("ipRateState")
          .withIndex("by_deviceIdHash", (q) => q.eq("deviceIdHash", args.deviceIdHash!))
          .unique()
      : await ctx.db
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
  args: { 
    creatorIpHash: v.string(),
    creatorDeviceIdHash: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ipRows = await ctx.db
      .query("generationJobs")
      .withIndex("by_creatorIpHash_createdAt", (q) => q.eq("creatorIpHash", args.creatorIpHash))
      .order("desc")
      .take(100);

    let deviceRows: Doc<"generationJobs">[] = [];
    if (args.creatorDeviceIdHash) {
      deviceRows = await ctx.db
        .query("generationJobs")
        .withIndex("by_creatorDeviceIdHash_createdAt", (q) => q.eq("creatorDeviceIdHash", args.creatorDeviceIdHash!))
        .order("desc")
        .take(100);
    }

    const mergedMap = new Map<string, Doc<"generationJobs">>();
    for (const r of [...ipRows, ...deviceRows]) {
      mergedMap.set(r._id, r);
    }
    const merged = Array.from(mergedMap.values());
    merged.sort((a, b) => b.createdAt - a.createdAt);

    return merged.filter((job) => job.status === "queued" || job.status === "running");
  },
});

export const listArchivedJobsByHash = query({
  args: { 
    creatorIpHash: v.string(), 
    creatorDeviceIdHash: v.optional(v.string()),
    limit: v.optional(v.number()) 
  },
  handler: async (ctx, args) => {
    const limit = Math.min(100, Math.max(1, Math.round(args.limit ?? 50)));
    const ipRows = await ctx.db
      .query("generationJobs")
      .withIndex("by_creatorIpHash_createdAt", (q) => q.eq("creatorIpHash", args.creatorIpHash))
      .order("desc")
      .take(limit * 3);

    let deviceRows: Doc<"generationJobs">[] = [];
    if (args.creatorDeviceIdHash) {
      deviceRows = await ctx.db
        .query("generationJobs")
        .withIndex("by_creatorDeviceIdHash_createdAt", (q) => q.eq("creatorDeviceIdHash", args.creatorDeviceIdHash!))
        .order("desc")
        .take(limit * 3);
    }

    const mergedMap = new Map<string, Doc<"generationJobs">>();
    for (const r of [...ipRows, ...deviceRows]) {
      mergedMap.set(r._id, r);
    }
    const merged = Array.from(mergedMap.values());
    merged.sort((a, b) => b.createdAt - a.createdAt);

    return merged
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
