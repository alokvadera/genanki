/** Convert standard math blocks ($$...$$ and $...$) to Anki-native MathJax
 *  wrappers (\\[...\\] and \\(...\\)) so math renders correctly in Anki.
 *
 *  This module is intentionally zero-dependency — it is imported by the
 *  anki/apkg export path which should NOT pull in KaTeX/marked/DOMPurify. */
export function formatMathForAnki(text: string): string {
  if (!text) return "";
  let formatted = text;
  // Convert $$...$$ to \\[...\\]
  formatted = formatted.replace(/\$\$([\s\S]+?)\$\$/g, (_, math) => `\\[${math.trim()}\\]`);
  // Convert $...$ to \\(...\\)
  formatted = formatted.replace(/\$(?!\s)([^$]+?)(?<!\s)\$/g, (_, math) => `\\(${math.trim()}\\)`);
  return formatted;
}
