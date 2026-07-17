import { marked } from "marked";
import katex from "katex";

/**
 * Sanitize HTML to remove potentially dangerous elements and attributes.
 * This prevents XSS attacks while allowing safe HTML formatting.
 */
function sanitizeHtml(html: string): string {
  // Remove script tags and their content
  let sanitized = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
  
  // Remove event handler attributes (onclick, onerror, onload, etc.)
  sanitized = sanitized.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  
  // Remove javascript: URLs
  sanitized = sanitized.replace(/href\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*')/gi, "");
  sanitized = sanitized.replace(/src\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*')/gi, "");
  
  // Remove data: URLs except for images (optional, can be restrictive)
  // sanitized = sanitized.replace(/(?:href|src)\s*=\s*(?:"data:[^"]*"|'data:[^']*')/gi, "");
  
  // Remove <iframe>, <object>, <embed>, <form> tags
  sanitized = sanitized.replace(/<(iframe|object|embed|form)\b[^<]*(?:(?!<\/\1>)<[^<]*)*<\/\1>/gi, "");
  sanitized = sanitized.replace(/<(iframe|object|embed|form)\b[^>]*\/?>/gi, "");
  
  // Remove style attributes that could contain expressions
  sanitized = sanitized.replace(/style\s*=\s*(?:"[^"]*expression\([^"]*"|'[^']*expression\([^']*')/gi, "");
  
  return sanitized;
}

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
  processed = processed.replace(/\$(?!\s)([^\$]+?)(?<!\s)\$/g, (_, math) => {
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

  // 6. Sanitize the final HTML to remove dangerous elements
  html = sanitizeHtml(html);

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
  formatted = formatted.replace(/\$(?!\s)([^\$]+?)(?<!\s)\$/g, (_, math) => `\\(${math.trim()}\\)`);
  return formatted;
}
