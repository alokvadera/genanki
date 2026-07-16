import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  ProviderRequestError,
  buildModelCandidates,
} from "./aiProviders";

// ---------------------------------------------------------------------------
// ProviderRequestError
// ---------------------------------------------------------------------------
describe("ProviderRequestError", () => {
  it("is an instance of Error", () => {
    const err = new ProviderRequestError("Groq", 429, "rate limited");
    expect(err).toBeInstanceOf(Error);
  });

  it("has name 'ProviderRequestError'", () => {
    const err = new ProviderRequestError("Cerebras", 500, "internal");
    expect(err.name).toBe("ProviderRequestError");
  });

  it("stores status code", () => {
    const err = new ProviderRequestError("OpenRouter", 403, "forbidden");
    expect(err.status).toBe(403);
  });

  it("formats message with provider label and status", () => {
    const err = new ProviderRequestError("Groq", 429, "too many requests");
    expect(err.message).toBe("Groq request failed (429): too many requests");
  });

  it("defaults rateLimit to empty object", () => {
    const err = new ProviderRequestError("Kilo", 502, "bad gateway");
    expect(err.rateLimit).toEqual({});
  });

  it("accepts rateLimit snapshot", () => {
    const rl = { remainingRequests: 10, remainingTokens: 5000, resetSeconds: 30 };
    const err = new ProviderRequestError("Groq", 429, "limited", rl);
    expect(err.rateLimit).toEqual(rl);
  });

  it("supports retryAfterSeconds", () => {
    const err = new ProviderRequestError("Groq", 429, "limited");
    expect(err.retryAfterSeconds).toBeUndefined();
    err.retryAfterSeconds = 12;
    expect(err.retryAfterSeconds).toBe(12);
  });
});

// ---------------------------------------------------------------------------
// buildModelCandidates – graceful skip when providers are absent
// ---------------------------------------------------------------------------
describe("buildModelCandidates", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear all provider keys so no provider loads real data
    delete process.env.GROQ_API_KEY;
    delete process.env.CEREBRAS_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.KILO_API_KEY;
    delete process.env.KILO_BASE_URL;
    delete process.env.KILO_MODEL_IDS;

    // Clear cached catalog so each test starts fresh
    // We access the module cache indirectly by re-importing is not needed
    // because the module-level `cachedCatalog` is set once per process.
    // Instead, we rely on the fact that all env keys are absent → every
    // load* function returns [] → buildModelCandidates returns [].
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns an empty array when no providers are configured", async () => {
    const candidates = await buildModelCandidates();
    expect(candidates).toEqual([]);
  });

  it("does NOT throw when Groq is absent (regression test for I1)", async () => {
    // CEREBRAS_API_KEY is also absent, so only fallback cerebras model should appear
    // The key point: this must NOT throw
    await expect(buildModelCandidates()).resolves.toBeDefined();
  });
});
