import { describe, it, expect } from "vitest";
import {
  sanitizeProviderOptions,
  PROVIDERS_CACHE_VERSION,
  PROVIDERS_CACHE_KEY,
  PROVIDERS_CACHE_VERSION_KEY,
} from "./providers";
import type { ProviderOption } from "./providers";

describe("sanitizeProviderOptions", () => {
  // --- Happy path ---
  it("returns valid array unchanged", () => {
    const input: ProviderOption[] = [
      { provider: "openai", label: "OpenAI", modelCount: 3 },
      {
        provider: "anthropic",
        label: "Anthropic",
        modelCount: 2,
        models: [
          { id: "claude-3-opus", name: "Claude 3 Opus" },
          { id: "claude-3-sonnet", name: "Claude 3 Sonnet" },
        ],
      },
    ];
    expect(sanitizeProviderOptions(input)).toEqual(input);
  });

  it("returns empty array for null input", () => {
    expect(sanitizeProviderOptions(null)).toEqual([]);
  });

  it("returns empty array for undefined input", () => {
    expect(sanitizeProviderOptions(undefined)).toEqual([]);
  });

  it("returns empty array for a string input", () => {
    expect(sanitizeProviderOptions("not an array")).toEqual([]);
  });

  it("returns empty array for an object input", () => {
    expect(sanitizeProviderOptions({ provider: "openai" })).toEqual([]);
  });

  it("returns empty array for a number input", () => {
    expect(sanitizeProviderOptions(42)).toEqual([]);
  });

  // --- Filtering ---
  it("filters out items that are not objects", () => {
    const input = [
      { provider: "openai", label: "OpenAI", modelCount: 3 },
      null,
      "string",
      42,
      undefined,
      { provider: "anthropic", label: "Anthropic", modelCount: 2 },
    ];
    const result = sanitizeProviderOptions(input);
    expect(result).toHaveLength(2);
    expect(result[0].provider).toBe("openai");
    expect(result[1].provider).toBe("anthropic");
  });

  it("filters out items missing required fields", () => {
    const input = [
      { provider: "openai", label: "OpenAI", modelCount: 3 },
      { provider: "missing-label", modelCount: 1 },
      { label: "Missing Provider", modelCount: 1 },
      { provider: "missing-count", label: "No Count" },
    ];
    const result = sanitizeProviderOptions(input);
    expect(result).toHaveLength(1);
    expect(result[0].provider).toBe("openai");
  });

  it("filters out items with wrong field types", () => {
    const input = [
      { provider: 123, label: "OpenAI", modelCount: 3 },
      { provider: "openai", label: 123, modelCount: 3 },
      { provider: "openai", label: "OpenAI", modelCount: "three" },
      { provider: "openai", label: "OpenAI", modelCount: Infinity },
      { provider: "openai", label: "OpenAI", modelCount: NaN },
    ];
    const result = sanitizeProviderOptions(input);
    expect(result).toEqual([]);
  });

  it("filters out items with empty string provider or label", () => {
    const input = [
      { provider: "", label: "Empty Provider", modelCount: 1 },
      { provider: "  ", label: "Whitespace", modelCount: 1 },
      { provider: "openai", label: "", modelCount: 1 },
      { provider: "openai", label: "  ", modelCount: 1 },
    ];
    const result = sanitizeProviderOptions(input);
    expect(result).toEqual([]);
  });

  // --- Models validation ---
  it("accepts valid models array", () => {
    const input = [
      {
        provider: "openai",
        label: "OpenAI",
        modelCount: 2,
        models: [
          { id: "gpt-4o", name: "GPT-4o" },
          { id: "gpt-4o-mini", name: "GPT-4o Mini" },
        ],
      },
    ];
    const result = sanitizeProviderOptions(input);
    expect(result).toHaveLength(1);
    expect(result[0].models).toHaveLength(2);
  });

  it("accepts undefined models (optional)", () => {
    const input = [{ provider: "openai", label: "OpenAI", modelCount: 1 }];
    const result = sanitizeProviderOptions(input);
    expect(result).toHaveLength(1);
  });

  it("filters out items where models is not an array", () => {
    const input = [
      {
        provider: "openai",
        label: "OpenAI",
        modelCount: 1,
        models: "not-an-array",
      },
    ];
    const result = sanitizeProviderOptions(input);
    expect(result).toEqual([]);
  });

  it("filters out items where a model entry is missing id or name", () => {
    const input = [
      {
        provider: "openai",
        label: "OpenAI",
        modelCount: 1,
        models: [{ id: "gpt-4o" }],
      },
    ];
    const result = sanitizeProviderOptions(input);
    expect(result).toEqual([]);
  });

  it("filters out items where a model entry has wrong types", () => {
    const input = [
      {
        provider: "openai",
        label: "OpenAI",
        modelCount: 1,
        models: [{ id: 123, name: "GPT-4o" }],
      },
    ];
    const result = sanitizeProviderOptions(input);
    expect(result).toEqual([]);
  });

  // --- Edge cases ---
  it("returns empty array for empty input array", () => {
    expect(sanitizeProviderOptions([])).toEqual([]);
  });

  it("handles a mix of valid and invalid items", () => {
    const input = [
      { provider: "openai", label: "OpenAI", modelCount: 3 },
      null,
      { provider: "bad", modelCount: 1 },
      { provider: "anthropic", label: "Anthropic", modelCount: 2, models: [] },
      42,
      { provider: "mistral", label: "Mistral", modelCount: "many" },
    ];
    const result = sanitizeProviderOptions(input);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.provider)).toEqual(["openai", "anthropic"]);
  });

  it("preserves extra properties on valid items", () => {
    const input = [
      { provider: "openai", label: "OpenAI", modelCount: 1, extra: "data" },
    ];
    const result = sanitizeProviderOptions(input);
    expect(result).toHaveLength(1);
    // Extra properties are preserved (the cast doesn't strip them)
    expect((result[0] as Record<string, unknown>).extra).toBe("data");
  });
});

describe("providers cache versioning", () => {
  it("exports PROVIDERS_CACHE_VERSION as a positive integer", () => {
    expect(typeof PROVIDERS_CACHE_VERSION).toBe("number");
    expect(PROVIDERS_CACHE_VERSION).toBeGreaterThan(0);
    expect(Number.isInteger(PROVIDERS_CACHE_VERSION)).toBe(true);
  });

  it("exports cache key constants as non-empty strings", () => {
    expect(typeof PROVIDERS_CACHE_KEY).toBe("string");
    expect(PROVIDERS_CACHE_KEY.length).toBeGreaterThan(0);
    expect(typeof PROVIDERS_CACHE_VERSION_KEY).toBe("string");
    expect(PROVIDERS_CACHE_VERSION_KEY.length).toBeGreaterThan(0);
  });

  it("uses distinct keys for data and version", () => {
    expect(PROVIDERS_CACHE_KEY).not.toBe(PROVIDERS_CACHE_VERSION_KEY);
  });
});
