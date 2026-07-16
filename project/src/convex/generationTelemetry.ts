import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const telemetryArgs = {
  event: v.string(),
  jobId: v.optional(v.id("generationJobs")),
  kind: v.optional(v.union(v.literal("prompt"), v.literal("document"))),
  requestedCount: v.optional(v.number()),
  generatedCount: v.optional(v.number()),
  duplicateCount: v.optional(v.number()),
  sourceChars: v.optional(v.number()),
  parseFailures: v.optional(v.number()),
  durationMs: v.optional(v.number()),
  tokensUsed: v.optional(v.number()),
  metric: v.optional(v.number()),
};

export const record = mutation({
  args: telemetryArgs,
  handler: async (ctx, args) => {
    await ctx.db.insert("generationTelemetry", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const summary = query({
  args: { daysBack: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const daysBack = Math.min(365, Math.max(1, Math.round(args.daysBack ?? 30)));
    const since = Date.now() - daysBack * 24 * 60 * 60 * 1000;
    const rows = (await ctx.db
      .query("generationTelemetry")
      .withIndex("by_createdAt")
      .order("desc")
      .collect()).filter((row) => row.createdAt >= since);

    const byEvent = new Map<string, { event: string; count: number; metricTotal: number }>();
    let requested = 0;
    let generated = 0;
    let duplicates = 0;
    let sourceChars = 0;
    let parseFailures = 0;
    let durationMs = 0;
    let tokensUsed = 0;

    for (const row of rows) {
      const event = byEvent.get(row.event) ?? { event: row.event, count: 0, metricTotal: 0 };
      event.count += 1;
      event.metricTotal += row.metric ?? 0;
      byEvent.set(row.event, event);
      requested += row.requestedCount ?? 0;
      generated += row.generatedCount ?? 0;
      duplicates += row.duplicateCount ?? 0;
      sourceChars += row.sourceChars ?? 0;
      parseFailures += row.parseFailures ?? 0;
      durationMs += row.durationMs ?? 0;
      tokensUsed += row.tokensUsed ?? 0;
    }

    return {
      windowDays: daysBack,
      events: [...byEvent.values()].sort((a, b) => b.count - a.count),
      requested,
      generated,
      duplicates,
      sourceChars,
      parseFailures,
      durationMs,
      tokensUsed,
      rows: rows.length,
    };
  },
});

export const byJob = query({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("generationTelemetry")
      .withIndex("by_jobId_createdAt", (q) => q.eq("jobId", args.jobId))
      .order("desc")
      .collect();
  },
});
