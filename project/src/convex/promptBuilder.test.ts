import { describe, it, expect } from "vitest";
import { buildSystemPrompt, buildDocumentSystemPrompt } from "./promptBuilder";

describe("buildSystemPrompt", () => {
  it("includes card count in the prompt", () => {
    const prompt = buildSystemPrompt(10, "intermediate", "");
    expect(prompt).toContain("exactly 10 cards");
  });

  it("includes difficulty level", () => {
    const prompt = buildSystemPrompt(5, "beginner", "");
    expect(prompt).toContain("beginner");
  });

  it("uses user-provided deck name", () => {
    const prompt = buildSystemPrompt(5, "advanced", "Biology 101");
    expect(prompt).toContain("Biology 101");
  });

  it("falls back to self-chosen deck name when empty", () => {
    const prompt = buildSystemPrompt(5, "intermediate", "");
    expect(prompt).toContain("Choose the best deck name yourself");
  });

  it("includes the JSON schema", () => {
    const prompt = buildSystemPrompt(1, "intermediate", "");
    expect(prompt).toContain('"deckName"');
    expect(prompt).toContain('"summary"');
    expect(prompt).toContain('"cards"');
    expect(prompt).toContain('"front"');
    expect(prompt).toContain('"back"');
  });

  it("includes back-card constraint (one to two words)", () => {
    const prompt = buildSystemPrompt(1, "intermediate", "");
    expect(prompt).toContain("ONE TO TWO WORDS MAX");
  });

  it("includes front-card guidance (longer prompts allowed)", () => {
    const prompt = buildSystemPrompt(1, "intermediate", "");
    expect(prompt).toContain("Fronts can be long");
  });

  it("does not include markdown fences instruction", () => {
    const prompt = buildSystemPrompt(1, "intermediate", "");
    expect(prompt).toContain("Do not include markdown fences");
  });

  it("handles large card counts", () => {
    const prompt = buildSystemPrompt(1000, "advanced", "");
    expect(prompt).toContain("exactly 1000 cards");
  });
});

describe("buildDocumentSystemPrompt", () => {
  it("includes card count limit", () => {
    const prompt = buildDocumentSystemPrompt(15, "intermediate", "", "");
    expect(prompt).toContain("at most 15 cards");
  });

  it("includes difficulty", () => {
    const prompt = buildDocumentSystemPrompt(5, "advanced", "", "");
    expect(prompt).toContain("advanced");
  });

  it("uses user-provided deck name", () => {
    const prompt = buildDocumentSystemPrompt(5, "beginner", "Physics Notes", "");
    expect(prompt).toContain("Physics Notes");
  });

  it("falls back to content-based deck name when empty", () => {
    const prompt = buildDocumentSystemPrompt(5, "intermediate", "", "");
    expect(prompt).toContain("Choose the best deck name based on the content");
  });

  it("includes user instructions when provided", () => {
    const prompt = buildDocumentSystemPrompt(5, "intermediate", "", "Focus on equations only");
    expect(prompt).toContain("Focus on equations only");
  });

  it("uses full-document guidance when no instructions", () => {
    const prompt = buildDocumentSystemPrompt(5, "intermediate", "", "");
    expect(prompt).toContain("Use the full document as the coverage guide");
  });

  it("includes document-specific guidance", () => {
    const prompt = buildDocumentSystemPrompt(5, "intermediate", "", "");
    expect(prompt).toContain("Base every card strictly on the content");
    expect(prompt).toContain("do not invent information");
  });

  it("includes JSON schema", () => {
    const prompt = buildDocumentSystemPrompt(5, "intermediate", "", "");
    expect(prompt).toContain('"deckName"');
    expect(prompt).toContain('"cards"');
  });

  it("includes back-card constraint", () => {
    const prompt = buildDocumentSystemPrompt(5, "intermediate", "", "");
    expect(prompt).toContain("ONE TO TWO WORDS MAX");
  });

  it("handles empty deck name and empty instructions", () => {
    const prompt = buildDocumentSystemPrompt(10, "beginner", "", "");
    expect(prompt).toContain("beginner");
    expect(prompt).toContain("at most 10 cards");
    expect(prompt).toContain("full document as the coverage guide");
  });
});
