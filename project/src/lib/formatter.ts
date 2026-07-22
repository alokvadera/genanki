import { marked } from "marked";
import katex from "katex";
import DOMPurify from "dompurify";

/**
 * Sanitize HTML to remove potentially dangerous elements and attributes.
 * This prevents XSS attacks while allowing safe HTML formatting.
 */
const ALLOWED_TAGS = [
  "p", "br", "strong", "em", "code", "pre", "ul", "ol", "li", "blockquote",
  "h1", "h2", "h3", "h4", "h5", "h6", "a", "span", "div", "table", "thead",
  "tbody", "tr", "td", "th", "sup", "sub", "hr",
  // KaTeX emits these MathML tags alongside its HTML output.
  "math", "semantics", "mrow", "mi", "mo", "mn", "annotation",
];
const ALLOWED_ATTR = ["href", "src", "class", "style", "target", "rel", "aria-hidden", "xmlns", "encoding"];

DOMPurify.addHook("uponSanitizeAttribute", (_node, data) => {
  if (data.attrName.startsWith("on")) data.keepAttr = false;
  if (data.attrName === "style" && /expression\s*\(|url\s*\(\s*javascript:/i.test(data.attrValue)) {
    data.keepAttr = false;
  }
});

function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input", "button", "textarea", "select", "style", "link", "meta", "base"],
  });
}

// --- Math helpers (extracted for coverage tracking) ---

let _placeholderCounter = 0;

/** Render math with KaTeX, falling back to error span on failure. */
function renderMath(math: string, displayMode: boolean): string {
  try {
    return katex.renderToString(math.trim(), { displayMode, throwOnError: false });
  } catch {
    return `<span class="text-red-500">${math}</span>`;
  }
}

/** Replace block math (either $$...$$ or \\[...\\]) with KaTeX HTML and a placeholder key. */
function replaceBlockMath(placeholders: Record<string, string>, math: string): string {
  const key = `BLOCKMATH${_placeholderCounter++}`;
  placeholders[key] = renderMath(math, true);
  return key;
}

/** Replace inline math (either $...$ or \\(...\\)) with KaTeX HTML and a placeholder key. */
function replaceInlineMath(placeholders: Record<string, string>, math: string): string {
  const key = `INLINEMATH${_placeholderCounter++}`;
  placeholders[key] = renderMath(math, false);
  return key;
}

/**
 * Format markdown and math (LaTeX) to HTML for rendering in the web preview UI.
 * Extracts math blocks first so marked doesn't corrupt math symbols (like underscores),
 * escapes HTML for safety/literal tag display, parses with marked, then restores math.
 */
export function formatCardText(text: string): string {
  if (!text) return "";

  const placeholders: { [key: string]: string } = {};
  _placeholderCounter = 0;
  let processed = text;

  // 1. Extract block math ($$...$$ or \\[...\\])
  processed = processed.replace(/\$\$([\s\S]+?)\$\$/g, (_, math) => replaceBlockMath(placeholders, math));
  processed = processed.replace(/\\\[([\s\S]+?)\\\]/g, (_, math) => replaceBlockMath(placeholders, math));

  // 2. Extract inline math ($...$ or \\(...\\))
  processed = processed.replace(/\$(?!\s)([^$]+?)(?<!\s)\$/g, (_, math) => replaceInlineMath(placeholders, math));
  processed = processed.replace(/\\\(([\s\S]+?)\\\)/g, (_, math) => replaceInlineMath(placeholders, math));

  // 3. Compile markdown to HTML
  let html = "";
  try {
    html = marked.parse(processed, { breaks: true, gfm: true, async: false });
  } catch {
    html = processed;
  }

  // 4. Restore math placeholders
  Object.keys(placeholders).forEach((key) => {
    html = html.split(key).join(placeholders[key]);
  });

  // 5. Sanitize the final HTML to remove dangerous elements
  html = sanitizeHtml(html);

  return html;
}

/**
 * Convert standard math blocks ($$...$$ and $...$) to Anki-native MathJax
 * wrappers (\\[...\\] and \\(...\\)) so that math renders correctly in Anki client app.
 */
export function formatMathForAnki(text: string): string {
  if (!text) return "";
  let formatted = text;
  // Convert $$...$$ to \\[...\\]
  formatted = formatted.replace(/\$\$([\s\S]+?)\$\$/g, (_, math) => `\\[${math.trim()}\\]`);
  // Convert $...$ to \\(...\\)
  formatted = formatted.replace(/\$(?!\s)([^$]+?)(?<!\s)\$/g, (_, math) => `\\(${math.trim()}\\)`);
  return formatted;
}
