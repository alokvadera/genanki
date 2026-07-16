/**
 * Shared types for AI provider selection across components.
 * Mirrors the backend AvailableProvider shape from convex/availableProviders.ts
 * and the catalog query shape from convex/providerCatalog.ts.
 */

/** Provider option shown in the dropdown UI. */
export type ProviderOption = {
  provider: string;
  label: string;
  modelCount: number;
  models?: Array<{ id: string; name: string }>;
};
