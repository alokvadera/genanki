"use node";

const REQUEST_TIMEOUT_MS = 15_000;
const CHAT_TIMEOUT_MS = 60_000;
const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const GROQ_MODELS_URL = "https://api.groq.com/openai/v1/models";
const CEREBRAS_MODELS_URL = "https://api.cerebras.ai/v1/models";

export type ProviderName = "groq" | "cerebras" | "openrouter" | "kilo";

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
};

let cachedCatalog: { fetchedAt: number; catalogs: ProviderCatalog[] } | null = null;
let cachedOpenRouterFree: { fetchedAt: number; models: AiModelCandidate[] } | null = null;
let cachedGroq: { fetchedAt: number; models: AiModelCandidate[] } | null = null;
let cachedCerebras: { fetchedAt: number; models: AiModelCandidate[] } | null = null;

const MODEL_CACHE_TTL_MS = 5 * 60_000;

function shuffleInPlace<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
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
      const text = await response.text();
      throw new Error(`Request failed (${response.status}): ${text}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
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
        providerIndex: 2,
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
      providerIndex: 2,
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
  } catch {
    const fallback: AiModelCandidate[] = [
      {
        provider: "openrouter",
        providerLabel: "OpenRouter",
        providerIndex: 2,
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
    const models = shuffleInPlace((filtered.length > 0 ? filtered : mapped).slice());
    cachedGroq = { fetchedAt: Date.now(), models };
    return models;
  } catch {
    const fallback: AiModelCandidate[] = shuffleInPlace(
      [
        "llama-3.1-8b-instant",
        "llama-3.3-70b-versatile",
        "openai/gpt-oss-20b",
        "openai/gpt-oss-120b",
        "qwen/qwen3-32b",
        "meta-llama/llama-4-scout-17b-16e-instruct",
      ].map((modelId) => ({
        provider: "groq" as const,
        providerLabel: "Groq",
        providerIndex: 0,
        modelId,
        modelName: modelId,
        supportsJsonMode: false,
        baseUrl,
        headers,
      })),
    );
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
    const models = shuffleInPlace(mapped.length > 0 ? mapped.slice() : []);
    if (models.length > 0) {
      cachedCerebras = { fetchedAt: Date.now(), models };
      return models;
    }
  } catch {
    // fall back to the documented model below
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
    providerIndex: 3,
    modelId,
    modelName: modelId,
    supportsJsonMode: false,
    baseUrl: normalizeBaseUrl(baseUrl),
    headers,
  }));
}

export async function buildModelCandidates(): Promise<AiModelCandidate[]> {
  const cached = cachedCatalog;
  if (cached && Date.now() - cached.fetchedAt < MODEL_CACHE_TTL_MS) {
    return cached.catalogs.flatMap((catalog) => catalog.models);
  }

  const catalogs: ProviderCatalog[] = [];

  const groqModels = await loadGroqModels();
  if (groqModels.length > 0) {
    catalogs.push({
      provider: "groq",
      label: "Groq",
      providerIndex: 0,
      baseUrl: "https://api.groq.com/openai/v1",
      headers: groqModels[0].headers,
      models: groqModels,
    });
  }

  const cerebrasModels = await loadCerebrasModels();
  if (cerebrasModels.length > 0) {
    catalogs.push({
      provider: "cerebras",
      label: "Cerebras",
      providerIndex: 1,
      baseUrl: "https://api.cerebras.ai/v1",
      headers: cerebrasModels[0].headers,
      models: cerebrasModels,
    });
  }

  const openRouterModels = await loadOpenRouterFreeModels();
  if (openRouterModels.length > 0) {
    catalogs.push({
      provider: "openrouter",
      label: "OpenRouter",
      providerIndex: 2,
      baseUrl: "https://openrouter.ai/api/v1",
      headers: openRouterModels[0].headers,
      models: openRouterModels,
    });
  }

  const kiloModels = await loadKiloModels();
  if (kiloModels.length > 0) {
    catalogs.push({
      provider: "kilo",
      label: "Kilo",
      providerIndex: 3,
      baseUrl: normalizeBaseUrl(process.env.KILO_BASE_URL || ""),
      headers: kiloModels[0].headers,
      models: kiloModels,
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

export async function callChatCompletion({
  candidate,
  systemPrompt,
  userContent,
  maxTokens,
}: ChatCallConfig): Promise<string> {
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
    signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${candidate.providerLabel} request failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as ChatCompletionResponse;
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error(`${candidate.providerLabel} returned an empty response`);
  }

  return content;
}

