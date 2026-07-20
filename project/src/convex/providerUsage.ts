import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const DAY_MS = 24 * 60 * 60 * 1000;
const PROVIDER_PRIORITY = new Map([
  ["groq", 0],
  ["cerebras", 1],
  ["kilo", 2],
  ["openrouter", 3],
  ["cloudflare", 4],
]);

export const record = mutation({
  args: {
    provider: v.string(),
    providerLabel: v.string(),
    model: v.string(),
    kind: v.union(v.literal("prompt"), v.literal("document")),
    jobId: v.optional(v.id("generationJobs")),
    promptTokens: v.number(),
    completionTokens: v.number(),
    totalTokens: v.number(),
    ip: v.optional(v.string()),
    createdAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("providerUsage", {
      provider: args.provider,
      providerLabel: args.providerLabel,
      model: args.model,
      kind: args.kind,
      jobId: args.jobId,
      promptTokens: Math.max(0, Math.round(args.promptTokens)),
      completionTokens: Math.max(0, Math.round(args.completionTokens)),
      totalTokens: Math.max(0, Math.round(args.totalTokens)),
      ip: args.ip,
      createdAt: args.createdAt ?? Date.now(),
    });
  },
});

export const summary = query({
  args: {
    daysBack: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const daysBack = Math.max(1, Math.min(365, Math.round(args.daysBack ?? 30)));
    const since = Date.now() - daysBack * DAY_MS;
    const rows = (await ctx.db
      .query("providerUsage")
      .withIndex("by_createdAt")
      .order("desc")
      .collect()).filter((row) => row.createdAt >= since);

    const providerMap = new Map<
      string,
      {
        provider: string;
        providerLabel: string;
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
        requests: number;
      }
    >();

    const modelMap = new Map<
      string,
      {
        provider: string;
        providerLabel: string;
        model: string;
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
        requests: number;
      }
    >();

    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalTokens = 0;
    let requests = 0;

    for (const row of rows) {
      requests += 1;
      totalPromptTokens += row.promptTokens;
      totalCompletionTokens += row.completionTokens;
      totalTokens += row.totalTokens;

      const providerEntry = providerMap.get(row.provider) ?? {
        provider: row.provider,
        providerLabel: row.providerLabel,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        requests: 0,
      };
      providerEntry.promptTokens += row.promptTokens;
      providerEntry.completionTokens += row.completionTokens;
      providerEntry.totalTokens += row.totalTokens;
      providerEntry.requests += 1;
      providerMap.set(row.provider, providerEntry);

      const modelKey = `${row.provider}:${row.model}`;
      const modelEntry = modelMap.get(modelKey) ?? {
        provider: row.provider,
        providerLabel: row.providerLabel,
        model: row.model,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        requests: 0,
      };
      modelEntry.promptTokens += row.promptTokens;
      modelEntry.completionTokens += row.completionTokens;
      modelEntry.totalTokens += row.totalTokens;
      modelEntry.requests += 1;
      modelMap.set(modelKey, modelEntry);
    }

    const providers = [...providerMap.values()].sort((a, b) => {
      const priorityDelta =
        (PROVIDER_PRIORITY.get(a.provider) ?? 99) - (PROVIDER_PRIORITY.get(b.provider) ?? 99);
      if (priorityDelta !== 0) return priorityDelta;
      return b.totalTokens - a.totalTokens;
    });
    const models = [...modelMap.values()].sort((a, b) => {
      const priorityDelta =
        (PROVIDER_PRIORITY.get(a.provider) ?? 99) - (PROVIDER_PRIORITY.get(b.provider) ?? 99);
      if (priorityDelta !== 0) return priorityDelta;
      return b.totalTokens - a.totalTokens;
    });

    return {
      windowDays: daysBack,
      totalPromptTokens,
      totalCompletionTokens,
      totalTokens,
      requests,
      providers,
      models,
    };
  },
});

export const byJob = query({
  args: {
    jobId: v.id("generationJobs"),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("providerUsage")
      .withIndex("by_jobId_createdAt", (q) => q.eq("jobId", args.jobId))
      .order("desc")
      .collect();

    const providerMap = new Map<
      string,
      {
        provider: string;
        providerLabel: string;
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
        requests: number;
      }
    >();

    const modelMap = new Map<
      string,
      {
        provider: string;
        providerLabel: string;
        model: string;
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
        requests: number;
      }
    >();

    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalTokens = 0;
    let requests = 0;

    for (const row of rows) {
      requests += 1;
      totalPromptTokens += row.promptTokens;
      totalCompletionTokens += row.completionTokens;
      totalTokens += row.totalTokens;

      const providerEntry = providerMap.get(row.provider) ?? {
        provider: row.provider,
        providerLabel: row.providerLabel,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        requests: 0,
      };
      providerEntry.promptTokens += row.promptTokens;
      providerEntry.completionTokens += row.completionTokens;
      providerEntry.totalTokens += row.totalTokens;
      providerEntry.requests += 1;
      providerMap.set(row.provider, providerEntry);

      const modelKey = `${row.provider}:${row.model}`;
      const modelEntry = modelMap.get(modelKey) ?? {
        provider: row.provider,
        providerLabel: row.providerLabel,
        model: row.model,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        requests: 0,
      };
      modelEntry.promptTokens += row.promptTokens;
      modelEntry.completionTokens += row.completionTokens;
      modelEntry.totalTokens += row.totalTokens;
      modelEntry.requests += 1;
      modelMap.set(modelKey, modelEntry);
    }

    const providers = [...providerMap.values()].sort((a, b) => b.totalTokens - a.totalTokens);
    const models = [...modelMap.values()].sort((a, b) => b.totalTokens - a.totalTokens);

    return {
      totalPromptTokens,
      totalCompletionTokens,
      totalTokens,
      requests,
      providers,
      models,
      rows,
    };
  },
});

export const recent = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(50, Math.max(1, Math.round(args.limit ?? 20)));
    return await ctx.db
      .query("providerUsage")
      .withIndex("by_createdAt")
      .order("desc")
      .take(limit);
  },
});
