/** Shared provider colour map used by ProviderUsage page and its sub-components. */

export const PROVIDER_COLORS: Record<string, { bar: string; bg: string; text: string }> = {
  groq: { bar: "bg-indigo-500", bg: "bg-indigo-50 dark:bg-indigo-950/40", text: "text-indigo-700 dark:text-indigo-300" },
  cerebras: { bar: "bg-teal-500", bg: "bg-teal-50 dark:bg-teal-950/40", text: "text-teal-700 dark:text-teal-300" },
  cloudflare: { bar: "bg-amber-500", bg: "bg-amber-50 dark:bg-amber-950/40", text: "text-amber-700 dark:text-amber-300" },
  kilo: { bar: "bg-rose-500", bg: "bg-rose-50 dark:bg-rose-950/40", text: "text-rose-700 dark:text-rose-300" },
  openrouter: { bar: "bg-purple-500", bg: "bg-purple-50 dark:bg-purple-950/40", text: "text-purple-700 dark:text-purple-300" },
};

export function getProviderColor(provider: string) {
  const key = provider.toLowerCase();
  for (const [k, v] of Object.entries(PROVIDER_COLORS)) {
    if (key.includes(k)) return v;
  }
  return { bar: "bg-primary", bg: "bg-muted/20", text: "text-foreground" };
}
