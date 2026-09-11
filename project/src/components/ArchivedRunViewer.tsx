import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { ArrowUpRight, BarChart3, Clock3, Cpu, Layers, Sparkles } from "lucide-react";
import { Link } from "react-router";
import type { GenerationJob } from "@/lib/api";
import { api } from "@/lib/api";
import { useApiQuery } from "@/hooks/use-api-query";
import { Button } from "@/components/ui/button";
import { FormattedCardText } from "@/components/FormattedCardText";

/**
 * Provider identity colours come from the data palette (chart tokens), not from
 * brand decoration. These distinguish series in a chart; they are not styling.
 */
const PROVIDER_COLORS: Record<string, { bar: string; bg: string; text: string }> = {
  groq: { bar: "bg-chart-2", bg: "bg-chart-2/10", text: "text-chart-2" },
  cerebras: { bar: "bg-chart-4", bg: "bg-chart-4/10", text: "text-chart-4" },
  cloudflare: { bar: "bg-chart-3", bg: "bg-chart-3/15", text: "text-foreground" },
  kilo: { bar: "bg-chart-5", bg: "bg-chart-5/10", text: "text-chart-5" },
  openrouter: { bar: "bg-chart-1", bg: "bg-chart-1/10", text: "text-chart-1" },
};

function getProviderColor(provider: string) {
  const key = provider.toLowerCase();
  for (const [k, v] of Object.entries(PROVIDER_COLORS)) {
    if (key.includes(k)) return v;
  }
  return { bar: "bg-primary", bg: "bg-muted/20", text: "text-foreground" };
}

type ArchivedRunViewerProps = {
  job: GenerationJob;
  historyHref?: string;
  onCreateDeck?: () => void;
  onAddToCurrent?: () => void;
  onClose?: () => void;
  closeLabel?: string;
  footer?: ReactNode;
};

function formatTokens(value: number): string {
  return new Intl.NumberFormat("en-US").format(Math.max(0, Math.round(value)));
}

function formatTime(value: number): string {
  return formatDistanceToNow(value, { addSuffix: true });
}

function getStatusLabel(status: GenerationJob["status"]): string {
  if (status === "queued") return "Queued";
  if (status === "running") return "Running";
  if (status === "succeeded") return "Complete";
  if (status === "canceled") return "Canceled";
  return "Failed";
}

function getStatusTone(status: GenerationJob["status"]): string {
  if (status === "succeeded") return "bg-status-ok/15 text-status-ok";
  if (status === "canceled") return "bg-muted text-muted-foreground";
  if (status === "failed") return "bg-status-err/15 text-status-err";
  if (status === "running") return "bg-status-info/15 text-status-info";
  return "bg-status-warn/15 text-status-warn";
}

/** Validation error emitted by AI SDK validation failures. */
interface ValidationError {
  message?: string;
  path?: string[];
}

function formatWarning(warning: string) {
  const jsonStart = warning.indexOf("[");
  if (jsonStart !== -1) {
    const prefix = warning.slice(0, jsonStart).trim();
    const jsonStr = warning.slice(jsonStart).trim();
    try {
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed)) {
        return (
          <div className="space-y-1">
            <span className="font-bold">{prefix}</span>
            <ul className="pl-4 mt-1 list-disc text-xs space-y-1">
              {parsed.map((err: ValidationError, idx: number) => {
                const path = err.path ? ` (${err.path.join(".")})` : "";
                return (
                  <li key={idx} className="text-status-warn">
                    <span className="font-semibold">{err.message || "Validation error"}</span>
                    <span className="text-status-warn/80 font-mono text-2xs">{path}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      }
    } catch {
      // ignore
    }
  }
  return <span>{warning}</span>;
}

function formatErrorReason(reason?: string) {
  if (!reason) return "";
  
  try {
    const jsonStart = reason.indexOf("[{");
    if (jsonStart !== -1) {
      const prefix = reason.slice(0, jsonStart).trim();
      const jsonStr = reason.slice(jsonStart);
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed) && parsed[0]?.code) {
        return (
          <details className="mt-1 cursor-pointer">
            <summary className="text-xs text-status-warn font-semibold hover:opacity-80">
              {prefix || "Validation failed"} ({parsed.length} errors, click to expand)
            </summary>
            <ul className="pl-6 mt-2 list-disc text-2xs space-y-1 text-status-warn nb-border bg-status-warn/10 p-3 max-h-[160px] overflow-auto">
              {parsed.map((err: ValidationError, idx: number) => {
                const path = err.path ? ` (${err.path.join(".")})` : "";
                return (
                  <li key={idx}>
                    <span className="font-bold">{err.message || "Validation error"}</span>
                    <span className="text-status-warn font-mono ml-1">{path}</span>
                  </li>
                );
              })}
            </ul>
          </details>
        );
      }
    }
  } catch {
    // Ignore and fallback to standard formatting
  }

  if (reason.includes("<!DOCTYPE") || reason.includes("<html") || reason.includes("<body")) {
    const titleMatch = reason.match(/<title>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1]!.trim() : "Error page (404/500)";
    const cleanPreview = reason.split("<")[0]!.trim() || `Server error: ${title}`;
    
    return (
      <details className="mt-1 cursor-pointer">
        <summary className="text-xs text-status-warn font-semibold hover:opacity-80">
          {cleanPreview} (click to view HTML)
        </summary>
        <pre className="mt-2 text-2xs bg-muted/40 p-2 overflow-auto max-h-[160px] nb-border whitespace-pre-wrap font-mono break-all text-status-warn">
          {reason}
        </pre>
      </details>
    );
  }

  if (reason.length > 200) {
    return (
      <details className="mt-1 cursor-pointer">
        <summary className="text-xs text-muted-foreground font-semibold hover:text-foreground">
          {reason.slice(0, 150)}... (click to expand)
        </summary>
        <pre className="mt-2 text-2xs bg-muted/40 p-2 overflow-auto max-h-[160px] nb-border whitespace-pre-wrap font-mono break-all">
          {reason}
        </pre>
      </details>
    );
  }

  return <p className="text-xs text-muted-foreground font-medium break-all">{reason}</p>;
}

export function ArchivedRunViewer({
  job,
  historyHref,
  onCreateDeck,
  onAddToCurrent,
  onClose,
  closeLabel = "Close",
  footer,
}: ArchivedRunViewerProps) {
  const usage = useApiQuery(() => api.usageByJob(job.id), { intervalMs: 5000 });
  const totalTokens = usage?.totalTokens ?? 0;
  const promptTokens = usage?.totalPromptTokens ?? 0;
  const completionTokens = usage?.totalCompletionTokens ?? 0;
  const requests = usage?.requests ?? 0;
  const providerRows = usage?.providers ?? [];
  const modelRows = usage?.models ?? [];
  const recentCalls = usage?.rows ?? [];

  return (
    <section className="nb-border bg-card text-card-foreground nb-shadow p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className={`nb-label px-2 py-1 ${getStatusTone(job.status)}`}>
              {getStatusLabel(job.status)}
            </span>
            <span className="nb-label px-2 py-1 bg-secondary nb-border">
              {job.kind}
            </span>
            <span className="nb-label px-2 py-1 bg-card nb-border">
              {job.requestedCount} cards
            </span>
          </div>
          <h2 className="text-lg font-bold tracking-tight">
            {job.resultDeckName || job.message}
          </h2>
          <p className="text-sm text-muted-foreground font-medium mt-1 break-words">
            {job.provider || "Provider pending"} / {job.model || "Model pending"}
          </p>
          <p className="text-xs text-muted-foreground font-medium mt-1">
            {formatTime(job.createdAt)}
            {" · "}
            {Math.round((job.status === "succeeded" ? 1 : job.progress ?? 0) * 100)}% complete
            {" · "}
            {job.resultCards?.length ?? 0} archived card(s)
            {job.resultPartial ? " · partial result" : ""}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {historyHref ? (
            <Button asChild variant="outline" className="nb-border nb-shadow-sm nb-hover-shadow font-bold text-xs px-3 h-9">
              <Link to={historyHref}>
                <ArrowUpRight className="w-4 h-4" />
                Full history
              </Link>
            </Button>
          ) : null}
          {onCreateDeck && job.resultCards?.length ? (
            <button
              type="button"
              onClick={onCreateDeck}
              className="nb-border bg-secondary px-3 py-1.5 text-xs font-bold nb-hover-shadow"
            >
              Create deck from run
            </button>
          ) : null}
          {onAddToCurrent && job.resultCards?.length ? (
            <button
              type="button"
              onClick={onAddToCurrent}
              className="nb-border bg-card px-3 py-1.5 text-xs font-bold nb-hover-shadow"
            >
              Add to current deck
            </button>
          ) : null}
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="nb-border bg-card px-3 py-1.5 text-xs font-bold nb-hover-shadow"
            >
              {closeLabel}
            </button>
          ) : null}
        </div>
      </div>

      {job.resultSummary ? (
        <p className="text-sm text-muted-foreground font-medium mt-4">
          {job.resultSummary}
        </p>
      ) : null}

      {job.resultWarnings?.length ? (
        <div className="mt-4 nb-border-2 bg-status-warn/10 p-3">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-status-warn">Warnings</p>
          <ul className="mt-2 space-y-2 text-sm text-status-warn font-medium">
            {job.resultWarnings.map((warning) => (
              <li key={warning} className="nb-border bg-card p-2.5">{formatWarning(warning)}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 2xl:grid-cols-[0.92fr_1.08fr]">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Total tokens", value: formatTokens(totalTokens), icon: Cpu, tint: "bg-muted", accent: "text-muted-foreground" },
              { label: "Prompt", value: formatTokens(promptTokens), icon: Layers, tint: "bg-muted", accent: "text-muted-foreground" },
              { label: "Completion", value: formatTokens(completionTokens), icon: Sparkles, tint: "bg-muted", accent: "text-muted-foreground" },
              { label: "Requests", value: formatTokens(requests), icon: BarChart3, tint: "bg-status-warn/10", accent: "text-muted-foreground dark:text-status-warn" },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className={`nb-border-2 p-3 ${item.tint}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className={`nb-label ${item.accent}`}>
                        {item.label}
                      </p>
                      <p className="text-lg font-bold tracking-tight mt-1">{item.value}</p>
                    </div>
                    <div className="nb-border bg-card p-2">
                      <Icon className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="nb-border-2 bg-muted/20 p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <p className="nb-label text-muted-foreground">
                  Provider breakdown
                </p>
                <h3 className="text-sm font-bold tracking-tight mt-1">Tokens by provider</h3>
              </div>
              <Clock3 className="w-4 h-4 text-muted-foreground" />
            </div>

            <div className="space-y-3">
              {usage === undefined ? (
                <p className="text-sm text-muted-foreground font-medium">Loading provider usage...</p>
              ) : providerRows.length === 0 ? (
                <p className="text-sm text-muted-foreground font-medium">No provider usage was recorded for this run.</p>
              ) : (
                providerRows.map((row) => {
                  const percent = totalTokens > 0 ? Math.max(4, (row.totalTokens / totalTokens) * 100) : 4;
                  return (
                    <div key={row.provider} className={`nb-border p-3 ${getProviderColor(row.provider).bg}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold tracking-tight">{row.providerLabel}</p>
                          <p className="text-xs text-muted-foreground font-medium mt-0.5">
                            {row.requests} request(s)
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-base font-bold tracking-tight">{formatTokens(row.totalTokens)}</p>
                          <p className="nb-label text-muted-foreground">tokens</p>
                        </div>
                      </div>
                      <div className="mt-2 h-2 w-full bg-muted overflow-hidden nb-border">
                        <motion.div
                          className={`h-full ${getProviderColor(row.provider).bar}`}
                          initial={false}
                          animate={{ width: `${Math.min(100, percent)}%` }}
                        />
                      </div>
                      <p className="mt-2 text-xs font-medium text-muted-foreground">
                        Prompt {formatTokens(row.promptTokens)} · Completion {formatTokens(row.completionTokens)}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="nb-border-2 bg-muted/20 p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <p className="nb-label text-muted-foreground">
                  Model breakdown
                </p>
                <h3 className="text-sm font-bold tracking-tight mt-1">Tokens by model</h3>
              </div>
            </div>

            <div className="space-y-2">
              {usage === undefined ? (
                <p className="text-sm text-muted-foreground font-medium">Loading model usage...</p>
              ) : modelRows.length === 0 ? (
                <p className="text-sm text-muted-foreground font-medium">No model usage was recorded for this run.</p>
              ) : (
                modelRows.map((row) => (
                  <div key={`${row.provider}:${row.model}`} className={`nb-border p-3 ${getProviderColor(row.provider).bg}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold tracking-tight truncate">{row.providerLabel}</p>
                        <p className="text-xs text-muted-foreground font-medium truncate">{row.model}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold">{formatTokens(row.totalTokens)}</p>
                        <p className="nb-label text-muted-foreground">tokens</p>
                      </div>
                    </div>
                    <p className="mt-2 text-xs font-medium text-muted-foreground">
                      {row.requests} request(s) · prompt {formatTokens(row.promptTokens)} · completion{" "}
                      {formatTokens(row.completionTokens)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          {footer}
        </div>

        <div className="space-y-4">
          <div className="nb-border-2 bg-muted/20 p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <p className="nb-label text-muted-foreground">
                  Recent calls
                </p>
                <h3 className="text-sm font-bold tracking-tight mt-1">Per-run provider calls</h3>
              </div>
            </div>

            <div className="space-y-2 max-h-[320px] overflow-auto pr-1">
              {usage === undefined ? (
                <p className="text-sm text-muted-foreground font-medium">Loading call history...</p>
              ) : recentCalls.length === 0 ? (
                <p className="text-sm text-muted-foreground font-medium">No calls recorded for this run.</p>
              ) : (
                recentCalls.map((row) => (
                  <div key={row.id} className={`nb-border p-3 ${getProviderColor(row.provider).bg}`}>
                    <p className="text-sm font-bold tracking-tight truncate">
                      {row.providerLabel} / {row.model}
                    </p>
                    <p className="text-xs text-muted-foreground font-medium mt-0.5">
                      {row.kind} · {formatTime(row.createdAt)}
                    </p>
                    <div className="mt-2 grid grid-cols-3 gap-2 nb-label text-muted-foreground">
                      <span>Prompt {formatTokens(row.promptTokens)}</span>
                      <span>Completion {formatTokens(row.completionTokens)}</span>
                      <span>Total {formatTokens(row.totalTokens)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {job.fallbackTrail?.length ? (
            <div className="nb-border-2 bg-muted/20 p-4">
              <p className="nb-label text-muted-foreground">
                Provider Fallback Trail
              </p>
              <div className="mt-3 grid gap-2 max-h-[320px] overflow-auto pr-1">
                {job.fallbackTrail.map((record, index) => (
                  <div key={index} className="nb-border bg-card p-3 flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold tracking-tight">{record.provider} / {record.model}</p>                        <span className={`nb-label px-2 py-1 ${record.outcome === 'success' ? 'bg-status-ok/15 text-status-ok' : 'bg-status-warn/15 text-status-warn'}`}>
                        {record.outcome}
                      </span>
                    </div>
                    {formatErrorReason(record.reason)}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {job.resultCards?.length ? (
            <div className="nb-border-2 bg-muted/20 p-4">
              <p className="nb-label text-muted-foreground">
                Archived cards
              </p>
              <div className="mt-3 grid gap-3 max-h-[520px] overflow-auto pr-1">
                {job.resultCards.map((card, index) => (
                  <div key={`${job.id}-${index}`} className="nb-border bg-card p-3">
                    <p className="nb-label text-muted-foreground mb-2">
                      Card {index + 1}
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="nb-border bg-muted/20 p-3">
                        <p className="nb-label text-muted-foreground mb-1">
                          Front
                        </p>
                        <FormattedCardText
                          text={card.front}
                          className="text-sm font-medium break-words prose prose-sm max-w-none"
                        />
                      </div>
                      <div className="nb-border bg-muted/20 p-3">
                        <p className="nb-label text-muted-foreground mb-1">
                          Back
                        </p>
                        <FormattedCardText
                          text={card.back}
                          className="text-sm font-medium break-words prose prose-sm max-w-none"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
