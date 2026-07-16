import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { BarChart3, ArrowLeft, Cpu, Layers, Zap } from "lucide-react";
import { useQuery } from "convex/react";
import { Link } from "react-router";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { OptimusDashboard } from "@/components/OptimusDashboard";
import { PROVIDERS, getKeyFromLabel } from "@/lib/providerConfig";
import { CLOUDFLARE_DAILY_BUDGET } from "@/convex/budget";

function formatTokens(value: number): string {
  return new Intl.NumberFormat("en-US").format(Math.max(0, Math.round(value)));
}

function formatTime(value: number): string {
  return formatDistanceToNow(value, { addSuffix: true });
}

export default function ProviderUsage() {
  const summary = useQuery(api.providerUsage.summary, { daysBack: 30 });
  const recent = useQuery(api.providerUsage.recent, { limit: 20 }) ?? [];
  const providerStates = useQuery(api.rateLimits.providerStates, {}) ?? [];
  const cloudflareBudget = useQuery(api.rateLimits.cloudflareBudget, {});
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (providerStates.length === 0) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [providerStates.length]);

  const providerOrder = PROVIDERS.map((p) => p.label);

  const providerStats = summary?.providers ?? [];
  const modelStats = summary?.models ?? [];
  const totalTokens = summary?.totalTokens ?? 0;
  const promptTokens = summary?.totalPromptTokens ?? 0;
  const completionTokens = summary?.totalCompletionTokens ?? 0;
  const requests = summary?.requests ?? 0;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b-[3px] border-black bg-white">
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
                Groq is the primary provider. Cerebras, Kilo, OpenRouter, and Cloudflare Workers AI only step in when needed.
              </p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
            <span className="nb-border bg-secondary px-2 py-1">Primary: Groq</span>
            <span className="nb-border bg-white px-2 py-1">Fallbacks: Cerebras, Kilo, OpenRouter, Cloudflare</span>
          </div>
        </div>
      </header>

      <main className="w-full px-6 lg:px-10 py-6 space-y-6">
        <OptimusDashboard />
        
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Total tokens", value: formatTokens(totalTokens), icon: Cpu },
            { label: "Prompt tokens", value: formatTokens(promptTokens), icon: Layers },
            { label: "Completion tokens", value: formatTokens(completionTokens), icon: Zap },
            { label: "Requests", value: formatTokens(requests), icon: BarChart3 },
          ].map((item, index) => {
            const Icon = item.icon;
            return (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="nb-border bg-white nb-shadow-sm p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                      {item.label}
                    </p>
                    <p className="text-2xl font-bold tracking-tight mt-1">{item.value}</p>
                  </div>
                  <div className="nb-border bg-secondary p-3">
                    <Icon className="w-5 h-5" />
                  </div>
                </div>
              </motion.div>
            );
          })}
        </section>

        <section className="nb-border bg-white nb-shadow-sm p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between mb-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-1">
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

        <section className="nb-border bg-white nb-shadow-sm p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between mb-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-1">
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
                <div key={providerName} className="nb-border-2 bg-muted/20 p-4">
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
                        Daily Free Tier
                      </p>
                      <p className="text-xs font-medium text-muted-foreground">
                        {cloudflareBudget ? formatTokens(cloudflareBudget.neuronsUsed) : 0} / {formatTokens(CLOUDFLARE_DAILY_BUDGET)} Neurons
                      </p>
                      <div className="mt-2 h-1.5 w-full bg-white overflow-hidden nb-border">
                        <motion.div
                          className={`h-full ${cloudflareBudget && cloudflareBudget.neuronsUsed >= CLOUDFLARE_DAILY_BUDGET ? 'bg-amber-500' : 'bg-primary'}`}
                          initial={false}
                          animate={{ width: `${Math.min(100, Math.max(0, ((cloudflareBudget?.neuronsUsed ?? 0) / CLOUDFLARE_DAILY_BUDGET) * 100))}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="nb-border bg-white nb-shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-1">
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
                    <div key={stat.provider} className="nb-border-2 bg-muted/20 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-bold tracking-tight">{stat.providerLabel}</p>
                          <p className="text-xs text-muted-foreground font-medium mt-0.5">
                            {stat.requests} request(s)
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold tracking-tight">{formatTokens(stat.totalTokens)}</p>
                          <p className="text-xs text-muted-foreground font-medium">tokens</p>
                        </div>
                      </div>
                      <div className="mt-3 h-2 w-full bg-white overflow-hidden nb-border">
                        <motion.div
                          className="h-full bg-primary"
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

          <div className="nb-border bg-white nb-shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-1">
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
                  <div key={`${stat.provider}:${stat.model}`} className="nb-border-2 bg-muted/20 p-3">
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
                    <div className="mt-2 h-1.5 w-full bg-white overflow-hidden nb-border">
                      <motion.div
                        className="h-full bg-primary"
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

        <section className="nb-border bg-white nb-shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-1">
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
                <div key={row._id} className="nb-border-2 bg-muted/20 p-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
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
