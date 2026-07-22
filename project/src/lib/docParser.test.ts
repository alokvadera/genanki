import { describe, it, expect, vi } from "vitest";

vi.mock("pdfjs-dist", () => {
  const mockPage = {
    getTextContent: vi.fn().mockResolvedValue({ items: [{ str: "Hello World" }] }),
    getViewport: vi.fn().mockReturnValue({ width: 800, height: 600 }),
  };
  const mockPdf = {
    numPages: 1,
    getPage: vi.fn().mockResolvedValue(mockPage),
    getOutline: vi.fn().mockResolvedValue(null),
    getDestination: vi.fn(),
    getPageIndex: vi.fn(),
  };
  return {
    getDocument: vi.fn().mockReturnValue({ promise: Promise.resolve(mockPdf) }),
    GlobalWorkerOptions: { workerSrc: "" },
    version: "4.0.379",
  };
});

vi.mock("mammoth/mammoth.browser", () => ({
  default: {
    extractRawText: vi.fn().mockResolvedValue({ value: "Extracted docx text" }),
  },
}));

import {
  extractTextFromTxt,
  extractTextFromDocx,
  extractTextFromFile,
  extractDocument,
} from "./docParser";

function createFile(name: string, content: string): File {
  return new File([content], name, { type: "text/plain" });
}

describe("docParser", () => {
  describe("extractTextFromTxt", () => {
    it("extracts text from a txt file", async () => {
      const file = createFile("test.txt", "Hello World");
      const result = await extractTextFromTxt(file);
      expect(result).toBe("Hello World");
    });

    it("rejects files exceeding 50MB size limit", async () => {
      const largeContent = "x".repeat(51 * 1024 * 1024);
      const file = createFile("large.txt", largeContent);
      await expect(extractTextFromTxt(file)).rejects.toThrow("too large");
    });

    it("truncates text exceeding 500K characters", async () => {
      const longContent = "a".repeat(600_000);
      const file = createFile("long.txt", longContent);
      const result = await extractTextFromTxt(file);
      expect(result.length).toBeLessThan(600_000);
      expect(result).toContain("[Text truncated due to size limits]");
    });

    it("does not truncate text under 500K characters", async () => {
      const content = "a".repeat(100_000);
      const file = createFile("normal.txt", content);
      const result = await extractTextFromTxt(file);
      expect(result).toBe(content);
      expect(result).not.toContain("truncated");
    });
  });

  describe("extractTextFromDocx", () => {
    it("extracts text from a docx file", async () => {
      const file = createFile("test.docx", "binary content");
      const result = await extractTextFromDocx(file);
      expect(result).toBe("Extracted docx text");
    });

    it("rejects oversized docx files", async () => {
      const file = createFile("large.docx", "x".repeat(51 * 1024 * 1024));
      await expect(extractTextFromDocx(file)).rejects.toThrow("too large");
    });
  });

  describe("extractTextFromFile", () => {
    it("extracts from .txt files", async () => {
      const file = createFile("notes.txt", "Plain text content");
      const result = await extractTextFromFile(file);
      expect(result).toBe("Plain text content");
    });

    it("extracts from .text files", async () => {
      const file = createFile("notes.text", "Plain text content");
      const result = await extractTextFromFile(file);
      expect(result).toBe("Plain text content");
    });

    it("extracts from .docx files", async () => {
      const file = createFile("doc.docx", "binary");
      const result = await extractTextFromFile(file);
      expect(result).toBe("Extracted docx text");
    });

    it("extracts from .md files with normalization", async () => {
      const file = createFile("readme.md", "# Heading\n\n**Bold** and *italic*");
      const result = await extractTextFromFile(file);
      expect(result).toContain("Heading");
      expect(result).toContain("Bold");
    });

    it("extracts from .markdown files", async () => {
      const file = createFile("doc.markdown", "# Title\n\nSome content");
      const result = await extractTextFromFile(file);
      expect(result).toContain("Title");
    });

    it("falls back to txt extraction for unknown extensions", async () => {
      const file = createFile("data.csv", "col1,col2");
      const result = await extractTextFromFile(file);
      expect(result).toBe("col1,col2");
    });

    it("extracts from .pdf files", async () => {
      const file = createFile("doc.pdf", "pdf content");
      const result = await extractTextFromFile(file);
      expect(result).toContain("Hello World");
    });
  });

  describe("extractDocument", () => {
    it("returns kind: txt for .txt files", async () => {
      const file = createFile("notes.txt", "text content");
      const result = await extractDocument(file);
      expect(result.kind).toBe("txt");
      expect(result.text).toBe("text content");
    });

    it("returns kind: txt for .text files", async () => {
      const file = createFile("notes.text", "text content");
      const result = await extractDocument(file);
      expect(result.kind).toBe("txt");
    });

    it("returns kind: md for .md files", async () => {
      const file = createFile("readme.md", "# Title");
      const result = await extractDocument(file);
      expect(result.kind).toBe("md");
    });

    it("returns kind: md for .markdown files", async () => {
      const file = createFile("doc.markdown", "# Title");
      const result = await extractDocument(file);
      expect(result.kind).toBe("md");
    });

    it("returns kind: docx for .docx files", async () => {
      const file = createFile("doc.docx", "binary");
      const result = await extractDocument(file);
      expect(result.kind).toBe("docx");
    });

    it("returns kind: pdf for .pdf files", async () => {
      const file = createFile("doc.pdf", "pdf content");
      const result = await extractDocument(file);
      expect(result.kind).toBe("pdf");
      expect(result.pageOffsets).toBeDefined();
    });

    it("falls back to txt for unknown extensions", async () => {
      const file = createFile("data.csv", "col1,col2");
      const result = await extractDocument(file);
      expect(result.kind).toBe("txt");
    });
  });

  describe("normalizeMarkdown (via extractTextFromFile .md)", () => {
    it("strips code fences", async () => {
      const file = createFile("code.md", "Text before\n```\ncode block\n```\nText after");
      const result = await extractTextFromFile(file);
      expect(result).not.toContain("code block");
      expect(result).toContain("Text before");
    });

    it("strips image syntax", async () => {
      const file = createFile("img.md", "Image: ![alt](url.png)");
      const result = await extractTextFromFile(file);
      expect(result).toContain("alt");
      expect(result).not.toContain("![");
    });

    it("strips link syntax but keeps text", async () => {
      const file = createFile("link.md", "[click here](https://example.com)");
      const result = await extractTextFromFile(file);
      expect(result).toContain("click here");
    });

    it("strips emphasis markers", async () => {
      const file = createFile("em.md", "**bold** and *italic* and ~~strike~~");
      const result = await extractTextFromFile(file);
      expect(result).toContain("bold");
      expect(result).toContain("italic");
      expect(result).toContain("strike");
    });

    it("strips horizontal rules", async () => {
      const file = createFile("hr.md", "Before\n---\nAfter");
      const result = await extractTextFromFile(file);
      expect(result).toContain("Before");
      expect(result).toContain("After");
    });

    it("truncates markdown over 200K characters", async () => {
      const longMd = "# ".repeat(100_000);
      const file = createFile("long.md", longMd);
      const result = await extractTextFromFile(file);
      expect(result.length).toBeLessThanOrEqual(200_000 + 100);
    });

    it("preserves heading markers for chapter detection", async () => {
      const file = createFile("headings.md", "# Chapter 1\n\n## Section 1.1\n\nContent here");
      const result = await extractTextFromFile(file);
      expect(result).toContain("# Chapter 1");
      expect(result).toContain("## Section 1.1");
    });
  });

  describe("extractDocument branches", () => {
    it("extracts from .pdf with structure", async () => {
      const file = createFile("doc.pdf", "pdf content");
      const result = await extractDocument(file);
      expect(result.kind).toBe("pdf");
      expect(result.pageOffsets).toBeDefined();
      expect(Array.isArray(result.outline)).toBe(true);
    });

    it("handles scanned PDF detection (short text)", async () => {
      const { getDocument } = await import("pdfjs-dist");
      const shortPage = {
        getTextContent: vi.fn().mockResolvedValue({ items: [{ str: "hi" }] }),
        getViewport: vi.fn().mockReturnValue({ width: 800, height: 600 }),
      };
      const shortPdf = {
        numPages: 1,
        getPage: vi.fn().mockResolvedValue(shortPage),
        getOutline: vi.fn().mockResolvedValue(null),
      };
      vi.mocked(getDocument).mockReturnValue({ promise: Promise.resolve(shortPdf) } as unknown as ReturnType<typeof getDocument>);
      
      const file = createFile("scan.pdf", "pdf");
      const result = await extractDocument(file);
      expect(result.isScanned).toBe(true);
    });

    it("handles PDF with empty text content", async () => {
      const { getDocument } = await import("pdfjs-dist");
      const emptyPage = {
        getTextContent: vi.fn().mockResolvedValue({ items: [] }),
        getViewport: vi.fn().mockReturnValue({ width: 800, height: 600 }),
      };
      const emptyPdf = {
        numPages: 1,
        getPage: vi.fn().mockResolvedValue(emptyPage),
        getOutline: vi.fn().mockResolvedValue(null),
      };
      vi.mocked(getDocument).mockReturnValue({ promise: Promise.resolve(emptyPdf) } as unknown as ReturnType<typeof getDocument>);
      
      const file = createFile("empty.pdf", "pdf");
      const result = await extractDocument(file);
      expect(result.text).toBe("");
    });

    it("handles PDF with outline/bookmarks", async () => {
      const { getDocument } = await import("pdfjs-dist");
      const mockPage = {
        getTextContent: vi.fn().mockResolvedValue({ items: [{ str: "Page content" }] }),
        getViewport: vi.fn().mockReturnValue({ width: 800, height: 600 }),
      };
      const mockPdf = {
        numPages: 2,
        getPage: vi.fn().mockResolvedValue(mockPage),
        getOutline: vi.fn().mockResolvedValue([
          { title: "Chapter 1", dest: "dest1", items: [] },
          { title: "Chapter 2", dest: "dest2", items: [{ title: "Section 2.1", dest: "dest3", items: [] }] },
        ]),
        getDestination: vi.fn().mockResolvedValue([{ pageNum: 0 }]),
        getPageIndex: vi.fn().mockResolvedValue(0),
      };
      vi.mocked(getDocument).mockReturnValue({ promise: Promise.resolve(mockPdf) } as unknown as ReturnType<typeof getDocument>);
      
      const file = createFile("outline.pdf", "pdf");
      const result = await extractDocument(file);
      expect(result.outline).toBeDefined();
      expect(result.outline!.length).toBeGreaterThan(0);
    });

    it("handles outline resolution errors gracefully", async () => {
      const { getDocument } = await import("pdfjs-dist");
      const mockPage = {
        getTextContent: vi.fn().mockResolvedValue({ items: [{ str: "Content" }] }),
        getViewport: vi.fn().mockReturnValue({ width: 800, height: 600 }),
      };
      const mockPdf = {
        numPages: 1,
        getPage: vi.fn().mockResolvedValue(mockPage),
        getOutline: vi.fn().mockRejectedValue(new Error("No outline")),
        getDestination: vi.fn(),
        getPageIndex: vi.fn(),
      };
      vi.mocked(getDocument).mockReturnValue({ promise: Promise.resolve(mockPdf) } as unknown as ReturnType<typeof getDocument>);
      
      const file = createFile("err.pdf", "pdf");
      const result = await extractDocument(file);
      expect(result.outline).toEqual([]);
    });

    it("handles PDF with named destination that fails", async () => {
      const { getDocument } = await import("pdfjs-dist");
      const mockPage = {
        getTextContent: vi.fn().mockResolvedValue({ items: [{ str: "Content" }] }),
        getViewport: vi.fn().mockReturnValue({ width: 800, height: 600 }),
      };
      const mockPdf = {
        numPages: 1,
        getPage: vi.fn().mockResolvedValue(mockPage),
        getOutline: vi.fn().mockResolvedValue([
          { title: "Chapter", dest: "named_dest", items: [] },
        ]),
        getDestination: vi.fn().mockRejectedValue(new Error("Unknown dest")),
        getPageIndex: vi.fn(),
      };
      vi.mocked(getDocument).mockReturnValue({ promise: Promise.resolve(mockPdf) } as unknown as ReturnType<typeof getDocument>);
      
      const file = createFile("named.pdf", "pdf");
      const result = await extractDocument(file);
      expect(result.outline).toEqual([]);
    });

    it("handles outline with non-array dest", async () => {
      const { getDocument } = await import("pdfjs-dist");
      const mockPage = {
        getTextContent: vi.fn().mockResolvedValue({ items: [{ str: "Content" }] }),
        getViewport: vi.fn().mockReturnValue({ width: 800, height: 600 }),
      };
      const mockPdf = {
        numPages: 1,
        getPage: vi.fn().mockResolvedValue(mockPage),
        getOutline: vi.fn().mockResolvedValue([
          { title: "Chapter", dest: 123, items: [] },
        ]),
        getDestination: vi.fn().mockResolvedValue("not-an-array"),
        getPageIndex: vi.fn(),
      };
      vi.mocked(getDocument).mockReturnValue({ promise: Promise.resolve(mockPdf) } as unknown as ReturnType<typeof getDocument>);
      
      const file = createFile("baddest.pdf", "pdf");
      const result = await extractDocument(file);
      expect(result.outline).toEqual([]);
    });

    it("handles outline with getPageIndex error", async () => {
      const { getDocument } = await import("pdfjs-dist");
      const mockPage = {
        getTextContent: vi.fn().mockResolvedValue({ items: [{ str: "Content" }] }),
        getViewport: vi.fn().mockReturnValue({ width: 800, height: 600 }),
      };
      const mockPdf = {
        numPages: 1,
        getPage: vi.fn().mockResolvedValue(mockPage),
        getOutline: vi.fn().mockResolvedValue([
          { title: "Chapter", dest: ["ref1", 0], items: [] },
        ]),
        getDestination: vi.fn(),
        getPageIndex: vi.fn().mockRejectedValue(new Error("Page not found")),
      };
      vi.mocked(getDocument).mockReturnValue({ promise: Promise.resolve(mockPdf) } as unknown as ReturnType<typeof getDocument>);
      
      const file = createFile("pageerr.pdf", "pdf");
      const result = await extractDocument(file);
      expect(result.outline).toEqual([]);
    });

    it("handles outline with null dest", async () => {
      const { getDocument } = await import("pdfjs-dist");
      const mockPage = {
        getTextContent: vi.fn().mockResolvedValue({ items: [{ str: "Content" }] }),
        getViewport: vi.fn().mockReturnValue({ width: 800, height: 600 }),
      };
      const mockPdf = {
        numPages: 1,
        getPage: vi.fn().mockResolvedValue(mockPage),
        getOutline: vi.fn().mockResolvedValue([
          { title: "Chapter", dest: null, items: [] },
        ]),
        getDestination: vi.fn(),
        getPageIndex: vi.fn(),
      };
      vi.mocked(getDocument).mockReturnValue({ promise: Promise.resolve(mockPdf) } as unknown as ReturnType<typeof getDocument>);
      
      const file = createFile("nulldest.pdf", "pdf");
      const result = await extractDocument(file);
      expect(result.outline).toEqual([]);
    });

    it("handles outline with empty dest array", async () => {
      const { getDocument } = await import("pdfjs-dist");
      const mockPage = {
        getTextContent: vi.fn().mockResolvedValue({ items: [{ str: "Content" }] }),
        getViewport: vi.fn().mockReturnValue({ width: 800, height: 600 }),
      };
      const mockPdf = {
        numPages: 1,
        getPage: vi.fn().mockResolvedValue(mockPage),
        getOutline: vi.fn().mockResolvedValue([
          { title: "Chapter", dest: [], items: [] },
        ]),
        getDestination: vi.fn().mockResolvedValue([]),
        getPageIndex: vi.fn(),
      };
      vi.mocked(getDocument).mockReturnValue({ promise: Promise.resolve(mockPdf) } as unknown as ReturnType<typeof getDocument>);
      
      const file = createFile("emptydest.pdf", "pdf");
      const result = await extractDocument(file);
      expect(result.outline).toEqual([]);
    });

    it("handles outline with non-string title", async () => {
      const { getDocument } = await import("pdfjs-dist");
      const mockPage = {
        getTextContent: vi.fn().mockResolvedValue({ items: [{ str: "Content" }] }),
        getViewport: vi.fn().mockReturnValue({ width: 800, height: 600 }),
      };
      const mockPdf = {
        numPages: 1,
        getPage: vi.fn().mockResolvedValue(mockPage),
        getOutline: vi.fn().mockResolvedValue([
          { title: 123, dest: ["ref1", 0], items: [] },
        ]),
        getDestination: vi.fn(),
        getPageIndex: vi.fn().mockResolvedValue(0),
      };
      vi.mocked(getDocument).mockReturnValue({ promise: Promise.resolve(mockPdf) } as unknown as ReturnType<typeof getDocument>);
      
      const file = createFile("badtitle.pdf", "pdf");
      const result = await extractDocument(file);
      expect(result.outline).toEqual([]);
    });

    it("handles outline with page index out of bounds", async () => {
      const { getDocument } = await import("pdfjs-dist");
      const mockPage = {
        getTextContent: vi.fn().mockResolvedValue({ items: [{ str: "Content" }] }),
        getViewport: vi.fn().mockReturnValue({ width: 800, height: 600 }),
      };
      const mockPdf = {
        numPages: 1,
        getPage: vi.fn().mockResolvedValue(mockPage),
        getOutline: vi.fn().mockResolvedValue([
          { title: "Chapter", dest: ["ref1", 0], items: [] },
        ]),
        getDestination: vi.fn(),
        getPageIndex: vi.fn().mockResolvedValue(999),
      };
      vi.mocked(getDocument).mockReturnValue({ promise: Promise.resolve(mockPdf) } as unknown as ReturnType<typeof getDocument>);
      
      const file = createFile("oob.pdf", "pdf");
      const result = await extractDocument(file);
      expect(result.outline).toEqual([]);
    });

    it("handles outline with empty string title", async () => {
      const { getDocument } = await import("pdfjs-dist");
      const mockPage = {
        getTextContent: vi.fn().mockResolvedValue({ items: [{ str: "Content" }] }),
        getViewport: vi.fn().mockReturnValue({ width: 800, height: 600 }),
      };
      const mockPdf = {
        numPages: 1,
        getPage: vi.fn().mockResolvedValue(mockPage),
        getOutline: vi.fn().mockResolvedValue([
          { title: "", dest: ["ref1", 0], items: [] },
        ]),
        getDestination: vi.fn(),
        getPageIndex: vi.fn().mockResolvedValue(0),
      };
      vi.mocked(getDocument).mockReturnValue({ promise: Promise.resolve(mockPdf) } as unknown as ReturnType<typeof getDocument>);
      
      const file = createFile("emptytitle.pdf", "pdf");
      const result = await extractDocument(file);
      expect(result.outline).toEqual([]);
    });

    it("handles outline with negative page index", async () => {
      const { getDocument } = await import("pdfjs-dist");
      const mockPage = {
        getTextContent: vi.fn().mockResolvedValue({ items: [{ str: "Content" }] }),
        getViewport: vi.fn().mockReturnValue({ width: 800, height: 600 }),
      };
      const mockPdf = {
        numPages: 1,
        getPage: vi.fn().mockResolvedValue(mockPage),
        getOutline: vi.fn().mockResolvedValue([
          { title: "Chapter", dest: ["ref1", 0], items: [] },
        ]),
        getDestination: vi.fn(),
        getPageIndex: vi.fn().mockResolvedValue(-1),
      };
      vi.mocked(getDocument).mockReturnValue({ promise: Promise.resolve(mockPdf) } as unknown as ReturnType<typeof getDocument>);
      
      const file = createFile("neg.pdf", "pdf");
      const result = await extractDocument(file);
      expect(result.outline).toEqual([]);
    });

    it("handles outline with getDestination returning non-string dest", async () => {
      const { getDocument } = await import("pdfjs-dist");
      const mockPage = {
        getTextContent: vi.fn().mockResolvedValue({ items: [{ str: "Content" }] }),
        getViewport: vi.fn().mockReturnValue({ width: 800, height: 600 }),
      };
      const mockPdf = {
        numPages: 1,
        getPage: vi.fn().mockResolvedValue(mockPage),
        getOutline: vi.fn().mockResolvedValue([
          { title: "Chapter", dest: "named_dest", items: [] },
        ]),
        getDestination: vi.fn().mockResolvedValue(123),
        getPageIndex: vi.fn(),
      };
      vi.mocked(getDocument).mockReturnValue({ promise: Promise.resolve(mockPdf) } as unknown as ReturnType<typeof getDocument>);
      
      const file = createFile("namednon.pdf", "pdf");
      const result = await extractDocument(file);
      expect(result.outline).toEqual([]);
    });

    it("handles outline with getPageIndex returning non-number", async () => {
      const { getDocument } = await import("pdfjs-dist");
      const mockPage = {
        getTextContent: vi.fn().mockResolvedValue({ items: [{ str: "Content" }] }),
        getViewport: vi.fn().mockReturnValue({ width: 800, height: 600 }),
      };
      const mockPdf = {
        numPages: 1,
        getPage: vi.fn().mockResolvedValue(mockPage),
        getOutline: vi.fn().mockResolvedValue([
          { title: "Chapter", dest: ["ref1", 0], items: [] },
        ]),
        getDestination: vi.fn(),
        getPageIndex: vi.fn().mockResolvedValue("not-a-number"),
      };
      vi.mocked(getDocument).mockReturnValue({ promise: Promise.resolve(mockPdf) } as unknown as ReturnType<typeof getDocument>);
      
      const file = createFile("nan.pdf", "pdf");
      const result = await extractDocument(file);
      expect(result.outline).toEqual([]);
    });

    it("handles outline with nested items", async () => {
      const { getDocument } = await import("pdfjs-dist");
      const mockPage = {
        getTextContent: vi.fn().mockResolvedValue({ items: [{ str: "Content" }] }),
        getViewport: vi.fn().mockReturnValue({ width: 800, height: 600 }),
      };
      const mockPdf = {
        numPages: 1,
        getPage: vi.fn().mockResolvedValue(mockPage),
        getOutline: vi.fn().mockResolvedValue([
          { title: "Chapter 1", dest: ["ref1", 0], items: [
            { title: "Section 1.1", dest: ["ref2", 0], items: [] },
          ] },
        ]),
        getDestination: vi.fn(),
        getPageIndex: vi.fn().mockResolvedValue(0),
      };
      vi.mocked(getDocument).mockReturnValue({ promise: Promise.resolve(mockPdf) } as unknown as ReturnType<typeof getDocument>);
      
      const file = createFile("nested.pdf", "pdf");
      const result = await extractDocument(file);
      expect(result.outline).toBeDefined();
      expect(result.outline!.length).toBe(2);
    });

    it("returns kind: txt for .txt files via extractDocument", async () => {
      const file = createFile("notes.txt", "text content");
      const result = await extractDocument(file);
      expect(result.kind).toBe("txt");
      expect(result.text).toBe("text content");
    });

    it("extracts text from unknown ext via extractDocument fallback", async () => {
      const file = createFile("data.xyz", "content");
      const result = await extractDocument(file);
      expect(result.kind).toBe("txt");
      expect(result.text).toBe("content");
    });

    it("extracts text from unknown ext via extractTextFromFile fallback", async () => {
      const file = createFile("data.xyz", "content");
      const result = await extractTextFromFile(file);
      expect(result).toBe("content");
    });

    it("handles PDF with empty outline array", async () => {
      const { getDocument } = await import("pdfjs-dist");
      const mockPage = {
        getTextContent: vi.fn().mockResolvedValue({ items: [{ str: "Content" }] }),
        getViewport: vi.fn().mockReturnValue({ width: 800, height: 600 }),
      };
      const mockPdf = {
        numPages: 1,
        getPage: vi.fn().mockResolvedValue(mockPage),
        getOutline: vi.fn().mockResolvedValue([]),
        getDestination: vi.fn(),
        getPageIndex: vi.fn(),
      };
      vi.mocked(getDocument).mockReturnValue({ promise: Promise.resolve(mockPdf) } as unknown as ReturnType<typeof getDocument>);
      
      const file = createFile("emptyoutline.pdf", "pdf");
      const result = await extractDocument(file);
      expect(result.outline).toEqual([]);
    });

    it("handles PDF with multi-page structure", async () => {
      const { getDocument } = await import("pdfjs-dist");
      const mockPage1 = {
        getTextContent: vi.fn().mockResolvedValue({ items: [{ str: "Page 1 content" }] }),
        getViewport: vi.fn().mockReturnValue({ width: 800, height: 600 }),
      };
      const mockPage2 = {
        getTextContent: vi.fn().mockResolvedValue({ items: [{ str: "Page 2 content" }] }),
        getViewport: vi.fn().mockReturnValue({ width: 800, height: 600 }),
      };
      const mockPdf = {
        numPages: 2,
        getPage: vi.fn()
          .mockResolvedValueOnce(mockPage1)
          .mockResolvedValueOnce(mockPage2),
        getOutline: vi.fn().mockResolvedValue(null),
      };
      vi.mocked(getDocument).mockReturnValue({ promise: Promise.resolve(mockPdf) } as unknown as ReturnType<typeof getDocument>);
      
      const file = createFile("multipage.pdf", "pdf");
      const result = await extractDocument(file);
      expect(result.text).toContain("Page 1 content");
      expect(result.text).toContain("Page 2 content");
      expect(result.pageOffsets).toBeDefined();
      expect(result.pageOffsets!.length).toBe(2);
    });
  });
});


// Cascade-free additions targeting residual statement gaps in normalizeMarkdown
// and the unsupported-extension error paths.
describe("docParser \u2014 cascade-free tail coverage", () => {
  // L215: normalizeMarkdown text.length > 200_000 truncation guard.
  it("truncates markdown input above 200,000 characters to the exact slice boundary", async () => {
    const longMd = `# Huge Section\n\n${"x".repeat(200_500)}`;
    const file = new File([longMd], "huge.md", { type: "text/markdown" });
    const result = await extractTextFromFile(file);
    // Input was > 200_500 chars; L215 truncates to 200_000 then a few zero-length
    // markdown replacements (.replace without matches preserves length) -> exact 200_000.
    expect(longMd.length).toBeGreaterThan(200_500);
    expect(result.length).toBe(200_000);
  });

  // L252: extractTextFromFile default case -> catch -> throws Unsupported.
  it("rejects unsupported extensions when plain-text extraction also fails", async () => {
    const file = new File(["\\xff\\xfe garbage bytes"], "mystery.xyz", { type: "application/x-unknown" });
    const spy = vi.spyOn(File.prototype, "text").mockRejectedValueOnce(new Error("not-a-text-file"));
    try {
      await expect(extractTextFromFile(file)).rejects.toThrow(/Unsupported file type: \.xyz/);
    } finally {
      spy.mockRestore();
    }
  });

  // L282: extractDocument default case -> catch -> throws Unsupported.
  it("rejects unsupported extensions in extractDocument when plain-text read fails", async () => {
    const file = new File(["\\xff\\xfe garbage bytes"], "mystery.xyz", { type: "application/x-unknown" });
    const spy = vi.spyOn(File.prototype, "text").mockRejectedValueOnce(new Error("not-a-text-file"));
    try {
      await expect(extractDocument(file)).rejects.toThrow(/Unsupported file type: \.xyz/);
    } finally {
      spy.mockRestore();
    }
  });
});
describe("docParser — final cascade-free push (branch gaps)", () => {
  // extensionOf chain via multi-dot filename exercises the split/pop logic
  it("extensionOf handles multi-dot filename (returns last segment as extension)", async () => {
    const file = createFile("my.report.txt", "Plain text content");
    const result = await extractTextFromFile(file);
    // extensionOf returns "txt"; switch routes to extractTextFromTxt.
    expect(result).toBe("Plain text content");
  });

  // extensionOf with no dot in filename returns the full filename as extension
  it("extensionOf handles filename with no dot (returns filename as fallback ext)", async () => {
    const file = createFile("README", "Plain text content");
    const result = await extractTextFromFile(file);
    // extensionOf returns "readme"; switch default falls back to txt extraction.
    expect(result).toBe("Plain text content");
  });
});
describe("docParser — surgical cond-expr branch", () => {
  it("100-char text via extractTextFromTxt exercises the truthy truncateText path", async () => {
    const file = createFile("small.txt", "x".repeat(100));
    const result = await extractTextFromTxt(file);
    expect(result.length).toBe(100);
  });



// Cascade-free mock-test: exercises the false-arm of `"str" in item` in
// `extractPdfWithStructure`. Real PDF.js emits TextMarkedContent items
// without a `.str` property for marked/highlighted text runs; the source's
// ternary fallback returns "" for them. Replaces the istanbul-ignore-next
// on docParser.ts:93 with real coverage.
describe("docParser — PDF TextMarkedContent defensive (PDF.js interop)", () => {
  it("handles getTextContent items without 'str' property (TextMarkedContent false-arm)", async () => {
    const { getDocument } = await import("pdfjs-dist");
    const mockPage = {
      getTextContent: vi.fn().mockResolvedValue({ items: [{}] }),
      getViewport: vi.fn().mockReturnValue({ width: 800, height: 600 }),
    };
    const mockPdf = {
      numPages: 1,
      getPage: vi.fn().mockResolvedValue(mockPage),
      getOutline: vi.fn().mockResolvedValue(null),
      getDestination: vi.fn(),
      getPageIndex: vi.fn(),
    };
    vi.mocked(getDocument).mockReturnValue({
      promise: Promise.resolve(mockPdf),
    } as unknown as ReturnType<typeof getDocument>);

    const file = createFile("no-str-items.pdf", "pdf");
    const result = await extractDocument(file);
    expect(result.text).toBe("");
    expect(result.kind).toBe("pdf");
  });

  it("handles getTextContent items WITH 'str' property (truthy-arm baseline)", async () => {
    const { getDocument } = await import("pdfjs-dist");
    const mockPage = {
      getTextContent: vi.fn().mockResolvedValue({ items: [{ str: "Covered text here" }] }),
      getViewport: vi.fn().mockReturnValue({ width: 800, height: 600 }),
    };
    const mockPdf = {
      numPages: 1,
      getPage: vi.fn().mockResolvedValue(mockPage),
      getOutline: vi.fn().mockResolvedValue(null),
      getDestination: vi.fn(),
      getPageIndex: vi.fn(),
    };
    vi.mocked(getDocument).mockReturnValue({
      promise: Promise.resolve(mockPdf),
    } as unknown as ReturnType<typeof getDocument>);

    const file = createFile("with-str.pdf", "pdf");
    const result = await extractDocument(file);
    expect(result.text).toContain("Covered text here");
  });
});

});
