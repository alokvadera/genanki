/**
 * IP/device rate limiting + admin console services — ported from
 * src/convex/ipRateLimiter.ts.
 *
 * The admin passphrase is NEVER shipped to the client. Login verifies it
 * server-side (timing-safe) against process.env.ADMIN_SECRET and issues a
 * random session token; only the SHA-256 hash of that token is stored.
 */
import { desc, eq, isNotNull, lte, sql } from "drizzle-orm";

import { db } from "../db";
import { adminSessions, generationJobs, ipRateState, ipRules, providerUsage } from "../db/schema";
import { GenError } from "../errors";

const DEFAULT_DAILY_LIMIT = 50_000;
const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

export async function sha256Hex(input: string): Promise<string> {
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
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(8, "0"))
    .join("");
}

export async function verifyAdminPassphrase(passphrase: string): Promise<boolean> {
  const expected = process.env.ADMIN_SECRET;
  if (!expected) return false; // fail closed if the secret is not configured
  return timingSafeEqual(passphrase, expected);
}

async function findAdminSession(token: string) {
  const tokenHash = await sha256Hex(token);
  const rows = await db
    .select()
    .from(adminSessions)
    .where(eq(adminSessions.tokenHash, tokenHash))
    .limit(1);
  const session = rows[0];
  if (!session) return null;
  if (session.expiresAt <= Date.now()) return null; // expired — treated as missing
  return session;
}

export async function requireAdminSession(token: string): Promise<void> {
  const session = await findAdminSession(token);
  if (!session) {
    throw new GenError("forbidden", "Unauthorized: Invalid or expired admin session");
  }
}

/** Admin: verify the passphrase and issue a short-lived session token. */
export async function adminLogin(passphrase: string): Promise<{ token: string; expiresAt: number }> {
  const valid = await verifyAdminPassphrase(passphrase);
  if (!valid) {
    throw new GenError("forbidden", "Unauthorized: Invalid admin passphrase");
  }
  const token = generateSessionToken();
  const tokenHash = await sha256Hex(token);
  const now = Date.now();
  await db.insert(adminSessions).values({
    tokenHash,
    createdAt: now,
    expiresAt: now + ADMIN_SESSION_TTL_MS,
  });
  // Opportunistic cleanup of expired sessions so the table doesn't grow unbounded.
  await db.delete(adminSessions).where(lte(adminSessions.expiresAt, now));
  return { token, expiresAt: now + ADMIN_SESSION_TTL_MS };
}

/** Admin: invalidate a session token (logout). */
export async function adminLogout(adminToken: string): Promise<void> {
  const tokenHash = await sha256Hex(adminToken);
  await db.delete(adminSessions).where(eq(adminSessions.tokenHash, tokenHash));
}

/** Admin: check whether a session token is still valid. */
export async function adminValidateSession(adminToken: string): Promise<boolean> {
  return (await findAdminSession(adminToken)) !== null;
}

export function getDayWindowStart(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export type IpCheckResult =
  | { allowed: true; ip: string }
  | { allowed: false; reason: string; retryAfterSeconds: number };

/** Find the governing rule for a visitor: device hash first, then IP. */
async function findRule(ip: string, deviceIdHash?: string) {
  if (deviceIdHash) {
    const rows = await db
      .select()
      .from(ipRules)
      .where(eq(ipRules.deviceIdHash, deviceIdHash))
      .limit(1);
    if (rows[0]) return rows[0];
  }
  const rows = await db.select().from(ipRules).where(eq(ipRules.ip, ip)).limit(1);
  return rows[0] ?? null;
}

/** Find the budget state row for a visitor: device hash first, then IP. */
async function findState(ip: string, deviceIdHash?: string) {
  if (deviceIdHash) {
    const rows = await db
      .select()
      .from(ipRateState)
      .where(eq(ipRateState.deviceIdHash, deviceIdHash))
      .limit(1);
    if (rows[0]) return rows[0];
  }
  const rows = await db.select().from(ipRateState).where(eq(ipRateState.ip, ip)).limit(1);
  return rows[0] ?? null;
}

/**
 * Check whether the visitor is blocked or over their daily token budget, and
 * record the request if allowed. Serialized per-state-row via a transaction
 * so concurrent section calls cannot race the daily counter.
 */
export async function checkAndLogIp(
  ip: string,
  estimatedTokens: number,
  deviceIdHash?: string,
): Promise<IpCheckResult> {
  const now = Date.now();
  const dayWindowStart = getDayWindowStart(now);

  // 1. Check IP blocklist
  const rule = await findRule(ip, deviceIdHash);
  if (rule?.isBlocked) {
    return {
      allowed: false,
      reason: "This visitor has been blocked by the administrator.",
      retryAfterSeconds: 86400,
    };
  }

  return db.transaction(async (tx) => {
    const dailyLimit = rule?.customDailyLimit ?? DEFAULT_DAILY_LIMIT;

    // 2. Check/lock token budget state (device hash first, then IP)
    let state = null as typeof ipRateState.$inferSelect | null;
    if (deviceIdHash) {
      await tx.execute(sql`SELECT id FROM ip_rate_state WHERE device_id_hash = ${deviceIdHash} FOR UPDATE`);
      const rows = await tx.select().from(ipRateState).where(eq(ipRateState.deviceIdHash, deviceIdHash)).limit(1);
      if (rows[0]) state = rows[0];
    }
    if (!state) {
      await tx.execute(sql`SELECT id FROM ip_rate_state WHERE ip = ${ip} FOR UPDATE`);
      const rows = await tx.select().from(ipRateState).where(eq(ipRateState.ip, ip)).limit(1);
      if (rows[0]) state = rows[0];
    }

    // Capture as const so TS narrows below (isNewDay implies state was non-null).
    const existing = state;
    const isNewDay = existing === null || dayWindowStart > existing.dayWindowStart;
    const dayTokensUsed = isNewDay ? 0 : existing.dayTokensUsed;

    if (dayTokensUsed + estimatedTokens > dailyLimit) {
      const secondsUntilMidnight = Math.max(0, Math.ceil((dayWindowStart + 86400000 - now) / 1000));
      return {
        allowed: false as const,
        reason: `Daily token limit of ${dailyLimit.toLocaleString()} tokens reached.`,
        retryAfterSeconds: secondsUntilMidnight,
      };
    }

    // 3. Log/update request state
    const currentIps = existing?.associatedIps ? [...existing.associatedIps] : [ip];
    if (!currentIps.includes(ip)) currentIps.push(ip);

    const nextState = {
      deviceIdHash:
        deviceIdHash !== undefined ? deviceIdHash : (existing?.deviceIdHash ?? null),
      associatedIps: currentIps,
      ip,
      dayWindowStart: isNewDay ? dayWindowStart : existing.dayWindowStart,
      dayTokensUsed,
      totalTokensAllTime: existing?.totalTokensAllTime ?? 0,
      totalRequests: (existing?.totalRequests ?? 0) + 1,
      lastSeenAt: now,
      firstSeenAt: existing?.firstSeenAt ?? now,
      updatedAt: now,
    };

    if (state) {
      await tx.update(ipRateState).set(nextState).where(eq(ipRateState.id, state.id));
    } else {
      await tx.insert(ipRateState).values(nextState);
    }

    return { allowed: true as const, ip };
  });
}

/** Deduct consumed tokens from the visitor's daily/all-time budget. */
export async function deductIpTokens(
  ip: string,
  tokens: number,
  deviceIdHash?: string,
): Promise<void> {
  const delta = Math.max(0, Math.round(tokens));
  if (delta === 0) return;
  await db.transaction(async (tx) => {
    let state = null as typeof ipRateState.$inferSelect | null;
    if (deviceIdHash) {
      await tx.execute(sql`SELECT id FROM ip_rate_state WHERE device_id_hash = ${deviceIdHash} FOR UPDATE`);
      const rows = await tx.select().from(ipRateState).where(eq(ipRateState.deviceIdHash, deviceIdHash)).limit(1);
      if (rows[0]) state = rows[0];
    }
    if (!state) {
      await tx.execute(sql`SELECT id FROM ip_rate_state WHERE ip = ${ip} FOR UPDATE`);
      const rows = await tx.select().from(ipRateState).where(eq(ipRateState.ip, ip)).limit(1);
      if (rows[0]) state = rows[0];
    }
    if (!state) return;

    await tx
      .update(ipRateState)
      .set({
        dayTokensUsed: state.dayTokensUsed + delta,
        totalTokensAllTime: state.totalTokensAllTime + delta,
        updatedAt: Date.now(),
      })
      .where(eq(ipRateState.id, state.id));
  });
}

export type AdminIpRow = {
  ip: string;
  deviceIdHash?: string;
  associatedIps: string[];
  dayWindowStart: number;
  dayTokensUsed: number;
  totalTokensAllTime: number;
  totalRequests: number;
  lastSeenAt: number;
  firstSeenAt: number;
  isBlocked: boolean;
  customDailyLimit?: number;
  note: string;
  providersUsed: Array<{ label: string; tokens: number; requests: number }>;
  modelsUsed: Array<{ name: string; tokens: number; requests: number }>;
};

/** Admin: list all IPs with rate limits, rules, and aggregated provider/model usage. */
export async function adminListIps(): Promise<AdminIpRow[]> {
  const states = await db.select().from(ipRateState);
  const rules = await db.select().from(ipRules);
  const usageRecords = await db
    .select({
      provider: providerUsage.provider,
      providerLabel: providerUsage.providerLabel,
      model: providerUsage.model,
      totalTokens: providerUsage.totalTokens,
      ip: providerUsage.ip,
    })
    .from(providerUsage);

  // Group rules by deviceIdHash (fallback to raw ip)
  const deviceRulesMap = new Map(rules.filter((r) => r.deviceIdHash).map((r) => [r.deviceIdHash!, r]));
  const ipRulesMap = new Map(rules.filter((r) => !r.deviceIdHash).map((r) => [r.ip, r]));

  return states.map((state) => {
    const rule = (state.deviceIdHash && deviceRulesMap.get(state.deviceIdHash)) || ipRulesMap.get(state.ip);

    const ipList = state.associatedIps ?? [state.ip];
    const ipSet = new Set(ipList);
    const ipUsages = usageRecords.filter((u) => u.ip && ipSet.has(u.ip));

    const providerMap = new Map<string, { label: string; tokens: number; requests: number }>();
    const modelMap = new Map<string, { name: string; tokens: number; requests: number }>();

    for (const usage of ipUsages) {
      const pData = providerMap.get(usage.provider) ?? { label: usage.providerLabel, tokens: 0, requests: 0 };
      pData.tokens += usage.totalTokens;
      pData.requests += 1;
      providerMap.set(usage.provider, pData);

      const mKey = `${usage.provider}:${usage.model}`;
      const mData = modelMap.get(mKey) ?? { name: usage.model, tokens: 0, requests: 0 };
      mData.tokens += usage.totalTokens;
      mData.requests += 1;
      modelMap.set(mKey, mData);
    }

    return {
      ip: state.ip,
      ...(state.deviceIdHash !== undefined && state.deviceIdHash !== null
        ? { deviceIdHash: state.deviceIdHash }
        : {}),
      associatedIps: ipList,
      dayWindowStart: state.dayWindowStart,
      dayTokensUsed: state.dayTokensUsed,
      totalTokensAllTime: state.totalTokensAllTime,
      totalRequests: state.totalRequests,
      lastSeenAt: state.lastSeenAt,
      firstSeenAt: state.firstSeenAt,
      isBlocked: rule?.isBlocked ?? false,
      ...(rule?.customDailyLimit != null ? { customDailyLimit: rule.customDailyLimit } : {}),
      note: rule?.note ?? "",
      providersUsed: Array.from(providerMap.values()),
      modelsUsed: Array.from(modelMap.values()),
    };
  });
}

export type SetRuleInput = {
  ip: string;
  deviceIdHash?: string;
  isBlocked: boolean;
  customDailyLimit?: number;
  note?: string;
};

/** Admin: configure block rules and limits for an IP or device. */
export async function adminSetRule(args: SetRuleInput): Promise<void> {
  const now = Date.now();
  await db.transaction(async (tx) => {
    let existing = null as typeof ipRules.$inferSelect | null;
    if (args.deviceIdHash) {
      const rows = await tx
        .select()
        .from(ipRules)
        .where(eq(ipRules.deviceIdHash, args.deviceIdHash))
        .limit(1);
      existing = rows[0] ?? null;
    } else {
      const rows = await tx.select().from(ipRules).where(eq(ipRules.ip, args.ip)).limit(1);
      existing = rows[0] ?? null;
    }

    const payload = {
      ip: args.ip,
      deviceIdHash: args.deviceIdHash ?? null,
      isBlocked: args.isBlocked,
      customDailyLimit: args.customDailyLimit ?? null,
      note: args.note ?? null,
      updatedAt: now,
    };

    if (existing) {
      await tx.update(ipRules).set(payload).where(eq(ipRules.id, existing.id));
    } else {
      await tx.insert(ipRules).values({ ...payload, createdAt: now });
    }
  });
}

/** Admin: reset today's token counter for an IP or device. */
export async function adminResetIpTokens(ip: string, deviceIdHash?: string): Promise<void> {
  await db.transaction(async (tx) => {
    let state = null as typeof ipRateState.$inferSelect | null;
    if (deviceIdHash) {
      const rows = await tx.select().from(ipRateState).where(eq(ipRateState.deviceIdHash, deviceIdHash)).limit(1);
      state = rows[0] ?? null;
    } else {
      const rows = await tx.select().from(ipRateState).where(eq(ipRateState.ip, ip)).limit(1);
      state = rows[0] ?? null;
    }
    if (state) {
      await tx
        .update(ipRateState)
        .set({ dayTokensUsed: 0, updatedAt: Date.now() })
        .where(eq(ipRateState.id, state.id));
    }
  });
}

/** Internal: fetch a job for the decrypt actions (server-side only callers). */
export async function getJobByIdForDecrypt(jobId: string) {
  const rows = await db.select().from(generationJobs).where(eq(generationJobs.id, jobId)).limit(1);
  return rows[0] ?? null;
}

/** Cleanup helper used by the maintenance sweep. */
export async function cleanupStaleIpState(olderThanMs: number, batch = 200): Promise<number> {
  const cutoff = Date.now() - olderThanMs;
  const result = await db.execute(sql`
    WITH victims AS (
      SELECT id FROM ip_rate_state
      WHERE last_seen_at < ${cutoff}
      ORDER BY last_seen_at ASC
      LIMIT ${batch}
    )
    DELETE FROM ip_rate_state WHERE id IN (SELECT id FROM victims)
  `);
  return result.rowCount ?? 0;
}

/** Latest N most-recently-seen states — kept for parity with old internal query. */
export async function recentIpStates(limit = 100) {
  return db
    .select()
    .from(ipRateState)
    .where(isNotNull(ipRateState.lastSeenAt))
    .orderBy(desc(ipRateState.lastSeenAt))
    .limit(limit);
}
