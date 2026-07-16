export type Candidate = {
  provider: string;
  modelId: string;
  providerLabel?: string;
  [key: string]: any;
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

// Cost per 1M tokens (prompt + completion avg or just a flat rate)
export const COST_TABLE: Record<string, number> = {
  "llama-3.1-8b-instant": 0.05,
  "llama-3.3-70b-versatile": 0.40,
  "qwen/qwen3-32b": 0.35,
  "qwen/qwen1.5-14b-chat-awq": 0.00, // free tier
};

const DEFAULT_COST = 0.50; // default conservative cost

export function prioritizeCandidates<T extends Candidate>(
  candidates: T[],
  performance: PerformanceRow[],
  preferredProvider?: string,
): { candidates: (T & { providerIndex: number })[]; providerCount: number } {
  const grouped = new Map<string, T[]>();

  // Use a default stable order for fallback providers
  const PROVIDER_ORDER = ["groq", "cerebras", "kilo", "openrouter", "cloudflare"];

  for (const provider of PROVIDER_ORDER) {
    grouped.set(provider, []);
  }

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

function scoreCandidate(row: PerformanceRow | undefined, candidate: Candidate): number {
  const isPreferred = false; // Priority handled at grouping level
  const costPer1M = COST_TABLE[candidate.modelId] ?? DEFAULT_COST;
  const isFreeTier = costPer1M === 0;

  // Defaults for unproven models
  if (!row || row.calls < 3) {
    let baseScore = 50;
    if (isFreeTier) baseScore += 20;
    return baseScore - costPer1M * 5;
  }

  const successRate = row.successes / row.calls;
  
  // Hysteresis: if failing consistently recently (or high total failures), heavily penalize
  // We approximate recent failures by checking if failures are high relative to total
  // In a real moving average we'd have a time window, but we work with what we have in PerformanceRow.
  const failureRate = row.failures / row.calls;
  const circuitBreakerPenalty = failureRate > 0.5 && row.calls >= 3 ? -100 : 0;

  const w1 = 100; // success rate
  const w2 = 5;   // latency
  const w3 = 10;  // cost
  const w4 = 20;  // free tier bonus

  const latencyScore = 1 / Math.max(0.25, row.averageLatencyMs / 1000);
  
  const score = 
    (w1 * successRate) +
    (w2 * latencyScore) -
    (w3 * costPer1M) +
    (isFreeTier ? w4 : 0) +
    circuitBreakerPenalty;

  return score;
}
