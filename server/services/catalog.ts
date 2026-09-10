/**
 * Provider catalog cache — ported from src/convex/providerCatalog.ts.
 */
import { eq, sql } from "drizzle-orm";

import { db } from "../db";
import { providerCatalog } from "../db/schema";
import type { CatalogModel } from "../db/schema";

/** Compute the most recent updatedAt from a list of catalog rows. */
export function computeLatestUpdatedAt(rows: Array<{ updatedAt: number }>): number {
  if (rows.length === 0) return 0;
  return Math.max(...rows.map((r) => r.updatedAt));
}

/**
 * Find stale provider rows that are no longer in the current set.
 * Returns row ids (the caller removes them).
 */
export function findStaleProviders(
  currentProviders: Set<string>,
  existingRows: Array<{ provider: string; id: string }>,
): string[] {
  return existingRows
    .filter((row) => !currentProviders.has(row.provider))
    .map((row) => row.id);
}

export async function catalogSummary() {
  const rows = await db
    .select({
      provider: providerCatalog.provider,
      label: providerCatalog.label,
      modelCount: providerCatalog.modelCount,
    })
    .from(providerCatalog);
  return rows;
}

export async function catalogLatestUpdatedAt(): Promise<number> {
  const rows = await db
    .select({ updatedAt: providerCatalog.updatedAt })
    .from(providerCatalog);
  return computeLatestUpdatedAt(rows);
}

export async function catalogRows() {
  return db.select().from(providerCatalog);
}

export type UpsertCatalogInput = {
  provider: string;
  label: string;
  modelCount: number;
  models: CatalogModel[];
};

export async function upsertCatalog(args: UpsertCatalogInput): Promise<void> {
  const patch = {
    label: args.label,
    modelCount: args.modelCount,
    models: args.models,
    updatedAt: Date.now(),
  };
  await db
    .insert(providerCatalog)
    .values({ provider: args.provider, ...patch })
    .onConflictDoUpdate({
      target: providerCatalog.provider,
      set: patch,
    });
}

export async function removeCatalogByProvider(provider: string): Promise<void> {
  await db.delete(providerCatalog).where(eq(providerCatalog.provider, provider));
}

export const _sql = sql;
