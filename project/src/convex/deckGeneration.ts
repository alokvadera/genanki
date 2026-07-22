"use node";

import { action, type ActionCtx } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import { parseAiDeckGeneration } from "../lib/deckGeneration";
import {
  estimateDocumentEtaSeconds,
  estimateDocumentTimeoutSeconds,
  estimatePromptEtaSeconds,
  estimatePromptTimeoutSeconds,
} from "../lib/generationTiming";
import { buildDocumentSystemPrompt, buildSystemPrompt } from "./promptBuilder";
import { attemptWithProviderFallback } from "./providerOrchestrator";
import { GenError, isGenerationCanceledError } from "./errors";
import { hashIp } from "./encryption";
import {
  getCandidateChain,
  updateJob,
  recordUsage,
  recordGenerationTelemetry,
  appendFallbackTrail,
  assertJobActive,
  enforceIpRateLimit,
} from "./deckHelpers";
import { clampCardCount, chunkText, MAX_CHUNKS } from "./deckChunking";

// Re-export for backward compatibility (used by deckGeneration.test.ts and others)
export { clampCardCount, chunkText } from "./deckChunking";

// (P5) Import and re-export for backward compatibility — primary definition moved to generationTiming.ts
import { formatSeconds } from "../lib/generationTiming";
export { formatSeconds };

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
    cardType: v.optional(v.union(v.literal("basic"), v.literal("cloze"))),
    deviceToken: v.optional(v.string()),
  },
  handler: async (ctx: ActionCtx, args) => {
    const text = args.text.trim();
    if (!text) {
      throw new Error("No text was extracted from the document");
    }

    const metadata = await ctx.meta.getRequestMetadata();
    const ip = metadata?.ip || "127.0.0.1";
    const creatorIpHash = hashIp(ip);
    const creatorDeviceIdHash = args.deviceToken ? hashIp(args.deviceToken) : undefined;
    const keySeed = args.deviceToken || ip;

    const requestedCount = clampCardCount(args.cardCount ?? 12);
    const difficulty = args.difficulty ?? "intermediate";
    const deckName = args.deckName?.trim() ?? "";
    const instructions = args.instructions?.trim() ?? "";
    const { candidates, providerCount } = await getCandidateChain(ctx, args.preferredProvider);

    if (candidates.length === 0) {
      throw new GenError("no_providers", "No AI providers are configured.");
    }

    const adaptiveSettings = await ctx.runQuery(api.rateLimits.adaptiveSettings, {});
    const completionPasses = adaptiveSettings?.completionPasses ?? 3;
    const naturalChunks = chunkText(text);
    const maxChunks = Math.min(
      adaptiveSettings?.documentMaxChunks ?? MAX_CHUNKS,
      naturalChunks.length
    );
    const chunks = naturalChunks.length > maxChunks ? chunkText(text, maxChunks) : naturalChunks;
    const totalSections = chunks.length;

    const estimatedTokens = totalSections * Math.ceil(requestedCount / totalSections) * 120 + totalSections * 400;

    await enforceIpRateLimit(ctx, ip, estimatedTokens, creatorDeviceIdHash);

    const timeoutSeconds = estimateDocumentTimeoutSeconds(requestedCount, totalSections);
    const deadlineAt = Date.now() + timeoutSeconds * 1000;
    const estimatedSeconds = estimateDocumentEtaSeconds(requestedCount, totalSections, candidates.length, providerCount);

    await updateJob(ctx, args.jobId, {
      creatorIpHash,
      ...(creatorDeviceIdHash !== undefined && { creatorDeviceIdHash }),
      status: "running",
      progress: 0,
      etaSeconds: estimatedSeconds,
      timeoutSeconds,
      deadlineAt,
      message: `Preparing generation across ${providerCount} provider(s) and ${candidates.length} model(s) (${formatSeconds(estimatedSeconds)} est.)`,
      providerIndex: 0,
      totalProviders: providerCount,
      totalModels: candidates.length,
      sectionIndex: 0,
      totalSections,
    }, keySeed);

    const allCards: Array<{ front: string; back: string }> = [];
    let parsedCardCount = 0;
    let totalTokensUsed = 0;
    let resultDeckName = deckName;
    let resultSummary = "";
    const seen = new Set<string>();
    const warnings: string[] = [];

    // Dedupe cleaner: lowercase, strip leading/trailing punctuation independently per side,
    // then collapse internal whitespace for more robust near-duplicate detection
    const normalizeCardText = (s: string) =>
      s.toLowerCase().replace(/^[^\w]+/, '').replace(/[^\w]+$/, '').replace(/\s+/g, ' ').trim();

    try {
    for (let i = 0; i < chunks.length; i++) {
      const remainingTarget = Math.max(1, requestedCount - allCards.length);
      const cardsForSection = Math.max(1, Math.ceil(remainingTarget / (chunks.length - i)));
      const systemPrompt = buildDocumentSystemPrompt(cardsForSection, difficulty, deckName, instructions, args.cardType);
      const userContent = [
        `Document content (section ${i + 1} of ${chunks.length}):`,
        chunks[i],
        `Preferred deck name: ${deckName || "auto-generate"}`,
        `Cards to generate from this section: ${cardsForSection}`,
        `Difficulty: ${difficulty}`,
        instructions ? `User instructions: ${instructions}` : "",
      ].join("\n");
      const maxTokens = Math.min(4096, cardsForSection * 120 + 400);

      const res = await attemptWithProviderFallback({
        candidates,
        providerCount,
        systemPrompt,
        userContent,
        maxTokens,
        parser: parseAiDeckGeneration,
        onSuccess: async (parsed, candidate, content, usage) => {
          await recordUsage(ctx, args.jobId, "document", candidate, systemPrompt, userContent, content, usage, ip, creatorDeviceIdHash);
          parsedCardCount += parsed.cards.length;
          if (!resultDeckName) resultDeckName = parsed.deckName;
          if (!resultSummary) resultSummary = parsed.summary;

          // Accumulate tokens used for telemetry (P5)
          if (usage?.totalTokens) totalTokensUsed += usage.totalTokens;

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
          }, keySeed);
        },
        updateJob: (patch) => updateJob(ctx, args.jobId, patch, keySeed),
        assertJobActive: () => assertJobActive(ctx, args.jobId),
        context: { ctx, ...(args.jobId !== undefined && { jobId: args.jobId }), deadlineAt, estimatedSeconds, sectionIndex: i, totalSections, kind: "document" as const }
      });

      if (!res.success && res.lastErr) {
        warnings.push(`section ${i + 1}: ${res.lastErr instanceof Error ? res.lastErr.message : String(res.lastErr)}`);
      }
      await appendFallbackTrail(ctx, args.jobId, res.fallbackTrail, keySeed);

      await updateJob(ctx, args.jobId, {
        progress: Math.min(0.95, (i + 1) / totalSections),
        sectionIndex: i + 1,
      }, keySeed);
    }

    // Completion passes
    for (let pass = 0; pass < completionPasses && allCards.length < requestedCount; pass++) {
      const missing = requestedCount - allCards.length;
      const source = chunks[pass % chunks.length];
      const completionSystemPrompt = [
        buildDocumentSystemPrompt(missing, difficulty, deckName, instructions, args.cardType),
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
      const maxTokens = Math.min(4096, missing * 120 + 400);

      const res = await attemptWithProviderFallback({
        candidates,
        providerCount,
        systemPrompt: completionSystemPrompt,
        userContent: completionUserContent,
        maxTokens,
        parser: parseAiDeckGeneration,
        onSuccess: async (parsed, candidate, content, usage) => {
          await recordUsage(ctx, args.jobId, "document", candidate, completionSystemPrompt, completionUserContent, content, usage, ip, creatorDeviceIdHash);
          parsedCardCount += parsed.cards.length;
          // Accumulate tokens for telemetry (P5)
          if (usage?.totalTokens) totalTokensUsed += usage.totalTokens;
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
          }, keySeed);
        },
        updateJob: (patch) => updateJob(ctx, args.jobId, patch, keySeed),
        assertJobActive: () => assertJobActive(ctx, args.jobId),
        context: { ctx, ...(args.jobId !== undefined && { jobId: args.jobId }), deadlineAt, estimatedSeconds, sectionIndex: chunks.length, totalSections, kind: "document" as const }
      });

      if (!res.success && res.lastErr) {
        warnings.push(`completion pass ${pass + 1}: ${res.lastErr instanceof Error ? res.lastErr.message : String(res.lastErr)}`);
      }
      
      await appendFallbackTrail(ctx, args.jobId, res.fallbackTrail, keySeed);
    }
    } catch (err) {
      if (isGenerationCanceledError(err)) {
        await updateJob(ctx, args.jobId, {
          status: "canceled", progress: 0, etaSeconds: 0, message: "Generation canceled",
        }, keySeed);
        throw err;
      }
      // Deadline exceeded — return partial results gracefully
      if (err instanceof GenError && err.kind === "deadline") {
        warnings.push("Generation timed out — returning partial results.");
        // Fall through to success path below with whatever cards we have
      } else {
        // For other errors, still return partial if we have ANY cards
        if (allCards.length === 0) throw err;
        warnings.push(`Generation interrupted: ${err instanceof Error ? err.message : String(err)}`);
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
      }, keySeed);
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
    }, keySeed);
    await recordGenerationTelemetry(ctx, "generation_completed", {
      jobId: args.jobId,
      kind: "document",
      requestedCount,
      generatedCount: allCards.slice(0, requestedCount).length,
      duplicateCount: Math.max(0, parsedCardCount - allCards.length),
      sourceChars: text.length,
      tokensUsed: totalTokensUsed, // (P5) accumulate real token usage
      metric: allCards.length / requestedCount,
    });

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
    cardType: v.optional(v.union(v.literal("basic"), v.literal("cloze"))),
    deviceToken: v.optional(v.string()),
  },
  handler: async (ctx: ActionCtx, args) => {
    const prompt = args.prompt.trim();
    if (!prompt) {
      throw new Error("Provide a topic or source text for deck generation");
    }

    const metadata = await ctx.meta.getRequestMetadata();
    const ip = metadata?.ip || "127.0.0.1";
    const creatorIpHash = hashIp(ip);
    const creatorDeviceIdHash = args.deviceToken ? hashIp(args.deviceToken) : undefined;
    const keySeed = args.deviceToken || ip;

    const requestedCount = clampCardCount(args.cardCount ?? 12);
    const difficulty = args.difficulty ?? "intermediate";
    const deckName = args.deckName?.trim() ?? "";
    const { candidates, providerCount } = await getCandidateChain(ctx, args.preferredProvider);

    if (candidates.length === 0) {
      throw new GenError("no_providers", "No AI providers are configured.");
    }

    const estimatedTokens = Math.min(4096, requestedCount * 90 + 300);

    await enforceIpRateLimit(ctx, ip, estimatedTokens, creatorDeviceIdHash);

    const timeoutSeconds = estimatePromptTimeoutSeconds(requestedCount);
    const deadlineAt = Date.now() + timeoutSeconds * 1000;
    const etaSeconds = estimatePromptEtaSeconds(requestedCount, candidates.length, providerCount);

    await updateJob(ctx, args.jobId, {
      creatorIpHash,
      ...(creatorDeviceIdHash !== undefined && { creatorDeviceIdHash }),
      status: "running",
      progress: 0,
      etaSeconds,
      timeoutSeconds,
      deadlineAt,
      message: `Preparing model chain across ${providerCount} provider(s) and ${candidates.length} model(s) (${formatSeconds(etaSeconds)} est.)`,
      providerIndex: 0,
      totalProviders: providerCount,
      totalModels: candidates.length,
      sectionIndex: 0,
      totalSections: 1,
    }, keySeed);

    const systemPrompt = buildSystemPrompt(requestedCount, difficulty, deckName, args.cardType);
    const userContent = [
      `Topic or source text: ${prompt}`,
      `Preferred deck name: ${deckName || "auto-generate"}`,
      `Target card count: ${requestedCount}`,
      `Difficulty: ${difficulty}`,
    ].join("\n");

    const maxTokens = Math.min(4096, requestedCount * 90 + 300);
    
    let resultCards: Array<{ front: string; back: string }> = [];
    let resultDeckName = deckName;
    let resultSummary = "";
    let parsedCardCount = 0;
    let promptTokensUsed = 0; // (P5) capture tokens from onSuccess

    const res = await attemptWithProviderFallback({
      candidates,
      providerCount,
      systemPrompt,
      userContent,
      maxTokens,
      parser: parseAiDeckGeneration,
      onSuccess: async (parsed, candidate, content, usage) => {
        await recordUsage(ctx, args.jobId, "prompt", candidate, systemPrompt, userContent, content, usage, ip, creatorDeviceIdHash);
        resultCards = parsed.cards.slice(0, requestedCount);
        resultDeckName = parsed.deckName;
        resultSummary = parsed.summary;
        parsedCardCount = parsed.cards.length;
        if (usage?.totalTokens) promptTokensUsed = usage.totalTokens; // (P5)

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
        }, keySeed);
      },
      updateJob: (patch) => updateJob(ctx, args.jobId, patch, keySeed),
      assertJobActive: () => assertJobActive(ctx, args.jobId),
      context: { ctx, ...(args.jobId !== undefined && { jobId: args.jobId }), deadlineAt, estimatedSeconds: etaSeconds, kind: "prompt" as const }
    });

    await appendFallbackTrail(ctx, args.jobId, res.fallbackTrail, keySeed);

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
        }, keySeed);
        throw res.lastErr;
      }

      // If deadline exceeded but we got partial cards from onSuccess, use them
      if (resultCards.length > 0) {
        const deadlineMsg = res.lastErr instanceof Error ? res.lastErr.message : String(res.lastErr);
        await updateJob(ctx, args.jobId, {
          status: "succeeded",
          progress: 1,
          etaSeconds: 0,
          resultDeckName: resultDeckName || deckName || "AI Deck",
          resultSummary,
          resultCards: resultCards.slice(0, requestedCount),
          resultPartial: true,
          resultWarnings: [`Generation timed out — ${deadlineMsg}. Returning ${resultCards.length} partial cards.`],
          message: `Generated ${resultCards.length} cards (partial — hit deadline)`,
        }, keySeed);
        await recordGenerationTelemetry(ctx, "generation_completed", {
          jobId: args.jobId,
          kind: "prompt",
          requestedCount,
          generatedCount: resultCards.length,
          tokensUsed: promptTokensUsed,
          metric: resultCards.length / requestedCount,
        });
        return {
          deckName: resultDeckName || deckName || "AI Deck",
          summary: resultSummary,
          cards: resultCards.slice(0, requestedCount),
          partial: true,
          warnings: [`Generation timed out. Returning ${resultCards.length} partial cards.`],
        };
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
      }, keySeed);
      throw res.lastErr instanceof Error ? res.lastErr : new Error(message);
    }

    await recordGenerationTelemetry(ctx, "generation_completed", {
      jobId: args.jobId,
      kind: "prompt",
      requestedCount,
      generatedCount: Math.min(requestedCount, parsedCardCount),
      tokensUsed: promptTokensUsed, // (P5)
      metric: Math.min(requestedCount, parsedCardCount) / requestedCount,
    });

    return {
      deckName: resultDeckName || deckName || "AI Deck",
      summary: resultSummary,
      cards: resultCards,
    };
  },
});
