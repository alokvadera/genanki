import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { ShieldAlert, Activity, ShieldCheck, BrainCircuit, ChevronDown, ChevronUp } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";

export function OptimusDashboard() {
  const [isOpen, setIsOpen] = useState(false);
  const healthData = useQuery(api.optimus.getNetworkHealth);
  const adaptiveSettings = useQuery(api.rateLimits.adaptiveSettings, {});
  const latestInsight = useQuery(api.rateLimits.latestInsight, {});

  if (healthData === undefined) {
    return (
      <div className="nb-border bg-white nb-shadow-sm p-3 animate-pulse">
        <div className="flex items-center gap-2 text-muted-foreground font-bold text-sm">
          <BrainCircuit className="h-4 w-4" />
          <span>Optimus Loading...</span>
        </div>
      </div>
    );
  }

  const exhausted = healthData.filter(d => d.status === "exhausted").length;
  const nearExhaustion = healthData.filter(d => d.status === "near-exhaustion").length;
  
  let overallStatus = "Healthy";
  let StatusIcon = ShieldCheck;
  let statusColor = "text-emerald-600 dark:text-emerald-400";
  let bgStatusColor = "bg-emerald-50 dark:bg-emerald-950/30";
  let shadowColor = "nb-shadow-teal";

  if (exhausted > 0) {
    overallStatus = "Active Rerouting";
    StatusIcon = ShieldAlert;
    statusColor = "text-red-600 dark:text-red-400";
    bgStatusColor = "bg-red-50 dark:bg-red-950/30";
    shadowColor = "nb-shadow-rose";
  } else if (nearExhaustion > 0) {
    overallStatus = "Monitoring Load";
    StatusIcon = Activity;
    statusColor = "text-amber-600 dark:text-amber-400";
    bgStatusColor = "bg-amber-50 dark:bg-amber-950/30";
    shadowColor = "nb-shadow-amber";
  }

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className={`nb-border ${shadowColor} transition-colors duration-300 ${bgStatusColor}`}
    >
      <CollapsibleTrigger className="w-full flex items-center justify-between p-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors group">
        <div className="flex items-center gap-3">
          <div className="nb-border bg-card p-1.5">
            <StatusIcon className={`h-4 w-4 ${statusColor}`} />
          </div>
          <div className="text-left">
            <h2 className="text-base font-black tracking-tight leading-tight">Optimus</h2>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">
              {healthData.length} models tracked · {adaptiveSettings?.documentMaxChunks ?? 10} chunks/doc
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className={`nb-border bg-card px-2 py-0.5 font-bold text-[10px] uppercase tracking-widest ${statusColor}`}>
            {overallStatus}
          </div>
          <div className="nb-border bg-card p-1 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
            {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent className="border-t-2 border-border bg-card text-card-foreground p-3 space-y-4">
        {/* Network Health Minimal View */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground">Routing Health</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {healthData.map((node) => {
              const isExhausted = node.status === "exhausted";
              const isNear = node.status === "near-exhaustion";
              let nodeColor = "text-green-600 bg-green-50";
              
              if (isExhausted) {
                nodeColor = "text-red-600 bg-red-50";
              } else if (isNear) {
                nodeColor = "text-amber-600 bg-amber-50";
              }

              return (
                <div key={`${node.provider}-${node.model}`} className={`nb-border px-2 py-1 flex items-center gap-1.5 ${nodeColor}`} title={node.reason ?? "Healthy"}>
                  <span className="text-[10px] font-bold uppercase tracking-wider">{node.provider}</span>
                  <span className="text-[10px] font-medium opacity-80 border-l border-current/20 pl-1.5">
                    {isExhausted ? "ERR" : (isNear ? "WARN" : "OK")}
                  </span>
                </div>
              );
            })}
            {healthData.length === 0 && (
              <div className="text-xs font-bold text-muted-foreground py-1">No providers active.</div>
            )}
          </div>
        </div>

        {/* Adaptive Tuning Minimal View */}
        <div className="pt-3 border-t border-border">
          <div className="flex flex-col sm:flex-row gap-4 justify-between">
            <div className="flex gap-4">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Sections</p>
                <p className="text-sm font-bold">{adaptiveSettings?.documentMaxChunks ?? 10}</p>
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Passes</p>
                <p className="text-sm font-bold">{adaptiveSettings?.completionPasses ?? 3}</p>
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Tuned</p>
                <p className="text-sm font-bold">
                  {latestInsight ? formatDistanceToNow(latestInsight.createdAt) + " ago" : "Pending"}
                </p>
              </div>
            </div>
            {latestInsight && (
              <p className="text-xs text-muted-foreground font-medium max-w-sm text-right leading-snug">
                "{latestInsight.summary}"
              </p>
            )}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
