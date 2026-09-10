/**
 * REST client for the genanki Neon Function.
 *
 * Replaces the Convex generated `api` object: every endpoint maps 1:1 to a
 * previously-public Convex query/mutation/action. The function URL comes from
 * `VITE_API_URL` (build-time) and the optional Neon Auth session token from
 * the auth store.
 */

export const API_URL: string = import.meta.env.VITE_API_URL ?? "";

if (!API_URL) {
  // Fail fast like the old VITE_CONVEX_URL check did.
  throw new Error(
    "VITE_API_URL is not set. Please configure it in .env.local with your Neon Function URL.",
  );
}

/** Stored Neon Auth session JWT (set by use-auth hook; optional). */
let authToken: string | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

export class ApiError extends Error {
  status: number;
  kind?: string;

  constructor(status: number, message: string, kind?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    if (kind !== undefined) this.kind = kind;
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  timeoutMs = 900_000, // generation runs are long; keep the default generous
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    };
    if (authToken) headers.Authorization = `Bearer ${authToken}`;

    const response = await fetch(`${API_URL}${path}`, { ...init, headers, signal: controller.signal });

    if (!response.ok) {
      let message = `Request failed (${response.status})`;
      let kind: string | undefined;
      try {
        const body = (await response.json()) as { error?: string; kind?: string };
        if (body.error) message = body.error;
        if (body.kind) kind = body.kind;
      } catch {
        // non-JSON error body
      }
      throw new ApiError(response.status, message, kind);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

function get<T>(path: string, timeoutMs?: number): Promise<T> {
  return request<T>(path, { method: "GET" }, timeoutMs);
}

function post<T>(path: string, body?: unknown, timeoutMs?: number): Promise<T> {
  return request<T>(
    path,
    { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) },
    timeoutMs,
  );
}

// ---------------------------------------------------------------------------
// Typed endpoints (mirror of the old generated convex api surface)
// ---------------------------------------------------------------------------

// src/types + shared shapes
export type ProviderCatalogEntry = { provider: string; label: string; modelCount: number };
export type RateStateRow = {
  id: string;
  provider: string;
  model: string;
  windowStartedAt: number;
  requestsUsed: number;
  tokensUsed: number;
  dayStartedAt: number;
  dayRequestsUsed: number;
  cooldownUntil: number;
  lastStatus?: number;
  remainingRequests?: number;
  remainingTokens?: number;
  resetAt?: number;
  updatedAt: number;
};
export type CloudflareBudget = { utcDay: string; neuronsUsed: number; updatedAt: number };
export type AdaptiveSettings = {
  key: string;
  documentMaxChunks: number;
  completionPasses: number;
  updatedAt: number;
  source: string;
};
export type SystemInsight = {
  id: string;
  kind: string;
  status: string;
  summary: string;
  recommendation: string;
  triggerCalls: number;
  createdAt: number;
};
export type HealthEntry = {
  provider: string;
  model: string;
  status: "healthy" | "near-exhaustion" | "exhausted";
  reason?: string;
  cooldownRemaining?: number;
};

export type GenerationJob = {
  id: string;
  kind: "prompt" | "document";
  status: "queued" | "running" | "succeeded" | "canceled" | "failed";
  requestedCount: number;
  progress: number;
  etaSeconds: number;
  timeoutSeconds: number;
  deadlineAt: number;
  message: string;
  provider?: string;
  model?: string;
  providerIndex: number;
  modelIndex: number;
  totalProviders: number;
  totalModels: number;
  sectionIndex: number;
  totalSections: number;
  resultDeckName?: string;
  resultSummary?: string;
  resultCards?: Array<{ front: string; back: string }>;
  resultPartial?: boolean;
  resultWarnings?: string[];
  fallbackTrail?: Array<{ provider: string; model: string; outcome: string; reason: string }>;
  cancelRequestedAt?: number;
  canceledAt?: number;
  createdAt: number;
  updatedAt: number;
  error?: string;
};

export type UsageSummary = {
  windowDays: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  requests: number;
  providers: Array<{
    provider: string;
    providerLabel: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    requests: number;
  }>;
  models: Array<{
    provider: string;
    providerLabel: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    requests: number;
  }>;
};

export type UsageRow = {
  id: string;
  provider: string;
  providerLabel: string;
  model: string;
  kind: "prompt" | "document";
  jobId?: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  ip?: string;
  createdAt: number;
};

export type TelemetrySummary = {
  windowDays: number;
  events: Array<{ event: string; count: number; metricTotal: number }>;
  requested: number;
  generated: number;
  duplicates: number;
  sourceChars: number;
  parseFailures: number;
  durationMs: number;
  tokensUsed: number;
  rows: number;
};

export type AdminIpRow = {
  ip: string;
  deviceIdHash?: string;
  associatedIps: string[];
  dayWindowStart: number;
  dayTokensUsed: number;
  totalTokensAllTime: number;
  totalRequests: number;
  lastSeenAt: number;
  firstSeenAt: number;
  isBlocked: boolean;
  customDailyLimit?: number;
  note: string;
  providersUsed: Array<{ label: string; tokens: number; requests: number }>;
  modelsUsed: Array<{ name: string; tokens: number; requests: number }>;
};

export const api = {
  health: () => get<{ ok: boolean }>("/health", 10_000),

  // Jobs + generation
  createJob: (body: {
    kind: "prompt" | "document";
    requestedCount: number;
    totalProviders?: number;
    totalModels?: number;
    totalSections?: number;
    message: string;
    etaSeconds: number;
    timeoutSeconds: number;
    deadlineAt: number;
  }) => post<{ jobId: string }>("/api/jobs", body, 30_000),

  cancelJob: (jobId: string) => post<{ ok: boolean }>(`/api/jobs/${jobId}/cancel`, undefined, 30_000),

  getJob: (jobId: string, deviceToken?: string) =>
    get<GenerationJob>(`/api/jobs/${jobId}${deviceToken ? `?deviceToken=${encodeURIComponent(deviceToken)}` : ""}`),

  generateFromPrompt: (body: {
    prompt: string;
    deckName?: string;
    cardCount?: number;
    difficulty?: "beginner" | "intermediate" | "advanced";
    jobId?: string;
    preferredProvider?: string;
    cardType?: "basic" | "cloze";
    deviceToken?: string;
  }) => post<{ deckName: string; summary: string; cards: Array<{ front: string; back: string }>; partial?: boolean; warnings?: string[] }>(
    "/api/generate/prompt",
    body,
  ),

  generateFromDocument: (body: {
    text: string;
    deckName?: string;
    cardCount?: number;
    difficulty?: "beginner" | "intermediate" | "advanced";
    instructions?: string;
    jobId?: string;
    preferredProvider?: string;
    cardType?: "basic" | "cloze";
    deviceToken?: string;
  }) => post<{ deckName: string; summary: string; cards: Array<{ front: string; back: string }>; partial?: boolean; warnings?: string[] }>(
    "/api/generate/document",
    body,
  ),

  // Run history
  listActiveRuns: (deviceToken?: string) =>
    post<GenerationJob[]>("/api/runs/active", { deviceToken }, 60_000),
  listArchivedRuns: (limit: number, deviceToken?: string) =>
    post<GenerationJob[]>("/api/runs/archived", { limit, deviceToken }, 60_000),

  // Rate limits
  providerStates: () => get<RateStateRow[]>("/api/rate-limits/states"),
  adaptiveSettings: () => get<AdaptiveSettings | null>("/api/rate-limits/adaptive-settings"),
  latestInsight: () => get<SystemInsight | null>("/api/rate-limits/latest-insight"),
  cloudflareBudget: () => get<CloudflareBudget | null>("/api/rate-limits/cloudflare-budget"),

  // Usage + telemetry
  usageSummary: (daysBack = 30) => get<UsageSummary>(`/api/usage/summary?daysBack=${daysBack}`),
  usageRecent: (limit = 20) => get<UsageRow[]>(`/api/usage/recent?limit=${limit}`),
  usageByJob: (jobId: string) => get<UsageSummary & { rows: UsageRow[] }>(`/api/usage/by-job/${jobId}`),
  recordTelemetry: (body: Record<string, unknown>) => post<{ ok: boolean }>("/api/telemetry", body, 30_000),
  telemetrySummary: (daysBack = 30) => get<TelemetrySummary>(`/api/telemetry/summary?daysBack=${daysBack}`),

  // Provider catalog
  providerCatalog: () => get<ProviderCatalogEntry[]>("/api/providers/catalog"),
  providerCatalogUpdatedAt: () => get<number>("/api/providers/latest-updated-at"),
  refreshProviders: () => post<ProviderCatalogEntry[]>("/api/providers/refresh", {}, 60_000),

  // Optimus
  networkHealth: () => get<HealthEntry[]>("/api/optimus/health"),

  // IP admin
  adminLogin: (passphrase: string) => post<{ token: string; expiresAt: number }>("/api/admin/login", { passphrase }, 30_000),
  adminLogout: (adminToken: string) => post<{ ok: boolean }>("/api/admin/logout", { adminToken }, 30_000),
  adminValidateSession: (adminToken: string) => post<boolean>("/api/admin/validate-session", { adminToken }, 30_000),
  adminListIps: (adminToken: string) => post<AdminIpRow[]>("/api/admin/ips", { adminToken }, 60_000),
  adminSetRule: (body: {
    adminToken: string;
    ip: string;
    deviceIdHash?: string;
    isBlocked: boolean;
    customDailyLimit?: number;
    note?: string;
  }) => post<{ ok: boolean }>("/api/admin/set-rule", body, 30_000),
  adminResetIpTokens: (body: { adminToken: string; ip: string; deviceIdHash?: string }) =>
    post<{ ok: boolean }>("/api/admin/reset-ip-tokens", body, 30_000),
};
