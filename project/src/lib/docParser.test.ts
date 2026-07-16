import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock pdfjs-dist to avoid loading the real PDF worker
vi.mock("pdfjs-dist", () => ({
  default: {
    GlobalWorkerOptions: { workerSrc: "" },
    getDocument: vi.fn(),
    version: "4.0.379",
  },
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: vi.fn(),
  version: "4.0.379",
}));

// Mock mammoth browser build — only the default export is used by import mammoth from ...
vi.mock("mammoth/mammoth.browser", () => ({
  default: {
    extractRawText: vi.fn(),
  },
}));

// Helper to create a mock File object
function createMockFile(
  name: string,
  content: string,
  options?: { rejectText?: boolean },
): File {
  const blob = new Blob([content], { type: "text/plain" });
  const file = new File([blob], name);

  if (options?.rejectText) {
    vi.spyOn(file, "text").mockRejectedValue(new Error("File read error"));
  }

  return file;
}

describe("extractTextFromFile", () => {
  let extractTextFromFile: (file: File) => Promise<string>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@/lib/docParser");
    extractTextFromFile = mod.extractTextFromFile;
  });

  it("extracts text from .txt files", async () => {
    const file = createMockFile("notes.txt", "Hello world\nThis is a test.");
    const result = await extractTextFromFile(file);
    // extractTextFromTxt just calls file.text()
    expect(result).toBe("Hello world\nThis is a test.");
  });

  it("extracts text from .md files with markdown normalization", async () => {
    const mdContent =
      "# Title\n\n**bold** and *italic* and `code`\n\n---\n\n[link](https://example.com)";
    const file = createMockFile("readme.md", mdContent);
    const result = await extractTextFromFile(file);
    // Markdown syntax should be stripped
    expect(result).not.toContain("**");
    expect(result).not.toContain("*italic*");
    expect(result).not.toContain("---");
    expect(result).not.toContain("[link]");
    expect(result).toContain("bold");
    expect(result).toContain("italic");
    expect(result).toContain("link");
  });

  it("strips code fences from .md files", async () => {
    const mdContent =
      "Some text\n```json\n{\"key\": \"value\"}\n```\nMore text";
    const file = createMockFile("doc.md", mdContent);
    const result = await extractTextFromFile(file);
    expect(result).not.toContain("```");
    expect(result).not.toContain('"key"');
    expect(result).toContain("Some text");
    expect(result).toContain("More text");
  });

  it("strips image markdown from .md files", async () => {
    const mdContent = "![alt text](image.png) and text after";
    const file = createMockFile("doc.md", mdContent);
    const result = await extractTextFromFile(file);
    expect(result).not.toContain("![");
    expect(result).not.toContain("image.png");
    expect(result).toContain("alt text");
  });

  it("extracts text from .text files", async () => {
    const file = createMockFile("data.text", "Plain text content");
    const result = await extractTextFromFile(file);
    expect(result).toBe("Plain text content");
  });

  it("trims whitespace from extracted markdown", async () => {
    const file = createMockFile("doc.md", "  hello world  ");
    const result = await extractTextFromFile(file);
    expect(result).toBe("hello world");
  });

  it("caps markdown input at 200k chars", async () => {
    const longContent = "a".repeat(250_000);
    const file = createMockFile("doc.md", longContent);
    const result = await extractTextFromFile(file);
    expect(result.length).toBeLessThanOrEqual(200_000);
  });

  it("forwards to PDF extraction for .pdf files", async () => {
    const pdfjs = await import("pdfjs-dist");
    const mockGetDocument = vi.mocked(pdfjs.getDocument);

    const mockPage = {
      getTextContent: vi.fn().mockResolvedValue({
        items: [{ str: "Page 1 text" }],
      }),
    };

    mockGetDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 1,
        getPage: vi.fn().mockResolvedValue(mockPage),
        destroy: vi.fn(),
      }),
    } as unknown as ReturnType<typeof mockGetDocument>);

    const file = createMockFile("doc.pdf", "pdf binary content");
    const result = await extractTextFromFile(file);
    expect(result).toContain("Page 1 text");
    expect(mockGetDocument).toHaveBeenCalledTimes(1);
  });

  it("throws for unsupported file types when text read fails", async () => {
    const file = createMockFile("data.xyz", "some content", {
      rejectText: true,
    });
    await expect(extractTextFromFile(file)).rejects.toThrow(
      /unsupported file type.*xyz/i,
    );
  });

  it("tries .text() fallback for unknown extensions", async () => {
    const file = createMockFile("data.xyz", "fallback content");
    const result = await extractTextFromFile(file);
    // Falls through to default which calls file.text()
    expect(result).toBe("fallback content");
  });

  it("extracts text from .markdown extension", async () => {
    const mdContent = "_emphasized_ text";
    const file = createMockFile("doc.markdown", mdContent);
    const result = await extractTextFromFile(file);
    expect(result).not.toContain("_");
    expect(result).toContain("emphasized");
  });

  it("forwards to DOCX extraction for .docx files", async () => {
    const mammothMod = await import("mammoth/mammoth.browser");
    const mockExtractRawText = vi.mocked(mammothMod.default.extractRawText);
    mockExtractRawText.mockResolvedValue({
      value: "Extracted Word content",
      messages: [],
    });

    const file = createMockFile("report.docx", "docx binary");
    const result = await extractTextFromFile(file);
    expect(result).toBe("Extracted Word content");
    expect(mockExtractRawText).toHaveBeenCalledTimes(1);
  });
});
