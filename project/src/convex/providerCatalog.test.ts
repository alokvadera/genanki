import { describe, it, expect } from "vitest";
import { computeLatestUpdatedAt, findStaleProviders } from "./providerCatalog";
import { groupCandidatesByProvider } from "./availableProviders";

// ---------------------------------------------------------------------------
// computeLatestUpdatedAt
// ---------------------------------------------------------------------------
describe("computeLatestUpdatedAt", () => {
  it("returns 0 for empty array", () => {
    expect(computeLatestUpdatedAt([])).toBe(0);
  });

  it("returns the single updatedAt for one row", () => {
    expect(computeLatestUpdatedAt([{ updatedAt: 1000 }])).toBe(1000);
  });

  it("returns the max updatedAt across multiple rows", () => {
    expect(
      computeLatestUpdatedAt([
        { updatedAt: 1000 },
        { updatedAt: 5000 },
        { updatedAt: 3000 },
      ]),
    ).toBe(5000);
  });

  it("handles rows with identical timestamps", () => {
    expect(computeLatestUpdatedAt([{ updatedAt: 999 }, { updatedAt: 999 }])).toBe(999);
  });

  it("handles large timestamps", () => {
    const future = Date.now() + 1_000_000;
    expect(computeLatestUpdatedAt([{ updatedAt: future }])).toBe(future);
  });
});

// ---------------------------------------------------------------------------
// findStaleProviders
// ---------------------------------------------------------------------------
describe("findStaleProviders", () => {
  it("returns empty array when no existing rows", () => {
    expect(findStaleProviders(new Set(["groq"]), [])).toEqual([]);
  });

  it("returns empty array when all providers are current", () => {
    const current = new Set(["groq", "cerebras"]);
    const rows = [
      { provider: "groq", _id: "id_1" },
      { provider: "cerebras", _id: "id_2" },
    ];
    expect(findStaleProviders(current, rows)).toEqual([]);
  });

  it("returns stale provider IDs when providers are removed", () => {
    const current = new Set(["groq"]);
    const rows = [
      { provider: "groq", _id: "id_1" },
      { provider: "cerebras", _id: "id_2" },
      { provider: "kilo", _id: "id_3" },
    ];
    const stale = findStaleProviders(current, rows);
    expect(stale).toHaveLength(2);
    expect(stale).toContain("id_2");
    expect(stale).toContain("id_3");
  });

  it("returns all IDs when current set is empty", () => {
    const current = new Set<string>();
    const rows = [
      { provider: "groq", _id: "id_1" },
      { provider: "cerebras", _id: "id_2" },
    ];
    const stale = findStaleProviders(current, rows);
    expect(stale).toHaveLength(2);
  });

  it("preserves order of stale IDs from input", () => {
    const current = new Set(["groq"]);
    const rows = [
      { provider: "old_a", _id: "id_a" },
      { provider: "groq", _id: "id_keep" },
      { provider: "old_b", _id: "id_b" },
    ];
    const stale = findStaleProviders(current, rows);
    expect(stale).toEqual(["id_a", "id_b"]);
  });

  it("handles single stale provider", () => {
    const current = new Set(["groq"]);
    const rows = [{ provider: "retired", _id: "id_retired" }];
    expect(findStaleProviders(current, rows)).toEqual(["id_retired"]);
  });
});

// ---------------------------------------------------------------------------
// groupCandidatesByProvider (additional edge cases)
// ---------------------------------------------------------------------------
describe("groupCandidatesByProvider (providerCatalog focus)", () => {
  it("handles duplicate model IDs across providers", () => {
    const candidates = [
      { provider: "groq", providerLabel: "Groq", modelId: "shared-model", modelName: "Shared" },
      { provider: "cerebras", providerLabel: "Cerebras", modelId: "shared-model", modelName: "Shared" },
    ];
    const result = groupCandidatesByProvider(candidates);
    expect(result.length).toBe(2);
    expect(result[0]!.models[0]!.id).toBe("shared-model");
    expect(result[1]!.models[0]!.id).toBe("shared-model");
  });

  it("preserves insertion order of providers", () => {
    const candidates = [
      { provider: "cloudflare", providerLabel: "CF", modelId: "m1", modelName: "M1" },
      { provider: "groq", providerLabel: "Groq", modelId: "m2", modelName: "M2" },
      { provider: "cerebras", providerLabel: "CB", modelId: "m3", modelName: "M3" },
    ];
    const result = groupCandidatesByProvider(candidates);
    expect(result.map((r) => r.provider)).toEqual(["cloudflare", "groq", "cerebras"]);
  });

  it("modelCount matches models array length", () => {
    const candidates = [
      { provider: "groq", providerLabel: "Groq", modelId: "m1", modelName: "M1" },
      { provider: "groq", providerLabel: "Groq", modelId: "m2", modelName: "M2" },
      { provider: "groq", providerLabel: "Groq", modelId: "m3", modelName: "M3" },
    ];
    const result = groupCandidatesByProvider(candidates);
    expect(result[0]!.modelCount).toBe(result[0]!.models.length);
  });
});
