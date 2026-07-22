import { describe, it, expect } from "vitest";
import {
  estimatePromptEtaSeconds,
  estimateDocumentEtaSeconds,
  estimatePromptTimeoutSeconds,
  estimateDocumentTimeoutSeconds,
  formatSeconds,
} from "@/lib/generationTiming";

describe("estimatePromptEtaSeconds", () => {
  it("returns at least 18 seconds for any input", () => {
    expect(estimatePromptEtaSeconds(0, 0, 0)).toBeGreaterThanOrEqual(18);
    expect(estimatePromptEtaSeconds(1, 1, 1)).toBeGreaterThanOrEqual(18);
  });

  it("scales with card count", () => {
    const small = estimatePromptEtaSeconds(5, 1, 1);
    const large = estimatePromptEtaSeconds(50, 1, 1);
    expect(large).toBeGreaterThan(small);
  });

  it("adds penalty for fallback models", () => {
    const single = estimatePromptEtaSeconds(12, 1, 1);
    const multi = estimatePromptEtaSeconds(12, 3, 1);
    expect(multi).toBeGreaterThan(single);
  });

  it("adds penalty for fallback providers", () => {
    const singleProvider = estimatePromptEtaSeconds(12, 1, 1);
    const multiProvider = estimatePromptEtaSeconds(12, 1, 3);
    expect(multiProvider).toBeGreaterThan(singleProvider);
  });

  it("handles negative or zero values gracefully", () => {
    expect(estimatePromptEtaSeconds(-5, -1, -1)).toBeGreaterThanOrEqual(18);
    expect(estimatePromptEtaSeconds(0, 0, 0)).toBeGreaterThanOrEqual(18);
  });

  it("produces integer results", () => {
    const result = estimatePromptEtaSeconds(12, 2, 2);
    expect(Number.isInteger(result)).toBe(true);
  });
});

describe("estimateDocumentEtaSeconds", () => {
  it("returns at least 24 seconds for any input", () => {
    expect(estimateDocumentEtaSeconds(0, 0, 0, 0)).toBeGreaterThanOrEqual(24);
    expect(estimateDocumentEtaSeconds(1, 1, 1, 1)).toBeGreaterThanOrEqual(24);
  });

  it("scales with card count", () => {
    expect(estimateDocumentEtaSeconds(5, 1, 1, 1)).toBeLessThan(
      estimateDocumentEtaSeconds(50, 1, 1, 1),
    );
  });

  it("scales with section count", () => {
    const oneSection = estimateDocumentEtaSeconds(12, 1, 1, 1);
    const fiveSections = estimateDocumentEtaSeconds(12, 5, 1, 1);
    expect(fiveSections).toBeGreaterThan(oneSection);
  });

  it("adds penalty for fallback models", () => {
    expect(estimateDocumentEtaSeconds(12, 3, 1, 1)).toBeLessThan(
      estimateDocumentEtaSeconds(12, 3, 3, 1),
    );
  });

  it("adds penalty for fallback providers", () => {
    expect(estimateDocumentEtaSeconds(12, 3, 1, 1)).toBeLessThan(
      estimateDocumentEtaSeconds(12, 3, 1, 3),
    );
  });

  it("handles negative inputs gracefully", () => {
    const result = estimateDocumentEtaSeconds(-5, -1, -1, -1);
    expect(result).toBeGreaterThanOrEqual(24);
    expect(Number.isInteger(result)).toBe(true);
  });
});

describe("estimatePromptTimeoutSeconds", () => {
  it("clamps to minimum of 240 seconds", () => {
    expect(estimatePromptTimeoutSeconds(0)).toBe(240);
    expect(estimatePromptTimeoutSeconds(1)).toBeGreaterThanOrEqual(240);
    expect(estimatePromptTimeoutSeconds(5)).toBeGreaterThanOrEqual(240);
  });

  it("clamps to maximum of 900 seconds", () => {
    expect(estimatePromptTimeoutSeconds(1000)).toBeLessThanOrEqual(900);
    expect(estimatePromptTimeoutSeconds(500)).toBeLessThanOrEqual(900);
  });

  it("scales linearly with card count within bounds", () => {
    // Use card counts that exceed the 240s minimum floor
    const r1 = estimatePromptTimeoutSeconds(25);  // 120 + 125 = 245
    const r2 = estimatePromptTimeoutSeconds(50);  // 120 + 250 = 370
    expect(r2).toBeGreaterThan(r1);
  });

  it("returns integer values", () => {
    const result = estimatePromptTimeoutSeconds(15);
    expect(Number.isInteger(result)).toBe(true);
  });
});

describe("estimateDocumentTimeoutSeconds", () => {
  it("clamps to minimum of 300 seconds", () => {
    expect(estimateDocumentTimeoutSeconds(0, 0)).toBe(300);
    expect(estimateDocumentTimeoutSeconds(1, 1)).toBeGreaterThanOrEqual(300);
  });

  it("clamps to maximum of 1200 seconds", () => {
    expect(estimateDocumentTimeoutSeconds(1000, 100)).toBeLessThanOrEqual(1200);
  });

  it("scales with card count", () => {
    expect(estimateDocumentTimeoutSeconds(10, 1)).toBeLessThan(
      estimateDocumentTimeoutSeconds(100, 1),
    );
  });

  it("scales with section count", () => {
    expect(estimateDocumentTimeoutSeconds(12, 1)).toBeLessThan(
      estimateDocumentTimeoutSeconds(12, 5),
    );
  });

  it("returns integer values", () => {
    expect(Number.isInteger(estimateDocumentTimeoutSeconds(15, 3))).toBe(true);
  });
});

describe("formatSeconds", () => {
  it("returns '0s' for NaN (Number.isFinite true arm)", () => {
    expect(formatSeconds(NaN)).toBe("0s");
  });

  it("returns '0s' for Infinity (Number.isFinite true arm)", () => {
    expect(formatSeconds(Infinity)).toBe("0s");
    expect(formatSeconds(-Infinity)).toBe("0s");
  });

  it("returns '0s' for zero and negative (rounded to 0)", () => {
    expect(formatSeconds(0)).toBe("0s");
    expect(formatSeconds(-5)).toBe("0s");
  });

  it("formats sub-minute values as '<N>s' (minutes <= 0 true arm)", () => {
    expect(formatSeconds(1)).toBe("1s");
    expect(formatSeconds(45)).toBe("45s");
    expect(formatSeconds(59)).toBe("59s");
  });

  it("formats minute+ values as '<N>m <SS>s' (minutes > 0 default arm)", () => {
    expect(formatSeconds(60)).toBe("1m 00s");
    expect(formatSeconds(125)).toBe("2m 05s");
    expect(formatSeconds(3661)).toBe("61m 01s");
  });

  it("rounds fractional seconds before formatting", () => {
    expect(formatSeconds(59.5)).toBe("1m 00s");
    expect(formatSeconds(125.4)).toBe("2m 05s");
  });

  it("pads single-digit seconds to 2-digit format", () => {
    expect(formatSeconds(65)).toBe("1m 05s");
  });
});
