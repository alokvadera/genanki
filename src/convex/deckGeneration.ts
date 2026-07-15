"use node";

import { action, type ActionCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { api } from "./_generated/api";
import { buildModelCandidates, callChatCompletion, type AiModelCandidate } from "./aiProviders";
import { parseAiDeckGeneration } from "../lib/deckGeneration";

const REQUEST_TIMEOUT_MS = 60_000;
const FALLBACK_PENALTY_SECONDS = 18;

function clampCardCount(value: number): number {
  if (!Number.isFinite(value)) {
    return 12;
  }
  return Math.min(100, Math.max(4, Math.round(value)));
}

type ModelCandidate = {
  provider: AiModelCandidate["provider"];
  providerLabel: string;
  baseUrl: string;
  headers: Record<string, string>;
  modelId: string;
  modelName: string;
  supportsJsonMode: boolean;
  providerIndex: number;
};

type JobPatch = {
  status?: "queued" | "running" | "succeeded" | "failed";
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
  error?: string;
};

function estimatePromptSeconds(cardCount: number, modelCount: number, providerCount: number): number {
  return Math.max(24, Math.round(10 + cardCount * 1.6 + Math.max(0, modelCount - 1) * 1.5 + Math.max(0, providerCount - 1) * 4));
}

function estimateDocumentSeconds(
  cardCount: number,
  sectionCount: number,
  modelCount: number,
  providerCount: number,
): number {
  return Math.max(
    28,
    Math.round(14 + cardCount * 1.8 + sectionCount * 6 + Math.max(0, modelCount - 1) * 1.5 + Math.max(0, providerCount - 1) * 4),
  );
}

function formatSeconds(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safe / 60);
  const remaining = safe % 60;
  if (minutes <= 0) return `${remaining}s`;
  return `${minutes}m ${String(remaining).padStart(2, "0")}s`;
}

function compactProviderOrder(candidates: AiModelCandidate[]): {
  candidates: Array<AiModelCandidate & { providerIndex: number }>;
  providerCount: number;
} {
  const providerOrder = new Map<string, number>();
  for (const candidate of candidates) {
    if (!providerOrder.has(candidate.provider)) {
      providerOrder.set(candidate.provider, providerOrder.size);
    }
  }

  return {
    candidates: candidates.map((candidate) => ({
      ...candidate,
      providerIndex: providerOrder.get(candidate.provider) ?? 0,
    })),
    providerCount: providerOrder.size,
  };
}

function rotateCandidates<T>(items: T[], startIndex: number): T[] {
  if (items.length === 0) return items;
  const start = ((startIndex % items.length) + items.length) % items.length;
  return [...items.slice(start), ...items.slice(0, start)];
}

function buildSystemPrompt(cardCount: number, difficulty: string, deckName: string) {
  return [
    "You generate high-quality Anki flashcards.",
    "Return only valid JSON that matches this schema:",
    '{ "deckName": string, "summary": string, "cards": [{ "front": string, "back": string }] }',
    "Keep the deck title concise and informative.",
    "Keep cards atomic, factual, and non-overlapping.",
    "Fronts may be detailed prompts or questions and can be as long as the topic needs.",
    "Backs must be a single word or a very short phrase (one or two words max). Never write sentences or explanations.",
    `Generate exactly ${cardCount} cards if the topic supports it.`,
    `Difficulty target: ${difficulty}.`,
    deckName ? `User preference for the deck name: ${deckName}.` : "Choose the best deck name yourself.",
    "Do not include markdown fences, commentary, or additional keys.",
  ].join(" ");
}

async function getCandidateChain(): Promise<{
  candidates: Array<ModelCandidate>;
  providerCount: number;
}> {
  const built = await buildModelCandidates();
  const { candidates, providerCount } = compactProviderOrder(built);

  return {
    candidates: candidates.map((candidate) => ({
      provider: candidate.provider,
      providerLabel: candidate.providerLabel,
      baseUrl: candidate.baseUrl,
      headers: candidate.headers,
      modelId: candidate.modelId,
      modelName: candidate.modelName,
      supportsJsonMode: candidate.supportsJsonMode,
      providerIndex: candidate.providerIndex,
    })),
    providerCount,
  };
}

const MAX_CHUNK_SIZE = 6000;
const MAX_CHUNKS = 3;

/**
 * Split text into chunks of at most MAX_CHUNK_SIZE characters,
 * breaking on paragraph boundaries. If there are more chunks than
 * MAX_CHUNKS, evenly sample across the document so all sections are
 * represented rather than only the beginning.
 */
function chunkText(text: string): string[] {
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

  if (chunks.length <= MAX_CHUNKS) return chunks;

  const sampled: string[] = [];
  const step = (chunks.length - 1) / (MAX_CHUNKS - 1);
  for (let i = 0; i < MAX_CHUNKS; i++) {
    sampled.push(chunks[Math.round(i * step)]);
  }
  return sampled;
}

function buildDocumentSystemPrompt(cardCount: number, difficulty: string, deckName: string) {
  return [
    "You create Anki flashcards from a document's content.",
    "Extract the most important facts, definitions, concepts, and relationships from the provided text.",
    "Base every card strictly on the content — do not invent information not present in the text.",
    "Return only valid JSON that matches this schema:",
    '{ "deckName": string, "summary": string, "cards": [{ "front": string, "back": string }] }',
    "Keep cards atomic, factual, and non-overlapping.",
    "Fronts may be detailed prompts or questions and can be as long as the content needs.",
    "Backs must be a single word or a very short phrase (one or two words max). Never write sentences or explanations.",
    `Generate at most ${cardCount} cards from this section of the document.`,
    `Difficulty target: ${difficulty}.`,
    deckName ? `Use this deck name: ${deckName}.` : "Choose the best deck name based on the content.",
    "Do not include markdown fences, commentary, or additional keys.",
  ].join(" ");
}

async function updateJob(
  ctx: ActionCtx,
  jobId: Id<"generationJobs"> | undefined,
  patch: JobPatch,
): Promise<void> {
  if (!jobId) return;
  await ctx.runMutation(api.generationJobs.update, {
    jobId,
    ...patch,
  });
}

function progressForPromptAttempt(attempt: number, totalAttempts: number): number {
  if (totalAttempts <= 0) return 0;
  return Math.min(0.95, attempt / totalAttempts);
}

function progressForDocumentSection(sectionIndex: number, totalSections: number): number {
  if (totalSections <= 0) return 0;
  return Math.min(0.95, sectionIndex / totalSections);
}

export const generateDeckFromDocument = action({
  args: {
    text: v.string(),
    deckName: v.optional(v.string()),
    cardCount: v.optional(v.number()),
    difficulty: v.optional(
      v.union(v.literal("beginner"), v.literal("intermediate"), v.literal("advanced"))
    ),
    jobId: v.optional(v.id("generationJobs")),
  },
  handler: async (ctx: ActionCtx, args: {
    text: string;
    deckName?: string;
    cardCount?: number;
    difficulty?: "beginner" | "intermediate" | "advanced";
    jobId?: Id<"generationJobs">;
  }) => {
    const text = args.text.trim();
    if (!text) {
      throw new Error("No text was extracted from the document");
    }

    const requestedCount = clampCardCount(args.cardCount ?? 12);
    const difficulty = args.difficulty ?? "intermediate";
    const deckName = args.deckName?.trim() ?? "";
    const { candidates, providerCount } = await getCandidateChain();

    if (candidates.length === 0) {
      throw new Error("No AI providers are configured. Add GROQ_API_KEY, CEREBRAS_API_KEY, or OPENROUTER_API_KEY.");
    }

    const chunks = chunkText(text);
    const totalSections = chunks.length;
    let estimatedSeconds = estimateDocumentSeconds(requestedCount, totalSections, candidates.length, providerCount);

    await updateJob(ctx, args.jobId, {
      status: "running",
      progress: 0,
      etaSeconds: estimatedSeconds,
      message: `Preparing document generation across ${providerCount} provider(s) and ${candidates.length} model(s) (${formatSeconds(estimatedSeconds)} est.)`,
      provider: undefined,
      providerIndex: 0,
      totalProviders: providerCount,
      totalModels: candidates.length,
      sectionIndex: 0,
      totalSections,
    });

    const cardsPerChunk = Math.ceil(requestedCount / chunks.length);
    const maxTokens = Math.min(12000, cardsPerChunk * 120 + 400);

    const allCards: Array<{ front: string; back: string }> = [];
    let resultDeckName = deckName;
    let resultSummary = "";
    const seen = new Set<string>();
    const warnings: string[] = [];
    let modelCursor = 0;

    for (let i = 0; i < chunks.length; i++) {
      const systemPrompt = buildDocumentSystemPrompt(cardsPerChunk, difficulty, deckName);
      const userContent = [
        `Document content (section ${i + 1} of ${chunks.length}):`,
        chunks[i],
        `Preferred deck name: ${deckName || "auto-generate"}`,
        `Cards to generate from this section: ${cardsPerChunk}`,
        `Difficulty: ${difficulty}`,
      ].join("\n");

      let lastErr: unknown = null;
      let success = false;
      for (let attempt = 0; attempt < candidates.length && !success; attempt++) {
        const candidate = candidates[modelCursor % candidates.length];
        modelCursor++;
        try {
          await updateJob(ctx, args.jobId, {
            provider: candidate.providerLabel,
            providerIndex: candidate.providerIndex,
            model: candidate.modelName,
            modelIndex: (modelCursor - 1) % candidates.length,
            sectionIndex: i,
            progress: progressForDocumentSection(i, totalSections),
            etaSeconds: estimatedSeconds + attempt * FALLBACK_PENALTY_SECONDS,
            totalProviders: providerCount,
            totalModels: candidates.length,
            message: `Section ${i + 1}/${chunks.length}: trying ${candidate.providerLabel} / ${candidate.modelName} (${formatSeconds(estimatedSeconds + attempt * FALLBACK_PENALTY_SECONDS)} est.)`,
          });
          if (attempt > 0) {
            await new Promise((r) => setTimeout(r, 1000 * attempt));
          }
          const content = await callChatCompletion({
            candidate,
            systemPrompt,
            userContent,
            maxTokens,
          });
          const parsed = parseAiDeckGeneration(content);

          // Use the most consistent deck name: prefer user override, then first successful response
          if (!resultDeckName) resultDeckName = parsed.deckName;
          if (!resultSummary) resultSummary = parsed.summary;

          for (const card of parsed.cards) {
            const key = `${card.front.toLowerCase().trim()}::${card.back.toLowerCase().trim()}`;
            if (!seen.has(key)) {
              seen.add(key);
              allCards.push(card);
            }
          }
          success = true;
        } catch (err) {
          lastErr = err;
          estimatedSeconds += FALLBACK_PENALTY_SECONDS;
          await updateJob(ctx, args.jobId, {
            etaSeconds: estimatedSeconds,
            provider: candidate.providerLabel,
            providerIndex: candidate.providerIndex,
            model: candidate.modelName,
            modelIndex: (modelCursor - 1) % candidates.length,
            totalProviders: providerCount,
            totalModels: candidates.length,
            message: `Section ${i + 1}/${chunks.length}: ${candidate.providerLabel} / ${candidate.modelName} failed, switching models`,
          });
        }
      }
      if (!success && lastErr) {
        warnings.push(`section ${i + 1}: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
      }
      await updateJob(ctx, args.jobId, {
        progress: progressForDocumentSection(i + 1, totalSections),
        sectionIndex: i + 1,
      });
    }

    if (allCards.length === 0) {
      const detail = warnings.length > 0 ? ` (${warnings.join("; ")})` : "";
      await updateJob(ctx, args.jobId, {
        status: "failed",
        error: `AI could not generate any cards from this document${detail}. Try again or use Quick Extract mode.`,
        message: "Generation failed",
      });
      throw new Error(`AI could not generate any cards from this document${detail}. Try again or use Quick Extract mode.`);
    }

    await updateJob(ctx, args.jobId, {
      status: "succeeded",
      progress: 1,
      etaSeconds: 0,
      message: `Generated ${allCards.slice(0, requestedCount).length} cards`,
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
  },
  handler: async (ctx: ActionCtx, args: {
    prompt: string;
    deckName?: string;
    cardCount?: number;
    difficulty?: "beginner" | "intermediate" | "advanced";
    jobId?: Id<"generationJobs">;
  }) => {
    const prompt = args.prompt.trim();
    if (!prompt) {
      throw new Error("Provide a topic or source text for deck generation");
    }

    const requestedCount = clampCardCount(args.cardCount ?? 12);
    const difficulty = args.difficulty ?? "intermediate";
    const deckName = args.deckName?.trim() ?? "";
    const { candidates, providerCount } = await getCandidateChain();

    if (candidates.length === 0) {
      throw new Error("No AI providers are configured. Add GROQ_API_KEY, CEREBRAS_API_KEY, or OPENROUTER_API_KEY.");
    }

    let etaSeconds = estimatePromptSeconds(requestedCount, candidates.length, providerCount);

    await updateJob(ctx, args.jobId, {
      status: "running",
      progress: 0,
      etaSeconds,
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
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < candidates.length; attempt++) {
      const candidate = candidates[attempt % candidates.length];
      try {
        await updateJob(ctx, args.jobId, {
          provider: candidate.providerLabel,
          providerIndex: candidate.providerIndex,
          model: candidate.modelName,
          modelIndex: attempt,
          progress: progressForPromptAttempt(attempt, candidates.length),
          etaSeconds,
          totalProviders: providerCount,
          totalModels: candidates.length,
          message: `Trying ${candidate.providerLabel} / ${candidate.modelName} (${formatSeconds(etaSeconds)} est.)`,
        });
        const content = await callChatCompletion({
          candidate,
          systemPrompt,
          userContent,
          maxTokens,
        });
        const parsed = parseAiDeckGeneration(content);
        await updateJob(ctx, args.jobId, {
          status: "succeeded",
          progress: 1,
          etaSeconds: 0,
          provider: candidate.providerLabel,
          providerIndex: candidate.providerIndex,
          model: candidate.modelName,
          modelIndex: attempt,
          totalProviders: providerCount,
          totalModels: candidates.length,
          message: `Generated ${parsed.cards.length} cards with ${candidate.providerLabel} / ${candidate.modelName}`,
        });
        return {
          deckName: parsed.deckName,
          summary: parsed.summary,
          cards: parsed.cards.slice(0, requestedCount),
        };
      } catch (err) {
        lastErr = err;
        etaSeconds += FALLBACK_PENALTY_SECONDS;
        await updateJob(ctx, args.jobId, {
          etaSeconds,
          provider: candidate.providerLabel,
          providerIndex: candidate.providerIndex,
          model: candidate.modelName,
          modelIndex: attempt,
          totalProviders: providerCount,
          totalModels: candidates.length,
          message: `${candidate.providerLabel} / ${candidate.modelName} failed, switching to another provider or model`,
        });
      }
    }

    const message = lastErr instanceof Error ? lastErr.message : String(lastErr);
    await updateJob(ctx, args.jobId, {
      status: "failed",
      error: message,
      message: `Generation failed: ${message}`,
    });
    throw lastErr instanceof Error ? lastErr : new Error(message);
  },
});
