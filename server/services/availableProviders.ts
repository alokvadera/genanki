/**
 * Available provider refresh — ported from src/convex/availableProviders.ts.
 */
import { buildModelCandidates, type ProviderName } from "../aiProviders";
import { catalogRows, removeCatalogByProvider, upsertCatalog } from "./catalog";

export type AvailableProvider = {
  provider: ProviderName;
  label: string;
  modelCount: number;
  models: Array<{ id: string; name: string }>;
};

/**
 * Group raw model candidates by provider, producing the AvailableProvider[]
 * shape used by the catalog query and the frontend dropdown.
 * Pure function — safe to unit test.
 */
export function groupCandidatesByProvider(
  candidates: Array<{ provider: string; providerLabel: string; modelId: string; modelName: string }>,
): AvailableProvider[] {
  const grouped = new Map<string, AvailableProvider>();

  for (const c of candidates) {
    let entry = grouped.get(c.provider);
    if (!entry) {
      entry = {
        provider: c.provider as ProviderName,
        label: c.providerLabel,
        modelCount: 0,
        models: [],
      };
      grouped.set(c.provider, entry);
    }
    entry.modelCount += 1;
    entry.models.push({ id: c.modelId, name: c.modelName });
  }

  return [...grouped.values()];
}

/**
 * Fetch available providers from external APIs, upsert the catalog cache for
 * real-time reads, prune stale providers, and return the list.
 */
export async function refreshProviderCatalog(): Promise<AvailableProvider[]> {
  const candidates = await buildModelCandidates();
  const results = groupCandidatesByProvider(candidates);

  for (const provider of results) {
    await upsertCatalog({
      provider: provider.provider,
      label: provider.label,
      modelCount: provider.modelCount,
      models: provider.models,
    });
  }

  // Remove stale providers that are no longer available
  const currentProviders = new Set<string>(results.map((r) => r.provider));
  const existingRows = await catalogRows();
  for (const row of existingRows) {
    if (!currentProviders.has(row.provider)) {
      await removeCatalogByProvider(row.provider);
    }
  }

  return results;
}
