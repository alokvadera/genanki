"use node";

import { action } from "./_generated/server";
import { buildModelCandidates, type ProviderName } from "./aiProviders";
import { api } from "./_generated/api";

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
 * Action that fetches available providers from external APIs,
 * caches results in the providerCatalog table for real-time queries,
 * and returns the list.
 */
export const refresh = action({
  args: {},
  handler: async (ctx): Promise<AvailableProvider[]> => {
    const candidates = await buildModelCandidates();
    const results = groupCandidatesByProvider(candidates);

    // Upsert each provider into the catalog table
    for (const provider of results) {
      await ctx.runMutation(api.providerCatalog.upsertCatalog, {
        provider: provider.provider,
        label: provider.label,
        modelCount: provider.modelCount,
        models: provider.models,
      });
    }

    // Remove stale providers that are no longer available
    const currentProviders = new Set<string>(results.map((r) => r.provider));
    const existingRows = await ctx.runQuery(api.providerCatalog.catalogRows, {});
    for (const row of existingRows) {
      if (!currentProviders.has(row.provider)) {
        await ctx.runMutation(api.providerCatalog.removeCatalog, { id: row._id });
      }
    }

    return results;
  },
});
