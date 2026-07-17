import * as pdfjsLib from "pdfjs-dist";
import mammoth from "mammoth/mammoth.browser";

// Set worker source to local bundle for offline compatibility
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "../../public/pdf.worker.min.mjs",
  import.meta.url
).href;

// Maximum file size limits (in bytes)
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_TEXT_LENGTH = 500_000; // 500K characters

/**
 * Validate file size before processing.
 * Throws an error if the file exceeds the maximum allowed size.
 */
function validateFileSize(file: File): void {
  if (file.size > MAX_FILE_SIZE) {
    const sizeMB = Math.round(file.size / (1024 * 1024));
    const maxMB = Math.round(MAX_FILE_SIZE / (1024 * 1024));
    throw new Error(
      `File "${file.name}" is too large (${sizeMB}MB). Maximum allowed size is ${maxMB}MB.`
    );
  }
}

/**
 * Truncate text to maximum allowed length.
 */
function truncateText(text: string): string {
  if (text.length > MAX_TEXT_LENGTH) {
    return text.slice(0, MAX_TEXT_LENGTH) + "\n\n[Text truncated due to size limits]";
  }
  return text;
}

/** A resolved outline (bookmark) entry mapped to a character offset in the extracted text. */
export interface OutlineEntry {
  title: string;
  /** Character offset into the extracted `text` where this outline item's page begins. */
  offset: number;
  /** Outline nesting depth (0 = top level). */
  level: number;
}

/** Structured extraction result used by chapter-aware scoping. */
export interface ExtractedDoc {
  text: string;
  kind: "pdf" | "docx" | "txt" | "md";
  /** For PDFs: character offset in `text` where each page begins (page 1 = index 0). */
  pageOffsets?: number[];
  /** For PDFs: resolved bookmarks/outline entries, in document order. */
  outline?: OutlineEntry[];
  isScanned?: boolean;
}

/**
 * Extract text from a PDF file (flat string, joined by blank lines).
 */
export async function extractTextFromPdf(file: File): Promise<string> {
  return (await extractPdfWithStructure(file)).text;
}

/**
 * Extract text from a PDF along with per-page character offsets and the
 * resolved bookmark outline (when present). Page offsets let outline page
 * destinations be mapped onto ranges of the flattened text.
 */
export async function extractPdfWithStructure(file: File): Promise<ExtractedDoc> {
  validateFileSize(file);
  
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const textParts: string[] = [];
  const pageOffsets: number[] = [];
  const separator = "\n\n";

  let runningLength = 0;
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .trim();

    // Record where this page's text starts in the final joined string.
    pageOffsets.push(runningLength);
    if (pageText) {
      textParts.push(pageText);
      runningLength += pageText.length + separator.length;
    }
  }

  let text = textParts.join(separator);
  text = truncateText(text);
  
  const outline = await resolveOutline(pdf, pageOffsets);
  const isScanned = text.trim().length < 100 && pdf.numPages > 0;

  return { text, kind: "pdf", pageOffsets, outline, isScanned };
}

/**
 * Resolve a PDF's bookmark outline into flat OutlineEntry[] with character
 * offsets. Best-effort: any item whose destination can't be resolved is
 * skipped rather than aborting the whole extraction.
 */
async function resolveOutline(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pdf: any,
  pageOffsets: number[],
): Promise<OutlineEntry[]> {
  let rawOutline: unknown;
  try {
    rawOutline = await pdf.getOutline();
  } catch {
    return [];
  }
  if (!Array.isArray(rawOutline) || rawOutline.length === 0) return [];

  const entries: OutlineEntry[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const walk = async (items: any[], level: number): Promise<void> => {
    for (const item of items) {
      try {
        const pageIndex = await resolveDestPageIndex(pdf, item?.dest);
        if (pageIndex !== null && pageIndex >= 0 && pageIndex < pageOffsets.length) {
          const title = typeof item?.title === "string" ? item.title.trim() : "";
          if (title) {
            entries.push({ title, offset: pageOffsets[pageIndex], level });
          }
        }
      } catch {
        // Skip unresolved item.
      }
      if (Array.isArray(item?.items) && item.items.length > 0) {
        await walk(item.items, level + 1);
      }
    }
  };

  await walk(rawOutline, 0);
  // Sort by document position so nested items interleave correctly.
  entries.sort((a, b) => a.offset - b.offset);
  return entries;
}

/**
 * Resolve an outline item's `dest` (explicit array or named destination) to a
 * zero-based page index. Returns null when it can't be resolved.
 */
async function resolveDestPageIndex(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pdf: any,
  dest: unknown,
): Promise<number | null> {
  if (!dest) return null;
  let explicit = dest;
  if (typeof dest === "string") {
    try {
      explicit = await pdf.getDestination(dest);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(explicit) || explicit.length === 0) return null;
  const ref = explicit[0];
  try {
    const idx = await pdf.getPageIndex(ref);
    return typeof idx === "number" ? idx : null;
  } catch {
    return null;
  }
}

/**
 * Extract text from a plain text file.
 */
export async function extractTextFromTxt(file: File): Promise<string> {
  validateFileSize(file);
  
  const text = await file.text();
  return truncateText(text);
}

/**
 * Extract text from a Word .docx file using mammoth (browser build).
 */
export async function extractTextFromDocx(file: File): Promise<string> {
  validateFileSize(file);
  
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return truncateText(result.value);
}

/**
 * Clean up markdown syntax that would produce noisy cards.
 * Strips code fences, images, links, and emphasis markers while
 * preserving the readable text content. Heading markers (`#`) are
 * intentionally preserved so chapter detection can see them.
 */
function normalizeMarkdown(text: string): string {
  // Bound input size to prevent ReDoS on pathological markdown
  if (text.length > 200_000) {
    text = text.slice(0, 200_000);
  }
  return text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/g, "$1")
    .replace(/^---$/gm, "")
    .trim();
}

function extensionOf(file: File): string | undefined {
  return file.name.split(".").pop()?.toLowerCase();
}

/**
 * Auto-detect file type and extract a flat text string.
 * Kept for callers that only need text (and for existing tests).
 */
export async function extractTextFromFile(file: File): Promise<string> {
  const ext = extensionOf(file);

  switch (ext) {
    case "pdf":
      return extractTextFromPdf(file);
    case "docx":
      return extractTextFromDocx(file);
    case "txt":
    case "text":
      return extractTextFromTxt(file);
    case "md":
    case "markdown":
      return normalizeMarkdown(await extractTextFromTxt(file));
    default:
      try {
        return await extractTextFromTxt(file);
      } catch {
        throw new Error(
          `Unsupported file type: .${ext}. Supported: PDF, DOCX, TXT, MD`
        );
      }
  }
}

/**
 * Auto-detect file type and extract text plus any available structure
 * (PDF page offsets and outline). Non-PDF formats return `{ text, kind }`
 * only; chapter detection falls back to regex heading scanning for those.
 */
export async function extractDocument(file: File): Promise<ExtractedDoc> {
  const ext = extensionOf(file);

  switch (ext) {
    case "pdf":
      return extractPdfWithStructure(file);
    case "docx":
      return { text: await extractTextFromDocx(file), kind: "docx" };
    case "txt":
    case "text":
      return { text: await extractTextFromTxt(file), kind: "txt" };
    case "md":
    case "markdown":
      return { text: normalizeMarkdown(await extractTextFromTxt(file)), kind: "md" };
    default:
      try {
        return { text: await extractTextFromTxt(file), kind: "txt" };
      } catch {
        throw new Error(
          `Unsupported file type: .${ext}. Supported: PDF, DOCX, TXT, MD`
        );
      }
  }
}
