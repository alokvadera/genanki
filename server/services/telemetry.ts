/**
 * Generation telemetry — ported from src/convex/generationTelemetry.ts.
 */
import { desc, eq, gte, sql } from "drizzle-orm";

import { db } from "../db";
import { generationTelemetry } from "../db/schema";

export type TelemetryRecordInput = {
  event: string;
  jobId?: string;
  kind?: "prompt" | "document";
  provider?: string;
  model?: string;
  outcome?: string;
  requestedCount?: number;
  generatedCount?: number;
  duplicateCount?: number;
  sourceChars?: number;
  parseFailures?: number;
  durationMs?: number;
  tokensUsed?: number;
  metric?: number;
};

export async function recordTelemetry(args: TelemetryRecordInput): Promise<void> {
  await db.insert(generationTelemetry).values({
    event: args.event,
    jobId: args.jobId ?? null,
    kind: args.kind ?? null,
    provider: args.provider ?? null,
    model: args.model ?? null,
    outcome: args.outcome ?? null,
    requestedCount: args.requestedCount,
    generatedCount: args.generatedCount,
    duplicateCount: args.duplicateCount,
    sourceChars: args.sourceChars,
    parseFailures: args.parseFailures,
    durationMs: args.durationMs,
    tokensUsed: args.tokensUsed,
    metric: args.metric,
    createdAt: Date.now(),
  });
}

export async function telemetrySummary(daysBackRaw?: number) {
  const daysBack = Math.min(365, Math.max(1, Math.round(daysBackRaw ?? 30)));
  const since = Date.now() - daysBack * 24 * 60 * 60 * 1000;

  const eventRows = await db
    .select({
      event: generationTelemetry.event,
      count: sql<number>`count(*)::int`.as("count"),
      metricTotal: sql<number>`coalesce(sum(${generationTelemetry.metric}), 0)::float8`.as("metric_total"),
    })
    .from(generationTelemetry)
    .where(gte(generationTelemetry.createdAt, since))
    .groupBy(generationTelemetry.event);

  const totalsRows = await db
    .select({
      requested: sql<number>`coalesce(sum(${generationTelemetry.requestedCount}), 0)::bigint`.as("requested"),
      generated: sql<number>`coalesce(sum(${generationTelemetry.generatedCount}), 0)::bigint`.as("generated"),
      duplicates: sql<number>`coalesce(sum(${generationTelemetry.duplicateCount}), 0)::bigint`.as("duplicates"),
      sourceChars: sql<number>`coalesce(sum(${generationTelemetry.sourceChars}), 0)::bigint`.as("source_chars"),
      parseFailures: sql<number>`coalesce(sum(${generationTelemetry.parseFailures}), 0)::bigint`.as("parse_failures"),
      durationMs: sql<number>`coalesce(sum(${generationTelemetry.durationMs}), 0)::bigint`.as("duration_ms"),
      tokensUsed: sql<number>`coalesce(sum(${generationTelemetry.tokensUsed}), 0)::bigint`.as("tokens_used"),
      rows: sql<number>`count(*)::int`.as("rows"),
    })
    .from(generationTelemetry)
    .where(gte(generationTelemetry.createdAt, since));

  const totals = totalsRows[0]!;
  const byEvent = eventRows.map((r) => ({
    event: r.event,
    count: Number(r.count),
    metricTotal: Number(r.metricTotal),
  }));

  return {
    windowDays: daysBack,
    events: byEvent.sort((a, b) => b.count - a.count),
    requested: Number(totals.requested),
    generated: Number(totals.generated),
    duplicates: Number(totals.duplicates),
    sourceChars: Number(totals.sourceChars),
    parseFailures: Number(totals.parseFailures),
    durationMs: Number(totals.durationMs),
    tokensUsed: Number(totals.tokensUsed),
    rows: Number(totals.rows),
  };
}

export async function telemetryByJob(jobId: string) {
  return db
    .select()
    .from(generationTelemetry)
    .where(eq(generationTelemetry.jobId, jobId))
    .orderBy(desc(generationTelemetry.createdAt));
}

/** Cleanup helper used by the maintenance sweep. */
export async function cleanupOldTelemetry(olderThanMs: number, batch = 200): Promise<number> {
  const cutoff = Date.now() - olderThanMs;
  const result = await db.execute(sql`
    WITH victims AS (
      SELECT id FROM generation_telemetry
      WHERE created_at < ${cutoff}
      ORDER BY created_at ASC
      LIMIT ${batch}
    )
    DELETE FROM generation_telemetry WHERE id IN (SELECT id FROM victims)
  `);
  return result.rowCount ?? 0;
}
