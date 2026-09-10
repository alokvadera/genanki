import type { OutlineEntry } from "@/lib/docParser";

/** A detected chapter/section mapped to a range of the extracted text. */
export interface DetectedChapter {
  /** Stable key for React lists. */
  id: string;
  /** Display title (heading text or synthesized "Chapter N"). */
  title: string;
  /** Inclusive character offset into the full extracted text. */
  start: number;
  /** Exclusive character offset into the full extracted text. */
  end: number;
  /** Where this boundary came from. */
  source: "outline" | "regex";
  /** Heading depth when known (0 = top level). */
  level?: number;
}

export interface ChapterDetectionResult {
  /** Detected chapters, in document order. Empty when scoping isn't applied. */
  chapters: DetectedChapter[];
  /** True when a usable chapter split was found. */
  detected: boolean;
  /** Machine-readable reason when detection was rejected. */
  reason?: string;
}

export interface DetectChaptersInput {
  text: string;
  outline?: OutlineEntry[];
  pageOffsets?: number[];
}

/** A chapter body must be at least this many characters to count. */
export const MIN_CHAPTER_CHARS = 200;
/** Need at least this many chapters for scoping to be meaningful. */
export const MIN_CHAPTERS = 2;
/** Guard against pathological documents producing thousands of "chapters". */
export const MAX_CHAPTERS_UI = 200;

/** Internal: a boundary marker before it becomes a full chapter range. */
interface Boundary {
  title: string;
  start: number;
  source: "outline" | "regex";
  level?: number;
}

function slug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** Turn ordered boundaries into non-overlapping [start,end) chapters covering the text. */
function boundariesToChapters(boundaries: Boundary[], textLength: number): DetectedChapter[] {
  const chapters: DetectedChapter[] = [];
  for (let i = 0; i < boundaries.length; i++) {
    const b = boundaries[i]!;
    const end = i + 1 < boundaries.length ? boundaries[i + 1]!.start : textLength;
    const chapter: DetectedChapter = {
      id: `${i}-${slug(b.title) || "section"}`,
      title: b.title,
      start: b.start,
      end,
      source: b.source,
    };
    /* istanbul ignore start: callers (matchHeading, detectFromOutline) always set b.level on each boundary */
    if (b.level !== undefined) chapter.level = b.level;
    /* istanbul ignore end */
    chapters.push(chapter);
  }
  return chapters;
}

/**
 * Merge chapters whose body is shorter than MIN_CHAPTER_CHARS into the
 * previous chapter (or the next one if it's the very first). This absorbs
 * heading fragments and stray lines produced by noisy extraction.
 */
function mergeTinyChapters(chapters: DetectedChapter[]): DetectedChapter[] {
  if (chapters.length <= 1) return chapters;
  const merged: DetectedChapter[] = [];
  for (const ch of chapters) {
    const bodyLen = ch.end - ch.start;
    if (bodyLen < MIN_CHAPTER_CHARS && merged.length > 0) {
      // Extend the previous chapter to swallow this tiny one.
      const prev = merged[merged.length - 1]!;
      merged[merged.length - 1] = { ...prev, end: ch.end };
    } else {
      merged.push({ ...ch });
    }
  }
  // If the first chapter is still tiny, fold it forward into the second.
  if (merged.length > 1 && (merged[0]!.end - merged[0]!.start) < MIN_CHAPTER_CHARS) {
    const first = merged[0]!;
    const second = merged[1]!;
    const rest = merged.slice(2);
    const mergedChapter: DetectedChapter = {
      id: second.id,
      title: second.title,
      start: first.start,
      end: second.end,
      source: second.source,
      ...(second.level !== undefined && { level: second.level }),
    };
    return [mergedChapter, ...rest];
  }
  return merged;
}

/** Dedupe boundaries that land on (nearly) the same offset. */
function dedupeBoundaries(boundaries: Boundary[]): Boundary[] {
  const sorted = [...boundaries].sort((a, b) => a.start - b.start);
  const out: Boundary[] = [];
  for (const b of sorted) {
    const prev = out.length > 0 ? out[out.length - 1] : undefined;
    if (prev && Math.abs(prev.start - b.start) < 2) continue;
    out.push(b);
  }
  return out;
}

/**
 * Ensure chapters cover from index 0. If content precedes the first boundary,
 * either prepend an "Introduction" chapter (when it's long enough) or fold it
 * into the first chapter.
 */
function coverPreamble(chapters: DetectedChapter[], _: string): DetectedChapter[] {
  // Callers early-return on empty input; this function asserts non-empty via `!`.
  const first = chapters[0]!;
  if (first.start <= 0) return chapters;
  const preambleLen = first.start;
  if (preambleLen >= MIN_CHAPTER_CHARS) {
    const intro: DetectedChapter = {
      id: "preamble-introduction",
      title: "Introduction",
      start: 0,
      end: first.start,
      source: first.source,
    };
    /* istanbul ignore start: outline entries always carry a level (defaults to 0); Layer 2 regex produces levels via headingLevel() which is always defined */
    if (first.level !== undefined) intro.level = first.level;
    /* istanbul ignore end */
    return [intro, ...chapters];
  }
  return [{ ...first, start: 0 }, ...chapters.slice(1)];
}

/** Build chapters from a resolved PDF outline. */
export function detectFromOutline(
  text: string,
  outline: OutlineEntry[],
): DetectedChapter[] {
  if (!outline || outline.length === 0) return [];

  // Prefer top-level entries; if there are fewer than MIN_CHAPTERS of them,
  // fall back to using all resolved entries.
  const topLevel = outline.filter((o) => o.level === 0);
  const chosen = topLevel.length >= MIN_CHAPTERS ? topLevel : outline;

  const boundaries: Boundary[] = dedupeBoundaries(
    chosen
      .filter((o) => o.offset >= 0 && o.offset <= text.length && o.title.trim())
      .map((o) => ({ title: o.title.trim(), start: o.offset, source: "outline" as const, level: o.level })),
  );

  if (boundaries.length === 0) return [];
  return coverPreamble(mergeTinyChapters(boundariesToChapters(boundaries, text.length)), text);
}

const ROMAN = "[IVXLCDM]+";
const HEADING_PATTERNS: RegExp[] = [
  /^#{1,3}\s+(.+)$/, // markdown
  new RegExp(`^(chapter\\s+(?:\\d+|${ROMAN})\\b.*)$`, "i"),
  new RegExp(`^(part\\s+(?:\\d+|${ROMAN})\\b.*)$`, "i"),
  new RegExp(`^(section\\s+(?:\\d+|${ROMAN})\\b.*)$`, "i"),
  /^(\d+\.(?:\d+)?(?:\.\d+)?\s+\S.*)$/, // numbered sections like "1 ", "1.2 ", "1.2.3 "
];

/** Heading depth for a matched line, used for display/nesting. */
function headingLevel(line: string): number {
  const md = line.match(/^(#{1,3})\s+/);
  if (md) return md[1]!.length - 1;
  const numbered = line.match(/^(\d+)(\.\d+)?(\.\d+)?\s+/);
  if (numbered) {
    if (numbered[3]) return 2;
    /* istanbul ignore start -- defense-in-depth: HEADING_PATTERNS[4] requires `\d+\.` literal dot, so any `line` where `numbered` is truthy via `matchHeading` has at least one of `numbered[2]`/`numbered[3]` defined (or short-circuits via `return 2`). The bare "1 Section" form passes `headingLevel`'s regex but fails HEADING_PATTERNS[4], so it never reaches this branch through the public API. */
    if (numbered[2]) return 1;
    /* istanbul ignore end */
  }
  return 0;
}

/** True when a line looks like a standalone ALL-CAPS heading (not body text). */
function isAllCapsHeading(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 3 || trimmed.length > 60) return false;
  // Must contain letters, be all uppercase, and have no sentence punctuation.
  if (!/[A-Z]/.test(trimmed)) return false;
  if (/[.!?,;:]/.test(trimmed)) return false;
  return /^[A-Z0-9][A-Z0-9 :-]+$/.test(trimmed);
}

function matchHeading(rawLine: string): { title: string; level: number } | null {
  const line = rawLine.trim();
  if (!line) return null;
  for (const re of HEADING_PATTERNS) {
    const m = line.match(re);
    if (m) {
      /* istanbul ignore start: HEADING_PATTERNS[0..4] all produce a group-1 capture; the `?? m[0]` arm is structurally unreachable */
      const title = (m[1] ?? m[0]).trim();
      /* istanbul ignore end */
      return { title, level: headingLevel(line) };
    }
  }
  if (isAllCapsHeading(line)) {
    return { title: line, level: 0 };
  }
  return null;
}

/** Build chapters by scanning the text for heading lines. */
export function detectFromHeadings(text: string): DetectedChapter[] {
  const boundaries: Boundary[] = [];
  let offset = 0;
  // Split but keep track of absolute offsets by walking the original text.
  const lines = text.split("\n");
  for (const line of lines) {
    const hit = matchHeading(line);
    if (hit) {
      // Boundary starts at the beginning of this heading line.
      const lineStart = offset + (line.length - line.trimStart().length);
      boundaries.push({
        title: hit.title,
        start: lineStart,
        source: "regex",
        level: hit.level,
      });
    }
    offset += line.length + 1; // +1 for the split "\n"
  }

  const deduped = dedupeBoundaries(boundaries);
  if (deduped.length === 0) return [];
  return coverPreamble(mergeTinyChapters(boundariesToChapters(deduped, text.length)), text);
}

/** Validity gate: enough chapters, each with enough body. */
function isValidSplit(chapters: DetectedChapter[]): boolean {
  if (chapters.length < MIN_CHAPTERS) return false;
  return chapters.every((c) => c.end - c.start >= MIN_CHAPTER_CHARS);
}

/**
 * Layered chapter detection: PDF outline first, then regex heading scanning,
 * then a rejection (caller keeps whole-document behavior).
 */
export function detectChapters(input: DetectChaptersInput): ChapterDetectionResult {
  const { text, outline } = input;
  if (!text || text.trim().length === 0) {
    return { chapters: [], detected: false, reason: "empty-text" };
  }

  // Layer 1: outline.
  if (outline && outline.length > 0) {
    const fromOutline = detectFromOutline(text, outline);
    if (isValidSplit(fromOutline)) {
      return { chapters: capChapters(fromOutline), detected: true };
    }
  }

  // Layer 2: regex headings.
  const fromHeadings = detectFromHeadings(text);
  if (isValidSplit(fromHeadings)) {
    return { chapters: capChapters(fromHeadings), detected: true };
  }

  // Layer 3: fallback — no scoping.
  return { chapters: [], detected: false, reason: "below-thresholds" };
}

function capChapters(chapters: DetectedChapter[]): DetectedChapter[] {
  return chapters.length > MAX_CHAPTERS_UI ? chapters.slice(0, MAX_CHAPTERS_UI) : chapters;
}

/**
 * Concatenate the text of the selected chapters (in document order),
 * joined by blank lines. `selectedIds` is a set of DetectedChapter.id.
 * Returns the full text when nothing is selected-out (all selected).
 */
export function sliceSelectedChapters(
  text: string,
  chapters: DetectedChapter[],
  selectedIds: Set<string>,
): string {
  if (chapters.length === 0) return text;
  const selected = chapters.filter((c) => selectedIds.has(c.id));
  if (selected.length === 0) return "";
  if (selected.length === chapters.length) return text;
  return selected
    .sort((a, b) => a.start - b.start)
    .map((c) => text.slice(c.start, c.end).trim())
    .filter(Boolean)
    .join("\n\n");
}
