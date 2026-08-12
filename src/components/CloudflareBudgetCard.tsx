import { motion } from "framer-motion";
import { Zap } from "lucide-react";
import { CLOUDFLARE_DAILY_BUDGET, formatTimeUntilMidnight } from "@/convex/budget";
import { formatTokens } from "@/lib/utils";

export type CloudflareBudgetData = {
  neuronsUsed: number;
};

export function CloudflareBudgetCard({
  budget,
  now,
}: {
  budget: CloudflareBudgetData;
  now: number;
}) {
  const used = budget.neuronsUsed ?? 0;
  const pct = Math.round((used / CLOUDFLARE_DAILY_BUDGET) * 100);
  const exhausted = used >= CLOUDFLARE_DAILY_BUDGET;
  const nearExhaustion = !exhausted && used >= CLOUDFLARE_DAILY_BUDGET * 0.8;

  const sectionClass = exhausted
    ? "nb-shadow-rose bg-red-50 dark:bg-red-950/20"
    : nearExhaustion
      ? "nb-shadow-amber bg-amber-50 dark:bg-amber-950/20"
      : "nb-shadow-teal bg-emerald-50 dark:bg-emerald-950/20";

  const barColor = exhausted
    ? "bg-destructive"
    : nearExhaustion
      ? "bg-amber-500"
      : "bg-teal-500";

  const textColor = exhausted
    ? "text-destructive"
    : nearExhaustion
      ? "text-amber-600"
      : "text-emerald-600";

  return (
    <section className={`nb-border p-5 mb-6 ${sectionClass}`}>
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
              {formatTokens(used)} / {formatTokens(CLOUDFLARE_DAILY_BUDGET)} Neurons
            </h2>
            <p className="text-xs text-muted-foreground font-medium mt-0.5">
              Resets in {formatTimeUntilMidnight(now)} · {pct}% used today
            </p>
          </div>
        </div>
        <div className="sm:w-[320px] shrink-0">
          <div className="flex items-center justify-between text-xs font-bold mb-1.5">
            <span className="text-muted-foreground">Daily usage</span>
            <span className={textColor}>{pct}%</span>
          </div>
          <div className="h-3 w-full bg-card overflow-hidden nb-border-2">
            <motion.div
              className={`h-full ${barColor}`}
              initial={false}
              animate={{
                width: `${Math.min(100, Math.max(2, (used / CLOUDFLARE_DAILY_BUDGET) * 100))}%`,
              }}
            />
          </div>
          {exhausted && (
            <p className="text-xs font-bold text-destructive mt-1.5">
              Budget exhausted — Cloudflare auto-routing disabled until reset.
            </p>
          )}
          {nearExhaustion && (
            <p className="text-xs font-bold text-amber-600 mt-1.5">
              Near exhaustion — Cloudflare routing priority reduced.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
