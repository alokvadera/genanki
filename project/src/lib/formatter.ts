import { marked } from "marked";
import katex from "katex";

/**
 * Format markdown and math (LaTeX) to HTML for rendering in the web preview UI.
 * Extracts math blocks first so marked doesn't corrupt math symbols (like underscores),
 * escapes HTML for safety/literal tag display, parses with marked, then restores math.
 */
export function formatCardText(text: string): string {
  if (!text) return "";

  const placeholders: { [key: string]: string } = {};
  let placeholderCounter = 0;
  let processed = text;

  // 1. Extract block math ($$...$$ or \[...\])
  processed = processed.replace(/\$$([\s\S]+?)\$\$/g, (_, math) => {
    const key = `BLOCKMATH${placeholderCounter++}`;
    let html = "";
    try {
      html = katex.renderToString(math.trim(), { displayMode: true, throwOnError: false });
    } catch {
      html = `<span class="text-red-500">$$${math}$$</span>`;
    }
    placeholders[key] = html;
    return key;
  });

  processed = processed.replace(/\\\[([\s\S]+?)\\\]/g, (_, math) => {
    const key = `BLOCKMATH${placeholderCounter++}`;
    let html = "";
    try {
      html = katex.renderToString(math.trim(), { displayMode: true, throwOnError: false });
    } catch {
      html = `<span class="text-red-500">\\[${math}\\]</span>`;
    }
    placeholders[key] = html;
    return key;
  });

  // 2. Extract inline math ($...$ or \(...\))
  processed = processed.replace(/\$([^\$]+?)\$/g, (_, math) => {
    const key = `INLINEMATH${placeholderCounter++}`;
    let html = "";
    try {
      html = katex.renderToString(math.trim(), { displayMode: false, throwOnError: false });
    } catch {
      html = `<span class="text-red-500">$${math}$</span>`;
    }
    placeholders[key] = html;
    return key;
  });

  processed = processed.replace(/\\\(([\s\S]+?)\\\)/g, (_, math) => {
    const key = `INLINEMATH${placeholderCounter++}`;
    let html = "";
    try {
      html = katex.renderToString(math.trim(), { displayMode: false, throwOnError: false });
    } catch {
      html = `<span class="text-red-500">\\(${math}\\)</span>`;
    }
    placeholders[key] = html;
    return key;
  });

  // 3. Escape HTML characters in markdown text
  processed = processed
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // 4. Compile markdown to HTML
  let html = "";
  try {
    html = marked.parse(processed, { breaks: true, gfm: true }) as string;
  } catch {
    html = processed;
  }

  // 5. Restore math placeholders
  Object.keys(placeholders).forEach((key) => {
    html = html.split(key).join(placeholders[key]);
  });

  return html;
}

/**
 * Convert standard math blocks ($$...$$ and $...$) to Anki-native MathJax
 * wrappers (\[...\] and \(...\)) so that math renders correctly in Anki client app.
 */
export function formatMathForAnki(text: string): string {
  if (!text) return "";
  let formatted = text;
  // Convert $$...$$ to \[...\]
  formatted = formatted.replace(/\$\$([\s\S]+?)\$\$/g, (_, math) => `\\[${math.trim()}\\]`);
  // Convert $...$ to \(...\)
  formatted = formatted.replace(/\$([^\$]+?)\$/g, (_, math) => `\\(${math.trim()}\\)`);
  return formatted;
}
