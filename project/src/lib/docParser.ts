import * as pdfjsLib from "pdfjs-dist";

// Set worker source to CDN for browser compatibility
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

/**
 * Extract text from a PDF file.
 */
export async function extractTextFromPdf(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const textParts: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    if (pageText.trim()) {
      textParts.push(pageText.trim());
    }
  }

  return textParts.join("\n\n");
}

/**
 * Extract text from a plain text file.
 */
export async function extractTextFromTxt(file: File): Promise<string> {
  return await file.text();
}

/**
 * Auto-detect file type and extract text.
 */
export async function extractTextFromFile(file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase();

  switch (ext) {
    case "pdf":
      return extractTextFromPdf(file);
    case "txt":
    case "md":
    case "markdown":
    case "text":
      return extractTextFromTxt(file);
    default:
      // Try reading as text for unknown extensions
      try {
        return await extractTextFromTxt(file);
      } catch {
        throw new Error(
          `Unsupported file type: .${ext}. Supported: PDF, TXT, MD`
        );
      }
  }
}
