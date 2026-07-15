import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const create = mutation({
  args: {
    kind: v.union(v.literal("prompt"), v.literal("document")),
    requestedCount: v.number(),
    totalProviders: v.number(),
    totalModels: v.number(),
    totalSections: v.number(),
    message: v.string(),
    etaSeconds: v.number(),
    timeoutSeconds: v.number(),
    deadlineAt: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("generationJobs", {
      kind: args.kind,
      status: "queued",
      requestedCount: args.requestedCount,
      progress: 0,
      etaSeconds: args.etaSeconds,
      timeoutSeconds: args.timeoutSeconds,
      deadlineAt: args.deadlineAt,
      message: args.message,
      provider: undefined,
      model: undefined,
      providerIndex: 0,
      modelIndex: 0,
      totalProviders: args.totalProviders,
      totalModels: args.totalModels,
      sectionIndex: 0,
      totalSections: args.totalSections,
      resultDeckName: undefined,
      resultSummary: undefined,
      resultCards: undefined,
      resultPartial: undefined,
      resultWarnings: undefined,
      cancelRequestedAt: undefined,
      canceledAt: undefined,
      createdAt: now,
      updatedAt: now,
      error: undefined,
    });
  },
});

export const update = mutation({
  args: {
    jobId: v.id("generationJobs"),
    status: v.optional(
      v.union(
        v.literal("queued"),
        v.literal("running"),
        v.literal("succeeded"),
        v.literal("canceled"),
        v.literal("failed"),
      ),
    ),
    progress: v.optional(v.number()),
    etaSeconds: v.optional(v.number()),
    timeoutSeconds: v.optional(v.number()),
    deadlineAt: v.optional(v.number()),
    message: v.optional(v.string()),
    provider: v.optional(v.string()),
    model: v.optional(v.string()),
    providerIndex: v.optional(v.number()),
    modelIndex: v.optional(v.number()),
    totalProviders: v.optional(v.number()),
    totalModels: v.optional(v.number()),
    sectionIndex: v.optional(v.number()),
    totalSections: v.optional(v.number()),
    resultDeckName: v.optional(v.string()),
    resultSummary: v.optional(v.string()),
    resultCards: v.optional(v.array(v.object({ front: v.string(), back: v.string() }))),
    resultPartial: v.optional(v.boolean()),
    resultWarnings: v.optional(v.array(v.string())),
    cancelRequestedAt: v.optional(v.number()),
    canceledAt: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.status !== undefined) patch.status = args.status;
    if (args.progress !== undefined) patch.progress = args.progress;
    if (args.etaSeconds !== undefined) patch.etaSeconds = args.etaSeconds;
    if (args.timeoutSeconds !== undefined) patch.timeoutSeconds = args.timeoutSeconds;
    if (args.deadlineAt !== undefined) patch.deadlineAt = args.deadlineAt;
    if (args.message !== undefined) patch.message = args.message;
    if (args.provider !== undefined) patch.provider = args.provider;
    if (args.model !== undefined) patch.model = args.model;
    if (args.providerIndex !== undefined) patch.providerIndex = args.providerIndex;
    if (args.modelIndex !== undefined) patch.modelIndex = args.modelIndex;
    if (args.totalProviders !== undefined) patch.totalProviders = args.totalProviders;
    if (args.totalModels !== undefined) patch.totalModels = args.totalModels;
    if (args.sectionIndex !== undefined) patch.sectionIndex = args.sectionIndex;
    if (args.totalSections !== undefined) patch.totalSections = args.totalSections;
    if (args.resultDeckName !== undefined) patch.resultDeckName = args.resultDeckName;
    if (args.resultSummary !== undefined) patch.resultSummary = args.resultSummary;
    if (args.resultCards !== undefined) patch.resultCards = args.resultCards;
    if (args.resultPartial !== undefined) patch.resultPartial = args.resultPartial;
    if (args.resultWarnings !== undefined) patch.resultWarnings = args.resultWarnings;
    if (args.cancelRequestedAt !== undefined) patch.cancelRequestedAt = args.cancelRequestedAt;
    if (args.canceledAt !== undefined) patch.canceledAt = args.canceledAt;
    if (args.error !== undefined) patch.error = args.error;
    await ctx.db.patch(args.jobId, patch);
  },
});

export const cancel = mutation({
  args: {
    jobId: v.id("generationJobs"),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return;
    const now = Date.now();
    await ctx.db.patch(args.jobId, {
      status: job.status === "succeeded" ? "succeeded" : "canceled",
      cancelRequestedAt: now,
      canceledAt: now,
      updatedAt: now,
      message: job.status === "succeeded" ? job.message : "Generation canceled",
    });
  },
});

export const get = query({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.jobId);
  },
});

export const listRecent = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(20, Math.max(1, Math.round(args.limit ?? 8)));
    return await ctx.db
      .query("generationJobs")
      .withIndex("by_createdAt")
      .order("desc")
      .take(limit);
  },
});
