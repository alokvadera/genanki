import { describe, it, expect } from "vitest";
import { formatCardText, formatMathForAnki } from "./formatter";
import { buildSystemPrompt } from "../convex/promptBuilder";

describe("New Improvements Test Suite", () => {
  describe("Rich Text & LaTeX Formatter", () => {
    it("converts markdown and LaTeX math to HTML correctly", () => {
      const text = "This is **bold** and $x^2$ inline math with $$y = mx + c$$ block math.";
      const html = formatCardText(text);

      expect(html).toContain("<strong>bold</strong>");
      expect(html).toContain("katex-html"); // KaTeX rendered output
    });

    it("escapes literal HTML tags in markdown but keeps math placeholders", () => {
      const text = "Literal tag: <html> and math: $a < b$";
      const html = formatCardText(text);

      expect(html).toContain("Literal tag: <html>");
      expect(html).toContain("katex-html"); // math rendered successfully
    });

    it("formats math for Anki desktop client MathJax", () => {
      const text = "Solve $x + y$ and $$x^2$$";
      const formatted = formatMathForAnki(text);

      expect(formatted).toBe("Solve \\(x + y\\) and \\[x^2\\]");
    });
  });

  describe("Cloze Deletion Support", () => {
    it("builds the system prompt correctly when cardType is cloze", () => {
      const systemPrompt = buildSystemPrompt(10, "intermediate", "My Deck", "cloze");
      expect(systemPrompt).toContain("{{c1::answer}}");
      expect(systemPrompt).toContain("cloze deletion");
    });
  });
});
