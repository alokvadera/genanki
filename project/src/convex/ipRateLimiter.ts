import { v } from "convex/values";
import {
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { GenError } from "./errors";

const DEFAULT_DAILY_LIMIT = 50_000;

// ---------------------------------------------------------------------------
// Admin session auth
//
// The admin passphrase is NEVER shipped to the client. Login verifies it
// server-side (timing-safe) against process.env.ADMIN_SECRET and issues a
// random session token; only the SHA-256 hash of that token is stored in
// Convex. All admin functions then authenticate via the token, not the
// passphrase, so the passphrase never leaves the login call.
// ---------------------------------------------------------------------------

const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Timing-safe comparison of two secrets: hashes both sides with SHA-256
 * (equalizing length) then XOR-compares the digests in constant time.
 */
export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([sha256Hex(a), sha256Hex(b)]);
  if (ha.length !== hb.length) return false;
  let diff = 0;
  for (let i = 0; i < ha.length; i++) {
    diff |= ha.charCodeAt(i) ^ hb.charCodeAt(i);
  }
  return diff === 0;
}

export function generateSessionToken(): string {
  const bytes = new Uint32Array(8); // 256 bits
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(8, "0")).join("");
}

export async function verifyAdminPassphrase(passphrase: string): Promise<boolean> {
  const expected = process.env.ADMIN_SECRET;
  if (!expected) return false; // fail closed if the secret is not configured
  return timingSafeEqual(passphrase, expected);
}

async function findAdminSession(
  ctx: QueryCtx | MutationCtx,
  token: string,
): Promise<Doc<"adminSessions"> | null> {
  const tokenHash = await sha256Hex(token);
  const session = await ctx.db
    .query("adminSessions")
    .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
    .unique();
  if (!session) return null;
  if (session.expiresAt <= Date.now()) return null; // expired — treated as missing
  return session;
}

async function requireAdminSession(ctx: QueryCtx | MutationCtx, token: string): Promise<void> {
  const session = await findAdminSession(ctx, token);
  if (!session) {
    throw new GenError("forbidden", "Unauthorized: Invalid or expired admin session");
  }
}

/**
 * Admin: Verify the passphrase and issue a short-lived session token.
 * The token is returned once; only its hash is persisted.
 */
export const adminLogin = mutation({
  args: { passphrase: v.string() },
  handler: async (ctx, args) => {
    const valid = await verifyAdminPassphrase(args.passphrase);
    if (!valid) {
      throw new GenError("forbidden", "Unauthorized: Invalid admin passphrase");
    }
    const token = generateSessionToken();
    const tokenHash = await sha256Hex(token);
    const now = Date.now();
    await ctx.db.insert("adminSessions", {
      tokenHash,
      createdAt: now,
      expiresAt: now + ADMIN_SESSION_TTL_MS,
    });
    // Opportunistic cleanup of expired sessions so the table doesn't grow unbounded.
    const expired = await ctx.db.query("adminSessions").collect();
    for (const session of expired) {
      if (session.expiresAt <= now) {
        await ctx.db.delete(session._id);
      }
    }
    return { token, expiresAt: now + ADMIN_SESSION_TTL_MS };
  },
});

/** Admin: Invalidate a session token (logout). */
export const adminLogout = mutation({
  args: { adminToken: v.string() },
  handler: async (ctx, args) => {
    const tokenHash = await sha256Hex(args.adminToken);
    const session = await ctx.db
      .query("adminSessions")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    if (session) {
      await ctx.db.delete(session._id);
    }
  },
});

/** Admin: Check whether a session token is still valid. */
export const adminValidateSession = query({
  args: { adminToken: v.string() },
  handler: async (ctx, args) => {
    return (await findAdminSession(ctx, args.adminToken)) !== null;
  },
});

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
  args: { adminToken: v.string() },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.adminToken);

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
    adminToken: v.string(),
    ip: v.string(),
    deviceIdHash: v.optional(v.string()),
    isBlocked: v.boolean(),
    customDailyLimit: v.optional(v.number()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.adminToken);

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
    adminToken: v.string(),
    ip: v.string(),
    deviceIdHash: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.adminToken);

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
 * Internal Queries used by Actions — deliberately NOT client-callable.
 * Exposing these publicly would let anyone enumerate another visitor's
 * generation jobs by hashing known IPs (IDOR).
 */
export const listActiveJobsByHash = internalQuery({
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

export const listArchivedJobsByHash = internalQuery({
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

export const getJobById = internalQuery({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.jobId);
  },
});
