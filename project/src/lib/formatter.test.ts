// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { formatCardText, formatMathForAnki } from "./formatter";

describe("formatter", () => {
  describe("formatCardText", () => {
    it("returns empty string for empty input", () => {
      expect(formatCardText("")).toBe("");
      expect(formatCardText(null as unknown as string)).toBe("");
      expect(formatCardText(undefined as unknown as string)).toBe("");
    });

    it("handles plain text without math or markdown", () => {
      const result = formatCardText("Hello world");
      expect(result).toContain("Hello world");
      expect(result).toContain("<p>");
    });

    it("renders inline math with KaTeX", () => {
      const result = formatCardText("The formula is $x^2$ here");
      expect(result).toContain("katex-html");
    });

    it("renders block math with KaTeX", () => {
      const result = formatCardText("Block: $$y = mx + c$$");
      expect(result).toContain("katex-html");
    });

    it("renders \\[\\] block math syntax", () => {
      const result = formatCardText("Block: \\[E = mc^2\\]");
      expect(result).toContain("katex-html");
    });

    it("renders \\(\\) inline math syntax", () => {
      const result = formatCardText("Inline: \\(x + y\\)");
      expect(result).toContain("katex-html");
    });

    it("does not corrupt currency text like $10 and $20", () => {
      const result = formatCardText("Basic is $10 and premium is $20");
      expect(result).not.toContain("katex");
      expect(result).toContain("$10");
      expect(result).toContain("$20");
    });

    it("preserves HTML tags in text visually", () => {
      const result = formatCardText("Use <strong>bold</strong> tags");
      expect(result).toContain("<strong>bold</strong>");
    });

    it("handles markdown bold", () => {
      const result = formatCardText("**bold text**");
      expect(result).toContain("<strong>bold text</strong>");
    });

    it("handles markdown italic", () => {
      const result = formatCardText("*italic text*");
      expect(result).toContain("<em>italic text</em>");
    });

    it("handles markdown code", () => {
      const result = formatCardText("`code`");
      expect(result).toContain("<code>code</code>");
    });

    it("handles markdown links", () => {
      const result = formatCardText("[link](https://example.com)");
      expect(result).toContain("href");
      expect(result).toContain("example.com");
    });

    it("sanitizes script tags", () => {
      const result = formatCardText("Test <script>alert('xss')</script> end");
      expect(result).not.toContain("<script>");
      expect(result).not.toContain("alert");
    });

    it("sanitizes onclick event handlers", () => {
      const result = formatCardText('<a onclick="alert(1)">click</a>');
      expect(result).not.toContain("onclick");
    });

    it("sanitizes javascript: URLs in raw HTML", () => {
      const result = formatCardText('<a href="javascript:alert(1)">click</a>');
      expect(result).toContain("<a");
      expect(result).not.toContain("javascript:");
      expect(result).not.toContain("alert");
      expect(result).toContain("click");
    });

    it("sanitizes iframe tags", () => {
      const result = formatCardText('<iframe src="evil.com"></iframe>');
      expect(result).not.toContain("<iframe");
    });

    it("sanitizes object tags", () => {
      const result = formatCardText('<object data="evil.swf"></object>');
      expect(result).not.toContain("<object");
    });

    it("sanitizes embed tags", () => {
      const result = formatCardText('<embed src="evil.swf">');
      expect(result).not.toContain("<embed");
    });

    it("sanitizes form tags", () => {
      const result = formatCardText('<form action="/steal"><input></form>');
      expect(result).not.toContain("<form");
    });

    it("sanitizes style expression attacks", () => {
      const result = formatCardText('<div style="background: expression(alert(1))">x</div>');
      expect(result).toContain("<div");
      expect(result).not.toContain("style");
      expect(result).not.toContain("expression");
    });

    it("handles multiple math blocks in one text", () => {
      const result = formatCardText("$a$ and $b$ and $$c$$");
      expect(result).toContain("katex-html");
    });

    it("handles inline math with KaTeX errors gracefully", () => {
      const result = formatCardText("$\\sqrt[]{}$");
      expect(result).toContain("katex");
    });

    it("handles block math with KaTeX errors gracefully", () => {
      const result = formatCardText("$$\\sqrt[]{}$$");
      expect(result).toContain("katex");
    });

    it("handles backslash bracket math syntax", () => {
      const result = formatCardText("\\[x^2\\]");
      expect(result).toContain("katex-html");
    });

    it("handles backslash paren math syntax", () => {
      const result = formatCardText("\\(x^2\\)");
      expect(result).toContain("katex-html");
    });

    it("shows error for truly invalid LaTeX", () => {
      const result = formatCardText("$$\\frac{}{}$$");
      expect(result).toContain("katex");
    });

    it("handles text with ampersands", () => {
      const result = formatCardText("A & B");
      expect(result).toContain("&amp;");
    });

    it("handles text with greater than signs", () => {
      const result = formatCardText("if x > 5");
      expect(result).toContain("&gt;");
    });
  });

  describe("formatMathForAnki", () => {
    it("returns empty string for empty input", () => {
      expect(formatMathForAnki("")).toBe("");
    });

    it("converts $$block$$ to \\[block\\]", () => {
      expect(formatMathForAnki("$$x^2$$")).toBe("\\[x^2\\]");
    });

    it("converts $inline$ to \\(inline\\)", () => {
      expect(formatMathForAnki("$x^2$")).toBe("\\(x^2\\)");
    });

    it("handles mixed block and inline math", () => {
      const result = formatMathForAnki("Solve $x + y$ and $$x^2$$");
      expect(result).toBe("Solve \\(x + y\\) and \\[x^2\\]");
    });

    it("trims whitespace in math expressions", () => {
      expect(formatMathForAnki("$$  x^2  $$")).toBe("\\[x^2\\]");
    });

    it("preserves text without math", () => {
      expect(formatMathForAnki("No math here")).toBe("No math here");
    });

    it("does not match currency $10 $20", () => {
      const result = formatMathForAnki("$10 and $20");
      expect(result).toBe("$10 and $20");
    });

    it("handles multiple inline math blocks", () => {
      const result = formatMathForAnki("$a$ and $b$");
      expect(result).toContain("\\(a\\)");
      expect(result).toContain("\\(b\\)");
    });
  });
});
