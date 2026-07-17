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
    expect(result.candidates[0].provider).toBe("cerebras");
  });

  it("ignores preferred when 'auto'", () => {
    const candidates = [
      makeCandidate("groq", "groq-1"),
      makeCandidate("cerebras", "cerebras-1"),
    ];
    const result = prioritizeCandidates(candidates, [], "auto");
    expect(result.candidates[0].provider).toBe("groq");
  });

  it("ignores preferred when not in candidates", () => {
    const candidates = [
      makeCandidate("groq", "groq-1"),
      makeCandidate("cerebras", "cerebras-1"),
    ];
    const result = prioritizeCandidates(candidates, [], "kilo");
    expect(result.candidates[0].provider).toBe("groq");
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
    expect(result.candidates[0].modelId).toBe("groq-fast");
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
    expect(result.candidates[0].modelId).toBe("groq-reliable");
  });

  it("free tier model gets bonus score", () => {
    const candidates = [
      makeCandidate("groq", "paid-model"),
      makeCandidate("groq", "qwen/qwen1.5-14b-chat-awq"), // free model in COST_TABLE
    ];
    // No performance data — both get base score, but free tier gets bonus
    const result = prioritizeCandidates(candidates, []);
    // qwen1.5-14b-chat-awq should rank higher due to COST_TABLE cost=0 bonus
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
    // Unknown provider should still appear but not in PROVIDER_ORDER grouping
    const groqModels = result.candidates.filter((c) => c.provider === "groq");
    expect(groqModels.length).toBe(1);
    // Unknown provider candidate is ignored since it's not in PROVIDER_ORDER
    expect(result.candidates.length).toBe(1);
  });

  it("preferredProvider with no matching candidates falls back to default order", () => {
    const candidates = [
      makeCandidate("groq", "groq-1"),
    ];
    const result = prioritizeCandidates(candidates, [], "kilo");
    // kilo has no candidates, so hasPreferred is false, default order used
    expect(result.candidates[0].provider).toBe("groq");
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
    expect(result.candidates[0].modelId).toBe("groq-proven");
  });
});
