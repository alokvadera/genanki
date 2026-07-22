import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { BarChart3, ArrowLeft, Cpu, Layers, Zap, Clock3, FileText, CheckCircle, XCircle } from "lucide-react";
import { useQuery } from "convex/react";
import { Link } from "react-router";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { OptimusDashboard } from "@/components/OptimusDashboard";
import { PROVIDERS, getKeyFromLabel } from "@/lib/providerConfig";
import { CLOUDFLARE_DAILY_BUDGET, formatTimeUntilMidnight } from "@/convex/budget";

import { ThemeToggle } from "@/components/ThemeToggle";

function formatTokens(value: number): string {
  return new Intl.NumberFormat("en-US").format(Math.max(0, Math.round(value)));
}

function formatTime(value: number): string {
  return formatDistanceToNow(value, { addSuffix: true });
}

const PROVIDER_COLORS: Record<string, { bar: string; bg: string; text: string }> = {
  groq: { bar: "bg-indigo-500", bg: "bg-indigo-50 dark:bg-indigo-950/40", text: "text-indigo-700 dark:text-indigo-300" },
  cerebras: { bar: "bg-teal-500", bg: "bg-teal-50 dark:bg-teal-950/40", text: "text-teal-700 dark:text-teal-300" },
  cloudflare: { bar: "bg-amber-500", bg: "bg-amber-50 dark:bg-amber-950/40", text: "text-amber-700 dark:text-amber-300" },
  kilo: { bar: "bg-rose-500", bg: "bg-rose-50 dark:bg-rose-950/40", text: "text-rose-700 dark:text-rose-300" },
  openrouter: { bar: "bg-purple-500", bg: "bg-purple-50 dark:bg-purple-950/40", text: "text-purple-700 dark:text-purple-300" },
};

function getProviderColor(provider: string) {
  const key = provider.toLowerCase();
  for (const [k, v] of Object.entries(PROVIDER_COLORS)) {
    if (key.includes(k)) return v;
  }
  return { bar: "bg-primary", bg: "bg-muted/20", text: "text-foreground" };
}

export default function ProviderUsage() {
  const summary = useQuery(api.providerUsage.summary, { daysBack: 30 });
  const recent = useQuery(api.providerUsage.recent, { limit: 20 }) ?? [];
  const providerStates = useQuery(api.rateLimits.providerStates, {}) ?? [];
  const cloudflareBudget = useQuery(api.rateLimits.cloudflareBudget, {});
  const telemetrySummary = useQuery(api.generationTelemetry.summary, { daysBack: 30 });
  const [now, setNow] = useState(() => Date.now());

  // Keep `now` ticking for the budget countdown independently of provider states
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
        <div className="w-full px-6 lg:px-10 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Button asChild variant="outline" className="nb-border nb-shadow-sm nb-hover-shadow font-bold text-sm px-3 h-9">
              <Link to="/app">
                <ArrowLeft className="w-4 h-4" />
              </Link>
            </Button>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2">
                <BarChart3 className="w-6 h-6" />
                Provider Usage
              </h1>
              <p className="text-xs text-muted-foreground font-medium mt-0.5">
                Groq is the primary provider. Cerebras, Kilo, OpenRouter, and Cloudflare Workers AI step in when needed.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <div className="hidden md:flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
              <span className="nb-border bg-secondary text-secondary-foreground px-2 py-1">Primary: Groq</span>
              <span className="nb-border bg-card px-2 py-1">Fallbacks: Cerebras, Kilo, OpenRouter, Cloudflare</span>
            </div>
          </div>
        </div>
      </header>

      <main className="w-full px-6 lg:px-10 py-6 space-y-6">
        <OptimusDashboard />

        {/* Generation Telemetry Dashboard */}
        {telemetrySummary !== undefined && telemetrySummary.rows > 0 && (
          <section className="nb-border bg-card nb-shadow-indigo p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="nb-border bg-indigo-50 dark:bg-indigo-950/30 p-2">
                <BarChart3 className="w-5 h-5 text-indigo-500" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  Generation Telemetry · Last {telemetrySummary.windowDays} days
                </p>
                <h2 className="text-lg font-bold tracking-tight">
                  {telemetrySummary.rows} generation events tracked
                </h2>
              </div>
            </div>

            {/* Stat cards row */}
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 mb-4">
              {[
                { label: "Cards Requested", value: telemetrySummary.requested.toLocaleString(), icon: FileText, tint: "bg-blue-50 dark:bg-blue-950/30", accent: "text-blue-600 dark:text-blue-300" },
                { label: "Cards Generated", value: telemetrySummary.generated.toLocaleString(), icon: CheckCircle, tint: "bg-emerald-50 dark:bg-emerald-950/30", accent: "text-emerald-600 dark:text-emerald-300" },
                { label: "Duplicates", value: telemetrySummary.duplicates.toLocaleString(), icon: XCircle, tint: "bg-amber-50 dark:bg-amber-950/30", accent: "text-amber-600 dark:text-amber-300" },
                { label: "Total Duration", value: `${Math.round(telemetrySummary.durationMs / 1000)}s`, icon: Clock3, tint: "bg-rose-50 dark:bg-rose-950/30", accent: "text-rose-600 dark:text-rose-300" },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className={`nb-border-2 p-3 ${item.tint}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className={`text-[10px] font-bold uppercase tracking-[0.2em] ${item.accent}`}>
                          {item.label}
                        </p>
                        <p className="text-lg font-bold tracking-tight mt-1">{item.value}</p>
                      </div>
                      <div className="nb-border bg-card p-1.5">
                        <Icon className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Secondary stats + event breakdown */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="nb-border-2 bg-muted/20 p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-3">
                  Additional Metrics
                </p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground font-medium">Source chars</p>
                    <p className="font-bold">{telemetrySummary.sourceChars.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground font-medium">Parse failures</p>
                    <p className={`font-bold ${telemetrySummary.parseFailures > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{telemetrySummary.parseFailures}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground font-medium">Tokens used</p>
                    <p className="font-bold">{telemetrySummary.tokensUsed.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground font-medium">Success rate</p>
                    <p className="font-bold">
                      {telemetrySummary.requested > 0
                        ? `${Math.round((telemetrySummary.generated / telemetrySummary.requested) * 100)}%`
                        : '—'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="nb-border-2 bg-muted/20 p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-3">
                  Event Breakdown
                </p>
                <div className="space-y-2 max-h-[160px] overflow-auto pr-1">
                  {telemetrySummary.events.map((ev) => (
                    <div key={ev.event} className="flex items-center justify-between nb-border bg-card p-2">
                      <span className="text-sm font-bold tracking-tight truncate">{ev.event}</span>
                      <span className="text-xs font-medium text-muted-foreground ml-2 shrink-0">
                        {ev.count} × {ev.metricTotal > 0 ? `${((ev.metricTotal / ev.count) * 100).toFixed(0)}%` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Cloudflare Budget Card */}
        {cloudflareBudget !== undefined && (
          <section className={`nb-border p-5 mb-6 ${
            (cloudflareBudget?.neuronsUsed ?? 0) >= CLOUDFLARE_DAILY_BUDGET
              ? 'nb-shadow-rose bg-red-50 dark:bg-red-950/20'
              : (cloudflareBudget?.neuronsUsed ?? 0) >= CLOUDFLARE_DAILY_BUDGET * 0.8
                ? 'nb-shadow-amber bg-amber-50 dark:bg-amber-950/20'
                : 'nb-shadow-teal bg-emerald-50 dark:bg-emerald-950/20'
          }`}>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="nb-border bg-card p-2">
                  <Zap className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                    Cloudflare Workers AI · Daily Free Tier
                  </p>
                  <h2 className="text-lg font-bold tracking-tight">
                    {formatTokens(cloudflareBudget?.neuronsUsed ?? 0)} / {formatTokens(CLOUDFLARE_DAILY_BUDGET)} Neurons
                  </h2>
                  <p className="text-xs text-muted-foreground font-medium mt-0.5">
                    Resets in {formatTimeUntilMidnight(now)} · {
                      Math.round(((cloudflareBudget?.neuronsUsed ?? 0) / CLOUDFLARE_DAILY_BUDGET) * 100)
                    }% used today
                  </p>
                </div>
              </div>
              <div className="sm:w-[320px] shrink-0">
                <div className="flex items-center justify-between text-xs font-bold mb-1.5">
                  <span className="text-muted-foreground">Daily usage</span>
                  <span className={
                    (cloudflareBudget?.neuronsUsed ?? 0) >= CLOUDFLARE_DAILY_BUDGET
                      ? 'text-destructive'
                      : (cloudflareBudget?.neuronsUsed ?? 0) >= CLOUDFLARE_DAILY_BUDGET * 0.8
                        ? 'text-amber-600'
                        : 'text-emerald-600'
                  }>
                    {Math.round(((cloudflareBudget?.neuronsUsed ?? 0) / CLOUDFLARE_DAILY_BUDGET) * 100)}%
                  </span>
                </div>
                <div className="h-3 w-full bg-card overflow-hidden nb-border-2">
                  <motion.div
                    className={`h-full ${
                      (cloudflareBudget?.neuronsUsed ?? 0) >= CLOUDFLARE_DAILY_BUDGET
                        ? 'bg-destructive'
                        : (cloudflareBudget?.neuronsUsed ?? 0) >= CLOUDFLARE_DAILY_BUDGET * 0.8
                          ? 'bg-amber-500'
                          : 'bg-teal-500'
                    }`}
                    initial={false}
                    animate={{ width: `${Math.min(100, Math.max(2, ((cloudflareBudget?.neuronsUsed ?? 0) / CLOUDFLARE_DAILY_BUDGET) * 100))}%` }}
                  />
                </div>
                {(cloudflareBudget?.neuronsUsed ?? 0) >= CLOUDFLARE_DAILY_BUDGET && (
                  <p className="text-xs font-bold text-destructive mt-1.5">
                    Budget exhausted — Cloudflare auto-routing disabled until reset.
                  </p>
                )}
                {(cloudflareBudget?.neuronsUsed ?? 0) >= CLOUDFLARE_DAILY_BUDGET * 0.8 && (cloudflareBudget?.neuronsUsed ?? 0) < CLOUDFLARE_DAILY_BUDGET && (
                  <p className="text-xs font-bold text-amber-600 mt-1.5">
                    Near exhaustion — Cloudflare routing priority reduced.
                  </p>
                )}
              </div>
            </div>
          </section>
        )}
        
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Total tokens", value: formatTokens(totalTokens), icon: Cpu, shadow: "nb-shadow-indigo", tint: "bg-indigo-50", accent: "text-indigo-600" },
            { label: "Prompt tokens", value: formatTokens(promptTokens), icon: Layers, shadow: "nb-shadow-teal", tint: "bg-teal-50", accent: "text-teal-600" },
            { label: "Completion tokens", value: formatTokens(completionTokens), icon: Zap, shadow: "nb-shadow-rose", tint: "bg-rose-50", accent: "text-rose-600" },
            { label: "Requests", value: formatTokens(requests), icon: BarChart3, shadow: "nb-shadow-amber", tint: "bg-amber-50", accent: "text-amber-600" },
          ].map((item, index) => {
            const Icon = item.icon;
            return (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className={`nb-border p-4 ${item.shadow} ${item.tint}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className={`text-[10px] font-bold uppercase tracking-[0.2em] ${item.accent}`}>
                      {item.label}
                    </p>
                    <p className="text-2xl font-bold tracking-tight mt-1">{item.value}</p>
                  </div>
                  <div className="nb-border bg-card p-3">
                    <Icon className="w-5 h-5" />
                  </div>
                </div>
              </motion.div>
            );
          })}
        </section>

        <section className="nb-border bg-card nb-shadow-indigo p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between mb-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-600 mb-1">
                Provider Order
              </p>
              <h2 className="text-lg font-bold tracking-tight">Groq starts first</h2>
            </div>
            <p className="text-xs text-muted-foreground font-medium">
              Showing the last 30 days of recorded provider calls
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {providerOrder.map((providerName) => {
              const providerKey = getKeyFromLabel(providerName);
              const stat = providerStats.find(
                (item) => item.provider === providerKey
              );
              return (
                <div key={providerName} className="nb-border-2 bg-muted/20 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                    {providerKey === "groq" ? "Primary" : "Fallback"}
                  </p>
                  <h3 className="text-base font-bold tracking-tight mt-1">{providerName}</h3>
                  <p className="text-sm text-muted-foreground font-medium mt-1">
                    {stat
                      ? `${formatTokens(stat.totalTokens)} tokens across ${stat.requests} request(s)`
                      : "No usage recorded yet"}
                  </p>
                  <div className="mt-3 space-y-1 text-xs font-medium text-muted-foreground">
                    <p>Prompt: {formatTokens(stat?.promptTokens ?? 0)}</p>
                    <p>Completion: {formatTokens(stat?.completionTokens ?? 0)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="nb-border bg-card nb-shadow-teal p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between mb-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-teal-600 mb-1">
                Live Capacity
              </p>
              <h2 className="text-lg font-bold tracking-tight">Provider budget and cooldown state</h2>
            </div>
            <p className="text-xs text-muted-foreground font-medium">
              Reservations prevent concurrent runs from exhausting the same provider.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {providerOrder.map((providerName) => {
              const providerKey = getKeyFromLabel(providerName) ?? providerName.toLowerCase();
              const rows = providerStates.filter(
                (row) => row.provider === providerKey,
              );
              const cooling = rows.some((row) => row.cooldownUntil > now);
              const latest = rows[0];
              return (
                <div key={providerName} className={`nb-border-2 p-4 ${getProviderColor(providerName).bg}`}>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-bold tracking-tight">{providerName}</h3>
                    <span className={`text-[10px] font-bold uppercase tracking-[0.15em] px-2 py-1 ${cooling ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
                      {cooling ? "Cooling" : "Ready"}
                    </span>
                  </div>
                  {latest ? (
                    <>
                      <p className="text-xs text-muted-foreground font-medium mt-2 truncate">{latest.model}</p>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-medium text-muted-foreground">
                        <p>Requests left {latest.remainingRequests ?? "tracked"}</p>
                        <p>Tokens left {latest.remainingTokens ?? "tracked"}</p>
                      </div>
                      <p className="text-[10px] text-muted-foreground font-medium mt-2">
                        Last status: {latest.lastStatus ?? "not called"}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground font-medium mt-2">No calls tracked yet.</p>
                  )}
                  {providerKey === "cloudflare" && (
                    <div className="mt-4 pt-4 border-t border-border">
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-1">
                        Resets in {formatTimeUntilMidnight(now)}
                      </p>
                      <p className="text-xs font-medium text-muted-foreground">
                        See top card for detailed budget status.
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="nb-border bg-card nb-shadow-rose p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-rose-600 mb-1">
                  Provider Breakdown
                </p>
                <h2 className="text-lg font-bold tracking-tight">By provider</h2>
              </div>
            </div>

            <div className="space-y-3">
              {providerStats.length === 0 ? (
                <p className="text-sm text-muted-foreground font-medium">No usage has been recorded yet.</p>
              ) : (
                providerStats.map((stat) => {
                  const percent = totalTokens > 0 ? Math.max(4, (stat.totalTokens / totalTokens) * 100) : 4;
                  return (
                    <div key={stat.provider} className={`nb-border-2 p-4 ${getProviderColor(stat.provider).bg}`}>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className={`text-sm font-bold tracking-tight ${getProviderColor(stat.provider).text}`}>{stat.providerLabel}</p>
                          <p className="text-xs text-muted-foreground font-medium mt-0.5">
                            {stat.requests} request(s)
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold tracking-tight">{formatTokens(stat.totalTokens)}</p>
                          <p className="text-xs text-muted-foreground font-medium">tokens</p>
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
                        <p>Completion {formatTokens(stat.completionTokens)}</p>
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
                <p className="text-sm text-muted-foreground font-medium">No model usage recorded yet.</p>
              ) : (
                modelStats.map((stat, index) => (
                  <div key={`${stat.provider}:${stat.model}`} className={`nb-border-2 p-3 ${getProviderColor(stat.provider).bg}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold tracking-tight truncate">{stat.providerLabel}</p>
                        <p className="text-xs text-muted-foreground font-medium truncate">{stat.model}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold">{formatTokens(stat.totalTokens)}</p>
                        <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">tokens</p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground font-medium mt-2">
                      {stat.requests} request(s) · prompt {formatTokens(stat.promptTokens)} · completion{" "}
                      {formatTokens(stat.completionTokens)}
                    </p>
                    <div className="mt-2 h-1.5 w-full bg-card overflow-hidden nb-border">
                      <motion.div
                        className={`h-full ${getProviderColor(stat.provider).bar}`}
                        initial={false}
                        animate={{ width: `${Math.max(5, 100 - index * 2)}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="nb-border bg-card nb-shadow-amber p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-600 mb-1">
                Recent Calls
              </p>
              <h2 className="text-lg font-bold tracking-tight">Latest provider activity</h2>
            </div>
          </div>

          <div className="space-y-2">
            {recent.length === 0 ? (
              <p className="text-sm text-muted-foreground font-medium">No recent calls yet.</p>
            ) : (
              recent.map((row) => (
                <div key={row._id} className={`nb-border-2 p-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between ${getProviderColor(row.provider).bg}`}>
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
      </main>
    </div>
  );
}
