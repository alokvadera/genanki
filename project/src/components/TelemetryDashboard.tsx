import { BarChart3, Clock3, FileText, CheckCircle, XCircle } from "lucide-react";

export type TelemetrySummaryData = {
  windowDays: number;
  rows: number;
  requested: number;
  generated: number;
  duplicates: number;
  durationMs: number;
  sourceChars: number;
  parseFailures: number;
  tokensUsed: number;
  events: Array<{
    event: string;
    count: number;
    metricTotal: number;
  }>;
};

export function TelemetryDashboard({
  telemetry,
}: {
  telemetry: TelemetrySummaryData;
}) {
  if (telemetry.rows === 0) return null;

  return (
    <section className="nb-border bg-card nb-shadow-indigo p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="nb-border bg-indigo-50 dark:bg-indigo-950/30 p-2">
          <BarChart3 className="w-5 h-5 text-indigo-500" />
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Generation Telemetry · Last {telemetry.windowDays} days
          </p>
          <h2 className="text-lg font-bold tracking-tight">
            {telemetry.rows} generation events tracked
          </h2>
        </div>
      </div>

      {/* Stat cards row */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 mb-4">
        {[
          { label: "Cards Requested", value: telemetry.requested.toLocaleString(), icon: FileText, tint: "bg-blue-50 dark:bg-blue-950/30", accent: "text-blue-600 dark:text-blue-300" },
          { label: "Cards Generated", value: telemetry.generated.toLocaleString(), icon: CheckCircle, tint: "bg-emerald-50 dark:bg-emerald-950/30", accent: "text-emerald-600 dark:text-emerald-300" },
          { label: "Duplicates", value: telemetry.duplicates.toLocaleString(), icon: XCircle, tint: "bg-amber-50 dark:bg-amber-950/30", accent: "text-amber-600 dark:text-amber-300" },
          { label: "Total Duration", value: `${Math.round(telemetry.durationMs / 1000)}s`, icon: Clock3, tint: "bg-rose-50 dark:bg-rose-950/30", accent: "text-rose-600 dark:text-rose-300" },
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
              <p className="font-bold">{telemetry.sourceChars.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-muted-foreground font-medium">Parse failures</p>
              <p className={`font-bold ${telemetry.parseFailures > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{telemetry.parseFailures}</p>
            </div>
            <div>
              <p className="text-muted-foreground font-medium">Tokens used</p>
              <p className="font-bold">{telemetry.tokensUsed.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-muted-foreground font-medium">Success rate</p>
              <p className="font-bold">
                {telemetry.requested > 0
                  ? `${Math.round((telemetry.generated / telemetry.requested) * 100)}%`
                  : "—"}
              </p>
            </div>
          </div>
        </div>

        <div className="nb-border-2 bg-muted/20 p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-3">
            Event Breakdown
          </p>
          <div className="space-y-2 max-h-[160px] overflow-auto pr-1">
            {telemetry.events.map((ev) => (
              <div key={ev.event} className="flex items-center justify-between nb-border bg-card p-2">
                <span className="text-sm font-bold tracking-tight truncate">{ev.event}</span>
                <span className="text-xs font-medium text-muted-foreground ml-2 shrink-0">
                  {ev.count} × {ev.metricTotal > 0 ? `${((ev.metricTotal / ev.count) * 100).toFixed(0)}%` : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
