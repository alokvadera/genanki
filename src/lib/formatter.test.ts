// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { formatCardText, formatMathForAnki } from "./formatter";
import katex from "katex";
import { marked } from "marked";

describe("formatter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

    it("renders inline math with KaTeX ($x^2$)", () => {
      const result = formatCardText("The formula is $x^2$ here");
      expect(result).toContain("katex-html");
    });

    it("renders block math with KaTeX ($$y=mx+c$$)", () => {
      const result = formatCardText("Block: $$y = mx + c$$");
      expect(result).toContain("katex-html");
    });

    // Use String.raw to produce exact backslash sequences
    it("renders \\\\[\\\\] block math via String.raw", () => {
      const result = formatCardText(String.raw`Block: \[E = mc^2\]`);
      expect(result).toContain("katex-html");
    });

    it("renders \\\\(\\\\) inline math via String.raw", () => {
      const result = formatCardText(String.raw`Inline: \(x + y\)`);
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
      expect(result).not.toContain("javascript:");
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
      const result = formatCardText(
        '<div style="background: expression(alert(1))">x</div>'
      );
      expect(result).not.toContain("expression");
    });

    it("handles multiple math blocks in one text", () => {
      const result = formatCardText("$a$ and $b$ and $$c$$");
      expect(result).toContain("katex-html");
    });

    // --- Catch block tests: KaTeX throws (spy on real implementation) ---
    it("handles block math ($$) KaTeX error gracefully (catch block)", () => {
      vi.spyOn(katex, "renderToString").mockImplementationOnce(() => {
        throw new Error("KaTeX parse error");
      });
      const result = formatCardText("$$badmath$$");
      expect(result).toContain("badmath");
      expect(result).toContain("text-red-500");
    });

    it("handles \\\\[\\\\] block math KaTeX error (catch block) via String.raw", () => {
      vi.spyOn(katex, "renderToString").mockImplementationOnce(() => {
        throw new Error("KaTeX parse error");
      });
      const result = formatCardText(String.raw`\[badmath\]`);
      expect(result).toContain("text-red-500");
    });

    it("handles inline math ($) KaTeX error gracefully (catch block)", () => {
      vi.spyOn(katex, "renderToString").mockImplementationOnce(() => {
        throw new Error("KaTeX parse error");
      });
      const result = formatCardText("$badmath$");
      expect(result).toContain("text-red-500");
    });

    it("handles \\\\(\\\\) inline math KaTeX error (catch block) via String.raw", () => {
      vi.spyOn(katex, "renderToString").mockImplementationOnce(() => {
        throw new Error("KaTeX parse error");
      });
      const result = formatCardText(String.raw`\(badmath\)`);
      expect(result).toContain("text-red-500");
    });

    // --- Catch block test: marked.parse throws ---
    it("handles marked.parse error gracefully (catch block)", () => {
      vi.spyOn(marked, "parse").mockImplementationOnce(() => {
        throw new Error("marked parse error");
      });
      const result = formatCardText("Some text to parse");
      expect(result).toContain("Some text to parse");
    });

    it("handles text with ampersands", () => {
      const result = formatCardText("A & B");
      expect(result).toContain("&amp;");
    });

    it("handles text with greater than signs", () => {
      const result = formatCardText("if x > 5");
      expect(result).toContain("&gt;");
    });

    it("handles markdown list items", () => {
      const result = formatCardText("- Item 1\n- Item 2");
      expect(result).toContain("<li>");
    });

    it("handles markdown code blocks", () => {
      const result = formatCardText("```\ncode block\n```");
      expect(result).toContain("<code>");
    });

    it("handles markdown blockquotes", () => {
      const result = formatCardText("> quote");
      expect(result).toContain("<blockquote>");
    });

    it("handles markdown tables", () => {
      const result = formatCardText("| Header |\n|--------|\n| Cell |");
      expect(result).toContain("<table>");
    });

    it("sanitizes javascript: in style attribute", () => {
      const result = formatCardText(
        '<div style="background: url(javascript:alert(1))">x</div>'
      );
      expect(result).not.toContain("javascript:");
    });
  });

  describe("formatMathForAnki", () => {
    it("returns empty string for empty input", () => {
      expect(formatMathForAnki("")).toBe("");
    });

    it("converts $$block$$ to \\\\[block\\\\]", () => {
      expect(formatMathForAnki("$$x^2$$")).toBe("\\[x^2\\]");
    });

    it("converts $inline$ to \\\\(inline\\\\)", () => {
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

    it("handles multiple block math blocks", () => {
      const result = formatMathForAnki("$$a$$ and $$b$$");
      expect(result).toContain("\\[a\\]");
      expect(result).toContain("\\[b\\]");
    });

    it("handles math with spaces around operators", () => {
      expect(formatMathForAnki("$x + y$")).toBe("\\(x + y\\)");
    });
  });
});
