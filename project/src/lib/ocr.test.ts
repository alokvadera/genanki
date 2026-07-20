// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRecognize, mockTerminate } = vi.hoisted(() => ({
  mockRecognize: vi.fn().mockResolvedValue({ data: { text: "OCR extracted text" } }),
  mockTerminate: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("tesseract.js", () => ({
  createWorker: vi.fn().mockResolvedValue({
    recognize: mockRecognize,
    terminate: mockTerminate,
  }),
}));

vi.mock("pdfjs-dist", () => {
  const mockPage = {
    getViewport: vi.fn().mockReturnValue({ width: 800, height: 600 }),
    render: vi.fn().mockReturnValue({ promise: Promise.resolve() }),
  };
  const mockPdf = {
    numPages: 1,
    getPage: vi.fn().mockResolvedValue(mockPage),
  };
  return {
    getDocument: vi.fn().mockReturnValue({ promise: Promise.resolve(mockPdf) }),
    GlobalWorkerOptions: { workerSrc: "" },
    version: "4.0.379",
  };
});

const originalCreateElement = document.createElement.bind(document);
vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
  if (tagName === "canvas") {
    const canvas = originalCreateElement(tagName);
    vi.spyOn(canvas, "getContext").mockReturnValue({
      fillRect: vi.fn(),
      clearRect: vi.fn(),
      putImageData: vi.fn(),
      canvas,
    } as any);
    Object.defineProperty(canvas, "width", { value: 800, writable: true });
    Object.defineProperty(canvas, "height", { value: 600, writable: true });
    return canvas;
  }
  return originalCreateElement(tagName);
});

import { runOcrOnPdf } from "./ocr";

function createFile(name: string, content: string): File {
  return new File([content], name, { type: "application/pdf" });
}

describe("ocr", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRecognize.mockResolvedValue({ data: { text: "OCR extracted text" } });
    mockTerminate.mockResolvedValue(undefined);
  });

  describe("runOcrOnPdf", () => {
    it("extracts text from a PDF using OCR", async () => {
      const file = createFile("scan.pdf", "pdf content");
      const result = await runOcrOnPdf(file);
      expect(result).toBe("OCR extracted text");
    });

    it("calls onProgress with rendering status", async () => {
      const onProgress = vi.fn();
      const file = createFile("scan.pdf", "pdf content");
      await runOcrOnPdf(file, onProgress);

      expect(onProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          status: expect.stringContaining("Rendering page"),
          progress: 0,
          currentPage: 1,
          totalPages: 1,
        })
      );
    });

    it("calls onProgress with OCR status", async () => {
      const onProgress = vi.fn();
      const file = createFile("scan.pdf", "pdf content");
      await runOcrOnPdf(file, onProgress);

      expect(onProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          status: expect.stringContaining("Running OCR"),
          progress: expect.any(Number),
          currentPage: 1,
          totalPages: 1,
        })
      );
    });

    it("terminates worker in finally block", async () => {
      const file = createFile("scan.pdf", "pdf content");
      await runOcrOnPdf(file);
      expect(mockTerminate).toHaveBeenCalled();
    });

    it("continues after a page OCR error and terminates the worker", async () => {
      mockRecognize.mockRejectedValueOnce(new Error("OCR failed"));
      const file = createFile("scan.pdf", "pdf content");

      await expect(runOcrOnPdf(file)).resolves.toContain("[OCR failed on page 1]");
      expect(mockTerminate).toHaveBeenCalled();
    });

    it("handles empty OCR results", async () => {
      mockRecognize.mockResolvedValueOnce({ data: { text: "" } });
      const file = createFile("scan.pdf", "pdf content");
      const result = await runOcrOnPdf(file);
      expect(result).toBe("");
    });

    it("trims OCR extracted text", async () => {
      mockRecognize.mockResolvedValueOnce({ data: { text: "  trimmed text  " } });
      const file = createFile("scan.pdf", "pdf content");
      const result = await runOcrOnPdf(file);
      expect(result).toBe("trimmed text");
    });

    it("works without progress callback", async () => {
      const file = createFile("scan.pdf", "pdf content");
      const result = await runOcrOnPdf(file);
      expect(result).toBe("OCR extracted text");
    });
  });
});
