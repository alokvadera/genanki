import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Show a recovery toast notification via sonner (dynamically imported).
 * Safe to call outside React render cycles — sonner is loaded on demand.
 */
export function showRecoveryToast(
  message: string,
  level: "info" | "warning" = "info",
): void {
  import("sonner")
    .then(({ toast }) => {
      const fn = level === "warning" ? toast.warning : toast.info;
      fn(message, { duration: level === "warning" ? 8000 : 4000 });
    })
    /* istanbul ignore next -- defensive no-op when dynamic sonner import fails (e.g. sonner package removed) */
    .catch(() => { /* sonner not available */ });
}

/**
 * Split a single CSV/TSV/Semicolon/Pipe-delimited line into fields,
 * respecting RFC-4180 double-quoted fields (a comma inside quotes is
 * NOT a separator). Accepts comma, semicolon, tab, or pipe as delimiters.
 */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
      else if (c === "," || c === ";" || c === "	" || c === "|") { out.push(cur.trim()); cur = ""; }
      else cur += c;
  }
  out.push(cur.trim());
  return out;
}
