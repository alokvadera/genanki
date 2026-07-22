export type Candidate = {
  provider: string;
  modelId: string;
  providerLabel?: string;
};

export type PerformanceRow = {
  provider: string;
  model: string;
  calls: number;
  successes: number;
  failures: number;
  timeouts: number;
  averageLatencyMs: number;
  averageTokens: number;
  updatedAt?: number;
};

// Cost per 1M tokens (prompt + completion blended rate).
// Sources: provider pricing pages (accessed 2026-07-22).
// Free-tier models get cost 0 for routing bonus purposes.
export const COST_TABLE: Record<string, number> = {
  // Groq
  "llama-3.1-8b-instant": 0.05,
  "llama-3.3-70b-versatile": 0.59,
  "openai/gpt-oss-20b": 0.07,
  "openai/gpt-oss-120b": 0.39,
  "qwen/qwen3-32b": 0.35,
  "qwen/qwen1.5-14b-chat-awq": 0.00, // free tier
  "meta-llama/llama-4-scout-17b-16e-instruct": 0.18,
  // Cerebras
  "gpt-oss-120b": 0.00, // free tier during beta
  // Cloudflare Workers AI (all free-tier within daily neuron budget)
  "@cf/meta/llama-3.2-3b-instruct": 0.00,
  "@cf/qwen/qwen3-30b-a3b-fp8": 0.00,
  "@cf/meta/llama-3.1-8b-instruct-fp8-fast": 0.00,
  // OpenRouter free
  "openrouter/free": 0.00,
};

const DEFAULT_COST = 0.50; // conservative fallback for unknown models
const BASELINE_COST = 0.20; // normalization baseline (~average paid model cost)
const BASELINE_LATENCY_MS = 3000; // normalization baseline (3 seconds)

export function prioritizeCandidates<T extends Candidate>(
  candidates: T[],
  performance: PerformanceRow[],
  preferredProvider?: string,
): { candidates: (T & { providerIndex: number })[]; providerCount: number } {
  const grouped = new Map<string, T[]>();

  // Use a default stable order for fallback providers
  const PROVIDER_ORDER = ["groq", "cerebras", "kilo", "openrouter", "cloudflare"];

  for (const candidate of candidates) {
    const list = grouped.get(candidate.provider) ?? [];
    list.push(candidate);
    grouped.set(candidate.provider, list);
  }

  const hasPreferred =
    preferredProvider &&
    preferredProvider !== "auto" &&
    (grouped.get(preferredProvider)?.length ?? 0) > 0;
  
  const order = hasPreferred
    ? [preferredProvider, ...PROVIDER_ORDER.filter((p) => p !== preferredProvider)]
    : [...PROVIDER_ORDER];

  const prioritized: (T & { providerIndex: number })[] = [];
  let providerIndex = 0;

  for (const provider of order) {
    const list = grouped.get(provider) ?? [];
    if (list.length === 0) continue;
    
    // Limits per provider
    let limit = 1;
    if (provider === "groq" || provider === "cloudflare") {
      limit = 2;
    }

    const ranked = list.slice().sort((a, b) => {
      const aRow = performance.find((row) => row.provider === a.provider && row.model === a.modelId);
      const bRow = performance.find((row) => row.provider === b.provider && row.model === b.modelId);
      return scoreCandidate(bRow, b) - scoreCandidate(aRow, a);
    });

    for (const candidate of ranked.slice(0, limit)) {
      prioritized.push({
        ...candidate,
        providerIndex,
      });
    }
    providerIndex += 1;
  }

  return { candidates: prioritized, providerCount: providerIndex };
}

/**
 * Compute a routing score for a candidate (provider + model).
 * Higher = better. Called both from prioritizeCandidates (lib) and
 * optimus rankCandidates (convex internal query).
 *
 * Score components:
 *   successRate — fraction of successful calls
 *   normalizedLatency — 1 / (latencyMs / baseline), clamped
 *   normalizedCost — costPer1M / baselineCost, so cheap models score higher
 *   freeTierBonus — flat boost for $0 models
 *   circuitBreakerPenalty — heavy penalty if >50% failures with >=3 calls
 *
 * Unproven models (<3 calls) get an optimistic bounded base score so new
 * providers are tried rather than starved.
 */
export function scoreCandidate(
  row: PerformanceRow | undefined,
  candidate: Candidate,
): number {
  const costPer1M = COST_TABLE[candidate.modelId] ?? DEFAULT_COST;
  const isFreeTier = costPer1M === 0;

  // Optimistic prior for unproven models — encourage exploration
  if (!row || row.calls < 3) {
    let baseScore = 55;
    if (isFreeTier) baseScore += 25; // free models get extra exploration boost
    return baseScore - (costPer1M / BASELINE_COST) * 8;
  }

  const successRate = row.successes / row.calls;
  const failureRate = row.failures / row.calls;

  // Time-windowed circuit breaker: if a model has failed >50% of its calls
  // AND was updated recently (<1 hour ago), penalize heavily.
  // Stale failure data (>1h) gets a lighter penalty so models can recover.
  const recentWindowMs = 60 * 60 * 1000; // 1 hour
  const isRecent = row.updatedAt !== undefined && (Date.now() - row.updatedAt) < recentWindowMs;
  let circuitBreakerPenalty = 0;
  if (failureRate > 0.5 && row.calls >= 3) {
    circuitBreakerPenalty = isRecent ? -120 : -40;
  }

  const w1 = 100; // success rate weight
  const w2 = 6;   // latency weight
  const w3 = 12;  // cost weight
  const w4 = 22;  // free tier bonus

  // Normalized latency: lower is better, inverted and clamped
  const normalizedLatency = 1 / Math.max(0.2, row.averageLatencyMs / BASELINE_LATENCY_MS);
  // Normalized cost: lower is better
  const normalizedCost = costPer1M / BASELINE_COST;

  const score =
    (w1 * successRate) +
    (w2 * normalizedLatency) -
    (w3 * normalizedCost) +
    (isFreeTier ? w4 : 0) +
    circuitBreakerPenalty;

  return score;
}
