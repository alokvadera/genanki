/**
 * Provider usage recording + aggregation — ported from src/convex/providerUsage.ts.
 */
import { and, desc, eq, gte, sql } from "drizzle-orm";

import { db } from "../db";
import { providerUsage } from "../db/schema";

const DAY_MS = 24 * 60 * 60 * 1000;

const PROVIDER_PRIORITY = new Map([
  ["groq", 0],
  ["cerebras", 1],
  ["kilo", 2],
  ["openrouter", 3],
  ["cloudflare", 4],
]);

export type UsageRecordInput = {
  provider: string;
  providerLabel: string;
  model: string;
  kind: "prompt" | "document";
  jobId?: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  ip?: string;
  createdAt?: number;
};

export async function recordUsageRow(args: UsageRecordInput): Promise<void> {
  await db.insert(providerUsage).values({
    provider: args.provider,
    providerLabel: args.providerLabel,
    model: args.model,
    kind: args.kind,
    jobId: args.jobId ?? null,
    promptTokens: Math.max(0, Math.round(args.promptTokens)),
    completionTokens: Math.max(0, Math.round(args.completionTokens)),
    totalTokens: Math.max(0, Math.round(args.totalTokens)),
    ip: args.ip ?? null,
    createdAt: args.createdAt ?? Date.now(),
  });
}

type ProviderStat = {
  provider: string;
  providerLabel: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  requests: number;
};

type ModelStat = ProviderStat & { model: string };

function priorityOf(provider: string): number {
  return PROVIDER_PRIORITY.get(provider) ?? 99;
}

/** Windowed summary aggregated in SQL (avoids loading the whole table). */
export async function usageSummary(daysBackRaw?: number) {
  const daysBack = Math.max(1, Math.min(365, Math.round(daysBackRaw ?? 30)));
  const since = Date.now() - daysBack * DAY_MS;

  const providerRows = await db
    .select({
      provider: providerUsage.provider,
      providerLabel: sql<string>`max(${providerUsage.providerLabel})`.as("provider_label"),
      promptTokens: sql<number>`coalesce(sum(${providerUsage.promptTokens}), 0)::bigint`.as("prompt_tokens"),
      completionTokens: sql<number>`coalesce(sum(${providerUsage.completionTokens}), 0)::bigint`.as("completion_tokens"),
      totalTokens: sql<number>`coalesce(sum(${providerUsage.totalTokens}), 0)::bigint`.as("total_tokens"),
      requests: sql<number>`count(*)::int`.as("requests"),
    })
    .from(providerUsage)
    .where(gte(providerUsage.createdAt, since))
    .groupBy(providerUsage.provider);

  const modelRows = await db
    .select({
      provider: providerUsage.provider,
      providerLabel: sql<string>`max(${providerUsage.providerLabel})`.as("provider_label"),
      model: providerUsage.model,
      promptTokens: sql<number>`coalesce(sum(${providerUsage.promptTokens}), 0)::bigint`.as("prompt_tokens"),
      completionTokens: sql<number>`coalesce(sum(${providerUsage.completionTokens}), 0)::bigint`.as("completion_tokens"),
      totalTokens: sql<number>`coalesce(sum(${providerUsage.totalTokens}), 0)::bigint`.as("total_tokens"),
      requests: sql<number>`count(*)::int`.as("requests"),
    })
    .from(providerUsage)
    .where(gte(providerUsage.createdAt, since))
    .groupBy(providerUsage.provider, providerUsage.model);

  const providers: ProviderStat[] = providerRows.map((r) => ({
    provider: r.provider,
    providerLabel: r.providerLabel,
    promptTokens: Number(r.promptTokens),
    completionTokens: Number(r.completionTokens),
    totalTokens: Number(r.totalTokens),
    requests: Number(r.requests),
  }));
  const models: ModelStat[] = modelRows.map((r) => ({
    provider: r.provider,
    providerLabel: r.providerLabel,
    model: r.model,
    promptTokens: Number(r.promptTokens),
    completionTokens: Number(r.completionTokens),
    totalTokens: Number(r.totalTokens),
    requests: Number(r.requests),
  }));

  providers.sort((a, b) => {
    const priorityDelta = priorityOf(a.provider) - priorityOf(b.provider);
    if (priorityDelta !== 0) return priorityDelta;
    return b.totalTokens - a.totalTokens;
  });
  models.sort((a, b) => {
    const priorityDelta = priorityOf(a.provider) - priorityOf(b.provider);
    if (priorityDelta !== 0) return priorityDelta;
    return b.totalTokens - a.totalTokens;
  });

  return {
    windowDays: daysBack,
    totalPromptTokens: providers.reduce((s, p) => s + p.promptTokens, 0),
    totalCompletionTokens: providers.reduce((s, p) => s + p.completionTokens, 0),
    totalTokens: providers.reduce((s, p) => s + p.totalTokens, 0),
    requests: providers.reduce((s, p) => s + p.requests, 0),
    providers,
    models,
  };
}

export async function usageByJob(jobId: string) {
  const rows = await db
    .select()
    .from(providerUsage)
    .where(eq(providerUsage.jobId, jobId))
    .orderBy(desc(providerUsage.createdAt));

  const providerMap = new Map<string, ProviderStat>();
  const modelMap = new Map<string, ModelStat>();

  for (const row of rows) {
    const pEntry = providerMap.get(row.provider) ?? {
      provider: row.provider,
      providerLabel: row.providerLabel,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      requests: 0,
    };
    pEntry.promptTokens += row.promptTokens;
    pEntry.completionTokens += row.completionTokens;
    pEntry.totalTokens += row.totalTokens;
    pEntry.requests += 1;
    providerMap.set(row.provider, pEntry);

    const modelKey = `${row.provider}:${row.model}`;
    const mEntry = modelMap.get(modelKey) ?? {
      provider: row.provider,
      providerLabel: row.providerLabel,
      model: row.model,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      requests: 0,
    };
    mEntry.promptTokens += row.promptTokens;
    mEntry.completionTokens += row.completionTokens;
    mEntry.totalTokens += row.totalTokens;
    mEntry.requests += 1;
    modelMap.set(modelKey, mEntry);
  }

  const providers = [...providerMap.values()].sort((a, b) => b.totalTokens - a.totalTokens);
  const models = [...modelMap.values()].sort((a, b) => b.totalTokens - a.totalTokens);

  return {
    totalPromptTokens: providers.reduce((s, p) => s + p.promptTokens, 0),
    totalCompletionTokens: providers.reduce((s, p) => s + p.completionTokens, 0),
    totalTokens: providers.reduce((s, p) => s + p.totalTokens, 0),
    requests: rows.length,
    providers,
    models,
    rows,
  };
}

export async function recentUsage(limitRaw?: number) {
  const limit = Math.min(50, Math.max(1, Math.round(limitRaw ?? 20)));
  return db.select().from(providerUsage).orderBy(desc(providerUsage.createdAt)).limit(limit);
}

/** Cleanup helper used by the maintenance sweep. */
export async function cleanupOldUsage(olderThanMs: number, batch = 200): Promise<number> {
  const cutoff = Date.now() - olderThanMs;
  const result = await db.execute(sql`
    WITH victims AS (
      SELECT id FROM provider_usage
      WHERE created_at < ${cutoff}
      ORDER BY created_at ASC
      LIMIT ${batch}
    )
    DELETE FROM provider_usage WHERE id IN (SELECT id FROM victims)
  `);
  return result.rowCount ?? 0;
}

export const _internalGuards = { and, eq };
