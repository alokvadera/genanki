import { type ActionCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { type Id } from "./_generated/dataModel";
import {
  callChatCompletion,
  ProviderRequestError,
  type AiModelCandidate,
  type ChatUsage,
} from "./aiProviders";
import { GenError, isTimeoutError, isGenerationCanceledError } from "./errors";
import { logger } from "./logger";

const FALLBACK_PENALTY_SECONDS = 12;
const TIMEOUT_BUFFER_MS = 2500;
const CANCELLATION_CHECK_TTL_MS = 1500;

/** Maximum fallback attempts per section to bound cost. */
export const MAX_ATTEMPTS = 2;

/** Backoff constants (exported for testing). */
export const BACKOFF_BASE_SECONDS = 3;
export const BACKOFF_MAX_SECONDS = 60;
export const BACKOFF_JITTER_FRACTION = 0.5;

/**
 * Compute exponential backoff cooldown with jitter, clamped by remaining deadline.
 * Exported as a pure function for testability.
 *
 * @param attempt — zero-based attempt index
 * @param deadlineAt — absolute deadline timestamp (ms)
 * @param randomFn — injectable random source (defaults to Math.random)
 */
export function computeBackoffCooldown(
  attempt: number,
  deadlineAt: number,
  randomFn: () => number = Math.random,
): number {
  const baseDelay = Math.min(BACKOFF_MAX_SECONDS, BACKOFF_BASE_SECONDS * Math.pow(2, attempt));
  const jitter = randomFn() * baseDelay * BACKOFF_JITTER_FRACTION;
  const remainingSeconds = Math.max(1, (deadlineAt - Date.now()) / 1000);
  return Math.min(baseDelay + jitter, remainingSeconds);
}

/**
 * Compute the candidates to attempt, capping to MAX_ATTEMPTS.
 * Falls back to the original candidates if Optimus returns empty.
 * Exported for testing — the logic is a pure function.
 */
export function computeAttemptCandidates<T>(
  rankedCandidates: T[],
  candidates: T[],
  maxAttempts = MAX_ATTEMPTS,
): T[] {
  // Array.slice(0, >length) safely returns all items, so fewer than maxAttempts is handled.
  return (rankedCandidates.length > 0 ? rankedCandidates : candidates).slice(0, maxAttempts);
}

export type OrchestrationPatch = {
  status?: "queued" | "running" | "succeeded" | "canceled" | "failed";
  progress?: number;
  etaSeconds?: number;
  message?: string;
  provider?: string;
  providerIndex?: number;
  model?: string;
  modelIndex?: number;
  totalProviders?: number;
  totalModels?: number;
  sectionIndex?: number;
  totalSections?: number;
  timeoutSeconds?: number;
  deadlineAt?: number;
  resultDeckName?: string;
  resultSummary?: string;
  resultCards?: Array<{ front: string; back: string }>;
  resultPartial?: boolean;
  resultWarnings?: string[];
  cancelRequestedAt?: number;
  canceledAt?: number;
  error?: string;
  fallbackTrail?: FallbackRecord[];
  creatorIpHash?: string;
  creatorDeviceIdHash?: string;
};

type FallbackRecord = {
  provider: string;
  model: string;
  outcome: string;
  reason: string;
};

export type OrchestrationContext = {
  ctx: ActionCtx;
  jobId?: Id<"generationJobs">;
  deadlineAt: number;
  estimatedSeconds: number;
  sectionIndex?: number;
  totalSections?: number;
  kind: "prompt" | "document";
};

export type CandidateExt = AiModelCandidate & {
  providerIndex: number;
  providerLabel: string;
  modelName: string;
};

type AttemptOptions<T> = {
  candidates: CandidateExt[];
  providerCount: number;
  systemPrompt: string;
  userContent: string;
  maxTokens: number;
  parser: (content: string) => T;
  onSuccess: (result: T, candidate: CandidateExt, content: string, usage: ChatUsage | null) => Promise<void>;
  updateJob: (patch: OrchestrationPatch) => Promise<void>;
  assertJobActive: () => Promise<void>;
  context: OrchestrationContext;
};

export function assertWithinDeadline(deadlineAt: number): void {
  if (Date.now() > deadlineAt) {
    throw new GenError("deadline", "Generation timed out before completion");
  }
}

export function getAttemptTimeoutMs(
  candidate: CandidateExt,
  kind: "prompt" | "document",
  deadlineAt: number,
): number {
  const remainingMs = Math.max(5_000, deadlineAt - Date.now() - TIMEOUT_BUFFER_MS);
  let providerBudget: number;
  switch (candidate.provider) {
    case "groq":
      providerBudget = candidate.modelId === "llama-3.1-8b-instant" ? 16_000 : 22_000;
      break;
    case "cerebras":
      providerBudget = 24_000;
      break;
    case "kilo":
      providerBudget = 20_000;
      break;
    case "cloudflare":
      providerBudget = 28_000;
      break;
    default:
      providerBudget = kind === "prompt" ? 18_000 : 22_000;
  }
  return Math.max(10_000, Math.min(remainingMs, providerBudget));
}

export async function attemptWithProviderFallback<T>(
  options: AttemptOptions<T>
): Promise<{ success: boolean; lastErr: unknown; fallbackTrail: FallbackRecord[] }> {
  const { candidates, providerCount, systemPrompt, userContent, maxTokens, parser, onSuccess, updateJob, assertJobActive, context } = options;
  const { ctx, deadlineAt, kind } = context;
  let { estimatedSeconds } = context;

  // OPTIMUS: Pre-rank candidates based on real-time rate limits and health
  const rankedCandidates = await ctx.runQuery(internal.optimus.rankCandidates, {
    candidates,
  });

  // Cap fallback attempts to at most MAX_ATTEMPTS per section to bound cost.
  const attemptCandidates = computeAttemptCandidates(rankedCandidates, candidates);

  const fallbackTrail: FallbackRecord[] = [];
  let lastErr: unknown = null;
  let success = false;

  logger.info("Starting provider attempt sequence", {
    jobId: context.jobId,
    kind: context.kind,
    candidates: attemptCandidates.length,
    providers: providerCount,
    sectionIndex: context.sectionIndex,
    totalSections: context.totalSections,
  });

  // Cached cancellation check to avoid N+1 DB reads (150+ per run)
  let lastCancelCheck = 0;

  for (let attempt = 0; attempt < attemptCandidates.length && !success; attempt++) {
    // Cached cancellation: only re-query if TTL has elapsed
    const now = Date.now();
    if (now - lastCancelCheck >= CANCELLATION_CHECK_TTL_MS) {
      await assertJobActive();
      lastCancelCheck = now;
    }

    // Deadline check — non-fatal: returns partial cards rather than crashing
    if (Date.now() > deadlineAt) {
      lastErr = new GenError("deadline", "Generation timed out before completion");
      fallbackTrail.push({ provider: "system", model: "system", outcome: "skipped", reason: "Deadline exceeded, returning partial results" });
      logger.warn("Deadline exceeded", { jobId: context.jobId, deadlineAt, sectionIndex: context.sectionIndex });
      break;
    }

    const candidate = attemptCandidates[attempt];
    if (!candidate) continue;
    const attemptStartedAt = Date.now();
    let attemptErrorMsg = "";

    try {
      const capacity = await ctx.runMutation(api.rateLimits.reserveProviderCapacity, {
        provider: candidate.provider,
        model: candidate.modelId,
        estimatedTokens: Math.ceil((systemPrompt.length + userContent.length) / 4) + maxTokens,
      });

      if (!capacity.allowed) {
        lastErr = new GenError("rate_limited", `${candidate.providerLabel} budget cooling down for ${capacity.waitSeconds}s`);
        attemptErrorMsg = `Rate limited (${capacity.waitSeconds}s)`;
        fallbackTrail.push({ provider: candidate.providerLabel, model: candidate.modelName, outcome: "skipped", reason: attemptErrorMsg });
        logger.warn("Provider rate-limited", { jobId: context.jobId, provider: candidate.provider, model: candidate.modelId, waitSeconds: capacity.waitSeconds });
        await updateJob({
          provider: candidate.providerLabel,
          providerIndex: candidate.providerIndex,
          model: candidate.modelName,
          modelIndex: candidate.providerIndex,
          message: `${candidate.providerLabel} / ${candidate.modelName} is rate-limited; switching provider`,
        });
        continue;
      }

      await updateJob({
        provider: candidate.providerLabel,
        providerIndex: candidate.providerIndex,
        model: candidate.modelName,
        modelIndex: candidate.providerIndex,
        etaSeconds: estimatedSeconds + attempt * FALLBACK_PENALTY_SECONDS,
        totalProviders: providerCount,
        totalModels: attemptCandidates.length,
        message: context.sectionIndex !== undefined
          ? `Section ${context.sectionIndex + 1}/${context.totalSections}: trying ${candidate.providerLabel} / ${candidate.modelName}`
          : `Trying ${candidate.providerLabel} / ${candidate.modelName}`,
      });

      const result = await callChatCompletion({
        candidate,
        systemPrompt,
        userContent,
        maxTokens,
        timeoutMs: getAttemptTimeoutMs(candidate, kind, deadlineAt),
      });

      const latencyMs = Date.now() - attemptStartedAt;
      const tokens = result.usage?.totalTokens ?? Math.ceil((systemPrompt.length + userContent.length + result.content.length) / 4);

      await ctx.runMutation(api.rateLimits.recordPerformance, {
        provider: candidate.provider,
        model: candidate.modelId,
        success: true,
        timedOut: false,
        latencyMs,
        tokens,
      });

      await ctx.runMutation(api.rateLimits.reportProviderResult, {
        provider: candidate.provider,
        model: candidate.modelId,
        status: 200,
        ...(result.rateLimit?.remainingRequests !== undefined && { remainingRequests: result.rateLimit.remainingRequests }),
        ...(result.rateLimit?.remainingTokens !== undefined && { remainingTokens: result.rateLimit.remainingTokens }),
        ...(result.rateLimit?.resetSeconds !== undefined && { resetSeconds: result.rateLimit.resetSeconds }),
        ...(capacity.allowed && { projectedNeurons: Math.ceil((systemPrompt.length + userContent.length) / 4) + maxTokens }),
        actualNeurons: tokens,
      });

      await assertJobActive();

      const parsed = parser(result.content);
      await onSuccess(parsed, candidate, result.content, result.usage);

      fallbackTrail.push({ provider: candidate.providerLabel, model: candidate.modelName, outcome: "success", reason: "Succeeded" });

      logger.info("Provider attempt succeeded", {
        jobId: context.jobId,
        provider: candidate.provider,
        model: candidate.modelId,
        latencyMs,
        tokens,
      });

      // Record per-attempt telemetry
      if (context.jobId) {
        await ctx.runMutation(api.generationTelemetry.record, {
          event: "attempt",
          jobId: context.jobId,
          kind: context.kind,
          durationMs: latencyMs,
          tokensUsed: tokens,
          provider: candidate.providerLabel,
          model: candidate.modelName,
          outcome: "success",
          metric: 1,
        }).catch((e) => logger.error("Telemetry record failed", { provider: candidate.provider, model: candidate.modelId, error: String(e) }));
      }

      success = true;

    } catch (err) {
      if (isGenerationCanceledError(err)) {
        throw err;
      }
      lastErr = err;
      attemptErrorMsg = err instanceof Error ? err.message : String(err);
      fallbackTrail.push({ provider: candidate.providerLabel, model: candidate.modelName, outcome: "failed", reason: attemptErrorMsg });

      logger.warn("Provider attempt failed", {
        jobId: context.jobId,
        provider: candidate.provider,
        model: candidate.modelId,
        error: attemptErrorMsg,
        latencyMs: Date.now() - attemptStartedAt,
      });

      // Record per-attempt telemetry
      if (context.jobId) {
        await ctx.runMutation(api.generationTelemetry.record, {
          event: "attempt",
          jobId: context.jobId,
          kind: context.kind,
          durationMs: Date.now() - attemptStartedAt,
          tokensUsed: 0,
          provider: candidate.providerLabel,
          model: candidate.modelName,
          outcome: "failed",
          metric: 0,
        }).catch((e) => logger.error("Telemetry record failed", { provider: candidate.provider, model: candidate.modelId, error: String(e) }));
      }

      await ctx.runMutation(api.rateLimits.recordPerformance, {
        provider: candidate.provider,
        model: candidate.modelId,
        success: false,
        timedOut: isTimeoutError(err),
        latencyMs: Date.now() - attemptStartedAt,
        tokens: 0,
      });

      if (err instanceof ProviderRequestError) {
        const retryAfter = err.retryAfterSeconds;
        const mutationArgs: Record<string, unknown> = {
          provider: candidate.provider,
          model: candidate.modelId,
          status: err.status,
          ...(err.rateLimit?.remainingRequests !== undefined && { remainingRequests: err.rateLimit.remainingRequests }),
          ...(err.rateLimit?.remainingTokens !== undefined && { remainingTokens: err.rateLimit.remainingTokens }),
          ...(err.rateLimit?.resetSeconds !== undefined && { resetSeconds: err.rateLimit.resetSeconds }),
        };

        if (retryAfter !== undefined && retryAfter > 0) {
          mutationArgs.cooldownSeconds = retryAfter;
        } else if (err.status === 429 || err.status === 503) {
          mutationArgs.cooldownSeconds = computeBackoffCooldown(attempt, deadlineAt);
        }

        await ctx.runMutation(api.rateLimits.reportProviderResult, mutationArgs as unknown as Parameters<typeof api.rateLimits.reportProviderResult>[0]);
      }

      if (isTimeoutError(err)) {
        estimatedSeconds += 8;
      } else {
        estimatedSeconds += FALLBACK_PENALTY_SECONDS;
      }

      await updateJob({
        etaSeconds: estimatedSeconds,
        provider: candidate.providerLabel,
        providerIndex: candidate.providerIndex,
        model: candidate.modelName,
        modelIndex: attempt,
        totalProviders: providerCount,
        totalModels: attemptCandidates.length,
        message: isTimeoutError(err)
          ? `${candidate.providerLabel} / ${candidate.modelName} timed out, switching models`
          : `${candidate.providerLabel} / ${candidate.modelName} failed, switching models`,
      });
    }
  }

  logger.info("Provider attempt sequence complete", {
    jobId: context.jobId,
    success,
    falls: fallbackTrail.length,
    trail: fallbackTrail.map((f) => `${f.provider}/${f.model}:${f.outcome}`),
  });

  return { success, lastErr, fallbackTrail };
}
