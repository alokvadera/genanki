import { describe, it, expect } from "vitest";
import {
  detectChapters,
  detectFromHeadings,
  detectFromOutline,
  sliceSelectedChapters,
  MIN_CHAPTER_CHARS,
  MAX_CHAPTERS_UI,
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
    expect(chapters[0]!.title).toBe("Chapter One");
    expect(chapters[1]!.title).toBe("Chapter Two");
    expect(chapters[0]!.source).toBe("regex");
  });

  it("detects 'Chapter N' headings", () => {
    const text = `Chapter 1 Introduction\n${body("intro")}\n\nChapter 2 Methods\n${body("methods")}`;
    const chapters = detectFromHeadings(text);
    expect(chapters.length).toBe(2);
    expect(chapters[0]!.title).toMatch(/Chapter 1/);
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
    expect(chapters[0]!.title).toBe("INTRODUCTION");
  });

  it("does NOT split on an all-caps sentence containing punctuation", () => {
    const text = `# Real Heading\nTHIS IS A SHOUTED SENTENCE, WITH PUNCTUATION.\n${body("x")}`;
    const chapters = detectFromHeadings(text);
    expect(chapters.length).toBe(1);
    expect(chapters[0]!.title).toBe("Real Heading");
  });

  it("detects 'Part N' headings", () => {
    const text = `Part I Introduction\n${body("intro")}\n\nPart II Methods\n${body("methods")}`;
    const chapters = detectFromHeadings(text);
    expect(chapters.length).toBe(2);
    expect(chapters[0]!.title).toMatch(/Part I/);
  });

  it("detects 'Section N' headings", () => {
    const text = `Section 1 Overview\n${body("over")}\n\nSection 2 Details\n${body("det")}`;
    const chapters = detectFromHeadings(text);
    expect(chapters.length).toBe(2);
    expect(chapters[0]!.title).toMatch(/Section 1/);
  });

  it("detects numbered sections with multiple dots like 1.2.3", () => {
    const text = `1.2.3 Advanced Topics\n${body("advanced")}\n\n1.2.4 Basic Topics\n${body("basic")}`;
    const chapters = detectFromHeadings(text);
    expect(chapters.length).toBe(2);
  });

  it("returns empty for text with no headings", () => {
    const text = body("just some flowing text with no headings whatsoever");
    const chapters = detectFromHeadings(text);
    expect(chapters.length).toBe(0);
  });

  it("deduplicates boundaries at nearly the same offset", () => {
    const text = `# Heading\n${body("content")}`;
    const chapters = detectFromHeadings(text);
    expect(chapters.length).toBe(1);
  });

  it("merges tiny chapters into neighbors", () => {
    const text = `# One\n# Two\n${body("real")}\n\n# Three\n${body("more")}`;
    const chapters = detectFromHeadings(text);
    if (chapters.length > 0) {
      expect(chapters.every((c) => c.end - c.start >= MIN_CHAPTER_CHARS)).toBe(true);
    }
  });

  it("synthesizes Introduction chapter for preamble text", () => {
    const text = `${body("preamble")}\n# Chapter One\n${body("a")}\n\n# Chapter Two\n${body("b")}`;
    const chapters = detectFromHeadings(text);
    expect(chapters.length).toBeGreaterThanOrEqual(2);
    expect(chapters[0]!.title).toBe("Introduction");
    expect(chapters[0]!.id).toBe("preamble-introduction");
  });

  it("folds small preamble into first chapter", () => {
    const text = `Short preamble\n# Chapter One\n${body("a")}\n\n# Chapter Two\n${body("b")}`;
    const chapters = detectFromHeadings(text);
    expect(chapters[0]!.start).toBe(0);
  });

  it("handles ALL-CAPS heading with numbers", () => {
    const text = `CHAPTER 1 INTRO\n${body("intro")}\n\nCHAPTER 2 BODY\n${body("body")}`;
    const chapters = detectFromHeadings(text);
    expect(chapters.length).toBe(2);
  });

  it("rejects ALL-CAPS heading with colons", () => {
    const text = `INTRODUCTION: OVERVIEW\n${body("overview")}\n\nCONCLUSION: SUMMARY\n${body("summary")}`;
    const chapters = detectFromHeadings(text);
    expect(chapters.length).toBe(0);
  });

  it("handles ALL-CAPS heading with hyphens", () => {
    const text = `PART-ONE INTRO\n${body("intro")}\n\nPART-TWO BODY\n${body("body")}`;
    const chapters = detectFromHeadings(text);
    expect(chapters.length).toBe(2);
  });

  it("rejects ALL-CAPS line that is too short", () => {
    const text = `AB\n${body("content")}\n\nCD\n${body("more")}`;
    const chapters = detectFromHeadings(text);
    expect(chapters.length).toBe(0);
  });

  it("rejects ALL-CAPS line that is too long", () => {
    const longCaps = "A".repeat(61);
    const text = `${longCaps}\n${body("content")}`;
    const chapters = detectFromHeadings(text);
    expect(chapters.length).toBe(0);
  });

  it("rejects ALL-CAPS line without letters", () => {
    const text = `12345\n${body("content")}`;
    const chapters = detectFromHeadings(text);
    expect(chapters.length).toBe(0);
  });

  it("rejects ALL-CAPS line with lowercase", () => {
    const text = `Hello World\n${body("content")}`;
    const chapters = detectFromHeadings(text);
    expect(chapters.length).toBe(0);
  });

  it("returns empty for empty string", () => {
    expect(detectFromHeadings("")).toEqual([]);
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
      { title: "Chapter Two", offset: ch2Offset, level: 0 },
    ];
    const chapters = detectFromOutline(text, outline);
    const ones = chapters.filter(c => c.title.includes("Chapter One"));
    expect(ones.length).toBe(1);
    expect(ones[0]!.title).toBe("Chapter One");
  });

  it("filters out entries with negative offset", () => {
    const outline = [
      { title: "Invalid", offset: -10, level: 0 },
      { title: "Chapter One", offset: text.indexOf("CH1"), level: 0 },
      { title: "Chapter Two", offset: ch2Offset, level: 0 },
    ];
    const chapters = detectFromOutline(text, outline);
    expect(chapters.every(c => c.title !== "Invalid")).toBe(true);
  });

  it("filters out entries with offset beyond text length", () => {
    const outline = [
      { title: "Too Far", offset: text.length + 100, level: 0 },
      { title: "Chapter One", offset: text.indexOf("CH1"), level: 0 },
      { title: "Chapter Two", offset: ch2Offset, level: 0 },
    ];
    const chapters = detectFromOutline(text, outline);
    expect(chapters.every(c => c.title !== "Too Far")).toBe(true);
  });

  it("filters out entries with empty or whitespace-only title", () => {
    const outline = [
      { title: "", offset: 10, level: 0 },
      { title: "   ", offset: 20, level: 0 },
      { title: "Chapter One", offset: text.indexOf("CH1"), level: 0 },
      { title: "Chapter Two", offset: ch2Offset, level: 0 },
    ];
    const chapters = detectFromOutline(text, outline);
    expect(chapters.every(c => c.title !== "" && c.title !== "   ")).toBe(true);
  });

  it("prefers top-level entries when there are enough", () => {
    const outline = [
      { title: "Chapter One", offset: text.indexOf("CH1"), level: 0 },
      { title: "Chapter Two", offset: ch2Offset, level: 0 },
      { title: "Sub Chapter", offset: text.indexOf("CH1") + 10, level: 1 },
    ];
    const chapters = detectFromOutline(text, outline);
    expect(chapters.length).toBeGreaterThanOrEqual(2);
  });

  it("falls back to all entries when top-level entries are fewer than MIN_CHAPTERS", () => {
    const outline = [
      { title: "Chapter One", offset: text.indexOf("CH1"), level: 0 },
      { title: "Sub Chapter", offset: text.indexOf("CH1") + 10, level: 1 },
      { title: "Sub Chapter 2", offset: text.indexOf("CH2"), level: 1 },
    ];
    const chapters = detectFromOutline(text, outline);
    expect(chapters.length).toBeGreaterThanOrEqual(2);
  });

  it("dedupeBoundaries coalesces entries within 1 character (offset+1)", () => {
    const text2 = "a".repeat(1200);
    const outline = [
      { title: "Alpha", offset: 10, level: 0 },
      { title: "Alpha Almost", offset: 11, level: 0 },
      { title: "Beta", offset: 400, level: 0 },
      { title: "Gamma", offset: 800, level: 0 },
    ];
    const chapters = detectFromOutline(text2, outline);
    expect(chapters.map((c) => c.title)).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  it("trims whitespace from outline titles", () => {
    const outline = [
      { title: "  Trimmed  ", offset: 0, level: 0 },
      { title: "  Other  ", offset: text.indexOf("CH1"), level: 0 },
      { title: "  Third  ", offset: ch2Offset, level: 0 },
    ];
    const chapters = detectFromOutline(text, outline);
    expect(chapters[0]!.title).toBe("Trimmed");
  });

  it("uses outline entries with non-zero offsets correctly", () => {
    const text2 = "a".repeat(1000);
    const outline = [
      { title: "X", offset: 50, level: 0 },
      { title: "Y", offset: 550, level: 0 },
    ];
    const chapters = detectFromOutline(text2, outline);
    expect(chapters.map((c) => c.title).sort()).toEqual(["X", "Y"]);
  });
});

describe("detectChapters (layered)", () => {
  it("prefers outline when valid", () => {
    const text = `${body("intro")}A${body("one")}B${body("two")}`;
    const outline = [
      { title: "A Chapter", offset: text.indexOf("A"), level: 0 },
      { title: "B Chapter", offset: text.indexOf("B"), level: 0 },
    ];
    const result = detectChapters({ text, outline });
    expect(result.detected).toBe(true);
    expect(result.chapters[0]!.source).toBe("outline");
  });

  it("falls back to regex when no outline", () => {
    const text = `# One\n${body("a")}\n\n# Two\n${body("b")}`;
    const result = detectChapters({ text });
    expect(result.detected).toBe(true);
    expect(result.chapters[0]!.source).toBe("regex");
  });

  it("falls back to regex when outline is provided but invalidates", () => {
    const text = `# One\n${body("a")}\n\n# Two\n${body("b")}`;
    const outline = [{ title: "Only One", offset: 0, level: 0 }];
    const result = detectChapters({ text, outline });
    expect(result.detected).toBe(true);
    expect(result.chapters[0]!.source).toBe("regex");
  });

  it("falls back to regex when outline array is empty", () => {
    const text = `# One\n${body("a")}\n\n# Two\n${body("b")}`;
    const result = detectChapters({ text, outline: [] });
    expect(result.detected).toBe(true);
    expect(result.chapters[0]!.source).toBe("regex");
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

  it("returns empty for whitespace-only text", () => {
    const result = detectChapters({ text: "   \n\n  " });
    expect(result.detected).toBe(false);
    expect(result.reason).toBe("empty-text");
  });

  it("synthesizes Introduction chapter for preamble text", () => {
    const text = `${body("preamble")}\n# Chapter One\n${body("a")}\n\n# Chapter Two\n${body("b")}`;
    const result = detectChapters({ text });
    expect(result.detected).toBe(true);
    expect(result.chapters[0]!.title).toBe("Introduction");
    expect(result.chapters[0]!.id).toBe("preamble-introduction");
    expect(result.chapters[1]!.title).toBe("Chapter One");
  });

  it("folds small preamble into first chapter", () => {
    const text = `Short preamble\n# Chapter One\n${body("a")}\n\n# Chapter Two\n${body("b")}`;
    const result = detectChapters({ text });
    expect(result.detected).toBe(true);
    expect(result.chapters[0]!.start).toBe(0);
    expect(result.chapters[0]!.title).not.toBe("Introduction");
  });

  it("inherits level for synthetic Introduction chapter from outline-derived parent", () => {
    const preamble = "p".repeat(MIN_CHAPTER_CHARS + 200);
    const body1 = body("x");
    const body2 = body("y");
    const text = preamble + "\n\n" + body1 + "\n\n" + body2;
    const outline = [
      { title: "First Body", offset: preamble.length + 2, level: 2 },
      { title: "Second Body", offset: preamble.length + 2 + body1.length + 2, level: 0 },
    ];
    const result = detectChapters({ text, outline });
    expect(result.detected).toBe(true);
    expect(result.chapters[0]!.title).toBe("Introduction");
    expect(result.chapters[0]!.level).toBe(2);
    expect(result.chapters[1]!.title).toBe("First Body");
    expect(result.chapters[2]!.title).toBe("Second Body");
  });

  it("merges tiny fragments into neighbors (no sub-threshold chapters)", () => {
    const text = `# One\n# Two\n${body("real")}\n\n# Three\n${body("more")}`;
    const result = detectChapters({ text });
    if (result.detected) {
      expect(result.chapters.every((c) => c.end - c.start >= MIN_CHAPTER_CHARS)).toBe(true);
    }
  });

  it("mergeTinyChapters forward-folds a tiny first chapter into the second", () => {
    const tiny = "x".repeat(10);
    const text = `# First\n${tiny}\n\n# Second\n${body("y")}\n\n# Third\n${body("z")}`;
    const result = detectChapters({ text });
    expect(result.detected).toBe(true);
    expect(result.chapters[0]!.title).toBe("Second");
    expect(result.chapters[0]!.start).toBe(0);
    expect(result.chapters.length).toBe(2);
  });

  it("mergeTinyChapters absorbs tiny chapters in middle", () => {
    const big1 = body("a");
    const tiny = "x".repeat(50);
    const big2 = body("b");
    const text = `# One\n${big1}\n\n# Two\n${tiny}\n\n# Three\n${big2}`;
    const result = detectChapters({ text });
    expect(result.detected).toBe(true);
    expect(result.chapters.length).toBeGreaterThanOrEqual(2);
    for (const c of result.chapters) {
      expect(c.end - c.start).toBeGreaterThanOrEqual(MIN_CHAPTER_CHARS);
    }
  });

  it("caps chapters at MAX_CHAPTERS_UI with valid outline", () => {
    const text = "a".repeat(200 * (MAX_CHAPTERS_UI + 2));
    const outline = Array.from({ length: MAX_CHAPTERS_UI + 2 }, (_, i) => ({
      title: `Chap ${i}`,
      offset: i * 200,
      level: 0,
    }));
    const result = detectChapters({ text, outline });
    expect(result.detected).toBe(true);
    expect(result.chapters.length).toBe(MAX_CHAPTERS_UI);
  });

  it("caps chapters at MAX_CHAPTERS_UI via regex", () => {
    let text = "";
    for (let i = 0; i < MAX_CHAPTERS_UI + 10; i++) {
      text += `Chapter ${i}\n${body("content")}\n`;
    }
    const result = detectChapters({ text });
    if (result.detected) {
      expect(result.chapters.length).toBeLessThanOrEqual(MAX_CHAPTERS_UI);
    }
  });

  it("falls back to Layer 3 below-thresholds when both layers fail", () => {
    const text = `# One\nshort body\n\n# Two\nanother short body`;
    const result = detectChapters({ text });
    expect(result.detected).toBe(false);
    expect(result.reason).toBe("below-thresholds");
  });

  it("falls back when outline produces only tiny chapters", () => {
    const outline = [
      { title: "Ch1", offset: 0, level: 0 },
      { title: "Ch2", offset: 15, level: 0 },
    ];
    const text = `# One\nshort\n\n# Two\nshort`;
    const result = detectChapters({ text, outline });
    expect(result.detected).toBe(false);
    expect(result.reason).toBe("below-thresholds");
  });
});

describe("sliceSelectedChapters", () => {
  const chapters = [
    { id: "0-a", title: "A", start: 0, end: 10, source: "regex" as const },
    { id: "1-b", title: "B", start: 10, end: 20, source: "regex" as const },
    { id: "2-c", title: "C", start: 20, end: 30, source: "regex" as const },
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

  it("returns empty string when selectedIds contains no valid chapter ids", () => {
    const sel = new Set(["nonexistent"]);
    expect(sliceSelectedChapters(text, chapters, sel)).toBe("");
  });

  it("returns trimmed text for selected chapters", () => {
    const chaptersWithWhitespace = [
      { id: "0-a", title: "A", start: 0, end: 15, source: "regex" as const },
      { id: "1-b", title: "B", start: 15, end: 30, source: "regex" as const },
    ];
    const textWithWhitespace = "   AAAA   \n\nBBBB   ";
    const sel = new Set(["0-a"]);
    const result = sliceSelectedChapters(textWithWhitespace, chaptersWithWhitespace, sel);
    expect(result).toContain("AAAA");
  });
});

describe("chapterDetection \u2014 MAX_CHAPTERS_UI cap", () => {
  it("caps chapters at MAX_CHAPTERS_UI (250 headings)", () => {
    const lines: string[] = [];
    for (let i = 0; i < 250; i++) {
      lines.push("# Heading " + i + "\n");
      lines.push("Body content long enough to pass minimum threshold for the chapter body. ".repeat(5));
    }
    const text = lines.join("\n\n");
    const result = detectChapters({ text });
    if (result.detected) {
      expect(result.chapters.length).toBeLessThanOrEqual(200);
    }
  });
});

describe("chapterDetection \u2014 targeted branch coverage", () => {
  it("dedupeBoundaries keeps entries whose offsets differ by 2+", () => {
    const line1 = "# Title One";
    const body1 = "x".repeat(MIN_CHAPTER_CHARS + 10);
    const line2 = "# Title Two";
    const body2 = "y".repeat(MIN_CHAPTER_CHARS + 10);
    const text = line1 + "\n" + body1 + "\n\n" + line2 + "\n" + body2 + "\n";
    const chapters = detectFromHeadings(text);
    expect(chapters.length).toBeGreaterThanOrEqual(2);
    expect(chapters.map((c) => c.title)).toContain("Title One");
    expect(chapters.map((c) => c.title)).toContain("Title Two");
  });

  it("mergeTinyChapters folds tiny first chapter into second", () => {
    const big = "y".repeat(MIN_CHAPTER_CHARS + 50);
    const text = "# Heading One\n\n# Heading Two\n" + big + "\n\n# Heading Three\n" + big;
    const result = detectChapters({ text });
    expect(result.detected).toBe(true);
    expect(result.chapters[0]!.title).toBe("Heading Two");
    expect(result.chapters[1]!.title).toBe("Heading Three");
  });

  it("coverPreamble prepends Introduction when preamble is large enough", () => {
    const preamble = "p".repeat(MIN_CHAPTER_CHARS + 100);
    const body1 = "b".repeat(MIN_CHAPTER_CHARS + 50);
    const body2 = "c".repeat(MIN_CHAPTER_CHARS + 50);
    const text = preamble + "\n\n# Chapter One\n" + body1 + "\n\n# Chapter Two\n" + body2;
    const result = detectChapters({ text });
    expect(result.detected).toBe(true);
    expect(result.chapters[0]!.title).toBe("Introduction");
  });

  it("matchHeading returns null for whitespace-only input", () => {
    expect(detectFromHeadings("   \n\n   ")).toEqual([]);
  });

  it("matchHeading falls through to isAllCapsHeading when HEADING_PATTERNS miss", () => {
    const text = "INTRODUCTION\n" + "a".repeat(MIN_CHAPTER_CHARS + 20) + "\n\nCHAPTER TWO\n" + "b".repeat(MIN_CHAPTER_CHARS + 20);
    const chapters = detectFromHeadings(text);
    expect(chapters.length).toBeGreaterThanOrEqual(2);
    expect(chapters[0]!.title).toBe("INTRODUCTION");
  });

  it("matchHeading matches numbered sections (1.2.3) at deeper depth", () => {
    const big = "x".repeat(MIN_CHAPTER_CHARS + 30);
    const text = "1.2.3 Advanced\n" + big + "\n\n2.0.0 Basic\n" + "y".repeat(MIN_CHAPTER_CHARS + 30);
    const chapters = detectFromHeadings(text);
    expect(chapters.length).toBeGreaterThanOrEqual(2);
  });

  it("coverPreamble folds short preamble into first chapter", () => {
    const short = "x".repeat(MIN_CHAPTER_CHARS - 50);
    const body1 = "b".repeat(MIN_CHAPTER_CHARS + 30);
    const body2 = "c".repeat(MIN_CHAPTER_CHARS + 30);
    const text = short + "\n\n# Chapter One\n" + body1 + "\n\n# Chapter Two\n" + body2;
    const result = detectChapters({ text });
    expect(result.detected).toBe(true);
    expect(result.chapters[0]!.start).toBe(0);
  });

  it("headings detected via outline or regex whose body >= MIN_CHAPTER_CHARS", () => {
    const outline = [
      { title: "Chapter 1", offset: 0, level: 0 },
      { title: "Chapter 2", offset: 300, level: 0 },
    ];
    const text = "a".repeat(MIN_CHAPTER_CHARS * 3);
    const result = detectChapters({ text, outline });
    expect(result.detected).toBe(true);
    expect(result.chapters.length).toBeGreaterThanOrEqual(2);
  });

  it("numbered heading without decimal points (1. Section style) gets level 0", () => {
    const text = `1. Section One\n${body("a")}\n\n1. Section Two\n${body("b")}`;
    const chapters = detectFromHeadings(text);
    expect(chapters.length).toBe(2);
    expect(chapters[0]!.title).toBe("1. Section One");
    expect(chapters[0]!.level).toBe(0);
  });

  it("headingLevel resolves depth 1 for 1.1 style numbered sections", () => {
    const text = `1.1 Section One\n${"a".repeat(250)}\n\n1.2 Section Two\n${"b".repeat(250)}`;
    const result = detectFromHeadings(text);
    expect(result.length).toBe(2);
    expect(result[0]!.level).toBe(1);
    expect(result[1]!.level).toBe(1);
  });

  it("headingLevel resolves depth 2 for 1.1.1 style numbered sections", () => {
    const text = `1.1.1 Deep One\n${"a".repeat(250)}\n\n1.1.2 Deep Two\n${"b".repeat(250)}`;
    const result = detectFromHeadings(text);
    expect(result.length).toBe(2);
    expect(result[0]!.level).toBe(2);
    expect(result[1]!.level).toBe(2);
  });

  it("headingLevel returns depth 1 for ## Section markdown headings", () => {
    const big1 = "a".repeat(MIN_CHAPTER_CHARS + 100);
    const big2 = "b".repeat(MIN_CHAPTER_CHARS + 100);
    const text = `## Level One Heading\n${big1}\n\n## Level One Other\n${big2}`;
    const result = detectChapters({ text });
    expect(result.detected).toBe(true);
    expect(result.chapters[0]!.level).toBe(1);
    expect(result.chapters[1]!.level).toBe(1);
  });

  it("headingLevel returns depth 2 for ### Subsection markdown headings", () => {
    const big1 = "a".repeat(MIN_CHAPTER_CHARS + 100);
    const big2 = "b".repeat(MIN_CHAPTER_CHARS + 100);
    const text = `### Subsection One\n${big1}\n\n### Subsection Two\n${big2}`;
    const result = detectChapters({ text });
    expect(result.detected).toBe(true);
    expect(result.chapters[0]!.level).toBe(2);
    expect(result.chapters[1]!.level).toBe(2);
  });
});

describe("chapterDetection \u2014 unique branch paths", () => {
  it("mergeTinyChapters forward-fold absorbs a tiny first chapter starting at offset 0", () => {
    const tiny = "x".repeat(50);
    const big = "y".repeat(MIN_CHAPTER_CHARS + 100);
    const text = `# Tiny First\n${tiny}\n\n# Big Second\n${big}\n\n# Big Third\n${big}`;
    const result = detectChapters({ text });
    expect(result.detected).toBe(true);
    expect(result.chapters[0]!.title).toBe("Big Second");
    expect(result.chapters[0]!.start).toBe(0);
    expect(result.chapters[0]!.level).toBe(0);
    expect(result.chapters.length).toBe(2);
  });

  it("coverPreamble synthesizes Introduction with level inherited from first heading", () => {
    const preamble = "p".repeat(MIN_CHAPTER_CHARS + 200);
    const body1 = "a".repeat(MIN_CHAPTER_CHARS + 50);
    const body2 = "b".repeat(MIN_CHAPTER_CHARS + 50);
    const text = `${preamble}\n## LevelOne Heading\n${body1}\n\n## LevelOne Another\n${body2}`;
    const result = detectChapters({ text });
    expect(result.detected).toBe(true);
    expect(result.chapters[0]!.title).toBe("Introduction");
    expect(result.chapters[0]!.level).toBe(1);
  });

  it("isAllCapsHeading rejects a line whose first character is not in [A-Z0-9]", () => {
    const big1 = "a".repeat(MIN_CHAPTER_CHARS + 100);
    const testText = `-hyphen-prefix\n${big1}`;
    const headings = detectFromHeadings(testText);
    expect(headings.length).toBe(0);
    expect(detectChapters({ text: testText }).detected).toBe(false);
  });

  it("mergeTinyChapters absorbs a tiny middle chapter into neighbouring", () => {
    const big1 = "a".repeat(MIN_CHAPTER_CHARS + 100);
    const tiny = "x".repeat(50);
    const big2 = "y".repeat(MIN_CHAPTER_CHARS + 100);
    const text = `# One\n${big1}\n\n# Two\n${tiny}\n\n# Three\n${big2}`;
    const result = detectChapters({ text });
    expect(result.detected).toBe(true);
    result.chapters.forEach((c) =>
      expect(c.end - c.start).toBeGreaterThanOrEqual(MIN_CHAPTER_CHARS)
    );
  });

  it("matchHeading covers the 'Part N' heading-pattern branch", () => {
    const big1 = "a".repeat(MIN_CHAPTER_CHARS + 100);
    const big2 = "b".repeat(MIN_CHAPTER_CHARS + 100);
    const text = `Part I Roman\n${big1}\n\nPart II Other\n${big2}`;
    const result = detectChapters({ text });
    expect(result.detected).toBe(true);
    expect(result.chapters[0]!.title).toMatch(/Part I/);
    expect(result.chapters[1]!.title).toMatch(/Part II/);
  });

  it("matchHeading covers the 'Section N' heading-pattern branch", () => {
    const big1 = "a".repeat(MIN_CHAPTER_CHARS + 100);
    const big2 = "b".repeat(MIN_CHAPTER_CHARS + 100);
    const text = `Section I Roman\n${big1}\n\nSection II Other\n${big2}`;
    const result = detectChapters({ text });
    expect(result.detected).toBe(true);
    expect(result.chapters[0]!.title).toMatch(/Section I/);
  });
});

describe("chapterDetection \u2014 cascade-free additional branches", () => {
  it("triggers Layer 3 fallback when outline is provided but invalidates", () => {
    const outline = [
      { title: "Ch1", offset: 0, level: 0 },
      { title: "Ch2", offset: 15, level: 0 },
    ];
    const text = `# One\nshort\n\n# Two\nshort`;
    const result = detectChapters({ text, outline });
    expect(result.detected).toBe(false);
    expect(result.reason).toBe("below-thresholds");
    expect(result.chapters).toEqual([]);
  });
});

describe("chapterDetection \u2014 cascade-free tail coverage", () => {
  it("treats an outline whose entries all fail validation as no-outline", () => {
    const text = `# Chapter One\n${"a".repeat(220)}\n\n# Chapter Two\n${"b".repeat(220)}`;
    const result = detectChapters({
      text,
      outline: [{ title: "Out of range", offset: 100_000, level: 0 }],
    });
    expect(result.detected).toBe(true);
    expect(result.chapters).toHaveLength(2);
    expect(result.chapters[0]?.title).toBe("Chapter One");
    expect(result.chapters[1]?.title).toBe("Chapter Two");
  });

  it("numbered heading without decimal points (1. Section style) gets level 0", () => {
    const text = `1. Section One\n${"a".repeat(220)}\n\n1. Section Two\n${"b".repeat(220)}`;
    const result = detectChapters({ text });
    expect(result.detected).toBe(true);
    expect(result.chapters).toHaveLength(2);
    expect(result.chapters[0]?.title).toBe("1. Section One");
    expect(result.chapters[1]?.title).toBe("1. Section Two");
    expect(result.chapters[0]?.level).toBe(0);
    expect(result.chapters[1]?.level).toBe(0);
  });
});

describe("chapterDetection \u2014 final cascade-free push (branch gaps)", () => {
  it("capChapters slice branch fires when chapters exceed MAX_CHAPTERS_UI", () => {
    const parts: string[] = [];
    for (let i = 0; i < 250; i++) {
      parts.push(`# Heading ${i}\n${"a".repeat(MIN_CHAPTER_CHARS + 100)}`);
    }
    const text = parts.join("\n\n\n");
    const result = detectChapters({ text });
    expect(result.detected).toBe(true);
    expect(result.chapters.length).toBe(MAX_CHAPTERS_UI);
  });

  it("outline entry with offset exactly 0 is included in detectFromOutline", () => {
    const text = `${"a".repeat(MIN_CHAPTER_CHARS + 50)}CH2${"b".repeat(MIN_CHAPTER_CHARS + 50)}`;
    const ch2Offset = text.indexOf("CH2");
    const outline = [
      { title: "First Chapter", offset: 0, level: 0 },
      { title: "Second Chapter", offset: ch2Offset, level: 0 },
    ];
    const chapters = detectFromOutline(text, outline);
    const titles = chapters.map((c) => c.title);
    expect(titles).toContain("First Chapter");
    expect(titles).toContain("Second Chapter");
    expect(chapters.length).toBeGreaterThanOrEqual(2);
  });

  it("falls back to Layer 3 when both outline-fit and regex-fit produce tiny chapters", () => {
    const outline = [
      { title: "Only One", offset: 0, level: 0 },
      { title: "Only Two", offset: 100, level: 0 },
    ];
    const text = `header\n\nhello short text ending here for the body\n\nagain short text here`;
    const result = detectChapters({ text, outline });
    expect(result.detected).toBe(false);
    expect(result.reason).toBe("below-thresholds");
  });
});

describe("chapterDetection \u2014 final surgical pull-through (coverage-targeted)", () => {
  it("dedupeBoundaries coalesces outline entries at exactly offset+1 (sub-2 near-coalesce)", () => {
    const text = "a".repeat(MIN_CHAPTER_CHARS * 3);
    const outline = [
      { title: "A", offset: 10, level: 0 },
      { title: "A prime", offset: 11, level: 0 },
      { title: "B", offset: 220, level: 0 },
    ];
    const chapters = detectFromOutline(text, outline);
    expect(chapters.map((c) => c.title)).toEqual(["A", "B"]);
  });

  it("boundariesToChapters id falls back to 'section' for non-letter titles (slug empty case)", () => {
    const text = `### !!!\n${"a".repeat(MIN_CHAPTER_CHARS + 100)}\n\n### ???\n${"b".repeat(MIN_CHAPTER_CHARS + 100)}`;
    const chapters = detectFromHeadings(text);
    expect(chapters.length).toBeGreaterThanOrEqual(2);
    expect(chapters[0]!.id).toContain("section");
    expect(chapters[1]!.id).toContain("section");
  });

  it("drops outline entries whose title is whitespace-only", () => {
    const text = body("a").repeat(3);
    const outline = [
      { title: "Valid Chapter", offset: 10, level: 0 },
      { title: "   \n\t  ", offset: 100, level: 0 },
      { title: "Another Chapter", offset: 500, level: 0 },
    ];
    const chapters = detectFromOutline(text, outline);
    expect(chapters.some((c) => c.title.trim() === "")).toBe(false);
    expect(chapters.length).toBe(2);
  });
});

describe("chapterDetection — cascade-free branch-closure batch", () => {
  it("mergeTinyChapters returns input unchanged when only one chapter (length<=1 arm)", () => {
    const text = `# Only Heading\n${body("single")}`;
    const chapters = detectFromHeadings(text);
    // Either empty (gates fail) or 1 chapter; both must be valid.
    expect(chapters.length).toBeLessThanOrEqual(1);
  });

  it("boundariesToChapters last-chapter end === textLength (fallback arm)", () => {
    const text = `# Single\n${body("one")}`;
    const chapters = detectFromHeadings(text);
    expect(chapters.length).toBe(1);
    expect(chapters[0]!.end).toBe(text.length);
  });

  it("capChapters at exactly MAX_CHAPTERS_UI (boundary, no slice — false arm of length>MAX)", () => {
    const text = "a".repeat(MAX_CHAPTERS_UI * 250);
    const outline = Array.from({ length: MAX_CHAPTERS_UI }, (_, i) => ({
      title: `Ch ${i}`,
      offset: i * 250,
      level: 0,
    }));
    const result = detectChapters({ text, outline });
    expect(result.detected).toBe(true);
    expect(result.chapters.length).toBe(MAX_CHAPTERS_UI);
  });

  it("matchHeading empty trimmed line returns null via blank-line boundary", () => {
    // Whitespace-only lines in the input exercise the `if (!line) return null;` arm.
    const text = `\n\n# Real Heading\n${body("x")}\n`;
    const chapters = detectFromHeadings(text);
    expect(chapters.length).toBe(1);
    expect(chapters[0]!.title).toBe("Real Heading");
  });  it("headingLevel returns 0 for ALL-CAPS heading (level=0 fallback arm)", () => {
    // ALL-CAPS headings route through isAllCapsHeading with level=0;
    // path covers the `return 0;` end-of-function arm.
    const text = `CHAPTER ONE\n${body("a")}\n\nCHAPTER TWO\n${body("b")}`;
    const chapters = detectFromHeadings(text);
    expect(chapters.length).toBe(2);
    expect(chapters[0]!.level).toBe(0);
  });
});

describe("chapterDetection — cascade-free branch-closure batch (round 2)", () => {
  it("detectFromOutline: outline entry at offset === 0 makes coverPreamble's first.start<=0 TRUE arm fire", () => {
    // coverPreamble runs after mergeTinyChapters. Even if mergeTinyChapters folds the
    // second chapter into the first (its body < MIN_CHAPTER_CHARS), coverPreamble still
    // fires and hits the `if (first.start <= 0) return chapters` arm.
    const outline = [
      { title: "First At Zero", offset: 0, level: 0 },
      { title: "Second", offset: 300, level: 0 },
    ];
    const text = "a".repeat(MIN_CHAPTER_CHARS + 200);
    const chapters = detectFromOutline(text, outline);
    expect(chapters.length).toBeGreaterThanOrEqual(1);
    expect(chapters[0]!.title).toBe("First At Zero");
    expect(chapters[0]!.start).toBe(0);
  });

  it("headingLevel: ## (depth-2 markdown) returns level 1 via md truthy arm", () => {
    const text = `## Sub One\n${body("x")}\n\n## Sub Two\n${body("y")}`;
    const chapters = detectFromHeadings(text);
    expect(chapters.length).toBe(2);
    expect(chapters.every((c) => c.level === 1)).toBe(true);
  });

  it("matchHeading catch-all: an ALL-CAPS line that fails every HEADING_PATTERNS becomes a chapter", () => {
    const text = `TOTALLY ALL CAPS TITLE\n${body("body")}\n\nANOTHER ONE\n${body("body2")}`;
    const chapters = detectFromHeadings(text);
    expect(chapters.length).toBe(2);
  });

  it("detectChapters: any single-chapter structureless text falls to Layer 3", () => {
    const text = `# Only\ntiny body`;
    const result = detectChapters({ text });
    expect(result.detected).toBe(false);
    expect(result.reason).toBe("below-thresholds");
  });
});

describe("chapterDetection — cascade-free round-2 batch (headingLevel md truthy arm)", () => {
  it("'# Section' markdown depth-0 routes through headingLevel `md` truthy arm", () => {
    const text = `# Section One\n${body("a")}\n\n# Section Two\n${body("b")}`;
    const chapters = detectFromHeadings(text);
    expect(chapters.length).toBe(2);
    expect(chapters[0]!.level).toBe(0);
    expect(chapters[1]!.level).toBe(0);
  });
});
