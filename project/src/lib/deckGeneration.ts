import { z } from "zod";

export const aiFlashcardSchema = z.object({
  front: z.string().trim().min(1).max(800),
  back: z.string().trim().max(1200).optional().default(""),
});

export const aiDeckGenerationSchema = z.object({
  deckName: z.string().trim().max(80).optional().default(""),
  summary: z.string().trim().max(240).optional().default(""),
  cards: z.array(aiFlashcardSchema).min(1).max(100),
});

export type AiFlashcard = z.infer<typeof aiFlashcardSchema>;
export type AiDeckGenerationResult = z.infer<typeof aiDeckGenerationSchema>;

export function extractJsonObject(text: string): string | null {
  const trimmed = text.trim();

  // 1. Try fenced code block first (```json ... ``` or ``` ... ```)
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    const candidate = fencedMatch[1].trim();
    if (isValidJsonStart(candidate)) {
      return candidate;
    }
  }

  // 2. Strict brace matching: find the first '{' then track depth to find
  //    the matching '}'. This avoids capturing the wrong range when models
  //    emit prose before the JSON object.
  const start = trimmed.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < trimmed.length; i++) {
    const ch = trimmed[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return trimmed.slice(start, i + 1).trim();
      }
    }
  }

  // 3. Ultra-fallback: find the first position where depth returns to 0
  //    using the same quote-aware scan as step 2. This avoids capturing
  //    trailing prose after a truncated JSON object (P3).
  depth = 0;
  inString = false;
  escaped = false;
  for (let i = start; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return trimmed.slice(start, i + 1).trim();
      }
    }
  }
  // If we never found a balanced close, return null (don't guess)
  return null;
}

function isValidJsonStart(text: string): boolean {
  const firstNonWs = text.search(/\S/);
  return firstNonWs >= 0 && text[firstNonWs] === "{";
}

export function parseAiDeckGeneration(text: string): AiDeckGenerationResult {
  const candidate = extractJsonObject(text);
  if (!candidate) {
    throw new Error("AI response did not include JSON output");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    throw new Error("AI response was not valid JSON");
  }

  const result = aiDeckGenerationSchema.parse(parsed);
  const seen = new Set<string>();

  return {
    ...result,
    cards: result.cards.filter((card) => {
      const key = `${card.front.toLowerCase().trim()}::${card.back.toLowerCase().trim()}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    }),
  };
}
