import { describe, it, expect } from "vitest";
import { mergeFallbackTrail, type TrailRecord } from "./deckHelpers";

// ---------------------------------------------------------------------------
// mergeFallbackTrail — pure trail merge logic
// ---------------------------------------------------------------------------
describe("mergeFallbackTrail", () => {
  const makeRecord = (provider: string): TrailRecord => ({
    provider,
    model: `${provider}-model`,
    outcome: provider === "fail" ? "failed" : "success",
    reason: provider === "fail" ? "timeout" : "Succeeded",
  });

  it("returns existing when incoming is empty", () => {
    const existing: TrailRecord[] = [makeRecord("groq")];
    expect(mergeFallbackTrail(existing, [])).toEqual(existing);
  });

  it("returns existing undefined when incoming is empty and existing is undefined", () => {
    expect(mergeFallbackTrail(undefined, [])).toBeUndefined();
  });

  it("merges incoming into undefined existing", () => {
    const incoming: TrailRecord[] = [makeRecord("groq")];
    expect(mergeFallbackTrail(undefined, incoming)).toEqual(incoming);
  });

  it("appends incoming to existing trail", () => {
    const existing: TrailRecord[] = [makeRecord("groq")];
    const incoming: TrailRecord[] = [makeRecord("cerebras")];
    const result = mergeFallbackTrail(existing, incoming);
    expect(result).toHaveLength(2);
    expect(result![0]!.provider).toBe("groq");
    expect(result![1]!.provider).toBe("cerebras");
  });

  it("handles empty existing array with non-empty incoming", () => {
    const incoming: TrailRecord[] = [makeRecord("kilo")];
    expect(mergeFallbackTrail([], incoming)).toEqual(incoming);
  });

  it("does not mutate existing array", () => {
    const existing: TrailRecord[] = [makeRecord("groq")];
    const incoming: TrailRecord[] = [makeRecord("cerebras")];
    mergeFallbackTrail(existing, incoming);
    expect(existing).toHaveLength(1);
  });

  it("handles multiple incoming records", () => {
    const incoming: TrailRecord[] = [makeRecord("groq"), makeRecord("cerebras"), makeRecord("fail")];
    const result = mergeFallbackTrail(undefined, incoming);
    expect(result).toHaveLength(3);
    expect(result![2]!.outcome).toBe("failed");
  });

  it("preserves TrailRecord structure", () => {
    const record: TrailRecord = {
      provider: "Cloudflare",
      model: "@cf/meta/llama-3.2-3b",
      outcome: "skipped",
      reason: "Rate limited (30s)",
    };
    const result = mergeFallbackTrail(undefined, [record]);
    expect(result![0]).toEqual(record);
  });

  it("merges multiple batches cumulatively", () => {
    let trail: TrailRecord[] | undefined;
    trail = mergeFallbackTrail(trail, [makeRecord("groq")]);
    trail = mergeFallbackTrail(trail, [makeRecord("cerebras")]);
    trail = mergeFallbackTrail(trail, [makeRecord("fail")]);
    expect(trail).toHaveLength(3);
    expect(trail!.map((t) => t.provider)).toEqual(["groq", "cerebras", "fail"]);
  });

  it("returns existing unmodified when incoming empty (safety check)", () => {
    const existing: TrailRecord[] = [makeRecord("openrouter")];
    const incoming: TrailRecord[] = [];
    const result = mergeFallbackTrail(existing, incoming);
    expect(result).toBe(existing);
  });
});
