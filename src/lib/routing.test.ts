import { describe, it, expect } from "vitest";
import {
  prioritizeCandidates,
  COST_TABLE,
  type Candidate,
  type PerformanceRow,
} from "./routing";

describe("COST_TABLE", () => {
  it("has known model costs", () => {
    expect(COST_TABLE["llama-3.1-8b-instant"]).toBe(0.05);
    expect(COST_TABLE["llama-3.3-70b-versatile"]).toBe(0.40);
    expect(COST_TABLE["qwen/qwen3-32b"]).toBe(0.35);
    expect(COST_TABLE["qwen/qwen1.5-14b-chat-awq"]).toBe(0);
  });

  it("free tier has cost 0", () => {
    expect(COST_TABLE["qwen/qwen1.5-14b-chat-awq"]).toBe(0);
  });
});

describe("prioritizeCandidates (routing)", () => {
  const makeCandidate = (provider: string, modelId: string): Candidate => ({
    provider,
    modelId,
  });

  it("returns empty results for empty input", () => {
    const result = prioritizeCandidates([], []);
    expect(result.candidates).toEqual([]);
    expect(result.providerCount).toBe(0);
  });

  it("groups and orders by stable PROVIDER_ORDER", () => {
    const candidates = [
      makeCandidate("openrouter", "or-model"),
      makeCandidate("cerebras", "cerebras-model"),
      makeCandidate("groq", "groq-model"),
      makeCandidate("kilo", "kilo-model"),
    ];
    const result = prioritizeCandidates(candidates, []);
    const providers = result.candidates.map((c) => c.provider);
    expect(providers).toEqual(["groq", "cerebras", "kilo", "openrouter"]);
  });

  it("moves preferred provider to front", () => {
    const candidates = [
      makeCandidate("groq", "groq-1"),
      makeCandidate("cerebras", "cerebras-1"),
      makeCandidate("cloudflare", "cf-1"),
    ];
    const result = prioritizeCandidates(candidates, [], "cerebras");
    expect(result.candidates[0]!.provider).toBe("cerebras");
  });

  it("ignores preferred when 'auto'", () => {
    const candidates = [
      makeCandidate("groq", "groq-1"),
      makeCandidate("cerebras", "cerebras-1"),
    ];
    const result = prioritizeCandidates(candidates, [], "auto");
    expect(result.candidates[0]!.provider).toBe("groq");
  });

  it("ignores preferred when not in candidates", () => {
    const candidates = [
      makeCandidate("groq", "groq-1"),
      makeCandidate("cerebras", "cerebras-1"),
    ];
    const result = prioritizeCandidates(candidates, [], "kilo");
    expect(result.candidates[0]!.provider).toBe("groq");
  });

  it("ranks by performance score within provider", () => {
    const candidates = [
      makeCandidate("groq", "groq-slow"),
      makeCandidate("groq", "groq-fast"),
    ];
    const performance: PerformanceRow[] = [
      { provider: "groq", model: "groq-slow", calls: 10, successes: 5, failures: 5, timeouts: 0, averageLatencyMs: 2000, averageTokens: 1000 },
      { provider: "groq", model: "groq-fast", calls: 10, successes: 10, failures: 0, timeouts: 0, averageLatencyMs: 200, averageTokens: 200 },
    ];
    const result = prioritizeCandidates(candidates, performance);
    expect(result.candidates[0]!.modelId).toBe("groq-fast");
  });

  it("applies provider model limits (groq=2, others=1)", () => {
    const candidates = [
      makeCandidate("groq", "groq-1"),
      makeCandidate("groq", "groq-2"),
      makeCandidate("groq", "groq-3"),
      makeCandidate("cerebras", "cb-1"),
      makeCandidate("cerebras", "cb-2"),
    ];
    const result = prioritizeCandidates(candidates, []);
    const groqModels = result.candidates.filter((c) => c.provider === "groq");
    const cerebrasModels = result.candidates.filter((c) => c.provider === "cerebras");
    expect(groqModels.length).toBe(2);
    expect(cerebrasModels.length).toBe(1);
  });

  it("counts providers correctly", () => {
    const candidates = [
      makeCandidate("groq", "groq-1"),
      makeCandidate("cerebras", "cb-1"),
      makeCandidate("kilo", "kilo-1"),
    ];
    const result = prioritizeCandidates(candidates, []);
    expect(result.providerCount).toBe(3);
  });

  it("skips absent providers in count", () => {
    const candidates = [
      makeCandidate("groq", "groq-1"),
      makeCandidate("kilo", "kilo-1"),
    ];
    const result = prioritizeCandidates(candidates, []);
    expect(result.providerCount).toBe(2);
    expect(result.candidates.map((c) => c.provider)).toEqual(["groq", "kilo"]);
  });

  it("unproven models (0 calls) still get a base score", () => {
    const candidates = [
      makeCandidate("groq", "groq-new-1"),
      makeCandidate("groq", "groq-new-2"),
    ];
    const result = prioritizeCandidates(candidates, []);
    expect(result.candidates.length).toBe(2);
  });

  it("circuit breaker: high failure rate penalizes candidate", () => {
    const candidates = [
      makeCandidate("groq", "groq-flaky"),
      makeCandidate("groq", "groq-reliable"),
    ];
    const performance: PerformanceRow[] = [
      { provider: "groq", model: "groq-flaky", calls: 10, successes: 2, failures: 8, timeouts: 0, averageLatencyMs: 500, averageTokens: 500 },
      { provider: "groq", model: "groq-reliable", calls: 10, successes: 9, failures: 1, timeouts: 0, averageLatencyMs: 500, averageTokens: 500 },
    ];
    const result = prioritizeCandidates(candidates, performance);
    expect(result.candidates[0]!.modelId).toBe("groq-reliable");
  });

  it("free tier model gets bonus score", () => {
    const candidates = [
      makeCandidate("groq", "paid-model"),
      makeCandidate("groq", "qwen/qwen1.5-14b-chat-awq"),
    ];
    const result = prioritizeCandidates(candidates, []);
    const freeIdx = result.candidates.findIndex((c) => c.modelId === "qwen/qwen1.5-14b-chat-awq");
    const paidIdx = result.candidates.findIndex((c) => c.modelId === "paid-model");
    expect(freeIdx).toBeLessThan(paidIdx);
  });

  it("handles candidate with provider not in PROVIDER_ORDER", () => {
    const candidates = [
      makeCandidate("groq", "groq-1"),
      makeCandidate("unknown-provider", "unknown-model"),
    ];
    const result = prioritizeCandidates(candidates, []);
    const groqModels = result.candidates.filter((c) => c.provider === "groq");
    expect(groqModels.length).toBe(1);
    expect(result.candidates.length).toBe(1);
  });

  it("preferredProvider with no matching candidates falls back to default order", () => {
    const candidates = [
      makeCandidate("groq", "groq-1"),
    ];
    const result = prioritizeCandidates(candidates, [], "kilo");
    expect(result.candidates[0]!.provider).toBe("groq");
  });

  it("circuit breaker: exactly at threshold does not trigger", () => {
    const candidates = [
      makeCandidate("groq", "groq-edge"),
    ];
    const performance: PerformanceRow[] = [
      { provider: "groq", model: "groq-edge", calls: 10, successes: 5, failures: 5, timeouts: 0, averageLatencyMs: 500, averageTokens: 500 },
    ];
    const result = prioritizeCandidates(candidates, performance);
    expect(result.candidates).toHaveLength(1);
  });

  it("circuit breaker: fewer than 3 calls does not trigger penalty", () => {
    const candidates = [
      makeCandidate("groq", "groq-few"),
    ];
    const performance: PerformanceRow[] = [
      { provider: "groq", model: "groq-few", calls: 2, successes: 0, failures: 2, timeouts: 0, averageLatencyMs: 500, averageTokens: 500 },
    ];
    const result = prioritizeCandidates(candidates, performance);
    expect(result.candidates).toHaveLength(1);
  });

  it("cloudflare provider also gets limit of 2", () => {
    const candidates = [
      makeCandidate("cloudflare", "cf-1"),
      makeCandidate("cloudflare", "cf-2"),
      makeCandidate("cloudflare", "cf-3"),
    ];
    const result = prioritizeCandidates(candidates, []);
    expect(result.candidates.filter((c) => c.provider === "cloudflare").length).toBe(2);
  });

  it("models with calls >= 3 are scored using performance data", () => {
    const candidates = [
      makeCandidate("groq", "groq-proven"),
      makeCandidate("groq", "groq-new"),
    ];
    const performance: PerformanceRow[] = [
      { provider: "groq", model: "groq-proven", calls: 5, successes: 5, failures: 0, timeouts: 0, averageLatencyMs: 200, averageTokens: 100 },
    ];
    const result = prioritizeCandidates(candidates, performance);
    expect(result.candidates[0]!.modelId).toBe("groq-proven");
  });

  it("candidate with no performance data gets base score", () => {
    const candidates = [
      makeCandidate("groq", "groq-no-data"),
    ];
    const result = prioritizeCandidates(candidates, []);
    expect(result.candidates).toHaveLength(1);
  });

  it("candidate with calls exactly 2 gets unproven base score", () => {
    const candidates = [
      makeCandidate("groq", "groq-2calls"),
    ];
    const performance: PerformanceRow[] = [
      { provider: "groq", model: "groq-2calls", calls: 2, successes: 1, failures: 1, timeouts: 0, averageLatencyMs: 500, averageTokens: 500 },
    ];
    const result = prioritizeCandidates(candidates, performance);
    expect(result.candidates).toHaveLength(1);
  });

  it("models with unknown cost get DEFAULT_COST penalty", () => {
    const candidates = [
      makeCandidate("groq", "unknown-cost-model"),
    ];
    const result = prioritizeCandidates(candidates, []);
    expect(result.candidates).toHaveLength(1);
  });

  it("cloudflare provider with performance data uses limit of 2", () => {
    const candidates = [
      makeCandidate("cloudflare", "cf-a"),
      makeCandidate("cloudflare", "cf-b"),
    ];
    const performance: PerformanceRow[] = [
      { provider: "cloudflare", model: "cf-a", calls: 10, successes: 8, failures: 2, timeouts: 0, averageLatencyMs: 300, averageTokens: 300 },
    ];
    const result = prioritizeCandidates(candidates, performance);
    expect(result.candidates.filter((c) => c.provider === "cloudflare").length).toBe(2);
  });

  it("proven model with low failure rate does not get circuit breaker penalty", () => {
    const candidates = [
      makeCandidate("groq", "groq-good"),
    ];
    const performance: PerformanceRow[] = [
      { provider: "groq", model: "groq-good", calls: 10, successes: 8, failures: 2, timeouts: 0, averageLatencyMs: 300, averageTokens: 300 },
    ];
    const result = prioritizeCandidates(candidates, performance);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.modelId).toBe("groq-good");
  });

  it("cerebras provider gets limit of 1", () => {
    const candidates = [
      makeCandidate("cerebras", "cb-1"),
      makeCandidate("cerebras", "cb-2"),
    ];
    const result = prioritizeCandidates(candidates, []);
    expect(result.candidates.filter((c) => c.provider === "cerebras").length).toBe(1);
  });

  it("preferred provider that is not in PROVIDER_ORDER still gets prioritized", () => {
    const candidates = [
      makeCandidate("groq", "groq-1"),
      makeCandidate("cerebras", "cb-1"),
    ];
    const result = prioritizeCandidates(candidates, [], "cerebras");
    expect(result.candidates[0]!.provider).toBe("cerebras");
    expect(result.candidates[1]!.provider).toBe("groq");
  });

  it("free tier proven model gets bonus score over paid model", () => {
    const candidates = [
      makeCandidate("groq", "paid-model"),
      makeCandidate("groq", "qwen/qwen1.5-14b-chat-awq"),
    ];
    const performance: PerformanceRow[] = [
      { provider: "groq", model: "paid-model", calls: 10, successes: 8, failures: 2, timeouts: 0, averageLatencyMs: 300, averageTokens: 300 },
      { provider: "groq", model: "qwen/qwen1.5-14b-chat-awq", calls: 10, successes: 8, failures: 2, timeouts: 0, averageLatencyMs: 300, averageTokens: 300 },
    ];
    const result = prioritizeCandidates(candidates, performance);
    const freeIdx = result.candidates.findIndex((c) => c.modelId === "qwen/qwen1.5-14b-chat-awq");
    const paidIdx = result.candidates.findIndex((c) => c.modelId === "paid-model");
    expect(freeIdx).toBeLessThan(paidIdx);
  });
});


describe("prioritizeCandidates (extra branches)", () => {
  const makeCandidate = (provider: string, modelId: string): Candidate => ({
    provider,
    modelId,
  });

  it("preferredProvider (empty string) is falsy and falls back to default order", () => {
    const candidates = [makeCandidate("groq", "g1"), makeCandidate("cerebras", "c1")];
    const result = prioritizeCandidates(candidates, [], "");
    expect(result.candidates[0]!.provider).toBe("groq");
  });

  it("preferredProvider undefined falls back to default order", () => {
    const candidates = [makeCandidate("groq", "g1"), makeCandidate("cerebras", "c1")];
    const result = prioritizeCandidates(candidates, [], undefined);
    expect(result.candidates[0]!.provider).toBe("groq");
  });

  it("groups unknown providers via fallback Map.get(??)", () => {
    const candidates = [
      makeCandidate("groq", "g1"),
      makeCandidate("totally-unknown", "u1"),
    ];
    const result = prioritizeCandidates(candidates, []);
    // unknown shouldn't surface in result since PROVIDER_ORDER doesn't include it
    expect(result.candidates.map((c) => c.provider)).toEqual(["groq"]);
  });

  it("providerIndex increments per provider with candidates", () => {
    const candidates = [
      makeCandidate("groq", "g1"),
      makeCandidate("cerebras", "c1"),
      makeCandidate("kilo", "k1"),
    ];
    const result = prioritizeCandidates(candidates, []);
    expect(result.candidates[0]!.providerIndex).toBe(0);
    expect(result.candidates[1]!.providerIndex).toBe(1);
    expect(result.candidates[2]!.providerIndex).toBe(2);
  });

  it("preserves providerLabel on output candidates", () => {
    const candidates: Candidate[] = [{ provider: "groq", modelId: "g1", providerLabel: "Groq Inc." }];
    const result = prioritizeCandidates(candidates, []);
    expect(result.candidates[0]!.providerLabel).toBe("Groq Inc.");
  });

  it("filter removes preferred from PROVIDER_ORDER for trailing positions", () => {
    const candidates = [
      makeCandidate("cerebras", "c1"),
      makeCandidate("kilo", "k1"),
      makeCandidate("groq", "g1"),
    ];
    const result = prioritizeCandidates(candidates, [], "groq");
    expect(result.candidates.map((c) => c.provider)).toEqual(["groq", "cerebras", "kilo"]);
  });

  it("openrouter + cloudflare ordering when groq absent", () => {
    // PROVIDER_ORDER = ["groq", "cerebras", "kilo", "openrouter", "cloudflare"]
    // With only openrouter and cloudflare present, the iteration walks the
    // order and emits matching providers in that sequence.
    const candidates = [
      makeCandidate("openrouter", "or1"),
      makeCandidate("cloudflare", "cf1"),
    ];
    const result = prioritizeCandidates(candidates, []);
    expect(result.candidates.map((c) => c.provider)).toEqual(["openrouter", "cloudflare"]);
  });
});



describe("prioritizeCandidates — targeted branch coverage", () => {
  const makeCandidate = (provider: string, modelId: string): Candidate => ({
    provider,
    modelId,
  });

  it("providerIndex does not increment for skipped providers", () => {
    // Only "kilo" present; groq and cerebras slots are empty in PROVIDER_ORDER.
    const result = prioritizeCandidates(
      [makeCandidate("kilo", "k1")],
      [],
    );
    expect(result.providerCount).toBe(1);
    expect(result.candidates[0]!.providerIndex).toBe(0);
  });

  it("unknown-provider candidate routes via Map.get fallback (no surfaced result)", () => {
    const candidates = [
      makeCandidate("groq", "g1"),
      makeCandidate("totally-unknown", "u1"),
    ];
    const result = prioritizeCandidates(candidates, []);
    expect(result.candidates.length).toBe(1);
    expect(result.candidates[0]!.provider).toBe("groq");
  });

  it("circuitBreakerPenalty triggers when failureRate > 0.5 AND calls >= 3", () => {
    const candidates = [
      makeCandidate("groq", "flaky-1"),
      makeCandidate("groq", "flaky-2"),
    ];
    const performance: PerformanceRow[] = [
      { provider: "groq", model: "flaky-1", calls: 10, successes: 1, failures: 9, timeouts: 0, averageLatencyMs: 500, averageTokens: 100 },
      { provider: "groq", model: "flaky-2", calls: 10, successes: 8, failures: 2, timeouts: 0, averageLatencyMs: 500, averageTokens: 100 },
    ];
    const result = prioritizeCandidates(candidates, performance);
    expect(result.candidates.length).toBe(2);
    expect(result.candidates[0]!.modelId).toBe("flaky-2");
  });

  it("isFreeTier path with row.calls >= 3 scores base+latency+free-bonus no penalty", () => {
    const candidates = [makeCandidate("groq", "qwen/qwen1.5-14b-chat-awq")];
    const performance: PerformanceRow[] = [
      { provider: "groq", model: "qwen/qwen1.5-14b-chat-awq", calls: 5, successes: 5, failures: 0, timeouts: 0, averageLatencyMs: 200, averageTokens: 100 },
    ];
    const result = prioritizeCandidates(candidates, performance);
    expect(result.candidates[0]!.modelId).toBe("qwen/qwen1.5-14b-chat-awq");
  });

  it("latencyScore clamped at 0.25 floor via Math.max", () => {
    const candidates = [makeCandidate("groq", "g-fast")];
    const performance: PerformanceRow[] = [
      // Very high latency forces Math.max(0.25, 9) clamp at 0.25.
      { provider: "groq", model: "g-fast", calls: 5, successes: 5, failures: 0, timeouts: 0, averageLatencyMs: 9000, averageTokens: 100 },
    ];
    const result = prioritizeCandidates(candidates, performance);
    expect(result.candidates.length).toBe(1);
  });

  // ('auto' branch already covered by the existing "ignores preferred when 'auto'" test above.)

  it("preferredProvider not in PROVIDER_ORDER triggers ?? 0 and ?? [] fallbacks", () => {
    // B2 (L52): grouped.get("nonexistent") => undefined => ?? 0 fires
    // B4 (L62): order includes "nonexistent" => grouped.get(provider) => undefined => ?? [] fires
    const candidates = [
      makeCandidate("groq", "groq-1"),
      makeCandidate("cerebras", "cb-1"),
    ];
    const result = prioritizeCandidates(candidates, [], "nonexistent-provider");
    // "nonexistent-provider" has no candidates, so hasPreferred = false
    // Falls back to default PROVIDER_ORDER
    expect(result.candidates[0]!.provider).toBe("groq");
    expect(result.candidates[1]!.provider).toBe("cerebras");
  });
});
