import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { BarChart3, ArrowLeft, Clock3, Layers } from "lucide-react";
import { useQuery } from "convex/react";
import { Link } from "react-router";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { OptimusDashboard } from "@/components/OptimusDashboard";
import { TelemetryDashboard } from "@/components/TelemetryDashboard";
import { CloudflareBudgetCard } from "@/components/CloudflareBudgetCard";
import { ProviderStatCards } from "@/components/ProviderStatCards";
import { LiveCapacityGrid } from "@/components/LiveCapacityGrid";
import { PROVIDERS, getKeyFromLabel } from "@/lib/providerConfig";
import { getProviderColor } from "@/lib/providerColors";
import { formatTokens } from "@/lib/utils";
import { ThemeToggle } from "@/components/ThemeToggle";

function formatTime(value: number): string {
  return formatDistanceToNow(value, { addSuffix: true });
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ProviderUsage() {
  const summary = useQuery(api.providerUsage.summary, { daysBack: 30 });
  const recent = useQuery(api.providerUsage.recent, { limit: 20 }) ?? [];
  const providerStates = useQuery(api.rateLimits.providerStates, {}) ?? [];
  const cloudflareBudget = useQuery(api.rateLimits.cloudflareBudget, {});
  const telemetrySummary = useQuery(api.generationTelemetry.summary, {
    daysBack: 30,
  });
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const providerOrder = PROVIDERS.map((p) => p.label);
  const providerStats = summary?.providers ?? [];
  const modelStats = summary?.models ?? [];
  const totalTokens = summary?.totalTokens ?? 0;
  const promptTokens = summary?.totalPromptTokens ?? 0;
  const completionTokens = summary?.totalCompletionTokens ?? 0;
  const requests = summary?.requests ?? 0;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b-[3px] border-border bg-card text-card-foreground">
        <div className="w-full px-4 sm:px-6 lg:px-10 py-3 sm:py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Button
              asChild
              variant="outline"
              className="nb-border nb-shadow-sm nb-hover-shadow font-bold text-sm px-3 h-9"
            >
              <Link to="/app" aria-label="Back to deck creator">
                <ArrowLeft className="w-4 h-4" />
              </Link>
            </Button>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2">
                <BarChart3 className="w-6 h-6" />
                Provider Usage
              </h1>
              <p className="text-xs text-muted-foreground font-medium mt-0.5">
                Groq is the primary provider. Cerebras, Kilo, OpenRouter, and
                Cloudflare Workers AI step in when needed.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap justify-end">
            <ThemeToggle />
            <Button
              asChild
              variant="outline"
              className="nb-border nb-shadow-sm nb-hover-shadow font-bold text-sm px-3 sm:px-4 h-9"
            >
              <Link to="/runs" aria-label="View generation runs">
                <Clock3 className="w-4 h-4" />
                <span className="hidden sm:inline">Runs</span>
              </Link>
            </Button>
            <Button
              asChild
              className="nb-border nb-shadow-sm nb-hover-shadow bg-primary text-primary-foreground font-bold text-sm px-3 sm:px-4 h-9"
            >
              <Link to="/app" aria-label="Open deck creator">
                <Layers className="w-4 h-4" />
                <span className="hidden sm:inline">Deck creator</span>
              </Link>
            </Button>
            <div className="hidden xl:flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
              <span className="nb-border bg-secondary text-secondary-foreground px-2 py-1">
                Primary: Groq
              </span>
              <span className="nb-border bg-card px-2 py-1">
                Fallbacks: Cerebras, Kilo, OpenRouter, Cloudflare
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="w-full px-4 sm:px-6 lg:px-10 py-5 sm:py-6">
        <div className="mx-auto max-w-7xl space-y-6">
          <section className="nb-border bg-foreground text-background nb-shadow-indigo dark:bg-card dark:text-foreground p-5 sm:p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-secondary mb-1.5">
                  Provider control room
                </p>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight leading-tight">
                  Know what is powering every deck.
                </h2>
                <p className="text-sm text-background/70 dark:text-muted-foreground font-medium mt-2 leading-relaxed">
                  Keep an eye on routing health, token flow, and fallback
                  capacity so generation stays predictable while you study.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:min-w-[360px]">
                <div className="nb-border-2 border-background/30 dark:border-border bg-background/10 dark:bg-muted/30 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-background/60 dark:text-muted-foreground">
                    Window
                  </p>
                  <p className="text-lg font-bold mt-1">
                    {summary?.windowDays ?? 30}d
                  </p>
                </div>
                <div className="nb-border-2 border-background/30 dark:border-border bg-background/10 dark:bg-muted/30 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-background/60 dark:text-muted-foreground">
                    Requests
                  </p>
                  <p className="text-lg font-bold mt-1">
                    {formatTokens(requests)}
                  </p>
                </div>
                <div className="nb-border-2 border-background/30 dark:border-border bg-background/10 dark:bg-muted/30 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-background/60 dark:text-muted-foreground">
                    Providers
                  </p>
                  <p className="text-lg font-bold mt-1">
                    {providerStats.length}
                  </p>
                </div>
              </div>
            </div>
          </section>

          <OptimusDashboard />

          {telemetrySummary !== undefined && telemetrySummary.rows > 0 && (
            <TelemetryDashboard telemetry={telemetrySummary} />
          )}

          {cloudflareBudget !== undefined && cloudflareBudget !== null && (
            <CloudflareBudgetCard budget={cloudflareBudget} now={now} />
          )}

          <ProviderStatCards
            totalTokens={totalTokens}
            promptTokens={promptTokens}
            completionTokens={completionTokens}
            requests={requests}
          />

          {/* Provider Order */}
          <section className="nb-border bg-card nb-shadow-indigo p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between mb-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-600 mb-1">
                  Provider Order
                </p>
                <h2 className="text-lg font-bold tracking-tight">
                  Groq starts first
                </h2>
              </div>
              <p className="text-xs text-muted-foreground font-medium">
                Showing the last 30 days of recorded provider calls
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {providerOrder.map((providerName) => {
                const providerKey = getKeyFromLabel(providerName);
                const stat = providerStats.find(
                  (item) => item.provider === providerKey,
                );
                return (
                  <div
                    key={providerName}
                    className="nb-border-2 bg-muted/20 p-4"
                  >
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                      {providerKey === "groq" ? "Primary" : "Fallback"}
                    </p>
                    <h3 className="text-base font-bold tracking-tight mt-1">
                      {providerName}
                    </h3>
                    <p className="text-sm text-muted-foreground font-medium mt-1">
                      {stat
                        ? `${formatTokens(stat.totalTokens)} tokens across ${stat.requests} request(s)`
                        : "No usage recorded yet"}
                    </p>
                    <div className="mt-3 space-y-1 text-xs font-medium text-muted-foreground">
                      <p>Prompt: {formatTokens(stat?.promptTokens ?? 0)}</p>
                      <p>
                        Completion: {formatTokens(stat?.completionTokens ?? 0)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <LiveCapacityGrid providerStates={providerStates} now={now} />

          {/* Provider & Model Breakdown */}
          <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="nb-border bg-card nb-shadow-rose p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-rose-600 mb-1">
                    Provider Breakdown
                  </p>
                  <h2 className="text-lg font-bold tracking-tight">
                    By provider
                  </h2>
                </div>
              </div>
              <div className="space-y-3">
                {providerStats.length === 0 ? (
                  <p className="text-sm text-muted-foreground font-medium">
                    No usage has been recorded yet.
                  </p>
                ) : (
                  providerStats.map((stat) => {
                    const percent =
                      totalTokens > 0
                        ? Math.max(4, (stat.totalTokens / totalTokens) * 100)
                        : 4;
                    return (
                      <div
                        key={stat.provider}
                        className={`nb-border-2 p-4 ${getProviderColor(stat.provider).bg}`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p
                              className={`text-sm font-bold tracking-tight ${getProviderColor(stat.provider).text}`}
                            >
                              {stat.providerLabel}
                            </p>
                            <p className="text-xs text-muted-foreground font-medium mt-0.5">
                              {stat.requests} request(s)
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold tracking-tight">
                              {formatTokens(stat.totalTokens)}
                            </p>
                            <p className="text-xs text-muted-foreground font-medium">
                              tokens
                            </p>
                          </div>
                        </div>
                        <div className="mt-3 h-2 w-full bg-card overflow-hidden nb-border">
                          <motion.div
                            className={`h-full ${getProviderColor(stat.provider).bar}`}
                            initial={false}
                            animate={{ width: `${Math.min(100, percent)}%` }}
                          />
                        </div>
                        <div className="mt-3 grid grid-cols-3 gap-3 text-xs font-medium text-muted-foreground">
                          <p>Prompt {formatTokens(stat.promptTokens)}</p>
                          <p>
                            Completion {formatTokens(stat.completionTokens)}
                          </p>
                          <p>Total {formatTokens(stat.totalTokens)}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="nb-border bg-card nb-shadow-indigo p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-600 mb-1">
                    Model Breakdown
                  </p>
                  <h2 className="text-lg font-bold tracking-tight">By model</h2>
                </div>
              </div>
              <div className="space-y-2 max-h-[520px] overflow-auto pr-1">
                {modelStats.length === 0 ? (
                  <p className="text-sm text-muted-foreground font-medium">
                    No model usage recorded yet.
                  </p>
                ) : (
                  modelStats.map((stat, index) => (
                    <div
                      key={`${stat.provider}:${stat.model}`}
                      className={`nb-border-2 p-3 ${getProviderColor(stat.provider).bg}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-bold tracking-tight truncate">
                            {stat.providerLabel}
                          </p>
                          <p className="text-xs text-muted-foreground font-medium truncate">
                            {stat.model}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold">
                            {formatTokens(stat.totalTokens)}
                          </p>
                          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                            tokens
                          </p>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground font-medium mt-2">
                        {stat.requests} request(s) · prompt{" "}
                        {formatTokens(stat.promptTokens)} · completion{" "}
                        {formatTokens(stat.completionTokens)}
                      </p>
                      <div className="mt-2 h-1.5 w-full bg-card overflow-hidden nb-border">
                        <motion.div
                          className={`h-full ${getProviderColor(stat.provider).bar}`}
                          initial={false}
                          animate={{
                            width: `${Math.max(5, 100 - index * 2)}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>

          {/* Recent Calls */}
          <section className="nb-border bg-card nb-shadow-amber p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-600 mb-1">
                  Recent Calls
                </p>
                <h2 className="text-lg font-bold tracking-tight">
                  Latest provider activity
                </h2>
              </div>
            </div>
            <div className="space-y-2">
              {recent.length === 0 ? (
                <p className="text-sm text-muted-foreground font-medium">
                  No recent calls yet.
                </p>
              ) : (
                recent.map((row) => (
                  <div
                    key={row._id}
                    className={`nb-border-2 p-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between ${getProviderColor(row.provider).bg}`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-bold tracking-tight truncate">
                        {row.providerLabel} / {row.model}
                      </p>
                      <p className="text-xs text-muted-foreground font-medium">
                        {row.kind} · {formatTime(row.createdAt)}
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-right text-xs font-medium text-muted-foreground">
                      <p>Prompt {formatTokens(row.promptTokens)}</p>
                      <p>Completion {formatTokens(row.completionTokens)}</p>
                      <p>Total {formatTokens(row.totalTokens)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
