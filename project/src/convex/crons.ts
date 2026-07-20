import { cronJobs } from "convex/server";
import { api, internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";

export const cleanupTelemetry = internalMutation({
  args: {},
  handler: async (ctx) => {
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - THIRTY_DAYS_MS;

    const oldTelemetry = await ctx.db
      .query("generationTelemetry")
      .withIndex("by_createdAt", (q) => q.lt("createdAt", cutoff))
      .take(100);

    for (const row of oldTelemetry) {
      await ctx.db.delete(row._id);
    }
  },
});

export const cleanupInsights = internalMutation({
  args: {},
  handler: async (ctx) => {
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - THIRTY_DAYS_MS;

    const oldInsights = await ctx.db
      .query("systemInsights")
      .withIndex("by_createdAt", (q) => q.lt("createdAt", cutoff))
      .take(100);

    for (const row of oldInsights) {
      await ctx.db.delete(row._id);
    }
  },
});

export const cleanupUsage = internalMutation({
  args: {},
  handler: async (ctx) => {
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - THIRTY_DAYS_MS;

    const oldUsage = await ctx.db
      .query("providerUsage")
      .withIndex("by_createdAt", (q) => q.lt("createdAt", cutoff))
      .take(100);

    for (const row of oldUsage) {
      await ctx.db.delete(row._id);
    }
  },
});

export const cleanupIpState = internalMutation({
  args: {},
  handler: async (ctx) => {
    const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - NINETY_DAYS_MS;

    const oldStates = await ctx.db
      .query("ipRateState")
      .withIndex("by_lastSeenAt", (q) => q.lt("lastSeenAt", cutoff))
      .take(100);

    for (const row of oldStates) {
      await ctx.db.delete(row._id);
    }
  },
});

const crons = cronJobs();

crons.daily(
  "cleanup old telemetry",
  { hourUTC: 2, minuteUTC: 0 },
  internal.crons.cleanupTelemetry,
);

crons.daily(
  "cleanup old usage",
  { hourUTC: 2, minuteUTC: 15 },
  internal.crons.cleanupUsage,
);

crons.daily(
  "cleanup old insights",
  { hourUTC: 2, minuteUTC: 30 },
  internal.crons.cleanupInsights,
);

crons.daily(
  "cleanup old ip rate state",
  { hourUTC: 2, minuteUTC: 45 },
  internal.crons.cleanupIpState,
);

crons.interval(
  "optimus health check",
  { minutes: 5 },
  internal.optimus.runHealthCheck,
);

// P1: Advisor runs every 6 hours instead of per-generation to avoid extra LLM
// calls and silent adaptiveSettings overwrites.
crons.interval(
  "provider advisor",
  { hours: 6 },
  api.providerAdvisor.maybeRun,
);

export default crons;
