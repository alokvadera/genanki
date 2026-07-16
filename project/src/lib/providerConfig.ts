/**
 * Centralized provider configuration.
 *
 * Maps internal provider keys (used in DB/backend) to display labels and roles.
 * All frontend components should import from here instead of hardcoding provider names.
 *
 * Source of truth for `providerLabel` values: src/convex/aiProviders.ts
 */

export type ProviderRole = "primary" | "fallback";

export type ProviderConfig = {
  /** Internal key used in DB and backend (e.g., "groq", "cloudflare") */
  key: string;
  /** Display label shown in the UI (e.g., "Groq", "Cloudflare Workers AI") */
  label: string;
  /** Role determines display priority */
  role: ProviderRole;
};

/**
 * Ordered list of all supported providers.
 * Order matches the backend providerIndex priority.
 */
export const PROVIDERS: ProviderConfig[] = [
  { key: "groq", label: "Groq", role: "primary" },
  { key: "cerebras", label: "Cerebras", role: "fallback" },
  { key: "kilo", label: "Kilo", role: "fallback" },
  { key: "openrouter", label: "OpenRouter", role: "fallback" },
  { key: "cloudflare", label: "Cloudflare Workers AI", role: "fallback" },
];

/**
 * Map from internal provider key to full config.
 * Use this for O(1) lookups when matching backend data.
 */
export const PROVIDER_MAP = new Map<string, ProviderConfig>(
  PROVIDERS.map((p) => [p.key, p]),
);

/**
 * Map from display label to internal key.
 * Use this when you have a display label and need the internal key.
 */
export const LABEL_TO_KEY = new Map<string, string>(
  PROVIDERS.map((p) => [p.label.toLowerCase(), p.key]),
);

/**
 * Get the internal provider key from a display label.
 * Handles case-insensitive matching and partial matches (e.g., "cloudflare" → "cloudflare").
 * Returns undefined if no match is found.
 */
export function getKeyFromLabel(label: string): string | undefined {
  const normalized = label.toLowerCase().trim();

  // Exact label match (case-insensitive)
  const exactMatch = LABEL_TO_KEY.get(normalized);
  if (exactMatch) return exactMatch;

  // Partial key match (e.g., "Cloudflare Workers AI" starts with "cloudflare")
  for (const provider of PROVIDERS) {
    if (normalized.startsWith(provider.key)) {
      return provider.key;
    }
  }

  return undefined;
}


