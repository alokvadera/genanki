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
    expect(result.cards[0]!.front).toBe("What is a cell?");
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
    expect(result.cards[0]!.front).toBe("Q");
    expect(result.cards[0]!.back).toBe("A");
  });
});

describe("extractJsonObject (extra branches)", () => {
  it("returns null when input has no {", () => {
    expect(extractJsonObject("just plain text no braces")).toBeNull();
  });

  it("extracts from fenced ```json block", () => {
    const out = extractJsonObject('```json\n{"a":1}\n```');
    expect(out).toBe('{"a":1}');
  });

  it("rejects fenced block not starting with {", () => {
    // When the fenced contents do not start with `{`, fallback to brace scan.
    const out = extractJsonObject('```\nNOT_JSON\n``` then {"a":1}');
    expect(out).toBe('{"a":1}');
  });

  it("uses fenced block with valid JSON start", () => {
    const out = extractJsonObject('```\n  {"x":2}  \n```');
    expect(out).toBe('{"x":2}');
  });

  it("handles strings containing escaped quotes during depth tracking", () => {
    const out = extractJsonObject('prefix {"a":"x\\"y","b":2} suffix');
    expect(JSON.parse(out!)).toEqual({ a: 'x"y', b: 2 });
  });

  it("handles unterminated string and unclosed object -> returns null", () => {
    expect(extractJsonObject('prefix {"a":"broken')).toBeNull();
  });

  it("handles nested objects with quote-aware depth scan", () => {
    const out = extractJsonObject('ignored {"k":"v","n":{"x":1}} tail');
    expect(JSON.parse(out!)).toEqual({ k: "v", n: { x: 1 } });
  });

  it("ultra-fallback: extracts from text with only outer braces", () => {
    // Triggers the second loop; first loop never finishes (depth never reaches 0).
    // Actually since "{" -> depth=1, "}" -> depth=0 finishes in first loop.
    // To force second loop we need a fenced-block reject with valid outer:
    const out = extractJsonObject('```\nnot-json\n``` {"k":"v"}');
    expect(JSON.parse(out!)).toEqual({ k: "v" });
  });

  it("honors isValidJsonStart: text starting with [ is rejected", () => {
    // Fenced content beginning with [ is treated as invalid start, falls through.
    expect(extractJsonObject('```[1,2,3]``` {"a":1}')).toBe('{"a":1}');
  });

  it("returns null when entire input is whitespace-padded no brace", () => {
    expect(extractJsonObject("   nothing here   ")).toBeNull();
  });
});

describe("parseAiDeckGeneration (extra)", () => {
  it("throws on no JSON candidate", () => {
    expect(() => parseAiDeckGeneration("no json here")).toThrow(/did not include JSON/);
  });

  it("throws on invalid JSON in candidate", () => {
    // enumerateDepth returns null for unterminated braces, so this would fall
    // through to "did not include JSON" — confirm the error wording.
    expect(() => parseAiDeckGeneration("prefix { not json")).toThrow(/did not include JSON/);
  });

  it("validates schema and rejects empty cards array", () => {
    expect(() =>
      parseAiDeckGeneration('{"deckName":"X","summary":"","cards":[]}')
    ).toThrow();
  });

  it("deduplicates cards with same front+back", () => {
    const text = JSON.stringify({
      deckName: "n",
      summary: "",
      cards: [
        { front: "Q1", back: "A1" },
        { front: "q1", back: "a1" },
        { front: "Q2", back: "A2" },
      ],
    });
    const result = parseAiDeckGeneration(text);
    expect(result.cards).toHaveLength(2);
  });
});
describe("extractJsonObject — targeted branch coverage", () => {
  it("handles escaped backslash inside string during depth scan", () => {
    // Valid JSON escape (\n) embeds a literal backslash+n in the source string.
    // The depth-scan code interprets the trailing char of the escape as the
    // in-string state, exercising the ch === "\\" branch.
    const out = extractJsonObject('prefix {"a":"x\\ny","b":1} suffix');
    expect(JSON.parse(out!)).toEqual({ a: "x\ny", b: 1 });
  });

  it("escaped quote inside string does not close it", () => {
    const out = extractJsonObject('{"v":"a\\"b"}');
    expect(JSON.parse(out!)).toEqual({ v: 'a"b' });
  });

  it("depth never reaches zero returns null", () => {
    expect(extractJsonObject('prefix {"a":"unterminated')).toBeNull();
  });

  it("fenced block followed by prose; extracts inside fence if valid", () => {
    const out = extractJsonObject('```\n{"a":1}\n``` and {"b":2}');
    // The fenced block wins (first parse path). The first object is {a:1}.
    expect(JSON.parse(out!)).toEqual({ a: 1 });
  });

  it("first loop balanced; second loop iteration not exercised", () => {
    // Standard balanced JSON: first loop finds balance, returns without
    // entering second loop. Verifies first-loop path explicitly.
    const out = extractJsonObject('{"a":1,"b":{"c":2}}');
    expect(JSON.parse(out!)).toEqual({ a: 1, b: { c: 2 } });
  });
});

describe("extractJsonObject — cascade-free branch coverage", () => {
  it("exercise brace-scan path with PLAIN JSON (no fences) so L54 inString=true fires", () => {
    const out = extractJsonObject('Some leading prose {"a":"b","c":1} trailing text');
    expect(out).toBe('{"a":"b","c":1}');
  });

  it("exercise L43 if (escaped) true arm via backslash-escaped quote inside JSON string", () => {
    // The JSON contains \" inside a string literal. The brace-scan must
    // treat the escaped quote as part of the string (not close it).
    const out = extractJsonObject(
      'prefix {"a":"He said \\"hi\\" today","b":2} suffix',
    );
    expect(JSON.parse(out!)).toEqual({ a: 'He said "hi" today', b: 2 });
  });

  it("exercise escaped backslash inside JSON string (ch === '\\\\')", () => {
    // "\\\\n" is JSON escape sequence for newline (literal backslash+n in source string)
    const out = extractJsonObject('prefix {"a":"x\\\\ny","b":1} suffix');
    expect(JSON.parse(out!)).toEqual({ a: "x\\ny", b: 1 });
  });

  it("brace-scan handles consecutive escaped backslash followed by quote", () => {
    // "\\\\\\"" sequence: literal backslash, then escaped quote
    const out = extractJsonObject('{"v":"a\\\\\\"b"}');
    expect(JSON.parse(out!)).toEqual({ v: 'a\\"b' });
  });

  it("brace-scan handles nested objects with escaped chars in outer string", () => {
    const out = extractJsonObject('prefix {"a":"x\\"y","n":{"k":1}} tail');
    expect(JSON.parse(out!)).toEqual({ a: 'x"y', n: { k: 1 } });
  });
});
