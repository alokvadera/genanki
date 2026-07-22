import { describe, it, expect } from "vitest";
import { estimateNeurons, getUtcDayString, getWaitSecondsUntilUtcMidnight, formatTimeUntilMidnight, CLOUDFLARE_NEURON_COST } from "./budget";

// ---------------------------------------------------------------------------
// estimateNeurons
// ---------------------------------------------------------------------------
describe("estimateNeurons", () => {
  it("estimates neurons correctly for known models", () => {
    // 700 input, 700 output per 1M
    const n = estimateNeurons("@cf/meta/llama-3.1-8b-instruct", 1_000_000, 2_000_000);
    expect(n).toBe(700 + 1400);
  });

  it("uses default cost for unknown models", () => {
    // Default: 1000 input, 1000 output per 1M
    const n = estimateNeurons("unknown-model", 1_000_000, 1_000_000);
    expect(n).toBe(2000);
  });

  it("returns 0 for zero tokens", () => {
    expect(estimateNeurons("@cf/meta/llama-3.1-8b-instruct", 0, 0)).toBe(0);
  });

  it("handles fractional tokens", () => {
    const n = estimateNeurons("@cf/meta/llama-3.1-8b-instruct", 500_000, 500_000);
    expect(n).toBe(700);
  });

  it("covers all models in CLOUDFLARE_NEURON_COST", () => {
    for (const [modelId, cost] of Object.entries(CLOUDFLARE_NEURON_COST)) {
      const n = estimateNeurons(modelId, 1_000_000, 1_000_000);
      expect(n).toBe(cost.inputNeuronsPer1M + cost.outputNeuronsPer1M);
    }
  });
});

// ---------------------------------------------------------------------------
// getUtcDayString
// ---------------------------------------------------------------------------
describe("getUtcDayString", () => {
  it("returns a valid UTC day string", () => {
    const d = getUtcDayString(new Date("2024-03-10T12:00:00Z").getTime());
    expect(d).toBe("2024-03-10");
  });

  it("returns YYYY-MM-DD format", () => {
    const d = getUtcDayString(Date.UTC(2025, 0, 1));
    expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(d).toBe("2025-01-01");
  });

  it("pads month and day with leading zeros", () => {
    const d = getUtcDayString(Date.UTC(2024, 0, 5));
    expect(d).toBe("2024-01-05");
  });

  it("uses UTC not local time", () => {
    // Create a timestamp that is Jan 1 UTC but Dec 31 local (US timezones)
    const d = getUtcDayString(Date.UTC(2025, 0, 1, 0, 0, 0));
    expect(d).toBe("2025-01-01");
  });

  it("handles epoch 0 (1970-01-01)", () => {
    expect(getUtcDayString(0)).toBe("1970-01-01");
  });

  it("handles large future timestamps", () => {
    const d = getUtcDayString(Date.UTC(2099, 11, 31));
    expect(d).toBe("2099-12-31");
  });
});

// ---------------------------------------------------------------------------
// getWaitSecondsUntilUtcMidnight
// ---------------------------------------------------------------------------
describe("getWaitSecondsUntilUtcMidnight", () => {
  it("returns seconds until next UTC midnight", () => {
    // 2024-03-10 12:00:00 UTC → next midnight is 2024-03-11 00:00:00 UTC = 12 hours = 43200s
    const ts = Date.UTC(2024, 2, 10, 12, 0, 0);
    expect(getWaitSecondsUntilUtcMidnight(ts)).toBe(12 * 3600);
  });

  it("returns 0 at exactly UTC midnight", () => {
    const ts = Date.UTC(2024, 2, 10, 0, 0, 0);
    expect(getWaitSecondsUntilUtcMidnight(ts)).toBe(0);
  });

  it("returns seconds for 1 second before midnight", () => {
    const ts = Date.UTC(2024, 2, 10, 23, 59, 59);
    expect(getWaitSecondsUntilUtcMidnight(ts)).toBe(1);
  });

  it("returns a full day (86400s) at 1 second past midnight", () => {
    const ts = Date.UTC(2024, 2, 10, 0, 0, 1);
    expect(getWaitSecondsUntilUtcMidnight(ts)).toBe(86400 - 1);
  });

  it("returns positive integer for any timestamp", () => {
    const result = getWaitSecondsUntilUtcMidnight(Date.now());
    expect(result).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(result)).toBe(true);
  });

  it("clamps negative to 0", () => {
    // Math.max(0, ...) ensures this
    const ts = Date.UTC(2024, 2, 10, 0, 0, 0);
    expect(getWaitSecondsUntilUtcMidnight(ts)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// formatTimeUntilMidnight
// ---------------------------------------------------------------------------
describe("formatTimeUntilMidnight", () => {
  it("returns 'now' at exactly midnight", () => {
    const ts = Date.UTC(2024, 2, 10, 0, 0, 0);
    expect(formatTimeUntilMidnight(ts)).toBe("now");
  });

  it("returns '<1m' for less than 60 seconds", () => {
    const ts = Date.UTC(2024, 2, 10, 23, 59, 30);
    expect(formatTimeUntilMidnight(ts)).toBe("<1m");
  });

  it("returns minutes only when under 1 hour", () => {
    const ts = Date.UTC(2024, 2, 10, 23, 30, 0);
    expect(formatTimeUntilMidnight(ts)).toBe("30m");
  });

  it("returns hours and minutes", () => {
    const ts = Date.UTC(2024, 2, 10, 11, 30, 0);
    expect(formatTimeUntilMidnight(ts)).toBe("12h 30m");
  });

  it("omits minutes when zero", () => {
    const ts = Date.UTC(2024, 2, 10, 18, 0, 0);
    expect(formatTimeUntilMidnight(ts)).toBe("6h");
  });

  it("returns hours only for even-hour values", () => {
    const ts = Date.UTC(2024, 2, 10, 1, 0, 0);
    expect(formatTimeUntilMidnight(ts)).toBe("23h");
  });

  it("returns hours and minutes for partial hours", () => {
    // 1h 30m until midnight
    const ts = Date.UTC(2024, 2, 10, 22, 30, 0);
    expect(formatTimeUntilMidnight(ts)).toBe("1h 30m");
  });

  it("handles 23h 59m case", () => {
    const ts = Date.UTC(2024, 2, 10, 0, 1, 0);
    expect(formatTimeUntilMidnight(ts)).toBe("23h 59m");
  });

  it("handles 1 minute case", () => {
    const ts = Date.UTC(2024, 2, 10, 23, 59, 0);
    expect(formatTimeUntilMidnight(ts)).toBe("1m");
  });
});
