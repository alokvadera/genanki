import { type ActionCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { type Id } from "./_generated/dataModel";
import {
  callChatCompletion,
  ProviderRequestError,
  type AiModelCandidate,
} from "./aiProviders";
import { formatSeconds } from "./deckGeneration"; // need to move formatSeconds or leave it
import { GenError, isTimeoutError, isGenerationCanceledError } from "./errors";

const FALLBACK_PENALTY_SECONDS = 12;
const TIMEOUT_BUFFER_MS = 2500;

/** Maximum fallback attempts per section to bound cost. */
export const MAX_ATTEMPTS = 2;

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
  onSuccess: (result: T, candidate: CandidateExt, content: string, usage: any) => Promise<void>;
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

  for (let attempt = 0; attempt < attemptCandidates.length && !success; attempt++) {
    await assertJobActive();
    assertWithinDeadline(deadlineAt);

    const candidate = attemptCandidates[attempt % attemptCandidates.length];
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
        await updateJob({
          provider: candidate.providerLabel,
          providerIndex: candidate.providerIndex,
          model: candidate.modelName,
          modelIndex: attempt,
          message: `${candidate.providerLabel} / ${candidate.modelName} is rate-limited; switching provider`,
        });
        continue;
      }

      await updateJob({
        provider: candidate.providerLabel,
        providerIndex: candidate.providerIndex,
        model: candidate.modelName,
        modelIndex: attempt,
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
        remainingRequests: result.rateLimit?.remainingRequests,
        remainingTokens: result.rateLimit?.remainingTokens,
        resetSeconds: result.rateLimit?.resetSeconds,
        projectedNeurons: capacity.allowed ? Math.ceil((systemPrompt.length + userContent.length) / 4) + maxTokens : undefined,
        actualNeurons: tokens,
      });

      await assertJobActive();

      const parsed = parser(result.content);
      await onSuccess(parsed, candidate, result.content, result.usage);

      fallbackTrail.push({ provider: candidate.providerLabel, model: candidate.modelName, outcome: "success", reason: "Succeeded" });
      success = true;

    } catch (err) {
      if (isGenerationCanceledError(err)) {
        throw err;
      }
      lastErr = err;
      attemptErrorMsg = err instanceof Error ? err.message : String(err);
      fallbackTrail.push({ provider: candidate.providerLabel, model: candidate.modelName, outcome: "failed", reason: attemptErrorMsg });

      await ctx.runMutation(api.rateLimits.recordPerformance, {
        provider: candidate.provider,
        model: candidate.modelId,
        success: false,
        timedOut: isTimeoutError(err),
        latencyMs: Date.now() - attemptStartedAt,
        tokens: 0,
      });

      if (err instanceof ProviderRequestError) {
        await ctx.runMutation(api.rateLimits.reportProviderResult, {
          provider: candidate.provider,
          model: candidate.modelId,
          status: err.status,
          remainingRequests: err.rateLimit?.remainingRequests,
          remainingTokens: err.rateLimit?.remainingTokens,
          resetSeconds: err.rateLimit?.resetSeconds,
          cooldownSeconds: err.retryAfterSeconds ?? (err.status === 429 || err.status === 503 ? 15 : undefined),
        });
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

  return { success, lastErr, fallbackTrail };
}
