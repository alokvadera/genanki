"use node";

import { GenError } from "./errors";

const REQUEST_TIMEOUT_MS = 15_000;
const CHAT_TIMEOUT_MS = 60_000;
const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const GROQ_MODELS_URL = "https://api.groq.com/openai/v1/models";
const CEREBRAS_MODELS_URL = "https://api.cerebras.ai/v1/models";

/** Maximum response body we'll read from any outbound LLM API call.
 *  A well-formed chat-completion response is typically <100 KB. This cap
 *  prevents resource-exhaustion / cost DoS from unexpectedly large bodies. */
const MAX_RESPONSE_BYTES = 2_000_000;

export const PROVIDER_NAMES = ["groq", "cerebras", "openrouter", "kilo", "cloudflare"] as const;
export type ProviderName = (typeof PROVIDER_NAMES)[number];

export type AiModelCandidate = {
  provider: ProviderName;
  providerLabel: string;
  providerIndex: number;
  modelId: string;
  modelName: string;
  supportsJsonMode: boolean;
  baseUrl: string;
  headers: Record<string, string>;
};

type ProviderCatalog = {
  provider: ProviderName;
  label: string;
  providerIndex: number;
  baseUrl: string;
  headers: Record<string, string>;
  models: AiModelCandidate[];
};

type ModelResponse = {
  data?: Array<{
    id?: string;
    name?: string;
    pricing?: { prompt?: string; completion?: string };
    supported_parameters?: string[];
  }>;
};

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    input_tokens?: number;
    output_tokens?: number;
    inputTokens?: number;
    outputTokens?: number;
  };
};

export type RateLimitSnapshot = {
  remainingRequests?: number;
  remainingTokens?: number;
  resetSeconds?: number;
};

export class ProviderRequestError extends Error {
  status: number;
  retryAfterSeconds?: number;
  rateLimit: RateLimitSnapshot;

  constructor(providerLabel: string, status: number, message: string, rateLimit: RateLimitSnapshot = {}) {
    super(`${providerLabel} request failed (${status}): ${message}`);
    this.name = "ProviderRequestError";
    this.status = status;
    this.rateLimit = rateLimit;
  }
}

let cachedCatalog: { fetchedAt: number; catalogs: ProviderCatalog[] } | null = null;
let cachedOpenRouterFree: { fetchedAt: number; models: AiModelCandidate[] } | null = null;
let cachedGroq: { fetchedAt: number; models: AiModelCandidate[] } | null = null;
let cachedCerebras: { fetchedAt: number; models: AiModelCandidate[] } | null = null;

export function invalidateModelCache(): void {
  cachedCatalog = null;
  cachedOpenRouterFree = null;
  cachedGroq = null;
  cachedCerebras = null;
}

const MODEL_CACHE_TTL_MS = 5 * 60_000;
const GROQ_MODEL_PRIORITY = new Map([
  ["llama-3.1-8b-instant", 0],
  ["llama-3.3-70b-versatile", 1],
  ["openai/gpt-oss-20b", 2],
  ["openai/gpt-oss-120b", 3],
  ["qwen/qwen3-32b", 4],
  ["meta-llama/llama-4-scout-17b-16e-instruct", 5],
]);

function shuffleInPlace<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = items[i]!;
    items[i] = items[j]!;
    items[j] = temp;
  }
  return items;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function joinUrl(baseUrl: string, path: string): string {
  return `${normalizeBaseUrl(baseUrl)}${path.startsWith("/") ? path : `/${path}`}`;
}

function createHeaders(apiKey: string, extra?: Record<string, string>): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function fetchJson<T>(url: string, init: RequestInit = {}, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      const text = await readBoundedResponse(response);
      throw new Error(`Request failed (${response.status}): ${text}`);
    }
    const bodyText = await readBoundedResponse(response);
    return JSON.parse(bodyText) as T;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Read the full response body as text, enforcing a byte-size cap to prevent
 * resource-exhaustion / cost DoS from unexpectedly large provider responses.
 */
async function readBoundedResponse(response: Response): Promise<string> {
  const contentLength = Number(response.headers.get("content-length"));
  let remaining = MAX_RESPONSE_BYTES;
  const decoder = new TextDecoder();
  const chunks: string[] = [];

  const reader = response.body?.getReader();
  if (!reader) {
    if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
      throw new ProviderRequestError("Provider", 502, `Response too large: ${contentLength} bytes exceeds limit of ${MAX_RESPONSE_BYTES}`);
    }
    return await response.text();
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      remaining -= value.length;
      if (remaining < 0) {
        reader.cancel();
        throw new ProviderRequestError("Provider", 502, `Response body exceeded ${MAX_RESPONSE_BYTES} byte limit`);
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
  }

  return chunks.join("") + decoder.decode();
}

function parseHeaderNumber(response: Response, name: string): number | undefined {
  const value = Number(response.headers.get(name));
  return Number.isFinite(value) ? Math.max(0, value) : undefined;
}

function readRateLimitSnapshot(response: Response, provider: ProviderName): RateLimitSnapshot {
  const snapshot: RateLimitSnapshot = {};
  if (provider === "cerebras") {
    const rr = parseHeaderNumber(response, "x-ratelimit-remaining-requests-day");
    const rt = parseHeaderNumber(response, "x-ratelimit-remaining-tokens-minute");
    const rs = parseHeaderNumber(response, "x-ratelimit-reset-tokens-minute");
    if (rr !== undefined) snapshot.remainingRequests = rr;
    if (rt !== undefined) snapshot.remainingTokens = rt;
    if (rs !== undefined) snapshot.resetSeconds = rs;
  } else {
    const rr = parseHeaderNumber(response, "x-ratelimit-remaining-requests");
    const rt = parseHeaderNumber(response, "x-ratelimit-remaining-tokens");
    const rs = parseHeaderNumber(response, "x-ratelimit-reset-tokens");
    if (rr !== undefined) snapshot.remainingRequests = rr;
    if (rt !== undefined) snapshot.remainingTokens = rt;
    if (rs !== undefined) snapshot.resetSeconds = rs;
  }
  return snapshot;
}

function supportsJsonModeFromParameters(params?: string[]): boolean {
  return Array.isArray(params) && params.includes("response_format");
}

function mapModelCatalog(
  provider: ProviderName,
  providerLabel: string,
  providerIndex: number,
  baseUrl: string,
  headers: Record<string, string>,
  response: ModelResponse,
  supportsJsonMode = false,
): AiModelCandidate[] {
  const models = (response.data ?? [])
    .map((item) => ({
      id: item.id?.trim(),
      name: item.name?.trim(),
      supportsJsonMode: supportsJsonMode || supportsJsonModeFromParameters(item.supported_parameters),
    }))
    .filter((item): item is { id: string; name: string; supportsJsonMode: boolean } => Boolean(item.id));

  return models.map((model) => ({
    provider,
    providerLabel,
    providerIndex,
    modelId: model.id,
    modelName: model.name || model.id,
    supportsJsonMode: model.supportsJsonMode,
    baseUrl,
    headers,
  }));
}

async function loadOpenRouterFreeModels(): Promise<AiModelCandidate[]> {
  const cached = cachedOpenRouterFree;
  if (cached && Date.now() - cached.fetchedAt < MODEL_CACHE_TTL_MS) {
    return cached.models;
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return [];
  }

  try {
    const response = await fetchJson<ModelResponse>(OPENROUTER_MODELS_URL, {
      headers: createHeaders(apiKey),
    });

    const models = (response.data ?? [])
      .filter((model) => {
        const id = model.id ?? "";
        const promptPrice = Number(model.pricing?.prompt ?? NaN);
        const completionPrice = Number(model.pricing?.completion ?? NaN);
        return id === "openrouter/free" || id.endsWith(":free") || (promptPrice === 0 && completionPrice === 0);
      })
      .map((model) => ({
        provider: "openrouter" as const,
        providerLabel: "OpenRouter",
        providerIndex: 3,
        modelId: model.id?.trim() || "openrouter/free",
        modelName: model.name?.trim() || model.id?.trim() || "OpenRouter free model",
        supportsJsonMode: supportsJsonModeFromParameters(model.supported_parameters),
        baseUrl: "https://openrouter.ai/api/v1",
        headers: createHeaders(apiKey, {
          "HTTP-Referer":
            process.env.OPENROUTER_APP_URL || process.env.CONVEX_SITE_URL || "http://localhost:5173",
          "X-Title": process.env.OPENROUTER_APP_NAME || process.env.VLY_APP_NAME || "genanki",
        }),
      }));

    const router: AiModelCandidate = {
      provider: "openrouter",
      providerLabel: "OpenRouter",
      providerIndex: 3,
      modelId: "openrouter/free",
      modelName: "OpenRouter Free Router",
      supportsJsonMode: true,
      baseUrl: "https://openrouter.ai/api/v1",
      headers: createHeaders(apiKey, {
        "HTTP-Referer":
          process.env.OPENROUTER_APP_URL || process.env.CONVEX_SITE_URL || "http://localhost:5173",
        "X-Title": process.env.OPENROUTER_APP_NAME || process.env.VLY_APP_NAME || "genanki",
      }),
    };

    const ordered = [router, ...shuffleInPlace(models.filter((m) => m.modelId !== router.modelId))];
    cachedOpenRouterFree = { fetchedAt: Date.now(), models: ordered };
    return ordered;
  } catch (err) {
    console.error("[AiProviders] Failed to load OpenRouter free models:", err);
    const fallback: AiModelCandidate[] = [
      {
        provider: "openrouter",
        providerLabel: "OpenRouter",
        providerIndex: 3,
        modelId: "openrouter/free",
        modelName: "OpenRouter Free Router",
        supportsJsonMode: true,
        baseUrl: "https://openrouter.ai/api/v1",
        headers: createHeaders(process.env.OPENROUTER_API_KEY || "", {
          "HTTP-Referer":
            process.env.OPENROUTER_APP_URL || process.env.CONVEX_SITE_URL || "http://localhost:5173",
          "X-Title": process.env.OPENROUTER_APP_NAME || process.env.VLY_APP_NAME || "genanki",
        }),
      },
    ];
    cachedOpenRouterFree = { fetchedAt: Date.now(), models: fallback };
    return fallback;
  }
}

async function loadGroqModels(): Promise<AiModelCandidate[]> {
  const cached = cachedGroq;
  if (cached && Date.now() - cached.fetchedAt < MODEL_CACHE_TTL_MS) {
    return cached.models;
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return [];
  }

  const headers = createHeaders(apiKey);
  const baseUrl = "https://api.groq.com/openai/v1";
  const preferredIds = new Set([
    "llama-3.1-8b-instant",
    "llama-3.3-70b-versatile",
    "openai/gpt-oss-20b",
    "openai/gpt-oss-120b",
    "qwen/qwen3-32b",
    "meta-llama/llama-4-scout-17b-16e-instruct",
  ]);

  try {
    const response = await fetchJson<ModelResponse>(GROQ_MODELS_URL, { headers });
    const mapped = mapModelCatalog("groq", "Groq", 0, baseUrl, headers, response);
    const filtered = mapped.filter((model) => preferredIds.has(model.modelId) || preferredIds.has(model.modelName));
    const models = (filtered.length > 0 ? filtered : mapped)
      .slice()
      .sort((a, b) => (GROQ_MODEL_PRIORITY.get(a.modelId) ?? 99) - (GROQ_MODEL_PRIORITY.get(b.modelId) ?? 99));
    cachedGroq = { fetchedAt: Date.now(), models };
    return models;
  } catch (err) {
    console.error("[AiProviders] Failed to load Groq models:", err);
    const fallback: AiModelCandidate[] = [
      "llama-3.1-8b-instant",
      "llama-3.3-70b-versatile",
      "openai/gpt-oss-20b",
      "openai/gpt-oss-120b",
      "qwen/qwen3-32b",
      "meta-llama/llama-4-scout-17b-16e-instruct",
    ]
      .map((modelId) => ({
        provider: "groq" as const,
        providerLabel: "Groq",
        providerIndex: 0,
        modelId,
        modelName: modelId,
        supportsJsonMode: false,
        baseUrl,
        headers,
      }))
      .sort((a, b) => (GROQ_MODEL_PRIORITY.get(a.modelId) ?? 99) - (GROQ_MODEL_PRIORITY.get(b.modelId) ?? 99));
    cachedGroq = { fetchedAt: Date.now(), models: fallback };
    return fallback;
  }
}

async function loadCerebrasModels(): Promise<AiModelCandidate[]> {
  const cached = cachedCerebras;
  if (cached && Date.now() - cached.fetchedAt < MODEL_CACHE_TTL_MS) {
    return cached.models;
  }

  const apiKey = process.env.CEREBRAS_API_KEY;
  if (!apiKey) {
    return [];
  }

  const headers = createHeaders(apiKey);
  const baseUrl = "https://api.cerebras.ai/v1";

  try {
    const response = await fetchJson<ModelResponse>(CEREBRAS_MODELS_URL, { headers });
    const mapped = mapModelCatalog("cerebras", "Cerebras", 1, baseUrl, headers, response);
    const models = (mapped.length > 0 ? mapped.slice() : []).sort((a, b) => a.modelId.localeCompare(b.modelId));
    if (models.length > 0) {
      cachedCerebras = { fetchedAt: Date.now(), models };
      return models;
    }
  } catch (err) {
    console.error("[AiProviders] Failed to load Cerebras models (falling back to default):", err);
  }

  const fallback: AiModelCandidate[] = [
    {
      provider: "cerebras",
      providerLabel: "Cerebras",
      providerIndex: 1,
      modelId: "gpt-oss-120b",
      modelName: "gpt-oss-120b",
      supportsJsonMode: false,
      baseUrl,
      headers,
    },
  ];
  cachedCerebras = { fetchedAt: Date.now(), models: fallback };
  return fallback;
}

async function loadKiloModels(): Promise<AiModelCandidate[]> {
  const apiKey = process.env.KILO_API_KEY;
  const baseUrl = process.env.KILO_BASE_URL;
  const modelIds = (process.env.KILO_MODEL_IDS || process.env.KILO_MODELS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (!apiKey || !baseUrl || modelIds.length === 0) {
    return [];
  }

  const headers = createHeaders(apiKey);
  return modelIds.map((modelId) => ({
    provider: "kilo",
    providerLabel: "Kilo",
    providerIndex: 2,
    modelId,
    modelName: modelId,
    supportsJsonMode: false,
    baseUrl: normalizeBaseUrl(baseUrl),
    headers,
  }));
}

/**
 * Cloudflare Workers AI — serverless open-source model inference with an
 * ongoing free daily allocation (10,000 Neurons/day). OpenAI-compatible
 * endpoint, so it plugs into `callChatCompletion` unchanged.
 *
 * Requires: CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN.
 * Optional:  CLOUDFLARE_MODEL_IDS (comma-separated, cheapest-first).
 */
const CLOUDFLARE_DEFAULT_MODELS = [
  "@cf/meta/llama-3.2-3b-instruct",
  "@cf/qwen/qwen3-30b-a3b-fp8",
  "@cf/meta/llama-3.1-8b-instruct-fp8-fast",
];

async function loadCloudflareModels(): Promise<AiModelCandidate[]> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !apiToken) {
    return [];
  }

  const modelIds = (process.env.CLOUDFLARE_MODEL_IDS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const models = modelIds.length > 0 ? modelIds : CLOUDFLARE_DEFAULT_MODELS;

  const baseUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1`;
  const headers = createHeaders(apiToken);

  return models.map((modelId) => ({
    provider: "cloudflare" as const,
    providerLabel: "Cloudflare Workers AI",
    providerIndex: 4,
    modelId,
    modelName: modelId,
    supportsJsonMode: true,
    baseUrl,
    headers,
  }));
}

export async function buildModelCandidates(): Promise<AiModelCandidate[]> {
  const cached = cachedCatalog;
  if (cached && Date.now() - cached.fetchedAt < MODEL_CACHE_TTL_MS) {
    return cached.catalogs.flatMap((catalog) => catalog.models);
  }

  const catalogs: ProviderCatalog[] = [];

  // Fetch every provider's catalog in parallel — they are independent.
  const [groqModels, cerebrasModels, kiloModels, openRouterModels, cloudflareModels] =
    await Promise.all([
      loadGroqModels(),
      loadCerebrasModels(),
      loadKiloModels(),
      loadOpenRouterFreeModels(),
      loadCloudflareModels(),
    ]);

  if (groqModels.length > 0) {
    catalogs.push({
      provider: "groq",
      label: "Groq",
      providerIndex: 0,
      baseUrl: "https://api.groq.com/openai/v1",
      headers: groqModels[0]!.headers,
      models: groqModels,
    });
  }

  if (cerebrasModels.length > 0) {
    catalogs.push({
      provider: "cerebras",
      label: "Cerebras",
      providerIndex: 1,
      baseUrl: "https://api.cerebras.ai/v1",
      headers: cerebrasModels[0]!.headers,
      models: cerebrasModels,
    });
  }

  if (kiloModels.length > 0) {
    catalogs.push({
      provider: "kilo",
      label: "Kilo",
      providerIndex: 2,
      baseUrl: normalizeBaseUrl(process.env.KILO_BASE_URL || ""),
      headers: kiloModels[0]!.headers,
      models: kiloModels,
    });
  }

  if (openRouterModels.length > 0) {
    catalogs.push({
      provider: "openrouter",
      label: "OpenRouter",
      providerIndex: 3,
      baseUrl: "https://openrouter.ai/api/v1",
      headers: openRouterModels[0]!.headers,
      models: openRouterModels,
    });
  }

  if (cloudflareModels.length > 0) {
    catalogs.push({
      provider: "cloudflare",
      label: "Cloudflare Workers AI",
      providerIndex: 4,
      baseUrl: cloudflareModels[0]!.baseUrl,
      headers: cloudflareModels[0]!.headers,
      models: cloudflareModels,
    });
  }

  cachedCatalog = { fetchedAt: Date.now(), catalogs };
  return catalogs.flatMap((catalog) => catalog.models);
}

export type ChatCallConfig = {
  candidate: AiModelCandidate;
  systemPrompt: string;
  userContent: string;
  maxTokens: number;
};

export type ChatUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type ChatCallResult = {
  content: string;
  usage: ChatUsage | null;
  rateLimit: RateLimitSnapshot;
};

function normalizeUsage(usage?: ChatCompletionResponse["usage"]): ChatUsage | null {
  if (!usage) return null;
  const promptTokens = Number(
    usage.prompt_tokens ?? usage.promptTokens ?? usage.input_tokens ?? usage.inputTokens ?? 0,
  );
  const completionTokens = Number(
    usage.completion_tokens ?? usage.completionTokens ?? usage.output_tokens ?? usage.outputTokens ?? 0,
  );
  const totalTokens = Number(usage.total_tokens ?? usage.totalTokens ?? promptTokens + completionTokens);
  if (!Number.isFinite(totalTokens)) return null;
  return {
    promptTokens: Number.isFinite(promptTokens) ? Math.max(0, Math.round(promptTokens)) : 0,
    completionTokens: Number.isFinite(completionTokens) ? Math.max(0, Math.round(completionTokens)) : 0,
    totalTokens: Math.max(0, Math.round(totalTokens)),
  };
}

export async function callChatCompletion({
  candidate,
  systemPrompt,
  userContent,
  maxTokens,
  timeoutMs = CHAT_TIMEOUT_MS,
}: ChatCallConfig & { timeoutMs?: number }): Promise<ChatCallResult> {
  const body: Record<string, unknown> = {
    model: candidate.modelId,
    temperature: 0.3,
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
  };

  if (candidate.supportsJsonMode) {
    body.response_format = { type: "json_object" };
  }

  const response = await fetch(joinUrl(candidate.baseUrl, "/chat/completions"), {
    method: "POST",
    headers: candidate.headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const rateLimit = readRateLimitSnapshot(response, candidate.provider);

  if (!response.ok) {
    const text = await readBoundedResponse(response);
    const retryAfter = Number(response.headers.get("retry-after"));
    const error = new ProviderRequestError(candidate.providerLabel, response.status, text, rateLimit);
    if (Number.isFinite(retryAfter) && retryAfter > 0) error.retryAfterSeconds = retryAfter;
    throw error;
  }

  const bodyText = await readBoundedResponse(response);
  const data = JSON.parse(bodyText) as ChatCompletionResponse;
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new GenError("empty_output", `${candidate.providerLabel} returned an empty response`, {
      provider: candidate.provider,
      model: candidate.modelId,
    });
  }

  return {
    content,
    usage: normalizeUsage(data.usage),
    rateLimit,
  };
}
