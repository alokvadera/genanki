"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { decrypt, hashIp } from "./encryption";

/**
 * Action: Fetch decrypted list of active jobs for matching client IP or device token.
 */
export const listActiveRunsAction = action({
  args: {
    deviceToken: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Doc<"generationJobs">[]> => {
    const metadata = await ctx.meta.getRequestMetadata();
    const ip = metadata?.ip || "127.0.0.1";
    const creatorIpHash = hashIp(ip);
    const creatorDeviceIdHash = args.deviceToken ? hashIp(args.deviceToken) : undefined;

    // Call internal query to list matching active jobs
    const jobs = await ctx.runQuery(api.ipRateLimiter.listActiveJobsByHash, {
      creatorIpHash,
      creatorDeviceIdHash,
    });

    // Decrypt on-the-fly using appropriate key seed
    return jobs.map((job) => {
      const isDeviceCreator = args.deviceToken && job.creatorDeviceIdHash === creatorDeviceIdHash;
      const keySeed = isDeviceCreator ? args.deviceToken! : ip;

      return {
        ...job,
        ...(job.encDeckName !== undefined && { resultDeckName: decrypt(job.encDeckName, keySeed) }),
        ...(job.encSummary !== undefined && { resultSummary: decrypt(job.encSummary, keySeed) }),
        ...(job.encCards !== undefined && { resultCards: JSON.parse(decrypt(job.encCards, keySeed)) }),
        message: job.encMessage ? decrypt(job.encMessage, keySeed) : job.message,
        error: job.encError ? decrypt(job.encError, keySeed) : job.error,
      };
    });
  },
});

/**
 * Action: Fetch decrypted list of archived runs for matching client IP or device token.
 */
export const listArchivedRunsAction = action({
  args: {
    limit: v.optional(v.number()),
    deviceToken: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Doc<"generationJobs">[]> => {
    const metadata = await ctx.meta.getRequestMetadata();
    const ip = metadata?.ip || "127.0.0.1";
    const creatorIpHash = hashIp(ip);
    const creatorDeviceIdHash = args.deviceToken ? hashIp(args.deviceToken) : undefined;

    const jobs = await ctx.runQuery(api.ipRateLimiter.listArchivedJobsByHash, {
      creatorIpHash,
      creatorDeviceIdHash,
      limit: args.limit,
    });

    return jobs.map((job) => {
      const isDeviceCreator = args.deviceToken && job.creatorDeviceIdHash === creatorDeviceIdHash;
      const keySeed = isDeviceCreator ? args.deviceToken! : ip;

      return {
        ...job,
        ...(job.encDeckName !== undefined && { resultDeckName: decrypt(job.encDeckName, keySeed) }),
        ...(job.encSummary !== undefined && { resultSummary: decrypt(job.encSummary, keySeed) }),
        ...(job.encCards !== undefined && { resultCards: JSON.parse(decrypt(job.encCards, keySeed)) }),
        message: job.encMessage ? decrypt(job.encMessage, keySeed) : job.message,
        error: job.encError ? decrypt(job.encError, keySeed) : job.error,
      };
    });
  },
});

/**
 * Action: Fetch decrypted run detail for a single job, only allowed for creator IP or device token.
 */
export const getRunDetailAction = action({
  args: {
    jobId: v.id("generationJobs"),
    deviceToken: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Doc<"generationJobs"> | null> => {
    const metadata = await ctx.meta.getRequestMetadata();
    const ip = metadata?.ip || "127.0.0.1";
    const creatorIpHash = hashIp(ip);
    const creatorDeviceIdHash = args.deviceToken ? hashIp(args.deviceToken) : undefined;

    const job = await ctx.runQuery(api.ipRateLimiter.getJobById, { jobId: args.jobId });
    if (!job) return null;

    const isIpCreator = job.creatorIpHash === creatorIpHash;
    const isDeviceCreator = args.deviceToken && job.creatorDeviceIdHash === creatorDeviceIdHash;

    if (!isIpCreator && !isDeviceCreator) {
      // Return metadata only, block sensitive contents
      return {
        ...job,
        resultDeckName: "[Encrypted - Unauthorized Visitor]",
        resultSummary: "[Encrypted - Unauthorized Visitor]",
        resultCards: [],
        message: "[Encrypted - Unauthorized Visitor]",
        error: "[Encrypted - Unauthorized Visitor]",
      };
    }

    const keySeed = isDeviceCreator ? args.deviceToken! : ip;

    return {
      ...job,
      ...(job.encDeckName !== undefined && { resultDeckName: decrypt(job.encDeckName, keySeed) }),
      ...(job.encSummary !== undefined && { resultSummary: decrypt(job.encSummary, keySeed) }),
      ...(job.encCards !== undefined && { resultCards: JSON.parse(decrypt(job.encCards, keySeed)) }),
      message: job.encMessage ? decrypt(job.encMessage, keySeed) : job.message,
      error: job.encError ? decrypt(job.encError, keySeed) : job.error,
    };
  },
});
