import { useState, useEffect } from "react";

type FormatFn = (text: string) => string;

/** Lazy-loads formatCardText. Returns the formatted HTML string, or the raw
 *  text while the formatter module (KaTeX + marked + DOMPurify ~324 kB) is
 *  still loading.  Avoids adding the heavy formatter chunk to the entry bundle. */
export function useFormatCardText(text: string): string {
  const [fn, setFn] = useState<FormatFn | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const m = await import("@/lib/formatter");
        if (!cancelled) setFn(() => m.formatCardText);
      } catch {
        // If the dynamic import fails (extremely unlikely), show the raw text
        if (!cancelled) setFn(() => (t: string) => t);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  // Compute synchronously — no setState-in-effect needed.
  // fn updates asynchronously and triggers a re-render when it arrives.
  return fn ? fn(text) : text;
}
