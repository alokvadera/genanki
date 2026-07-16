import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// ---------------------------------------------------------------------------
// Pure helper functions — safe to unit test without a Convex context
// ---------------------------------------------------------------------------

/** Compute the most recent updatedAt from a list of catalog rows. */
export function computeLatestUpdatedAt(
  rows: Array<{ updatedAt: number }>,
): number {
  if (rows.length === 0) return 0;
  return Math.max(...rows.map((r) => r.updatedAt));
}

/** Find stale provider rows that are no longer in the current set. */
export function findStaleProviders(
  currentProviders: Set<string>,
  existingRows: Array<{ provider: string; _id: string }>,
): string[] {
  return existingRows
    .filter((row) => !currentProviders.has(row.provider))
    .map((row) => row._id);
}

/**
 * Real-time query that reads cached provider catalog from the database.
 * The client subscribes to this via useQuery for live updates.
 * Returns only the fields the frontend needs (strips models array).
 */
export const catalog = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("providerCatalog").collect();
    return rows.map((row) => ({
      provider: row.provider,
      label: row.label,
      modelCount: row.modelCount,
    }));
  },
});

/**
 * Returns the most recent updatedAt timestamp from the catalog.
 * Used by the frontend to decide whether to trigger a refresh.
 */
export const latestUpdatedAt = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("providerCatalog").collect();
    return computeLatestUpdatedAt(rows);
  },
});

/** Internal helper query used by the refresh action. */
export const catalogRows = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("providerCatalog").collect();
  },
});

/** Internal helper mutation used by the refresh action. */
export const upsertCatalog = mutation({
  args: {
    provider: v.string(),
    label: v.string(),
    modelCount: v.number(),
    models: v.array(v.object({ id: v.string(), name: v.string() })),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("providerCatalog")
      .withIndex("by_provider", (q) => q.eq("provider", args.provider))
      .unique();

    const patch = {
      label: args.label,
      modelCount: args.modelCount,
      models: args.models,
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("providerCatalog", {
        provider: args.provider,
        ...patch,
      });
    }
  },
});

/** Internal helper mutation used by the refresh action. */
export const removeCatalog = mutation({
  args: { id: v.id("providerCatalog") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
