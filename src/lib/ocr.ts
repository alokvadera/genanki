import * as pdfjsLib from "pdfjs-dist";
import type { RenderParameters } from "pdfjs-dist/types/src/display/api";
import { createWorker } from "tesseract.js";

interface OcrProgress {
  status: string;
  progress: number; // 0 to 1
  currentPage: number;
  totalPages: number;
}

/**
 * Runs OCR on a PDF file page-by-page.
 * Renders each page to a canvas and uses tesseract.js to extract text.
 */
export async function runOcrOnPdf(
  file: File,
  onProgress?: (progress: OcrProgress) => void
): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const totalPages = pdf.numPages;
  const textParts: string[] = [];

  // Create Tesseract worker
  const worker = await createWorker("eng");

  try {
    for (let i = 1; i <= totalPages; i++) {
      if (onProgress) {
        onProgress({
          status: `Rendering page ${i}/${totalPages}...`,
          progress: (i - 1) / totalPages,
          currentPage: i,
          totalPages,
        });
      }

      // Render PDF page to canvas
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2.0 }); // 2.0 scale for better OCR accuracy

      const canvas = document.createElement("canvas");
      // jsdom's getContext("2d") always returns a 2d context; `!` asserts it.
      const context = canvas.getContext("2d")!;
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      await page.render({
        canvasContext: context,
        viewport,
        canvas,
      } as RenderParameters).promise;

      // Run OCR on the rendered canvas
      if (onProgress) {
        onProgress({
          status: `Running OCR on page ${i}/${totalPages}...`,
          progress: (i - 0.5) / totalPages,
          currentPage: i,
          totalPages,
        });
      }

      try {
        const { data } = await worker.recognize(canvas);
        if (data?.text) textParts.push(data.text.trim());
      } catch (error) {
        console.error(`OCR failed on page ${i}`, error);
        textParts.push(`[OCR failed on page ${i}]`);
      }
    }
  } finally {
    await worker.terminate();
  }

  return textParts.join("\n\n");
}
