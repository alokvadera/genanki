import { api } from "@/lib/api";
import { useApiQuery } from "@/hooks/use-api-query";
import {
  ShieldAlert,
  Activity,
  ShieldCheck,
  BrainCircuit,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible";

export function OptimusDashboard() {
  const [isOpen, setIsOpen] = useState(false);
  const healthData = useApiQuery(() => api.networkHealth());
  const adaptiveSettings = useApiQuery(() => api.adaptiveSettings(), {
    intervalMs: 5000,
  });
  const latestInsight = useApiQuery(() => api.latestInsight(), {
    intervalMs: 5000,
  });

  if (healthData === undefined) {
    return (
      <div className="nb-border bg-card nb-shadow-sm p-3 animate-pulse">
        <div className="flex items-center gap-2 text-muted-foreground font-bold text-sm">
          <BrainCircuit className="h-4 w-4" />
          <span>Checking provider health</span>
        </div>
      </div>
    );
  }

  const exhausted = healthData.filter((d) => d.status === "exhausted").length;
  const nearExhaustion = healthData.filter(
    (d) => d.status === "near-exhaustion",
  ).length;

  // Status is carried by a word plus a tone, never by hue alone.
  let overallStatus = "All routes healthy";
  let StatusIcon = ShieldCheck;
  let statusTone = "text-muted-foreground";
  let containerTone = "bg-card";
  let shadowColor = "nb-shadow";

  if (exhausted > 0) {
    overallStatus = "Rerouting";
    StatusIcon = ShieldAlert;
    statusTone = "text-destructive";
    containerTone = "bg-destructive/10";
    shadowColor = "nb-shadow-oxblood";
  } else if (nearExhaustion > 0) {
    overallStatus = "Watching load";
    StatusIcon = Activity;
    statusTone = "text-foreground";
    containerTone = "bg-secondary/25";
    shadowColor = "nb-shadow-highlight";
  }

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className={`nb-border ${shadowColor} transition-colors duration-300 ${containerTone}`}
    >
      <CollapsibleTrigger className="w-full flex items-center justify-between p-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors group">
        <div className="flex items-center gap-2.5">
          <StatusIcon className={`h-4 w-4 shrink-0 ${statusTone}`} />
          <div className="text-left">
            <h2 className="text-base font-bold tracking-tight leading-tight">
              Optimus
            </h2>
            <p className="nb-label text-muted-foreground mt-0.5">
              {healthData.length} models tracked ·{" "}
              {adaptiveSettings?.documentMaxChunks ?? 10} chunks/doc
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`nb-border bg-card px-2 py-0.5 nb-label ${statusTone}`}
          >
            {overallStatus}
          </span>
          <div className="nb-border bg-card p-1 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
            {isOpen ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </div>
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent className="border-t-2 border-border bg-card text-card-foreground p-3 space-y-4">
        <div>
          <h3 className="nb-label text-muted-foreground mb-2">Routing health</h3>
          <div className="flex flex-wrap gap-2">
            {healthData.map((node) => {
              const isExhausted = node.status === "exhausted";
              const isNear = node.status === "near-exhaustion";
              const nodeTone = isExhausted
                ? "bg-destructive text-white"
                : isNear
                  ? "bg-secondary text-secondary-foreground"
                  : "bg-muted text-muted-foreground";

              return (
                <div
                  key={`${node.provider}-${node.model}`}
                  className={`nb-border-2 px-2 py-1 flex items-center gap-1.5 ${nodeTone}`}
                  title={node.reason ?? "Healthy"}
                >
                  <span className="nb-label">{node.provider}</span>
                  <span className="nb-label opacity-80 border-l border-current/30 pl-1.5">
                    {isExhausted ? "ERR" : isNear ? "WARN" : "OK"}
                  </span>
                </div>
              );
            })}
            {healthData.length === 0 && (
              <div className="text-xs font-bold text-muted-foreground py-1">
                No providers are reporting.
              </div>
            )}
          </div>
        </div>

        <div className="pt-3 border-t-2 border-border">
          <div className="flex flex-col sm:flex-row gap-4 justify-between">
            <dl className="flex gap-6">
              <div>
                <dt className="nb-label text-muted-foreground">Sections</dt>
                <dd className="text-base font-bold">
                  {adaptiveSettings?.documentMaxChunks ?? 10}
                </dd>
              </div>
              <div>
                <dt className="nb-label text-muted-foreground">Passes</dt>
                <dd className="text-base font-bold">
                  {adaptiveSettings?.completionPasses ?? 3}
                </dd>
              </div>
              <div>
                <dt className="nb-label text-muted-foreground">Tuned</dt>
                <dd className="text-base font-bold">
                  {latestInsight
                    ? formatDistanceToNow(latestInsight.createdAt) + " ago"
                    : "Pending"}
                </dd>
              </div>
            </dl>
            {latestInsight && (
              <p className="text-xs text-muted-foreground max-w-sm sm:text-right leading-snug">
                {latestInsight.summary}
              </p>
            )}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
