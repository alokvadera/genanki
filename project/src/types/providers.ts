/**
 * Shared types for AI provider selection across components.
 * Mirrors the backend AvailableProvider shape from convex/availableProviders.ts
 * and the catalog query shape from convex/providerCatalog.ts.
 */

/**
 * Bump this version whenever ProviderOption shape changes so that stale
 * localStorage caches are automatically discarded.
 */
export const PROVIDERS_CACHE_VERSION = 1;
export const PROVIDERS_CACHE_KEY = "genanki-providers-cache";
export const PROVIDERS_CACHE_VERSION_KEY = "genanki-providers-cache-version";

/** Provider option shown in the dropdown UI. */
export type ProviderOption = {
  provider: string;
  label: string;
  modelCount: number;
  models?: Array<{ id: string; name: string }>;
};

/** Runtime type guard for a single ProviderOption. */
function isValidProviderOption(item: unknown): item is ProviderOption {
  if (typeof item !== "object" || item === null) return false;
  const obj = item as Record<string, unknown>;
  if (typeof obj.provider !== "string" || obj.provider.trim().length === 0) return false;
  if (typeof obj.label !== "string" || obj.label.trim().length === 0) return false;
  if (typeof obj.modelCount !== "number" || !Number.isFinite(obj.modelCount)) return false;
  if (obj.models !== undefined) {
    if (!Array.isArray(obj.models)) return false;
    for (const m of obj.models) {
      if (typeof m !== "object" || m === null) return false;
      const mo = m as Record<string, unknown>;
      if (typeof mo.id !== "string" || typeof mo.name !== "string") return false;
    }
  }
  return true;
}

/**
 * Validates and filters a parsed JSON value into a valid ProviderOption array.
 * Returns an empty array if the input is not a valid array of ProviderOption objects.
 * Skips individual items that fail validation (permissive filtering).
 */
export function sanitizeProviderOptions(data: unknown): ProviderOption[] {
  if (!Array.isArray(data)) return [];
  return data.filter(isValidProviderOption);
}
