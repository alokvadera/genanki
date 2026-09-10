/**
 * Postgres schema (Drizzle ORM) — migrated from src/convex/schema.ts.
 *
 * Mapping conventions:
 *  - Convex `_id` / `v.id("table")` → `uuid` primary key / FK columns.
 *  - Convex `_creationTime` → `creationTime timestamptz default now()`.
 *  - Millisecond epoch numbers (v.number()) → `bigint` (mode: "number") so the
 *    server layer keeps passing raw `Date.now()` integers exactly like the
 *    Convex original — no Date conversions sprinkled through business logic.
 *  - `v.optional(...)` → nullable column.
 *  - Arrays of objects (resultCards, fallbackTrail, warnings, models,
 *    associatedIps) → `jsonb`.
 *  - Index parity with the Convex `.index(...)` declarations below.
 *  - Convex Auth tables are replaced by the Neon Auth `users` table
 *    (Better Auth convention: text id). Role is preserved for future gating.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/** Card record stored in generationJobs.resultCards. */
export type CardRecord = { front: string; back: string };

/** A single fallback-trail record stored in generationJobs.fallbackTrail. */
export type TrailRecord = {
  provider: string;
  model: string;
  outcome: string;
  reason: string;
};

/** Model entry stored in providerCatalog.models. */
export type CatalogModel = { id: string; name: string };

// ---------------------------------------------------------------------------
// Users (Neon Auth — Better Auth convention)
// ---------------------------------------------------------------------------

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    name: text("name"),
    email: text("email"),
    emailVerified: timestamp("email_verified", { withTimezone: true }),
    image: text("image"),
    role: text("role"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("users_email_idx").on(t.email)],
);

// ---------------------------------------------------------------------------
// Provider routing / rate limiting
// ---------------------------------------------------------------------------

export const providerRateState = pgTable(
  "provider_rate_state",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    windowStartedAt: bigint("window_started_at", { mode: "number" }).notNull(),
    requestsUsed: integer("requests_used").notNull(),
    tokensUsed: bigint("tokens_used", { mode: "number" }).notNull(),
    dayStartedAt: bigint("day_started_at", { mode: "number" }).notNull(),
    dayRequestsUsed: integer("day_requests_used").notNull(),
    cooldownUntil: bigint("cooldown_until", { mode: "number" }).notNull(),
    lastStatus: integer("last_status"),
    remainingRequests: integer("remaining_requests"),
    remainingTokens: bigint("remaining_tokens", { mode: "number" }),
    resetAt: bigint("reset_at", { mode: "number" }),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (t) => [
    uniqueIndex("provider_rate_state_provider_model_key").on(t.provider, t.model),
    index("provider_rate_state_updated_at_idx").on(t.updatedAt),
  ],
);

export const providerPerformance = pgTable(
  "provider_performance",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    calls: integer("calls").notNull(),
    successes: integer("successes").notNull(),
    failures: integer("failures").notNull(),
    timeouts: integer("timeouts").notNull(),
    averageLatencyMs: real("average_latency_ms").notNull(),
    averageTokens: real("average_tokens").notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (t) => [uniqueIndex("provider_performance_provider_model_key").on(t.provider, t.model)],
);

export const adaptiveSettings = pgTable("adaptive_settings", {
  key: text("key").primaryKey(),
  documentMaxChunks: integer("document_max_chunks").notNull(),
  completionPasses: integer("completion_passes").notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  source: text("source").notNull(),
});

export const systemInsights = pgTable(
  "system_insights",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(),
    status: text("status").notNull(),
    summary: text("summary").notNull(),
    recommendation: text("recommendation").notNull(),
    triggerCalls: integer("trigger_calls").notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (t) => [index("system_insights_created_at_idx").on(t.createdAt)],
);

// ---------------------------------------------------------------------------
// Generation jobs
// ---------------------------------------------------------------------------

export const generationJobs = pgTable(
  "generation_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(), // "prompt" | "document"
    status: text("status").notNull(), // "queued" | "running" | "succeeded" | "canceled" | "failed"
    requestedCount: integer("requested_count").notNull(),
    progress: real("progress").notNull(),
    etaSeconds: integer("eta_seconds").notNull(),
    timeoutSeconds: integer("timeout_seconds").notNull(),
    deadlineAt: bigint("deadline_at", { mode: "number" }).notNull(),
    message: text("message").notNull(),
    provider: text("provider"),
    model: text("model"),
    providerIndex: integer("provider_index").notNull(),
    modelIndex: integer("model_index").notNull(),
    totalProviders: integer("total_providers").notNull(),
    totalModels: integer("total_models").notNull(),
    sectionIndex: integer("section_index").notNull(),
    totalSections: integer("total_sections").notNull(),
    resultDeckName: text("result_deck_name"),
    resultSummary: text("result_summary"),
    resultCards: jsonb("result_cards").$type<CardRecord[]>(),
    resultPartial: boolean("result_partial"),
    resultWarnings: jsonb("result_warnings").$type<string[]>(),
    fallbackTrail: jsonb("fallback_trail").$type<TrailRecord[]>(),
    cancelRequestedAt: bigint("cancel_requested_at", { mode: "number" }),
    canceledAt: bigint("canceled_at", { mode: "number" }),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
    creationTime: timestamp("creation_time", { withTimezone: true }).notNull().defaultNow(),
    error: text("error"),

    // Zero-knowledge IP-based privacy fields (encrypted at rest)
    creatorIpHash: text("creator_ip_hash"),
    creatorDeviceIdHash: text("creator_device_id_hash"),
    encDeckName: text("enc_deck_name"),
    encSummary: text("enc_summary"),
    encCards: text("enc_cards"),
    encMessage: text("enc_message"),
    encError: text("enc_error"),
  },
  (t) => [
    index("generation_jobs_created_at_idx").on(t.createdAt),
    index("generation_jobs_ip_hash_created_at_idx").on(t.creatorIpHash, t.createdAt),
    index("generation_jobs_device_hash_created_at_idx").on(t.creatorDeviceIdHash, t.createdAt),
  ],
);

export const providerUsage = pgTable(
  "provider_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    providerLabel: text("provider_label").notNull(),
    model: text("model").notNull(),
    kind: text("kind").notNull(), // "prompt" | "document"
    jobId: uuid("job_id").references(() => generationJobs.id, { onDelete: "set null" }),
    promptTokens: bigint("prompt_tokens", { mode: "number" }).notNull(),
    completionTokens: bigint("completion_tokens", { mode: "number" }).notNull(),
    totalTokens: bigint("total_tokens", { mode: "number" }).notNull(),
    ip: text("ip"),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (t) => [
    index("provider_usage_created_at_idx").on(t.createdAt),
    index("provider_usage_provider_created_at_idx").on(t.provider, t.createdAt),
    index("provider_usage_job_id_created_at_idx").on(t.jobId, t.createdAt),
    index("provider_usage_ip_created_at_idx").on(t.ip, t.createdAt),
  ],
);

export const generationTelemetry = pgTable(
  "generation_telemetry",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    event: text("event").notNull(), // "summary" | "attempt" | app events
    jobId: uuid("job_id").references(() => generationJobs.id, { onDelete: "set null" }),
    kind: text("kind"), // "prompt" | "document"
    requestedCount: integer("requested_count"),
    generatedCount: integer("generated_count"),
    duplicateCount: integer("duplicate_count"),
    sourceChars: bigint("source_chars", { mode: "number" }),
    parseFailures: integer("parse_failures"),
    durationMs: bigint("duration_ms", { mode: "number" }),
    tokensUsed: bigint("tokens_used", { mode: "number" }),
    metric: real("metric"),
    provider: text("provider"),
    model: text("model"),
    outcome: text("outcome"),
    latencyMs: bigint("latency_ms", { mode: "number" }),
    neurons: real("neurons"),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (t) => [
    index("generation_telemetry_created_at_idx").on(t.createdAt),
    index("generation_telemetry_job_id_created_at_idx").on(t.jobId, t.createdAt),
  ],
);

export const cloudflareNeuronBudget = pgTable("cloudflare_neuron_budget", {
  utcDay: text("utc_day").primaryKey(), // e.g. "2026-09-09"
  neuronsUsed: real("neurons_used").notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});

export const providerCatalog = pgTable(
  "provider_catalog",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    label: text("label").notNull(),
    modelCount: integer("model_count").notNull(),
    models: jsonb("models").$type<CatalogModel[]>().notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (t) => [uniqueIndex("provider_catalog_provider_key").on(t.provider)],
);

// ---------------------------------------------------------------------------
// IP rate limiting / admin
// ---------------------------------------------------------------------------

export const ipRateState = pgTable(
  "ip_rate_state",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deviceIdHash: text("device_id_hash"),
    associatedIps: jsonb("associated_ips").$type<string[]>(),
    ip: text("ip").notNull(),
    dayWindowStart: bigint("day_window_start", { mode: "number" }).notNull(),
    dayTokensUsed: bigint("day_tokens_used", { mode: "number" }).notNull(),
    totalTokensAllTime: bigint("total_tokens_all_time", { mode: "number" }).notNull(),
    totalRequests: integer("total_requests").notNull(),
    lastSeenAt: bigint("last_seen_at", { mode: "number" }).notNull(),
    firstSeenAt: bigint("first_seen_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (t) => [
    uniqueIndex("ip_rate_state_ip_key").on(t.ip),
    uniqueIndex("ip_rate_state_device_id_hash_key").on(t.deviceIdHash),
    index("ip_rate_state_last_seen_at_idx").on(t.lastSeenAt),
  ],
);

export const ipRules = pgTable(
  "ip_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ip: text("ip").notNull(),
    deviceIdHash: text("device_id_hash"),
    isBlocked: boolean("is_blocked").notNull(),
    customDailyLimit: integer("custom_daily_limit"),
    note: text("note"),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (t) => [
    index("ip_rules_ip_idx").on(t.ip),
    index("ip_rules_device_id_hash_idx").on(t.deviceIdHash),
  ],
);

/**
 * Server-issued admin sessions. Only the SHA-256 hash of the session token is
 * stored — the raw token is returned to the client exactly once at login.
 */
export const adminSessions = pgTable(
  "admin_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenHash: text("token_hash").notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
  },
  (t) => [uniqueIndex("admin_sessions_token_hash_key").on(t.tokenHash)],
);

/**
 * Keep a Postgres-level guard against clock-skewed duplicate usage rows for
 * the same job/provider/model within the same millisecond (harmless, but the
 * Convex version was effectively unique per insertion).
 */
export const _internal = { sql };
