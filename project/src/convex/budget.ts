/** Cloudflare Workers AI free-tier daily neuron budget (shared across all models). */
export const CLOUDFLARE_DAILY_BUDGET = 10_000;

/** Ratio at which we consider the daily budget "near exhaustion" (8000 / 10000). */
export const NEAR_EXHAUSTION_RATIO = 0.8;

export const CLOUDFLARE_NEURON_COST: Record<
  string,
  { inputNeuronsPer1M: number; outputNeuronsPer1M: number }
> = {
  "@cf/meta/llama-3.1-8b-instruct": { inputNeuronsPer1M: 700, outputNeuronsPer1M: 700 },
  "@cf/meta/llama-3.1-8b-instruct-fp8": { inputNeuronsPer1M: 13778, outputNeuronsPer1M: 26128 },
  "@cf/meta/llama-3.1-8b-instruct-fp8-fast": { inputNeuronsPer1M: 4119, outputNeuronsPer1M: 34868 },
  "@cf/meta/llama-3.2-3b-instruct": { inputNeuronsPer1M: 4625, outputNeuronsPer1M: 30475 },
  "@cf/qwen/qwen3-30b-a3b-fp8": { inputNeuronsPer1M: 4625, outputNeuronsPer1M: 30475 },
  "@cf/qwen/qwen1.5-14b-chat-awq": { inputNeuronsPer1M: 1000, outputNeuronsPer1M: 1000 },
  "@cf/qwen/qwen1.5-7b-chat-awq": { inputNeuronsPer1M: 500, outputNeuronsPer1M: 500 },
};

const DEFAULT_NEURON_COST = { inputNeuronsPer1M: 1000, outputNeuronsPer1M: 1000 };

export function estimateNeurons(
  modelId: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const cost = CLOUDFLARE_NEURON_COST[modelId] || DEFAULT_NEURON_COST;
  const inputNeurons = (promptTokens / 1_000_000) * cost.inputNeuronsPer1M;
  const outputNeurons = (completionTokens / 1_000_000) * cost.outputNeuronsPer1M;
  return inputNeurons + outputNeurons;
}

export function getUtcDayString(timestampMs: number): string {
  const d = new Date(timestampMs);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getWaitSecondsUntilUtcMidnight(timestampMs: number): number {
  const d = new Date(timestampMs);
  if (
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0
  ) {
    return 0;
  }
  const nextMidnight = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1),
  );
  return Math.max(0, Math.ceil((nextMidnight.getTime() - timestampMs) / 1000));
}
