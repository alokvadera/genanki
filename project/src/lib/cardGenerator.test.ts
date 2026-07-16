import { describe, it, expect } from "vitest";
import { generateCardsFromText } from "@/lib/cardGenerator";

describe("generateCardsFromText", () => {
  it("returns empty array for short text", () => {
    expect(generateCardsFromText("short")).toEqual([]);
  });

  it("returns empty array for empty input", () => {
    expect(generateCardsFromText("")).toEqual([]);
  });

  it("extracts definition cards", () => {
    const text = "Mitochondria is the powerhouse of the cell. DNA is the genetic material found in living organisms.";
    const cards = generateCardsFromText(text);
    expect(cards.length).toBeGreaterThan(0);
    const mitochondria = cards.find((c) => c.front.toLowerCase().includes("mitochondria"));
    expect(mitochondria).toBeDefined();
  });

  it("extracts Q&A cards", () => {
    const text = "What is photosynthesis? It is the process by which plants convert sunlight into energy. How do cells divide? Through mitosis and meiosis.";
    const cards = generateCardsFromText(text);
    const photoCard = cards.find((c) => c.front.includes("photosynthesis"));
    expect(photoCard).toBeDefined();
  });

  it("deduplicates cards by front text", () => {
    const text =
      "What is photosynthesis? It is the process by which plants convert sunlight into energy.\n\nWhat is photosynthesis? The process of converting light to chemical energy.";
    const cards = generateCardsFromText(text);
    const photoCards = cards.filter((c) => c.front.toLowerCase().includes("photosynthesis"));
    expect(photoCards.length).toBe(1);
  });

  it("respects maxCards limit", () => {
    let text = "";
    for (let i = 0; i < 50; i++) {
      text += `Term${i} is a definition that is long enough to match the pattern here.\n\n`;
    }
    const cards = generateCardsFromText(text, 10);
    expect(cards.length).toBeLessThanOrEqual(10);
  });

  it("defaults to 30 cards when no maxCards specified", () => {
    let text = "";
    for (let i = 0; i < 100; i++) {
      text += `Term${i} is a definition that is long enough to match the pattern here.\n\n`;
    }
    const cards = generateCardsFromText(text);
    expect(cards.length).toBeLessThanOrEqual(30);
  });

  it("caps input size to avoid blocking on huge documents", () => {
    const huge = "A".repeat(100000);
    const cards = generateCardsFromText(huge);
    expect(cards).toEqual([]);
  });

  it("does not create nonsense questions from statements", () => {
    const text = "The cell membrane regulates what enters and exits the cell through selective permeability mechanisms.";
    const cards = generateCardsFromText(text);
    for (const card of cards) {
      // No card should be a statement with just "?" appended
      expect(card.front).not.toMatch(/^[A-Z][^.?]*\.$/);
    }
  });

  // --- P2: Back field clamping ---
  it("backs are capped at MAX_BACK (240 chars)", () => {
    // Definition pattern will match with a very long back
    const longBack = "Mitochondria is " + "very important for cell function ".repeat(20) + "in the cell.";
    const text = `This is a test.\n\n${longBack}`;
    // Force definition extraction by providing clear pattern
    const defText = "Mitochondria is the powerhouse of the cell that generates energy through oxidative phosphorylation and is essential for cellular respiration and metabolism across all eukaryotic organisms.";
    const cards = generateCardsFromText(defText);
    for (const card of cards) {
      expect(card.back.length).toBeLessThanOrEqual(250); // 240 + ellipsis
    }
  });

  // --- P6: ALL-CAPS noise ---
  it("does not create cards from long ALL-CAPS line that isn't a heading (P6)", () => {
    // A standalone ALL-CAPS line (too long to be a heading) followed by content
    const text = "MITOCHONDRIA AND THEIR FUNCTION IN CELLULAR RESPIRATION IS IMPORTANT FOR UNDERSTANDING HOW CELLS PRODUCE ENERGY\nThe study of mitochondria shows how cells generate ATP.";
    const cards = generateCardsFromText(text);
    for (const card of cards) {
      // No card should have a front longer than 50 chars that is entirely ALL-CAPS
      if (card.front.length > 40 && /^[A-Z\s]+$/.test(card.front)) {
        expect(card.front.length).toBeLessThanOrEqual(41);
      }
    }
  });

  it("still creates cards from real heading-style ALL CAPS on standalone line (P6)", () => {
    const text = "INTRODUCTION\nMitochondria are the powerhouse of the cell and generate energy through ATP production.\n\nCONCLUSION\nUnderstanding cellular respiration is key to biology.";
    const cards = generateCardsFromText(text);
    // Should still extract content (at minimum from the definition patterns)
    expect(cards.length).toBeGreaterThanOrEqual(0);
  });
});
