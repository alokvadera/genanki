"use node";

/**
 * genanki API — Neon Function (Hono).
 *
 * Replaces the Convex backend: every previously public Convex
 * query/mutation/action is exposed as a REST route here. The client IP is
 * resolved from proxy headers (the equivalent of Convex
 * ctx.meta.getRequestMetadata()).
 */
import { Hono } from "hono";
import { cors } from "hono/cors";

import { getClientIp } from "./requestContext";
import { GenError, isGenError } from "./errors";
import { tryVerifyNeonAuthToken } from "./auth";
import { db, pool } from "./db";

import { createJob, cancelJob, getJob } from "./services/jobs";
import {
  providerStates,
  performanceSnapshot,
  getAdaptiveSettings,
  latestInsight,
  cloudflareBudget,
} from "./services/rateLimits";
import {
  adminLogin,
  adminLogout,
  adminValidateSession,
  adminListIps,
  adminSetRule,
  adminResetIpTokens,
  requireAdminSession,
} from "./services/ipRateLimiter";
import { usageSummary, usageByJob, recentUsage } from "./services/usage";
import { recordTelemetry, telemetrySummary, telemetryByJob } from "./services/telemetry";
import { catalogSummary, catalogLatestUpdatedAt } from "./services/catalog";
import { refreshProviderCatalog } from "./services/availableProviders";
import { getNetworkHealth } from "./services/optimus";
import { listActiveRuns, listArchivedRuns, getRunDetail } from "./services/decrypt";
import { generateDeckFromDocument, generateDeckFromPrompt } from "./deckGeneration";
import { startMaintenanceLoop } from "./services/maintenance";
import { hashIp } from "./encryption";
import { sql } from "drizzle-orm";

const app = new Hono();

// ---------------------------------------------------------------------------
// CORS — the SPA on Cloudflare Pages calls this function cross-origin.
// ---------------------------------------------------------------------------
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use("*", (c, next) => {
  const origin = c.req.header("origin");
  // Default to permissive during migration; lock down via ALLOWED_ORIGINS.
  const allowOrigin =
    allowedOrigins.length === 0
      ? origin ?? "*"
      : origin && allowedOrigins.includes(origin)
        ? origin
        : allowedOrigins[0]!;
  return cors({ origin: allowOrigin, allowHeaders: ["Content-Type", "Authorization"], maxAge: 86400 })(c, next);
});

// ---------------------------------------------------------------------------
// Error mapping — GenError taxonomy → HTTP status codes.
// ---------------------------------------------------------------------------
const STATUS_BY_KIND: Record<string, number> = {
  invalid_input: 400,
  forbidden: 403,
  not_found: 404,
  rate_limited: 429,
  deadline: 504,
  timeout: 504,
  canceled: 409,
};

app.onError((err, c) => {
  if (isGenError(err)) {
    const status = STATUS_BY_KIND[err.kind] ?? 500;
    return c.json({ error: err.message, kind: err.kind }, status as 400);
  }
  console.error("[api] unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

/** Helper: run a handler with the resolved client IP. */
function withIp<T>(c: any, fn: (ip: string) => Promise<T>): Promise<T> {
  return fn(getClientIp(c.req.raw));
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

app.get("/", (c) => c.json({ ok: true, service: "genanki-api" }));

app.get("/health", async (c) => {
  await pool.query("SELECT 1");
  return c.json({ ok: true, db: "up" });
});

// ---------------------------------------------------------------------------
// Generation jobs
// ---------------------------------------------------------------------------

const CreateJobBody = (body: Record<string, unknown>) => ({
  kind: body.kind as "prompt" | "document",
  requestedCount: Number(body.requestedCount),
  totalProviders: Number(body.totalProviders ?? 0),
  totalModels: Number(body.totalModels ?? 0),
  totalSections: Number(body.totalSections ?? 1),
  message: String(body.message ?? "Queued"),
  etaSeconds: Number(body.etaSeconds ?? 0),
  timeoutSeconds: Number(body.timeoutSeconds ?? 0),
  deadlineAt: Number(body.deadlineAt ?? Date.now()),
});

app.post("/api/jobs", async (c) => {
  const raw = await c.req.json<Record<string, unknown>>();
  const args = CreateJobBody(raw);
  if (args.kind !== "prompt" && args.kind !== "document") {
    throw new GenError("invalid_input", "kind must be 'prompt' or 'document'");
  }
  const jobId = await createJob(args);
  return c.json({ jobId }, 201);
});

app.post("/api/jobs/:jobId/cancel", async (c) => {
  await cancelJob(c.req.param("jobId"));
  return c.json({ ok: true });
});

app.get("/api/jobs/:jobId", async (c) => {
  return withIp(c, async (ip) => {
    const job = await getRunDetail(c.req.param("jobId"), ip, c.req.query("deviceToken") ?? undefined);
    if (!job) throw new GenError("not_found", "Job not found");
    return c.json(job);
  });
});

// Long-running generation (15-minute Function budget covers both endpoints)
app.post("/api/generate/document", async (c) => {
  return withIp(c, async (ip) => {
    const args = await c.req.json();
    const result = await generateDeckFromDocument({ ...args, ip });
    return c.json(result);
  });
});

app.post("/api/generate/prompt", async (c) => {
  return withIp(c, async (ip) => {
    const args = await c.req.json();
    const result = await generateDeckFromPrompt({ ...args, ip });
    return c.json(result);
  });
});

// Run history (zero-knowledge decrypt actions)
app.post("/api/runs/active", async (c) => {
  return withIp(c, async (ip) => {
    const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
    const jobs = await listActiveRuns(ip, (body.deviceToken as string) ?? undefined);
    return c.json(jobs);
  });
});

app.post("/api/runs/archived", async (c) => {
  return withIp(c, async (ip) => {
    const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
    const limit = body.limit !== undefined ? Number(body.limit) : undefined;
    const jobs = await listArchivedRuns(ip, limit, (body.deviceToken as string) ?? undefined);
    return c.json(jobs);
  });
});

// ---------------------------------------------------------------------------
// Rate limits / adaptive settings / budgets
// ---------------------------------------------------------------------------

app.get("/api/rate-limits/states", async (c) => c.json(await providerStates()));
app.get("/api/rate-limits/performance", async (c) => c.json(await performanceSnapshot()));
app.get("/api/rate-limits/adaptive-settings", async (c) => c.json(await getAdaptiveSettings()));
app.get("/api/rate-limits/latest-insight", async (c) => c.json(await latestInsight()));
app.get("/api/rate-limits/cloudflare-budget", async (c) => c.json(await cloudflareBudget()));

// ---------------------------------------------------------------------------
// Provider usage + telemetry
// ---------------------------------------------------------------------------

app.get("/api/usage/summary", async (c) => {
  const daysBack = c.req.query("daysBack");
  return c.json(await usageSummary(daysBack ? Number(daysBack) : undefined));
});

app.get("/api/usage/recent", async (c) => {
  const limit = c.req.query("limit");
  return c.json(await recentUsage(limit ? Number(limit) : undefined));
});

app.get("/api/usage/by-job/:jobId", async (c) => c.json(await usageByJob(c.req.param("jobId"))));

app.post("/api/telemetry", async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  await recordTelemetry({
    event: String(body.event ?? "unknown"),
    jobId: (body.jobId as string) ?? undefined,
    kind: body.kind === "document" ? "document" : body.kind === "prompt" ? "prompt" : undefined,
    provider: (body.provider as string) ?? undefined,
    model: (body.model as string) ?? undefined,
    outcome: (body.outcome as string) ?? undefined,
    requestedCount: body.requestedCount !== undefined ? Number(body.requestedCount) : undefined,
    generatedCount: body.generatedCount !== undefined ? Number(body.generatedCount) : undefined,
    duplicateCount: body.duplicateCount !== undefined ? Number(body.duplicateCount) : undefined,
    sourceChars: body.sourceChars !== undefined ? Number(body.sourceChars) : undefined,
    parseFailures: body.parseFailures !== undefined ? Number(body.parseFailures) : undefined,
    durationMs: body.durationMs !== undefined ? Number(body.durationMs) : undefined,
    tokensUsed: body.tokensUsed !== undefined ? Number(body.tokensUsed) : undefined,
    metric: body.metric !== undefined ? Number(body.metric) : undefined,
  });
  return c.json({ ok: true }, 201);
});

app.get("/api/telemetry/summary", async (c) => {
  const daysBack = c.req.query("daysBack");
  return c.json(await telemetrySummary(daysBack ? Number(daysBack) : undefined));
});

app.get("/api/telemetry/by-job/:jobId", async (c) => c.json(await telemetryByJob(c.req.param("jobId"))));

// ---------------------------------------------------------------------------
// Provider catalog
// ---------------------------------------------------------------------------

app.get("/api/providers/catalog", async (c) => c.json(await catalogSummary()));
app.get("/api/providers/latest-updated-at", async (c) => c.json(await catalogLatestUpdatedAt()));
app.post("/api/providers/refresh", async (c) => c.json(await refreshProviderCatalog()));

// ---------------------------------------------------------------------------
// Optimus
// ---------------------------------------------------------------------------

app.get("/api/optimus/health", async (c) => c.json(await getNetworkHealth()));

// ---------------------------------------------------------------------------
// IP admin console (admin passphrase → session token)
// ---------------------------------------------------------------------------

app.post("/api/admin/login", async (c) => {
  const { passphrase } = await c.req.json<{ passphrase: string }>();
  return c.json(await adminLogin(passphrase));
});

app.post("/api/admin/logout", async (c) => {
  const { adminToken } = await c.req.json<{ adminToken: string }>();
  await adminLogout(adminToken);
  return c.json({ ok: true });
});

app.post("/api/admin/validate-session", async (c) => {
  const { adminToken } = await c.req.json<{ adminToken: string }>();
  return c.json(await adminValidateSession(adminToken));
});

app.post("/api/admin/ips", async (c) => {
  const { adminToken } = await c.req.json<{ adminToken: string }>();
  await requireAdminSession(adminToken);
  return c.json(await adminListIps());
});

app.post("/api/admin/set-rule", async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  await requireAdminSession(String(body.adminToken ?? ""));
  await adminSetRule({
    ip: String(body.ip ?? ""),
    deviceIdHash: (body.deviceIdHash as string) ?? undefined,
    isBlocked: Boolean(body.isBlocked),
    customDailyLimit: body.customDailyLimit !== undefined ? Number(body.customDailyLimit) : undefined,
    note: (body.note as string) ?? undefined,
  });
  return c.json({ ok: true });
});

app.post("/api/admin/reset-ip-tokens", async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  await requireAdminSession(String(body.adminToken ?? ""));
  await adminResetIpTokens(String(body.ip ?? ""), (body.deviceIdHash as string) ?? undefined);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Neon Auth
// ---------------------------------------------------------------------------

app.get("/api/me", async (c) => {
  const identity = await tryVerifyNeonAuthToken(c.req.raw);
  if (!identity) return c.json({ user: null });
  const result = await pool.query(
    "select id, coalesce(name, '') as name, coalesce(email, '') as email, coalesce(role, 'user') as role from users where id = $1",
    [identity.userId],
  );
  return c.json({ user: result.rows[0] ?? { id: identity.userId, name: null, email: null, role: null } });
});

app.get("/api/me/ip", async (c) => {
  return withIp(c, async (ip) => c.json({ ip, ipHash: hashIp(ip) }));
});

/** Admin-only diagnostics: confirm DB visibility from the Function. */
app.get("/api/debug/tables", async (c) => {
  const identity = await tryVerifyNeonAuthToken(c.req.raw);
  if (!identity) return c.json({ error: "unauthorized" }, 401);
  const result = await db.execute(
    sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
  );
  return c.json({ tables: result.rows });
});

// Start the cron-equivalent maintenance loop once per isolate.
startMaintenanceLoop();

export default app;
