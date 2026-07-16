import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { useQuery } from "convex/react";
import { formatDistanceToNow } from "date-fns";
import { ArrowUpRight, BarChart3, Clock3, Cpu, Layers, Sparkles } from "lucide-react";
import { Link } from "react-router";
import type { Doc } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";

type GenerationJob = Doc<"generationJobs">;

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
  if (status === "succeeded") return "bg-emerald-100 text-emerald-800";
  if (status === "canceled") return "bg-slate-100 text-slate-800";
  if (status === "failed") return "bg-red-100 text-red-800";
  if (status === "running") return "bg-blue-100 text-blue-800";
  return "bg-amber-100 text-amber-800";
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
  const usage = useQuery(api.providerUsage.byJob, { jobId: job._id });
  const totalTokens = usage?.totalTokens ?? 0;
  const promptTokens = usage?.totalPromptTokens ?? 0;
  const completionTokens = usage?.totalCompletionTokens ?? 0;
  const requests = usage?.requests ?? 0;
  const providerRows = usage?.providers ?? [];
  const modelRows = usage?.models ?? [];
  const recentCalls = usage?.rows ?? [];

  return (
    <section className="nb-border bg-white nb-shadow-sm p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className={`text-[10px] font-bold uppercase tracking-[0.2em] px-2 py-1 ${getStatusTone(job.status)}`}>
              {getStatusLabel(job.status)}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] px-2 py-1 bg-secondary nb-border">
              {job.kind}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] px-2 py-1 bg-white nb-border">
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
              className="nb-border bg-white px-3 py-1.5 text-xs font-bold nb-hover-shadow"
            >
              Add to current deck
            </button>
          ) : null}
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="nb-border bg-white px-3 py-1.5 text-xs font-bold nb-hover-shadow"
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
        <div className="mt-4 nb-border-2 bg-amber-50 p-3">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-800">Warnings</p>
          <ul className="mt-2 space-y-1 text-sm text-amber-900 font-medium">
            {job.resultWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Total tokens", value: formatTokens(totalTokens), icon: Cpu },
              { label: "Prompt", value: formatTokens(promptTokens), icon: Layers },
              { label: "Completion", value: formatTokens(completionTokens), icon: Sparkles },
              { label: "Requests", value: formatTokens(requests), icon: BarChart3 },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="nb-border-2 bg-muted/20 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                        {item.label}
                      </p>
                      <p className="text-lg font-bold tracking-tight mt-1">{item.value}</p>
                    </div>
                    <div className="nb-border bg-white p-2">
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
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
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
                    <div key={row.provider} className="nb-border bg-white p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold tracking-tight">{row.providerLabel}</p>
                          <p className="text-xs text-muted-foreground font-medium mt-0.5">
                            {row.requests} request(s)
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-base font-bold tracking-tight">{formatTokens(row.totalTokens)}</p>
                          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">tokens</p>
                        </div>
                      </div>
                      <div className="mt-2 h-2 w-full bg-muted overflow-hidden nb-border">
                        <motion.div
                          className="h-full bg-primary"
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
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
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
                  <div key={`${row.provider}:${row.model}`} className="nb-border bg-white p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold tracking-tight truncate">{row.providerLabel}</p>
                        <p className="text-xs text-muted-foreground font-medium truncate">{row.model}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold">{formatTokens(row.totalTokens)}</p>
                        <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">tokens</p>
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
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
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
                  <div key={row._id} className="nb-border bg-white p-3">
                    <p className="text-sm font-bold tracking-tight truncate">
                      {row.providerLabel} / {row.model}
                    </p>
                    <p className="text-xs text-muted-foreground font-medium mt-0.5">
                      {row.kind} · {formatTime(row.createdAt)}
                    </p>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
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
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                Provider Fallback Trail
              </p>
              <div className="mt-3 grid gap-2 max-h-[320px] overflow-auto pr-1">
                {job.fallbackTrail.map((record, index) => (
                  <div key={index} className="nb-border bg-white p-3 flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold tracking-tight">{record.provider} / {record.model}</p>
                      <span className={`text-[10px] font-bold uppercase tracking-[0.2em] px-2 py-1 ${record.outcome === 'success' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                        {record.outcome}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground font-medium">{record.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {job.resultCards?.length ? (
            <div className="nb-border-2 bg-muted/20 p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                Archived cards
              </p>
              <div className="mt-3 grid gap-3 max-h-[520px] overflow-auto pr-1">
                {job.resultCards.map((card, index) => (
                  <div key={`${job._id}-${index}`} className="nb-border bg-white p-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-2">
                      Card {index + 1}
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="nb-border bg-muted/20 p-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-1">
                          Front
                        </p>
                        <p className="text-sm font-medium break-words">{card.front}</p>
                      </div>
                      <div className="nb-border bg-muted/20 p-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-1">
                          Back
                        </p>
                        <p className="text-sm font-medium break-words">{card.back}</p>
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
