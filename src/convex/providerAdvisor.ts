"use node";

import { action, type ActionCtx } from "./_generated/server";
import { api } from "./_generated/api";
import { buildModelCandidates, callChatCompletion } from "./aiProviders";

const ADVISOR_THRESHOLD = 20;
const ADVISOR_COOLDOWN_MS = 24 * 60 * 60 * 1000;

type AdvisorOutput = {
  summary?: string;
  recommendation?: string;
  documentMaxChunks?: number;
  completionPasses?: number;
};

type PerformanceRow = {
  provider: string;
  model: string;
  calls: number;
  successes: number;
  failures: number;
  timeouts: number;
  averageLatencyMs: number;
  averageTokens: number;
  updatedAt: number;
};

type AdvisorResult = {
  status: string;
  totalCalls: number;
  settings?: unknown;
};

type TelemetrySummary = {
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

/** (P4) Safely parse advisor JSON output with try/catch and numeric clamping. */
function parseAdvisorOutput(content: string): AdvisorOutput {
  try {
    const cleaned = content.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(cleaned) as Partial<AdvisorOutput>;
    const safeNumber = (v: unknown, fallback: number): number => {
      const n = Number(v);
      return Number.isFinite(n) ? n : fallback;
    };
    return {
      summary: typeof parsed.summary === "string" ? parsed.summary : "Adaptive generation settings updated.",
      recommendation: typeof parsed.recommendation === "string" ? parsed.recommendation : cleaned,
      documentMaxChunks: safeNumber(parsed.documentMaxChunks, 10),
      completionPasses: safeNumber(parsed.completionPasses, 3),
    };
  } catch {
    return { summary: "Advisor parse failed", recommendation: "", documentMaxChunks: 10, completionPasses: 3 };
  }
}

export const maybeRun = action({
  args: {},
  handler: async (ctx: ActionCtx): Promise<AdvisorResult> => {
    const performance: PerformanceRow[] = await ctx.runQuery(api.rateLimits.performanceSnapshot, {});
    const telemetry: TelemetrySummary = await ctx.runQuery(api.generationTelemetry.summary, {});
    const totalCalls = performance.reduce((sum: number, row: PerformanceRow) => sum + row.calls, 0);
    if (totalCalls < ADVISOR_THRESHOLD) return { status: "below-threshold", totalCalls };

    const latest = await ctx.runQuery(api.rateLimits.latestInsight, {});
    if (latest && Date.now() - latest.createdAt < ADVISOR_COOLDOWN_MS) {
      return { status: "cooldown", totalCalls };
    }

    const groq = (await buildModelCandidates()).find((candidate) => candidate.provider === "groq");
    if (!groq) return { status: "groq-unavailable", totalCalls };

    const prompt = [
      "You are a provider-routing reliability advisor.",
      "Analyze aggregate generation performance and return JSON only.",
      '{ "summary": string, "recommendation": string, "documentMaxChunks": number, "completionPasses": number }',
      "Keep Groq as the first provider tier. Never recommend removing a provider.",
      "Choose documentMaxChunks from 4 to 12 and completionPasses from 1 to 4.",
      "Prefer faster models with high success rates, but do not optimize away reliability.",
      `Performance data: ${JSON.stringify(performance.slice(0, 30))}`,
      `Product telemetry: ${JSON.stringify(telemetry)}`,
    ].join("\n");
    const result = await callChatCompletion({
      candidate: groq,
      systemPrompt: "Return strict JSON. Do not include markdown or additional keys.",
      userContent: prompt,
      maxTokens: 500,
    });
    const recommendation = parseAdvisorOutput(result.content);
    const documentMaxChunks = Number.isFinite(recommendation.documentMaxChunks)
      ? recommendation.documentMaxChunks!
      : 10;
    const completionPasses = Number.isFinite(recommendation.completionPasses)
      ? recommendation.completionPasses!
      : 3;
    const settings = await ctx.runMutation(api.rateLimits.applyAdvisorSettings, {
      summary: recommendation.summary || "Adaptive settings updated.",
      recommendation: recommendation.recommendation || "No additional detail.",
      triggerCalls: totalCalls,
      documentMaxChunks,
      completionPasses,
    });
    return { status: "applied", totalCalls, settings };
  },
});
