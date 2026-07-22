"use node";

import { type ActionCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { api } from "./_generated/api";
import { buildModelCandidates, type AiModelCandidate } from "./aiProviders";
import { prioritizeCandidates } from "../lib/routing";
import { type OrchestrationPatch } from "./providerOrchestrator";
import { GenError } from "./errors";
import { encrypt } from "./encryption";

// ---------------------------------------------------------------------------
// Candidate chain builder
// ---------------------------------------------------------------------------
export async function getCandidateChain(
  ctx: ActionCtx,
  preferredProvider?: string,
) {
  const built = await buildModelCandidates();
  const performance = await ctx.runQuery(api.rateLimits.performanceSnapshot, {});
  const { candidates, providerCount } = prioritizeCandidates(built, performance, preferredProvider);

  return {
    candidates: candidates.map((c) => ({
      ...c,
      providerLabel: c.providerLabel,
      modelName: c.modelName,
    })),
    providerCount,
  };
}

// ---------------------------------------------------------------------------
// Encrypted job patcher
// ---------------------------------------------------------------------------
export async function updateJob(
  ctx: ActionCtx,
  jobId: Id<"generationJobs"> | undefined,
  patch: OrchestrationPatch,
  keySeed?: string,
): Promise<void> {
  if (!jobId) return;

  const mutationPatch: Partial<Doc<"generationJobs">> = { ...patch };

  if (keySeed) {
    if (mutationPatch.resultDeckName !== undefined) {
      mutationPatch.encDeckName = encrypt(mutationPatch.resultDeckName, keySeed);
      delete mutationPatch.resultDeckName;
    }
    if (mutationPatch.resultSummary !== undefined) {
      mutationPatch.encSummary = encrypt(mutationPatch.resultSummary, keySeed);
      delete mutationPatch.resultSummary;
    }
    if (mutationPatch.resultCards !== undefined) {
      mutationPatch.encCards = encrypt(JSON.stringify(mutationPatch.resultCards), keySeed);
      delete mutationPatch.resultCards;
    }
    if (mutationPatch.message !== undefined) {
      mutationPatch.encMessage = encrypt(mutationPatch.message, keySeed);
      if (mutationPatch.message.includes("complete")) {
        mutationPatch.message = "Section complete";
      } else if (mutationPatch.message.includes("Preparing")) {
        mutationPatch.message = "Preparing generation";
      } else {
        mutationPatch.message = "Generating cards...";
      }
    }
    if (mutationPatch.error !== undefined) {
      mutationPatch.encError = encrypt(mutationPatch.error, keySeed);
      mutationPatch.error = "Generation failed. Review details in your history.";
    }
  }

  await ctx.runMutation(api.generationJobs.update, {
    jobId,
    ...mutationPatch,
  });
}

// ---------------------------------------------------------------------------
// Provider usage & IP budget recording
// ---------------------------------------------------------------------------
export async function recordUsage(
  ctx: ActionCtx,
  jobId: Id<"generationJobs"> | undefined,
  kind: "prompt" | "document",
  candidate: AiModelCandidate,
  systemPrompt: string,
  userContent: string,
  content: string,
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number } | null,
  ip?: string,
  deviceIdHash?: string,
): Promise<void> {
  const promptTokens = usage?.promptTokens ?? Math.max(1, Math.ceil((systemPrompt.length + userContent.length) / 4));
  const completionTokens = usage?.completionTokens ?? Math.max(1, Math.ceil(content.length / 4));
  const totalTokens = usage?.totalTokens ?? promptTokens + completionTokens;

  await ctx.runMutation(api.providerUsage.record, {
    provider: candidate.provider,
    providerLabel: candidate.providerLabel,
    model: candidate.modelName,
    kind,
    jobId,
    promptTokens,
    completionTokens,
    totalTokens,
    ip,
    createdAt: Date.now(),
  });

  if (ip) {
    await ctx.runMutation(api.ipRateLimiter.deductIpTokens, {
      ip,
      tokens: totalTokens,
      deviceIdHash,
    });
  }
}

// ---------------------------------------------------------------------------
// Generation telemetry thin-wrapper
// ---------------------------------------------------------------------------
export async function recordGenerationTelemetry(
  ctx: ActionCtx,
  event: string,
  args: {
    jobId?: Id<"generationJobs">;
    kind: "prompt" | "document";
    requestedCount?: number;
    generatedCount?: number;
    duplicateCount?: number;
    sourceChars?: number;
    parseFailures?: number;
    durationMs?: number;
    tokensUsed?: number;
    metric?: number;
  },
): Promise<void> {
  await ctx.runMutation(api.generationTelemetry.record, { event, ...args });
}

// ---------------------------------------------------------------------------
// Fallback trail merging — pure logic extracted for testability
// ---------------------------------------------------------------------------

/** A single fallback trail record. */
export type TrailRecord = { provider: string; model: string; outcome: string; reason: string };

/**
 * Merge a new trail batch into an existing trail safely.
 * Returns the merged array, or undefined if there's nothing to merge.
 * Exported as a pure function for testing.
 */
export function mergeFallbackTrail(
  existing: TrailRecord[] | undefined,
  incoming: TrailRecord[],
): TrailRecord[] | undefined {
  if (!incoming.length) return existing;
  return [...(existing || []), ...incoming];
}

/**
 * Persist a fallback trail batch to the job document.
 * Used in 3 places (section loop, completion passes, prompt handler).
 */
export async function appendFallbackTrail(
  ctx: ActionCtx,
  jobId: Id<"generationJobs"> | undefined,
  fallbackTrail: TrailRecord[],
  keySeed?: string,
): Promise<void> {
  if (!jobId || !fallbackTrail.length) return;
  const job = await ctx.runQuery(api.generationJobs.get, { jobId });
  if (!job) return;
  const merged = mergeFallbackTrail(job.fallbackTrail, fallbackTrail);
  if (merged) {
    await updateJob(ctx, jobId, { fallbackTrail: merged }, keySeed);
  }
}

// ---------------------------------------------------------------------------
// IP rate limit check — duplicated in both handlers
// ---------------------------------------------------------------------------
export async function enforceIpRateLimit(
  ctx: ActionCtx,
  ip: string,
  estimatedTokens: number,
  deviceIdHash?: string,
): Promise<void> {
  const check = await ctx.runMutation(api.ipRateLimiter.checkAndLogIp, {
    ip,
    estimatedTokens,
    deviceIdHash,
  });
  if (!check.allowed) {
    throw new Error(check.reason);
  }
}

// ---------------------------------------------------------------------------
// Cancellation guard
// ---------------------------------------------------------------------------
export async function assertJobActive(ctx: ActionCtx, jobId: Id<"generationJobs"> | undefined): Promise<void> {
  if (!jobId) return;
  const job = await ctx.runQuery(api.generationJobs.get, { jobId });
  if (job?.status === "canceled") {
    throw new GenError("canceled", "Generation canceled");
  }
}
