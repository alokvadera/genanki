"use node";

/**
 * Provider routing advisor — ported from src/convex/providerAdvisor.ts.
 * The Convex action becomes a plain async function (invoked by cron sweep).
 */
import { buildModelCandidates, callChatCompletion } from "./aiProviders";
import { performanceSnapshot, latestInsight, applyAdvisorSettings } from "./services/rateLimits";
import { telemetrySummary } from "./services/telemetry";

const ADVISOR_THRESHOLD = 20;
const ADVISOR_COOLDOWN_MS = 24 * 60 * 60 * 1000;

type AdvisorOutput = {
  summary?: string;
  recommendation?: string;
  documentMaxChunks?: number;
  completionPasses?: number;
};

type AdvisorResult = {
  status: string;
  totalCalls: number;
  settings?: unknown;
};

/** (P4) Safely parse advisor JSON output with try/catch and numeric clamping. */
export function parseAdvisorOutput(content: string): AdvisorOutput {
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

export async function maybeRunAdvisor(): Promise<AdvisorResult> {
  const performance = await performanceSnapshot();
  const telemetry = await telemetrySummary();
  const totalCalls = performance.reduce((sum, row) => sum + row.calls, 0);
  if (totalCalls < ADVISOR_THRESHOLD) return { status: "below-threshold", totalCalls };

  const latest = await latestInsight();
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
  const settings = await applyAdvisorSettings({
    summary: recommendation.summary || "Adaptive settings updated.",
    recommendation: recommendation.recommendation || "No additional detail.",
    triggerCalls: totalCalls,
    documentMaxChunks,
    completionPasses,
  });
  return { status: "applied", totalCalls, settings };
}
