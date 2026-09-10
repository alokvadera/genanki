"use node";

/**
 * Deck generation helpers — ported from src/convex/deckHelpers.ts.
 * Convex ctx.runQuery/runMutation calls become direct service-function calls.
 */
import { buildModelCandidates, type AiModelCandidate } from "./aiProviders";
import { prioritizeCandidates } from "./lib/routing";
import type { OrchestrationPatch } from "./providerOrchestrator";
import { GenError } from "./errors";
import { encrypt } from "./encryption";
import { getJob, updateJobRow } from "./services/jobs";
import { deductIpTokens } from "./services/ipRateLimiter";
import { recordUsageRow } from "./services/usage";
import { recordTelemetry } from "./services/telemetry";
import { performanceSnapshot } from "./services/rateLimits";
import type { CardRecord, TrailRecord } from "./db/schema";

// ---------------------------------------------------------------------------
// Candidate chain builder
// ---------------------------------------------------------------------------
export async function getCandidateChain(preferredProvider?: string) {
  const built = await buildModelCandidates();
  const performance = await performanceSnapshot();
  const { candidates, providerCount } = prioritizeCandidates(
    built,
    performance.map((row) => ({
      provider: row.provider,
      model: row.model,
      calls: row.calls,
      successes: row.successes,
      failures: row.failures,
      timeouts: row.timeouts,
      averageLatencyMs: row.averageLatencyMs,
      averageTokens: row.averageTokens,
      updatedAt: row.updatedAt,
    })),
    preferredProvider,
  );

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
  jobId: string | undefined,
  patch: OrchestrationPatch,
  keySeed?: string,
): Promise<void> {
  if (!jobId) return;

  const dbPatch: Record<string, unknown> = { ...patch };

  if (keySeed) {
    if (dbPatch.resultDeckName !== undefined) {
      dbPatch.encDeckName = encrypt(dbPatch.resultDeckName as string, keySeed);
      delete dbPatch.resultDeckName;
    }
    if (dbPatch.resultSummary !== undefined) {
      dbPatch.encSummary = encrypt(dbPatch.resultSummary as string, keySeed);
      delete dbPatch.resultSummary;
    }
    if (dbPatch.resultCards !== undefined) {
      dbPatch.encCards = encrypt(JSON.stringify(dbPatch.resultCards), keySeed);
      delete dbPatch.resultCards;
    }
    if (dbPatch.message !== undefined) {
      const message = dbPatch.message as string;
      dbPatch.encMessage = encrypt(message, keySeed);
      if (message.includes("complete")) {
        dbPatch.message = "Section complete";
      } else if (message.includes("Preparing")) {
        dbPatch.message = "Preparing generation";
      } else {
        dbPatch.message = "Generating cards...";
      }
    }
    if (dbPatch.error !== undefined) {
      dbPatch.encError = encrypt(dbPatch.error as string, keySeed);
      dbPatch.error = "Generation failed. Review details in your history.";
    }
  }

  await updateJobRow(jobId, dbPatch);
}

// ---------------------------------------------------------------------------
// Provider usage & IP budget recording
// ---------------------------------------------------------------------------
export async function recordUsage(
  jobId: string | undefined,
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

  await recordUsageRow({
    provider: candidate.provider,
    providerLabel: candidate.providerLabel,
    model: candidate.modelName,
    kind,
    jobId,
    promptTokens,
    completionTokens,
    totalTokens,
    ip,
  });

  if (ip) {
    await deductIpTokens(ip, totalTokens, deviceIdHash);
  }
}

// ---------------------------------------------------------------------------
// Generation telemetry thin-wrapper
// ---------------------------------------------------------------------------
export async function recordGenerationTelemetry(
  event: string,
  args: {
    jobId?: string;
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
  await recordTelemetry({ event, ...args });
}

// ---------------------------------------------------------------------------
// Fallback trail merging — pure logic extracted for testability
// ---------------------------------------------------------------------------

export type { TrailRecord };

/**
 * Merge a new trail batch into an existing trail safely.
 * Returns the merged array, or undefined if there's nothing to merge.
 * Exported as a pure function for testing.
 */
export function mergeFallbackTrail(
  existing: TrailRecord[] | undefined | null,
  incoming: TrailRecord[],
): TrailRecord[] | undefined {
  if (!incoming.length) return existing ?? undefined;
  return [...(existing ?? []), ...incoming];
}

/**
 * Persist a fallback trail batch to the job row.
 * Used in 3 places (section loop, completion passes, prompt handler).
 */
export async function appendFallbackTrail(
  jobId: string | undefined,
  fallbackTrail: TrailRecord[],
  keySeed?: string,
): Promise<void> {
  if (!jobId || !fallbackTrail.length) return;
  const job = await getJob(jobId);
  if (!job) return;
  const merged = mergeFallbackTrail(job.fallbackTrail, fallbackTrail);
  if (merged) {
    await updateJob(jobId, { fallbackTrail: merged }, keySeed);
  }
}

// ---------------------------------------------------------------------------
// IP rate limit check — shared by both handlers
// ---------------------------------------------------------------------------
export async function enforceIpRateLimit(
  ip: string,
  estimatedTokens: number,
  deviceIdHash?: string,
): Promise<void> {
  const { checkAndLogIp } = await import("./services/ipRateLimiter");
  const check = await checkAndLogIp(ip, estimatedTokens, deviceIdHash);
  if (!check.allowed) {
    throw new GenError("rate_limited", check.reason ?? "Rate limit exceeded");
  }
}

// ---------------------------------------------------------------------------
// Cancellation guard
// ---------------------------------------------------------------------------
export async function assertJobActive(jobId: string | undefined): Promise<void> {
  if (!jobId) return;
  const job = await getJob(jobId);
  if (job?.status === "canceled") {
    throw new GenError("canceled", "Generation canceled");
  }
}

export type { CardRecord };
