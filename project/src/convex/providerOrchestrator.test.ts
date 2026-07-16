import { describe, it, expect } from "vitest";
import { assertWithinDeadline, getAttemptTimeoutMs, computeAttemptCandidates, MAX_ATTEMPTS } from "./providerOrchestrator";
import { GenError } from "./errors";
import type { ProviderName } from "./aiProviders";

describe("assertWithinDeadline", () => {
  it("does not throw when within deadline", () => {
    expect(() => assertWithinDeadline(Date.now() + 60_000)).not.toThrow();
  });

  it("throws GenError with kind 'deadline' when past deadline", () => {
    expect(() => assertWithinDeadline(Date.now() - 1000)).toThrow(GenError);
    try {
      assertWithinDeadline(Date.now() - 1000);
    } catch (err) {
      expect((err as GenError).kind).toBe("deadline");
      expect((err as GenError).message).toContain("timed out");
    }
  });
});

describe("getAttemptTimeoutMs", () => {
  const baseCandidate = (provider: ProviderName, modelId = "test-model") => ({
    provider,
    providerIndex: 0,
    providerLabel: provider,
    modelId,
    modelName: modelId,
    supportsJsonMode: false,
    baseUrl: "https://example.com",
    headers: {},
  });

  it("returns at least 10_000ms", () => {
    const deadline = Date.now() + 5_000;
    const result = getAttemptTimeoutMs(baseCandidate("groq"), "prompt", deadline);
    expect(result).toBeGreaterThanOrEqual(10_000);
  });

  it("returns provider-specific budget for groq", () => {
    const deadline = Date.now() + 300_000;
    const result = getAttemptTimeoutMs(baseCandidate("groq"), "prompt", deadline);
    expect(result).toBeLessThanOrEqual(22_000);
  });

  it("returns 16_000ms for groq llama-3.1-8b-instant", () => {
    const deadline = Date.now() + 300_000;
    const result = getAttemptTimeoutMs(
      baseCandidate("groq", "llama-3.1-8b-instant"),
      "prompt",
      deadline,
    );
    expect(result).toBeLessThanOrEqual(16_000);
  });

  it("returns 24_000ms for cerebras", () => {
    const deadline = Date.now() + 300_000;
    const result = getAttemptTimeoutMs(baseCandidate("cerebras"), "prompt", deadline);
    expect(result).toBeLessThanOrEqual(24_000);
  });

  it("returns 20_000ms for kilo", () => {
    const deadline = Date.now() + 300_000;
    const result = getAttemptTimeoutMs(baseCandidate("kilo"), "prompt", deadline);
    expect(result).toBeLessThanOrEqual(20_000);
  });

  it("returns 28_000ms for cloudflare", () => {
    const deadline = Date.now() + 300_000;
    const result = getAttemptTimeoutMs(baseCandidate("cloudflare"), "prompt", deadline);
    expect(result).toBeLessThanOrEqual(28_000);
  });

  it("returns 18_000ms for unknown provider in prompt mode", () => {
    const deadline = Date.now() + 300_000;
    const result = getAttemptTimeoutMs(baseCandidate("openrouter"), "prompt", deadline);
    expect(result).toBeLessThanOrEqual(18_000);
  });

  it("returns 22_000ms for unknown provider in document mode", () => {
    const deadline = Date.now() + 300_000;
    const result = getAttemptTimeoutMs(baseCandidate("openrouter"), "document", deadline);
    expect(result).toBeLessThanOrEqual(22_000);
  });

  it("caps at remaining deadline minus buffer", () => {
    const deadline = Date.now() + 15_000;
    const result = getAttemptTimeoutMs(baseCandidate("cloudflare"), "prompt", deadline);
    expect(result).toBeLessThanOrEqual(12_500);
  });

  it("prefers provider budget when deadline is generous", () => {
    const deadline = Date.now() + 600_000;
    const result = getAttemptTimeoutMs(baseCandidate("cerebras"), "document", deadline);
    expect(result).toBe(24_000);
  });
});

// ---------------------------------------------------------------------------
// computeAttemptCandidates (capped fallback logic)
// ---------------------------------------------------------------------------
describe("computeAttemptCandidates", () => {
  const candidates5 = [1, 2, 3, 4, 5];
  const candidates1 = [1];
  const empty: number[] = [];

  it("caps to at most MAX_ATTEMPTS (2) when Optimus returns many candidates", () => {
    const ranked = [99, 88, 77, 66, 55];
    const result = computeAttemptCandidates(ranked, candidates5);
    expect(result.length).toBe(MAX_ATTEMPTS);
    expect(result).toEqual([99, 88]);
  });

  it("uses ranked candidates when available (preserves Optimus ordering)", () => {
    const ranked = [99, 88, 77];
    const result = computeAttemptCandidates(ranked, candidates5, 2);
    expect(result).toEqual([99, 88]);
  });

  it("falls back to original candidates when ranked is empty", () => {
    const result = computeAttemptCandidates(empty, candidates5);
    expect(result.length).toBe(2);
    expect(result).toEqual([1, 2]);
  });

  it("handles fewer candidates than MAX_ATTEMPTS gracefully", () => {
    const result = computeAttemptCandidates(candidates1, empty);
    expect(result.length).toBe(1);
    expect(result).toEqual([1]);
  });

  it("handles empty ranked and original candidates gracefully", () => {
    const result = computeAttemptCandidates(empty, empty);
    expect(result).toEqual([]);
  });

  it("respects custom maxAttempts parameter", () => {
    const result = computeAttemptCandidates(candidates5, empty, 3);
    expect(result.length).toBe(3);
    expect(result).toEqual([1, 2, 3]);
  });

  it("does not cap when fewer candidates than maxAttempts", () => {
    const result = computeAttemptCandidates(candidates1, empty, 5);
    expect(result.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Optimus Map-lookup refactoring — verify keyFor and map-based scoring
// ---------------------------------------------------------------------------
describe("optimus map-lookup", () => {
  const sampleRateStates = [
    { provider: "groq", model: "llama-3.1-8b-instant", remainingRequests: 10, remainingTokens: 50000, cooldownUntil: undefined, resetAt: undefined },
    { provider: "cerebras", model: "gpt-oss-120b", remainingRequests: 1, remainingTokens: 1000, cooldownUntil: undefined, resetAt: Date.now() + 60000 },
  ];
  const samplePerfRecords = [
    { provider: "groq", model: "llama-3.1-8b-instant", calls: 100, successes: 95, averageLatencyMs: 3000 },
    { provider: "cerebras", model: "gpt-oss-120b", calls: 10, successes: 8, averageLatencyMs: 15000 },
  ];

  function keyFor(provider: string, model: string): string {
    return `${provider}:${model}`;
  }

  it("builds state map and looks up by composite key", () => {
    const stateByKey = new Map(sampleRateStates.map(s => [keyFor(s.provider, s.model), s]));
    expect(stateByKey.size).toBe(2);
    expect(stateByKey.get("groq:llama-3.1-8b-instant")?.remainingRequests).toBe(10);
    expect(stateByKey.get("groq:llama-3.1-8b-instant")?.cooldownUntil).toBeUndefined();
    expect(stateByKey.get("cerebras:gpt-oss-120b")?.remainingRequests).toBe(1);
    expect(stateByKey.get("nonexistent:model")).toBeUndefined();
  });

  it("builds perf map and looks up by composite key", () => {
    const perfByKey = new Map(samplePerfRecords.map(p => [keyFor(p.provider, p.model), p]));
    expect(perfByKey.size).toBe(2);
    expect(perfByKey.get("groq:llama-3.1-8b-instant")?.calls).toBe(100);
    expect(perfByKey.get("groq:llama-3.1-8b-instant")?.averageLatencyMs).toBe(3000);
    expect(perfByKey.get("cerebras:gpt-oss-120b")?.successes).toBe(8);
  });

  it("produces same lookups as .find() — state lookup", () => {
    const stateByKey = new Map(sampleRateStates.map(s => [keyFor(s.provider, s.model), s]));
    for (const state of sampleRateStates) {
      const key = keyFor(state.provider, state.model);
      const mapResult = stateByKey.get(key);
      const findResult = sampleRateStates.find(s => s.provider === state.provider && s.model === state.model);
      expect(mapResult).toEqual(findResult);
    }
  });

  it("produces same lookups as .find() — perf lookup", () => {
    const perfByKey = new Map(samplePerfRecords.map(p => [keyFor(p.provider, p.model), p]));
    for (const perf of samplePerfRecords) {
      const key = keyFor(perf.provider, perf.model);
      const mapResult = perfByKey.get(key);
      const findResult = samplePerfRecords.find(p => p.provider === perf.provider && p.model === perf.model);
      expect(mapResult).toEqual(findResult);
    }
  });

  it("missing key returns undefined (matches .find() returning undefined)", () => {
    const stateByKey = new Map(sampleRateStates.map(s => [keyFor(s.provider, s.model), s]));
    const perfByKey = new Map(samplePerfRecords.map(p => [keyFor(p.provider, p.model), p]));
    expect(stateByKey.get("unknown:model")).toBeUndefined();
    expect(perfByKey.get("unknown:model")).toBeUndefined();
  });
});
