import { describe, it, expect } from "vitest";
import {
  extractJsonObject,
  parseAiDeckGeneration,
} from "@/lib/deckGeneration";

describe("extractJsonObject", () => {
  it("extracts plain JSON object", () => {
    const input = '{"deckName":"Test","cards":[]}';
    expect(extractJsonObject(input)).toBe(input);
  });

  it("extracts JSON from fenced code block", () => {
    const input = '```json\n{"deckName":"Test","cards":[]}\n```';
    expect(extractJsonObject(input)).toBe('{"deckName":"Test","cards":[]}');
  });

  it("extracts JSON from fenced block without json label", () => {
    const input = '```\n{"deckName":"Test","cards":[]}\n```';
    expect(extractJsonObject(input)).toBe('{"deckName":"Test","cards":[]}');
  });

  it("extracts JSON when preceded by prose", () => {
    const input = 'Here are your cards:\n{"deckName":"Test","cards":[]}';
    expect(extractJsonObject(input)).toBe('{"deckName":"Test","cards":[]}');
  });

  it("handles nested objects with brace matching", () => {
    const input = '{"a":{"b":1},"c":2}';
    expect(extractJsonObject(input)).toBe('{"a":{"b":1},"c":2}');
  });

  it("handles braces inside strings", () => {
    const input = '{"front":"What is {x}?","back":"answer"}';
    expect(extractJsonObject(input)).toBe('{"front":"What is {x}?","back":"answer"}');
  });

  it("handles escaped quotes inside strings", () => {
    const input = '{"front":"He said \\"hello\\"","back":"greeting"}';
    expect(extractJsonObject(input)).toBe('{"front":"He said \\"hello\\"","back":"greeting"}');
  });

  it("returns null for text without JSON", () => {
    expect(extractJsonObject("just some text")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractJsonObject("")).toBeNull();
  });

  it("returns null for truly truncated JSON (no balanced close)", () => {
    const input = 'Here is your data: {"deckName":"Test","cards":[{"front":"q"}';
    const result = extractJsonObject(input);
    expect(result).toBeNull();
  });

  it("does not over-capture trailing } in prose", () => {
    const input = 'Here are your cards: {"deckName":"Test","cards":[]} Hope this helps!}';
    const result = extractJsonObject(input);
    expect(result).toBe('{"deckName":"Test","cards":[]}');
  });

  it("does not over-capture multiple trailing braces in prose", () => {
    const input = 'Result: {"deckName":"Bio","cards":[{"front":"Q1","back":"A1"}]} This is the answer we were looking for! } Cheers }';
    const result = extractJsonObject(input);
    expect(result).toBe('{"deckName":"Bio","cards":[{"front":"Q1","back":"A1"}]}');
  });

  it("ignores fenced block that does not start with {", () => {
    const input = "```\nnot json\n```";
    expect(extractJsonObject(input)).toBeNull();
  });

  // --- P3: Ultra-fallback tests (brace-matching fails, falls back to depth scan) ---
  it("does not over-capture trailing } in prose (ultra-fallback)", () => {
    const input = 'Some prose {"deckName":"Test","cards":[]} and more text here}';
    const result = extractJsonObject(input);
    expect(result).toBe('{"deckName":"Test","cards":[]}');
  });

  it("does not over-capture with multiple trailing braces (ultra-fallback)", () => {
    const input = 'Result: {"deckName":"Test","cards":[]} } } extra';
    const result = extractJsonObject(input);
    expect(result).toBe('{"deckName":"Test","cards":[]}');
  });

  it("returns null when no balanced close exists (ultra-fallback)", () => {
    const input = 'Here is JSON: {"deckName":"Test","cards":[';
    const result = extractJsonObject(input);
    expect(result).toBeNull();
  });

  it("handles nested objects correctly in ultra-fallback", () => {
    const input = 'Output: {"deckName":"My Deck","summary":"Test","cards":[{"front":"Q","back":"A"}]} trailing';
    const result = extractJsonObject(input);
    expect(result).toBe('{"deckName":"My Deck","summary":"Test","cards":[{"front":"Q","back":"A"}]}');
  });
});

describe("parseAiDeckGeneration", () => {
  it("parses valid JSON with cards", () => {
    const input = JSON.stringify({
      deckName: "Biology 101",
      summary: "Cell biology basics",
      cards: [
        { front: "What is a cell?", back: "Basic unit" },
        { front: "What is mitochondria?", back: "Powerhouse organelle" },
      ],
    });
    const result = parseAiDeckGeneration(input);
    expect(result.deckName).toBe("Biology 101");
    expect(result.summary).toBe("Cell biology basics");
    expect(result.cards).toHaveLength(2);
    expect(result.cards[0].front).toBe("What is a cell?");
  });

  it("parses JSON wrapped in markdown fences", () => {
    const input = '```json\n{"deckName":"Test","cards":[{"front":"Q","back":"A"}]}\n```';
    const result = parseAiDeckGeneration(input);
    expect(result.deckName).toBe("Test");
    expect(result.cards).toHaveLength(1);
  });

  it("parses JSON with preceding prose", () => {
    const input = 'Here are your cards:\n{"deckName":"Test","cards":[{"front":"Q","back":"A"}]}';
    const result = parseAiDeckGeneration(input);
    expect(result.cards).toHaveLength(1);
  });

  it("deduplicates cards with same front+back", () => {
    const input = JSON.stringify({
      deckName: "Test",
      cards: [
        { front: "What is X?", back: "Y" },
        { front: "What is X?", back: "Y" },
        { front: "What is Z?", back: "W" },
      ],
    });
    const result = parseAiDeckGeneration(input);
    expect(result.cards).toHaveLength(2);
  });

  it("throws on missing JSON", () => {
    expect(() => parseAiDeckGeneration("no json here")).toThrow(
      "AI response did not include JSON output",
    );
  });

  it("throws on invalid JSON", () => {
    expect(() => parseAiDeckGeneration("{not valid json}")).toThrow(
      "AI response was not valid JSON",
    );
  });

  it("throws on empty cards array", () => {
    const input = JSON.stringify({ deckName: "Test", cards: [] });
    expect(() => parseAiDeckGeneration(input)).toThrow();
  });

  it("handles missing summary field", () => {
    const input = JSON.stringify({
      deckName: "Test",
      cards: [{ front: "Q", back: "A" }],
    });
    const result = parseAiDeckGeneration(input);
    expect(result.summary).toBe("");
  });

  it("trims whitespace in card fields", () => {
    const input = JSON.stringify({
      deckName: "Test",
      cards: [{ front: "  Q  ", back: "  A  " }],
    });
    const result = parseAiDeckGeneration(input);
    expect(result.cards[0].front).toBe("Q");
    expect(result.cards[0].back).toBe("A");
  });
});
