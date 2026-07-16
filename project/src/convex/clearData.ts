import { mutation } from "./_generated/server";

/**
 * Delete all old data from every application table.
 * Auth tables (users, sessions, etc.) are preserved.
 * This is a destructive operation — use with caution.
 */
export const clearAllData = mutation({
  args: {},
  handler: async (ctx) => {
    const tables = [
      "providerRateState",
      "providerPerformance",
      "adaptiveSettings",
      "systemInsights",
      "generationJobs",
      "providerUsage",
      "generationTelemetry",
    ] as const;

    let totalDeleted = 0;

    for (const tableName of tables) {
      const all = await ctx.db.query(tableName).collect();
      for (const doc of all) {
        await ctx.db.delete(doc._id);
        totalDeleted += 1;
      }
    }

    return { deleted: totalDeleted, tables: tables.length };
  },
});
