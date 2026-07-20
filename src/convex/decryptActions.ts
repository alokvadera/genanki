"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { decrypt, hashIp } from "./encryption";

/**
 * Action: Fetch decrypted list of active jobs for matching client IP.
 */
export const listActiveRunsAction = action({
  args: {},
  handler: async (ctx): Promise<any[]> => {
    const metadata = await ctx.meta.getRequestMetadata();
    const ip = metadata?.ip || "127.0.0.1";
    const creatorIpHash = hashIp(ip);

    // Call internal query to list matching active jobs
    const jobs = (await ctx.runQuery(api.ipRateLimiter.listActiveJobsByHash, { creatorIpHash })) as any[];

    // Decrypt on-the-fly
    return jobs.map((job: any) => ({
      ...job,
      resultDeckName: job.encDeckName ? decrypt(job.encDeckName, ip) : undefined,
      resultSummary: job.encSummary ? decrypt(job.encSummary, ip) : undefined,
      resultCards: job.encCards ? JSON.parse(decrypt(job.encCards, ip)) : undefined,
      message: job.encMessage ? decrypt(job.encMessage, ip) : job.message,
      error: job.encError ? decrypt(job.encError, ip) : job.error,
    }));
  },
});

/**
 * Action: Fetch decrypted list of archived runs for matching client IP.
 */
export const listArchivedRunsAction = action({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<any[]> => {
    const metadata = await ctx.meta.getRequestMetadata();
    const ip = metadata?.ip || "127.0.0.1";
    const creatorIpHash = hashIp(ip);

    const jobs = (await ctx.runQuery(api.ipRateLimiter.listArchivedJobsByHash, {
      creatorIpHash,
      limit: args.limit,
    })) as any[];

    return jobs.map((job: any) => ({
      ...job,
      resultDeckName: job.encDeckName ? decrypt(job.encDeckName, ip) : undefined,
      resultSummary: job.encSummary ? decrypt(job.encSummary, ip) : undefined,
      resultCards: job.encCards ? JSON.parse(decrypt(job.encCards, ip)) : undefined,
      message: job.encMessage ? decrypt(job.encMessage, ip) : job.message,
      error: job.encError ? decrypt(job.encError, ip) : job.error,
    }));
  },
});

/**
 * Action: Fetch decrypted run detail for a single job, only allowed for creator IP.
 */
export const getRunDetailAction = action({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args): Promise<any> => {
    const metadata = await ctx.meta.getRequestMetadata();
    const ip = metadata?.ip || "127.0.0.1";
    const creatorIpHash = hashIp(ip);

    const job = (await ctx.runQuery(api.ipRateLimiter.getJobById, { jobId: args.jobId })) as any;
    if (!job) return null;

    if (job.creatorIpHash !== creatorIpHash) {
      // Return metadata only, block sensitive contents
      return {
        ...job,
        resultDeckName: "[Encrypted - Unauthorized IP]",
        resultSummary: "[Encrypted - Unauthorized IP]",
        resultCards: [],
        message: "[Encrypted - Unauthorized IP]",
        error: "[Encrypted - Unauthorized IP]",
      };
    }

    return {
      ...job,
      resultDeckName: job.encDeckName ? decrypt(job.encDeckName, ip) : undefined,
      resultSummary: job.encSummary ? decrypt(job.encSummary, ip) : undefined,
      resultCards: job.encCards ? JSON.parse(decrypt(job.encCards, ip)) : undefined,
      message: job.encMessage ? decrypt(job.encMessage, ip) : job.message,
      error: job.encError ? decrypt(job.encError, ip) : job.error,
    };
  },
});
