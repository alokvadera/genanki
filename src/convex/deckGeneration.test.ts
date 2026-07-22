import { describe, it, expect } from "vitest";
import {
  chunkText,
  formatSeconds,
  clampCardCount,
} from "./deckGeneration";
import { groupCandidatesByProvider } from "./availableProviders";

// ---------------------------------------------------------------------------
// formatSeconds
// ---------------------------------------------------------------------------
describe("formatSeconds", () => {
  it("formats 0 seconds", () => {
    expect(formatSeconds(0)).toBe("0s");
  });

  it("formats sub-minute values", () => {
    expect(formatSeconds(5)).toBe("5s");
    expect(formatSeconds(59)).toBe("59s");
  });

  it("formats exactly 1 minute", () => {
    expect(formatSeconds(60)).toBe("1m 00s");
  });

  it("formats minutes with seconds", () => {
    expect(formatSeconds(90)).toBe("1m 30s");
    expect(formatSeconds(125)).toBe("2m 05s");
  });

  it("formats large values", () => {
    expect(formatSeconds(3600)).toBe("60m 00s");
    expect(formatSeconds(3661)).toBe("61m 01s");
  });

  it("rounds fractional seconds", () => {
    expect(formatSeconds(2.3)).toBe("2s");
    expect(formatSeconds(2.7)).toBe("3s");
  });

  it("clamps negative values to 0", () => {
    expect(formatSeconds(-10)).toBe("0s");
    expect(formatSeconds(-0.5)).toBe("0s");
  });

  it("handles NaN as 0", () => {
    expect(formatSeconds(NaN)).toBe("0s");
  });

  it("handles Infinity as 0", () => {
    expect(formatSeconds(Infinity)).toBe("0s");
  });
});

// ---------------------------------------------------------------------------
// clampCardCount
// ---------------------------------------------------------------------------
describe("clampCardCount", () => {
  it("returns the value when valid", () => {
    expect(clampCardCount(12)).toBe(12);
    expect(clampCardCount(1)).toBe(1);
    expect(clampCardCount(500)).toBe(500);
  });

  it("rounds fractional values", () => {
    expect(clampCardCount(12.4)).toBe(12);
    expect(clampCardCount(12.6)).toBe(13);
  });

  it("clamps to minimum of 1", () => {
    expect(clampCardCount(0)).toBe(1);
    expect(clampCardCount(-5)).toBe(1);
  });

  it("clamps to maximum of 1000", () => {
    expect(clampCardCount(1001)).toBe(1000);
    expect(clampCardCount(5000)).toBe(1000);
  });

  it("returns default 12 for NaN", () => {
    expect(clampCardCount(NaN)).toBe(12);
  });

  it("returns default 12 for Infinity", () => {
    expect(clampCardCount(Infinity)).toBe(12);
    expect(clampCardCount(-Infinity)).toBe(12);
  });
});



// ---------------------------------------------------------------------------
// chunkText
// ---------------------------------------------------------------------------
describe("chunkText", () => {
  it("returns empty array for empty input", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   ")).toEqual([]);
  });

  it("splits when combined paragraphs exceed MAX_CHUNK_SIZE", () => {
    // Each paragraph ~600 words × 5 chars = ~3000 chars. Two combined = ~6000.
    // With MAX_CHUNK_SIZE = 9000, we need more to trigger a split.
    const filler = "word ".repeat(950);
    const p1 = `First paragraph ${filler}end.`;
    const p2 = `Second paragraph ${filler}end.`;
    const text = `${p1}\n\n${p2}`;
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });

  it("respects maxChunks limit by sampling", () => {
    const filler = "x".repeat(3200);
    const paragraphs: string[] = [];
    for (let i = 0; i < 15; i++) {
      paragraphs.push(`Paragraph ${String(i).padStart(2, "0")} ${filler}`);
    }
    const text = paragraphs.join("\n\n");
    const chunks = chunkText(text, 5);
    expect(chunks.length).toBeLessThanOrEqual(5);
  });

  it("handles very long paragraphs by splitting sentences", () => {
    const longSentence = "This is a sentence with enough words to fill space for testing the chunking logic. ".repeat(200);
    const text = `${longSentence}\n\nThis is another paragraph that provides additional content for the test.`;
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(10000);
    }
  });

  it("filters out empty/short paragraphs", () => {
    const filler = "word ".repeat(600);
    const text = `A\n\n\n\nB\n\nReal paragraph that is long enough ${filler}end.`;
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    for (const chunk of chunks) {
      expect(chunk.trim().length).toBeGreaterThan(15);
    }
  });

  it("preserves paragraph content within chunks", () => {
    const filler = "biology ".repeat(400);
    const text = `First paragraph about ${filler}end.\n\nSecond paragraph about chemistry elements ${filler}end.`;
    const chunks = chunkText(text);
    const allText = chunks.join(" ");
    expect(allText).toContain("biology");
    expect(allText).toContain("chemistry");
  });

  it("produces ~4 sections from a 40k-char doc at MAX_CHUNK_SIZE=9000 (vs ~7 at old 6000)", () => {
    // 40 text blocks of ~1000 chars each = ~40,000 chars total
    const paragraphs: string[] = [];
    for (let i = 0; i < 40; i++) {
      paragraphs.push(
        `Section ${String(i).padStart(2, "0")} ` +
        "word ".repeat(180) + // ~900 chars
        "sentence that ends here. " +
        "More content to fill up the paragraph boundary. ".repeat(5)
      );
    }
    const text = paragraphs.join("\n\n");
    const chunks = chunkText(text, 10);
    // At MAX_CHUNK_SIZE=9000: 40k / 9000 ≈ 5 chunks (capped at 10)
    // At old MAX_CHUNK_SIZE=6000: 40k / 6000 ≈ 7 chunks
    // With the 9000 limit we expect ≤5 chunks for this text
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    expect(chunks.length).toBeLessThanOrEqual(6);
    // Verify each chunk is within the size limit
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(9500);
    }
  });

  it("samples evenly when exceeding maxChunks", () => {
    const filler = "x".repeat(3200);
    const paragraphs: string[] = [];
    for (let i = 0; i < 20; i++) {
      paragraphs.push(`Paragraph ${String(i).padStart(2, "0")} ${filler}`);
    }
    const text = paragraphs.join("\n\n");
    const chunks = chunkText(text, 3);
    expect(chunks.length).toBe(3);
    expect(chunks[0]).not.toBe(chunks[2]);
  });
});



// ---------------------------------------------------------------------------
// groupCandidatesByProvider (from availableProviders.ts)
// ---------------------------------------------------------------------------
describe("groupCandidatesByProvider", () => {
  it("returns empty array for empty input", () => {
    expect(groupCandidatesByProvider([])).toEqual([]);
  });

  it("groups candidates by provider", () => {
    const candidates = [
      { provider: "groq", providerLabel: "Groq", modelId: "llama-3.1-8b", modelName: "Llama 3.1 8B" },
      { provider: "groq", providerLabel: "Groq", modelId: "llama-3.3-70b", modelName: "Llama 3.3 70B" },
      { provider: "cerebras", providerLabel: "Cerebras", modelId: "gpt-oss-120b", modelName: "GPT OSS 120B" },
    ];
    const result = groupCandidatesByProvider(candidates);
    expect(result.length).toBe(2);
    expect(result[0]!.provider).toBe("groq");
    expect(result[0]!.label).toBe("Groq");
    expect(result[0]!.modelCount).toBe(2);
    expect(result[0]!.models).toHaveLength(2);
    expect(result[1]!.provider).toBe("cerebras");
    expect(result[1]!.modelCount).toBe(1);
  });

  it("preserves model details", () => {
    const candidates = [
      { provider: "cloudflare", providerLabel: "Cloudflare Workers AI", modelId: "@cf/meta/llama-3.2-3b", modelName: "Llama 3.2 3B" },
    ];
    const result = groupCandidatesByProvider(candidates);
    expect(result[0]!.models[0]).toEqual({ id: "@cf/meta/llama-3.2-3b", name: "Llama 3.2 3B" });
  });

  it("handles all providers present", () => {
    const candidates = [
      { provider: "groq", providerLabel: "Groq", modelId: "m1", modelName: "M1" },
      { provider: "cerebras", providerLabel: "Cerebras", modelId: "m2", modelName: "M2" },
      { provider: "kilo", providerLabel: "Kilo", modelId: "m3", modelName: "M3" },
      { provider: "openrouter", providerLabel: "OpenRouter", modelId: "m4", modelName: "M4" },
      { provider: "cloudflare", providerLabel: "Cloudflare Workers AI", modelId: "m5", modelName: "M5" },
    ];
    const result = groupCandidatesByProvider(candidates);
    expect(result.length).toBe(5);
    const providers = result.map((r) => r.provider);
    expect(providers).toContain("groq");
    expect(providers).toContain("cerebras");
    expect(providers).toContain("kilo");
    expect(providers).toContain("openrouter");
    expect(providers).toContain("cloudflare");
  });

  it("single provider with multiple models", () => {
    const candidates = [
      { provider: "groq", providerLabel: "Groq", modelId: "m1", modelName: "M1" },
      { provider: "groq", providerLabel: "Groq", modelId: "m2", modelName: "M2" },
      { provider: "groq", providerLabel: "Groq", modelId: "m3", modelName: "M3" },
    ];
    const result = groupCandidatesByProvider(candidates);
    expect(result.length).toBe(1);
    expect(result[0]!.modelCount).toBe(3);
    expect(result[0]!.models.map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
  });
});
