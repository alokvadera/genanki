"use node";

import { action, type ActionCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { api } from "./_generated/api";
import { buildModelCandidates } from "./aiProviders";
import { parseAiDeckGeneration } from "../lib/deckGeneration";
import {
  estimateDocumentEtaSeconds,
  estimateDocumentTimeoutSeconds,
  estimatePromptEtaSeconds,
  estimatePromptTimeoutSeconds,
} from "../lib/generationTiming";
import { prioritizeCandidates } from "../lib/routing";
import { buildDocumentSystemPrompt, buildSystemPrompt } from "./promptBuilder";
import { attemptWithProviderFallback, assertWithinDeadline, type OrchestrationPatch } from "./providerOrchestrator";
import { GenError, isGenerationCanceledError } from "./errors";

const MAX_CARD_COUNT = 1000;
const MAX_CHUNK_SIZE = 9000;
const MAX_CHUNKS = 10;

export function clampCardCount(value: number): number {
  if (!Number.isFinite(value)) {
    return 12;
  }
  return Math.min(MAX_CARD_COUNT, Math.max(1, Math.round(value)));
}

export function formatSeconds(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0s";
  const safe = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safe / 60);
  const remaining = safe % 60;
  if (minutes <= 0) return `${remaining}s`;
  return `${minutes}m ${String(remaining).padStart(2, "0")}s`;
}

export function chunkText(text: string, maxChunks = MAX_CHUNKS): string[] {
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    if (current.length + para.length + 2 > MAX_CHUNK_SIZE) {
      if (current) chunks.push(current.trim());
      if (para.length > MAX_CHUNK_SIZE) {
        const sentences = para.match(/[^.!?]+[.!?]+|\S+/g) ?? [para];
        current = "";
        for (const sentence of sentences) {
          if (current.length + sentence.length > MAX_CHUNK_SIZE) {
            if (current) chunks.push(current.trim());
            current = sentence;
          } else {
            current += sentence;
          }
        }
      } else {
        current = para;
      }
    } else {
      current += (current ? "\n\n" : "") + para;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  if (chunks.length <= maxChunks) return chunks;

  const sampled: string[] = [];
  const step = (chunks.length - 1) / (maxChunks - 1);
  for (let i = 0; i < maxChunks; i++) {
    sampled.push(chunks[Math.round(i * step)]);
  }
  return sampled;
}

async function getCandidateChain(
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

async function updateJob(
  ctx: ActionCtx,
  jobId: Id<"generationJobs"> | undefined,
  patch: OrchestrationPatch,
): Promise<void> {
  if (!jobId) return;
  await ctx.runMutation(api.generationJobs.update, {
    jobId,
    ...patch,
  });
}

async function recordUsage(
  ctx: ActionCtx,
  jobId: Id<"generationJobs"> | undefined,
  kind: "prompt" | "document",
  candidate: any,
  systemPrompt: string,
  userContent: string,
  content: string,
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number } | null,
): Promise<void> {
  const promptTokens = usage?.promptTokens ?? Math.max(1, Math.ceil((systemPrompt.length + userContent.length) / 4));
  const completionTokens = usage?.completionTokens ?? Math.max(1, Math.ceil(content.length / 4));
  await ctx.runMutation(api.providerUsage.record, {
    provider: candidate.provider,
    providerLabel: candidate.providerLabel,
    model: candidate.modelName,
    kind,
    jobId,
    promptTokens,
    completionTokens,
    totalTokens: usage?.totalTokens ?? promptTokens + completionTokens,
  });
}

async function recordGenerationTelemetry(
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

// N+1 cancellation check optimization
// We will only query DB if enough time has passed to avoid hitting Convex too hard.
// In a serverless action, we can't easily cache across sections if they are long,
// but we just run the query. Convex caches it well anyway.
async function assertJobActive(ctx: ActionCtx, jobId: Id<"generationJobs"> | undefined): Promise<void> {
  if (!jobId) return;
  const job = await ctx.runQuery(api.generationJobs.get, { jobId });
  if (job?.status === "canceled") {
    throw new GenError("canceled", "Generation canceled");
  }
}

export const generateDeckFromDocument = action({
  args: {
    text: v.string(),
    deckName: v.optional(v.string()),
    cardCount: v.optional(v.number()),
    difficulty: v.optional(
      v.union(v.literal("beginner"), v.literal("intermediate"), v.literal("advanced"))
    ),
    instructions: v.optional(v.string()),
    jobId: v.optional(v.id("generationJobs")),
    preferredProvider: v.optional(v.string()),
  },
  handler: async (ctx: ActionCtx, args) => {
    const text = args.text.trim();
    if (!text) {
      throw new Error("No text was extracted from the document");
    }

    const requestedCount = clampCardCount(args.cardCount ?? 12);
    const difficulty = args.difficulty ?? "intermediate";
    const deckName = args.deckName?.trim() ?? "";
    const instructions = args.instructions?.trim() ?? "";
    const { candidates, providerCount } = await getCandidateChain(ctx, args.preferredProvider);

    if (candidates.length === 0) {
      throw new GenError("no_providers", "No AI providers are configured.");
    }

    const adaptiveSettings = await ctx.runQuery(api.rateLimits.adaptiveSettings, {});
    const maxChunks = adaptiveSettings?.documentMaxChunks ?? MAX_CHUNKS;
    const completionPasses = adaptiveSettings?.completionPasses ?? 3;
    const chunks = chunkText(text, maxChunks);
    const totalSections = chunks.length;
    const timeoutSeconds = estimateDocumentTimeoutSeconds(requestedCount, totalSections);
    const deadlineAt = Date.now() + timeoutSeconds * 1000;
    const estimatedSeconds = estimateDocumentEtaSeconds(requestedCount, totalSections, candidates.length, providerCount);

    await updateJob(ctx, args.jobId, {
      status: "running",
      progress: 0,
      etaSeconds: estimatedSeconds,
      timeoutSeconds,
      deadlineAt,
      message: `Preparing generation across ${providerCount} provider(s) and ${candidates.length} model(s) (${formatSeconds(estimatedSeconds)} est.)`,
      provider: undefined,
      providerIndex: 0,
      totalProviders: providerCount,
      totalModels: candidates.length,
      sectionIndex: 0,
      totalSections,
    });

    const allCards: Array<{ front: string; back: string }> = [];
    let parsedCardCount = 0;
    let resultDeckName = deckName;
    let resultSummary = "";
    const seen = new Set<string>();
    const warnings: string[] = [];

    // Dedupe cleaner function (strip punctuation, lowercase, collapse whitespace)
    const normalizeCardText = (s: string) => s.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();

    for (let i = 0; i < chunks.length; i++) {
      const remainingTarget = Math.max(1, requestedCount - allCards.length);
      const cardsForSection = Math.max(1, Math.ceil(remainingTarget / (chunks.length - i)));
      const systemPrompt = buildDocumentSystemPrompt(cardsForSection, difficulty, deckName, instructions);
      const userContent = [
        `Document content (section ${i + 1} of ${chunks.length}):`,
        chunks[i],
        `Preferred deck name: ${deckName || "auto-generate"}`,
        `Cards to generate from this section: ${cardsForSection}`,
        `Difficulty: ${difficulty}`,
        instructions ? `User instructions: ${instructions}` : "",
      ].join("\n");
      const maxTokens = Math.min(2000, cardsForSection * 120 + 400);

      const res = await attemptWithProviderFallback({
        candidates,
        providerCount,
        systemPrompt,
        userContent,
        maxTokens,
        parser: parseAiDeckGeneration,
        onSuccess: async (parsed, candidate, content, usage) => {
          await recordUsage(ctx, args.jobId, "document", candidate, systemPrompt, userContent, content, usage);
          parsedCardCount += parsed.cards.length;
          if (!resultDeckName) resultDeckName = parsed.deckName;
          if (!resultSummary) resultSummary = parsed.summary;

          for (const card of parsed.cards) {
            const key = `${normalizeCardText(card.front)}::${normalizeCardText(card.back)}`;
            if (!seen.has(key)) {
              seen.add(key);
              allCards.push(card);
            }
          }
          await updateJob(ctx, args.jobId, {
            resultDeckName: resultDeckName || deckName || "Document Deck",
            resultSummary,
            resultCards: allCards.slice(0, requestedCount),
            resultPartial: true,
            message: `Section ${i + 1}/${chunks.length} complete · ${allCards.length} card(s) available live`,
          });
        },
        updateJob: (patch) => updateJob(ctx, args.jobId, patch),
        assertJobActive: () => assertJobActive(ctx, args.jobId),
        context: { ctx, jobId: args.jobId, deadlineAt, estimatedSeconds, sectionIndex: i, totalSections, kind: "document" }
      });

      if (!res.success && res.lastErr) {
        warnings.push(`section ${i + 1}: ${res.lastErr instanceof Error ? res.lastErr.message : String(res.lastErr)}`);
      }
      // Log fallback trail per attempt if desired
      if (res.fallbackTrail.length > 0) {
        // We could aggregate this into a job field later, but for now we'll just push to DB if supported
        const job = await ctx.runQuery(api.generationJobs.get, { jobId: args.jobId! });
        if (job) {
           const newTrail = [...(job.fallbackTrail || []), ...res.fallbackTrail];
           await updateJob(ctx, args.jobId, { fallbackTrail: newTrail });
        }
      }

      await updateJob(ctx, args.jobId, {
        progress: Math.min(0.95, (i + 1) / totalSections),
        sectionIndex: i + 1,
      });
    }

    // Completion passes
    for (let pass = 0; pass < completionPasses && allCards.length < requestedCount; pass++) {
      const missing = requestedCount - allCards.length;
      const source = chunks[pass % chunks.length];
      const completionSystemPrompt = [
        buildDocumentSystemPrompt(missing, difficulty, deckName, instructions),
        "This is a completion pass.",
        "Return only new cards that do not duplicate the existing cards.",
      ].join(" ");
      const completionUserContent = [
        "Generate the missing cards from this document section:",
        source,
        `Missing card count: ${missing}`,
        "Existing card fronts to avoid:",
        allCards.slice(-40).map((card) => `- ${card.front}`).join("\n"),
      ].join("\n");
      const maxTokens = Math.min(2000, missing * 120 + 400);

      const res = await attemptWithProviderFallback({
        candidates,
        providerCount,
        systemPrompt: completionSystemPrompt,
        userContent: completionUserContent,
        maxTokens,
        parser: parseAiDeckGeneration,
        onSuccess: async (parsed, candidate, content, usage) => {
          parsedCardCount += parsed.cards.length;
          for (const card of parsed.cards) {
            const key = `${normalizeCardText(card.front)}::${normalizeCardText(card.back)}`;
            if (!seen.has(key) && allCards.length < requestedCount) {
              seen.add(key);
              allCards.push(card);
            }
          }
          await updateJob(ctx, args.jobId, {
            resultCards: allCards.slice(0, requestedCount),
            resultPartial: allCards.length < requestedCount,
            message: `Completion pass ${pass + 1}: ${allCards.length}/${requestedCount} cards available live`,
          });
        },
        updateJob: (patch) => updateJob(ctx, args.jobId, patch),
        assertJobActive: () => assertJobActive(ctx, args.jobId),
        context: { ctx, jobId: args.jobId, deadlineAt, estimatedSeconds, sectionIndex: chunks.length, totalSections, kind: "document" }
      });

      if (!res.success && res.lastErr) {
        warnings.push(`completion pass ${pass + 1}: ${res.lastErr instanceof Error ? res.lastErr.message : String(res.lastErr)}`);
      }
      
      if (res.fallbackTrail.length > 0) {
        const job = await ctx.runQuery(api.generationJobs.get, { jobId: args.jobId! });
        if (job) {
           const newTrail = [...(job.fallbackTrail || []), ...res.fallbackTrail];
           await updateJob(ctx, args.jobId, { fallbackTrail: newTrail });
        }
      }
    }

    if (allCards.length < requestedCount) {
      warnings.push(`Generated ${allCards.length} of ${requestedCount} requested cards after completion passes.`);
    }

    if (allCards.length === 0) {
      const detail = warnings.length > 0 ? ` (${warnings.join("; ")})` : "";
      await recordGenerationTelemetry(ctx, "generation_failed", {
        jobId: args.jobId,
        kind: "document",
        requestedCount,
        generatedCount: 0,
        sourceChars: text.length,
        metric: 0,
      });
      await updateJob(ctx, args.jobId, {
        status: "failed",
        error: `AI could not generate any cards from this document${detail}. Try again or use Quick Extract mode.`,
        message: "Generation failed",
      });
      throw new GenError("empty_output", `AI could not generate any cards from this document${detail}. Try again or use Quick Extract mode.`);
    }

    await updateJob(ctx, args.jobId, {
      status: "succeeded",
      progress: 1,
      etaSeconds: 0,
      resultDeckName: resultDeckName || deckName || "Document Deck",
      resultSummary: resultSummary,
      resultCards: allCards.slice(0, requestedCount),
      resultPartial: warnings.length > 0,
      resultWarnings: warnings,
      message: `Generated ${allCards.slice(0, requestedCount).length} cards`,
    });
    await recordGenerationTelemetry(ctx, "generation_completed", {
      jobId: args.jobId,
      kind: "document",
      requestedCount,
      generatedCount: allCards.slice(0, requestedCount).length,
      duplicateCount: Math.max(0, parsedCardCount - allCards.length),
      sourceChars: text.length,
      metric: allCards.length / requestedCount,
    });
    await ctx.scheduler.runAfter(0, api.providerAdvisor.maybeRun, {});

    return {
      deckName: resultDeckName || deckName || "Document Deck",
      summary: resultSummary,
      cards: allCards.slice(0, requestedCount),
      partial: warnings.length > 0,
      warnings,
    };
  },
});

export const generateDeckFromPrompt = action({
  args: {
    prompt: v.string(),
    deckName: v.optional(v.string()),
    cardCount: v.optional(v.number()),
    difficulty: v.optional(
      v.union(v.literal("beginner"), v.literal("intermediate"), v.literal("advanced"))
    ),
    jobId: v.optional(v.id("generationJobs")),
    preferredProvider: v.optional(v.string()),
  },
  handler: async (ctx: ActionCtx, args) => {
    const prompt = args.prompt.trim();
    if (!prompt) {
      throw new Error("Provide a topic or source text for deck generation");
    }

    const requestedCount = clampCardCount(args.cardCount ?? 12);
    const difficulty = args.difficulty ?? "intermediate";
    const deckName = args.deckName?.trim() ?? "";
    const { candidates, providerCount } = await getCandidateChain(ctx, args.preferredProvider);

    if (candidates.length === 0) {
      throw new GenError("no_providers", "No AI providers are configured.");
    }

    const timeoutSeconds = estimatePromptTimeoutSeconds(requestedCount);
    const deadlineAt = Date.now() + timeoutSeconds * 1000;
    const etaSeconds = estimatePromptEtaSeconds(requestedCount, candidates.length, providerCount);

    await updateJob(ctx, args.jobId, {
      status: "running",
      progress: 0,
      etaSeconds,
      timeoutSeconds,
      deadlineAt,
      message: `Preparing model chain across ${providerCount} provider(s) and ${candidates.length} model(s) (${formatSeconds(etaSeconds)} est.)`,
      provider: undefined,
      providerIndex: 0,
      totalProviders: providerCount,
      totalModels: candidates.length,
      sectionIndex: 0,
      totalSections: 1,
    });

    const systemPrompt = buildSystemPrompt(requestedCount, difficulty, deckName);
    const userContent = [
      `Topic or source text: ${prompt}`,
      `Preferred deck name: ${deckName || "auto-generate"}`,
      `Target card count: ${requestedCount}`,
      `Difficulty: ${difficulty}`,
    ].join("\n");

    const maxTokens = Math.min(12000, requestedCount * 90 + 300);
    
    let resultCards: any[] = [];
    let resultDeckName = deckName;
    let resultSummary = "";
    let parsedCardCount = 0;

    const res = await attemptWithProviderFallback({
      candidates,
      providerCount,
      systemPrompt,
      userContent,
      maxTokens,
      parser: parseAiDeckGeneration,
      onSuccess: async (parsed, candidate, content, usage) => {
        await recordUsage(ctx, args.jobId, "prompt", candidate, systemPrompt, userContent, content, usage);
        resultCards = parsed.cards.slice(0, requestedCount);
        resultDeckName = parsed.deckName;
        resultSummary = parsed.summary;
        parsedCardCount = parsed.cards.length;

        await updateJob(ctx, args.jobId, {
          status: "succeeded",
          progress: 1,
          etaSeconds: 0,
          provider: candidate.providerLabel,
          providerIndex: candidate.providerIndex,
          model: candidate.modelName,
          totalProviders: providerCount,
          totalModels: candidates.length,
          resultDeckName,
          resultSummary,
          resultCards,
          resultPartial: false,
          resultWarnings: [],
          message: `Generated ${resultCards.length} cards with ${candidate.providerLabel} / ${candidate.modelName}`,
        });
      },
      updateJob: (patch) => updateJob(ctx, args.jobId, patch),
      assertJobActive: () => assertJobActive(ctx, args.jobId),
      context: { ctx, jobId: args.jobId, deadlineAt, estimatedSeconds: etaSeconds, kind: "prompt" }
    });

    if (res.fallbackTrail.length > 0) {
      const job = await ctx.runQuery(api.generationJobs.get, { jobId: args.jobId! });
      if (job) {
         const newTrail = [...(job.fallbackTrail || []), ...res.fallbackTrail];
         await updateJob(ctx, args.jobId, { fallbackTrail: newTrail });
      }
    }

    if (!res.success) {
      if (isGenerationCanceledError(res.lastErr)) {
        await recordGenerationTelemetry(ctx, "generation_canceled", {
          jobId: args.jobId,
          kind: "prompt",
          requestedCount,
          metric: 1,
        });
        await updateJob(ctx, args.jobId, {
          status: "canceled",
          progress: 0,
          etaSeconds: 0,
          message: "Generation canceled",
        });
        throw res.lastErr;
      }

      const message = res.lastErr instanceof Error ? res.lastErr.message : String(res.lastErr);
      await recordGenerationTelemetry(ctx, "generation_failed", {
        jobId: args.jobId,
        kind: "prompt",
        requestedCount,
        generatedCount: 0,
        metric: 0,
      });
      await updateJob(ctx, args.jobId, {
        status: "failed",
        error: message,
        message: `Generation failed: ${message}`,
      });
      throw res.lastErr instanceof Error ? res.lastErr : new Error(message);
    }

    await recordGenerationTelemetry(ctx, "generation_completed", {
      jobId: args.jobId,
      kind: "prompt",
      requestedCount,
      generatedCount: Math.min(requestedCount, parsedCardCount),
      metric: Math.min(requestedCount, parsedCardCount) / requestedCount,
    });
    await ctx.scheduler.runAfter(0, api.providerAdvisor.maybeRun, {});
    return {
      deckName: resultDeckName,
      summary: resultSummary,
      cards: resultCards,
    };
  },
});
