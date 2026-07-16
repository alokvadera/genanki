import { describe, it, expect } from "vitest";
import {
  detectChapters,
  detectFromHeadings,
  detectFromOutline,
  sliceSelectedChapters,
  MIN_CHAPTER_CHARS,
  type DetectedChapter,
} from "@/lib/chapterDetection";

/** Body long enough to pass the MIN_CHAPTER_CHARS gate. */
function body(label: string): string {
  return `${label} `.repeat(Math.ceil((MIN_CHAPTER_CHARS + 50) / (label.length + 1)));
}

describe("detectFromHeadings", () => {
  it("detects markdown headings", () => {
    const text = `# Chapter One\n${body("alpha")}\n\n# Chapter Two\n${body("beta")}`;
    const chapters = detectFromHeadings(text);
    expect(chapters.length).toBe(2);
    expect(chapters[0].title).toBe("Chapter One");
    expect(chapters[1].title).toBe("Chapter Two");
    expect(chapters[0].source).toBe("regex");
  });

  it("detects 'Chapter N' headings", () => {
    const text = `Chapter 1 Introduction\n${body("intro")}\n\nChapter 2 Methods\n${body("methods")}`;
    const chapters = detectFromHeadings(text);
    expect(chapters.length).toBe(2);
    expect(chapters[0].title).toMatch(/Chapter 1/);
  });

  it("detects numbered sections like 1. and 1.1", () => {
    const text = `1. Overview\n${body("over")}\n\n2. Details\n${body("det")}`;
    const chapters = detectFromHeadings(text);
    expect(chapters.length).toBe(2);
  });

  it("detects Roman numeral chapters", () => {
    const text = `Chapter IV The Fall\n${body("fall")}\n\nChapter V The Rise\n${body("rise")}`;
    const chapters = detectFromHeadings(text);
    expect(chapters.length).toBe(2);
  });

  it("treats a standalone ALL-CAPS line as a heading", () => {
    const text = `INTRODUCTION\n${body("a")}\n\nCONCLUSION\n${body("b")}`;
    const chapters = detectFromHeadings(text);
    expect(chapters.length).toBe(2);
    expect(chapters[0].title).toBe("INTRODUCTION");
  });

  it("does NOT split on an all-caps sentence containing punctuation", () => {
    const text = `# Real Heading\nTHIS IS A SHOUTED SENTENCE, WITH PUNCTUATION.\n${body("x")}`;
    const chapters = detectFromHeadings(text);
    // Only the markdown heading should count as a boundary.
    expect(chapters.length).toBe(1);
    expect(chapters[0].title).toBe("Real Heading");
  });
});

describe("detectFromOutline", () => {
  const text = `${body("pre")}CH1${body("one")}CH2${body("two")}`;
  const ch2Offset = text.indexOf("CH2");

  it("maps outline entries to chapter ranges", () => {
    const outline = [
      { title: "Chapter One", offset: text.indexOf("CH1"), level: 0 },
      { title: "Chapter Two", offset: ch2Offset, level: 0 },
    ];
    const chapters = detectFromOutline(text, outline);
    expect(chapters.length).toBeGreaterThanOrEqual(2);
    const two = chapters.find((c) => c.title === "Chapter Two");
    expect(two?.end).toBe(text.length);
    expect(chapters.every((c) => c.source === "outline")).toBe(true);
  });

  it("returns empty for no outline", () => {
    expect(detectFromOutline(text, [])).toEqual([]);
  });

  it("deduplicates outline entries at the same or nearly the same offset", () => {
    const outline = [
      { title: "Chapter One", offset: 10, level: 0 },
      { title: "Chapter One (Duplicate)", offset: 10, level: 0 },
      { title: "Chapter One (Off by 1)", offset: 11, level: 0 },
      { title: "Chapter Two", offset: text.indexOf("CH2"), level: 0 },
    ];
    const chapters = detectFromOutline(text, outline);
    const ones = chapters.filter(c => c.title.includes("Chapter One"));
    expect(ones.length).toBe(1);
    expect(ones[0].title).toBe("Chapter One");
  });
});

describe("detectChapters (layered)", () => {
  it("prefers outline when valid", () => {
    const text = `${body("intro")}A${body("one")}B${body("two")}`;
    const outline = [
      { title: "A Chapter", offset: text.indexOf("A" + "into") >= 0 ? 0 : text.indexOf("A"), level: 0 },
      { title: "B Chapter", offset: text.indexOf("B"), level: 0 },
    ];
    const result = detectChapters({ text, outline });
    expect(result.detected).toBe(true);
    expect(result.chapters[0].source).toBe("outline");
  });

  it("falls back to regex when no outline", () => {
    const text = `# One\n${body("a")}\n\n# Two\n${body("b")}`;
    const result = detectChapters({ text });
    expect(result.detected).toBe(true);
    expect(result.chapters[0].source).toBe("regex");
  });

  it("rejects when fewer than 2 chapters", () => {
    const text = `# Only One\n${body("a")}`;
    const result = detectChapters({ text });
    expect(result.detected).toBe(false);
    expect(result.reason).toBe("below-thresholds");
    expect(result.chapters).toEqual([]);
  });

  it("rejects structureless text", () => {
    const text = body("just some flowing text with no headings whatsoever");
    const result = detectChapters({ text });
    expect(result.detected).toBe(false);
  });

  it("returns empty for empty text", () => {
    expect(detectChapters({ text: "" }).detected).toBe(false);
  });

  it("merges tiny fragments into neighbors (no sub-threshold chapters)", () => {
    // A heading immediately followed by another heading with no body between.
    const text = `# One\n# Two\n${body("real")}\n\n# Three\n${body("more")}`;
    const result = detectChapters({ text });
    if (result.detected) {
      expect(result.chapters.every((c) => c.end - c.start >= MIN_CHAPTER_CHARS)).toBe(true);
    }
  });

  it("synthesizes an Introduction chapter for preamble text", () => {
    // Preamble before first heading is large enough to be its own chapter
    const text = `${body("preamble")}\n# Chapter One\n${body("a")}\n\n# Chapter Two\n${body("b")}`;
    const result = detectChapters({ text });
    expect(result.detected).toBe(true);
    expect(result.chapters[0].title).toBe("Introduction");
    expect(result.chapters[0].id).toBe("preamble-introduction");
    expect(result.chapters[1].title).toBe("Chapter One");
  });
});

describe("sliceSelectedChapters", () => {
  const chapters: DetectedChapter[] = [
    { id: "0-a", title: "A", start: 0, end: 10, source: "regex" },
    { id: "1-b", title: "B", start: 10, end: 20, source: "regex" },
    { id: "2-c", title: "C", start: 20, end: 30, source: "regex" },
  ];
  const text = "AAAAAAAAAA" + "BBBBBBBBBB" + "CCCCCCCCCC";

  it("returns full text when all selected", () => {
    const all = new Set(chapters.map((c) => c.id));
    expect(sliceSelectedChapters(text, chapters, all)).toBe(text);
  });

  it("returns only selected chapter ranges in order", () => {
    const sel = new Set(["0-a", "2-c"]);
    expect(sliceSelectedChapters(text, chapters, sel)).toBe("AAAAAAAAAA\n\nCCCCCCCCCC");
  });

  it("returns empty string when nothing selected", () => {
    expect(sliceSelectedChapters(text, chapters, new Set())).toBe("");
  });

  it("returns full text when no chapters detected", () => {
    expect(sliceSelectedChapters(text, [], new Set())).toBe(text);
  });
});
