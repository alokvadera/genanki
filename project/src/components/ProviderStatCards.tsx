import { motion } from "framer-motion";
import { Cpu, Layers, Zap, BarChart3 } from "lucide-react";
import { formatTokens } from "@/lib/utils";

export function ProviderStatCards({
  totalTokens,
  promptTokens,
  completionTokens,
  requests,
}: {
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  requests: number;
}) {
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {[
        { label: "Total tokens", value: formatTokens(totalTokens), icon: Cpu, shadow: "nb-shadow-indigo", tint: "bg-indigo-50 dark:bg-indigo-950/20", accent: "text-indigo-600 dark:text-indigo-300" },
        { label: "Prompt tokens", value: formatTokens(promptTokens), icon: Layers, shadow: "nb-shadow-teal", tint: "bg-teal-50 dark:bg-teal-950/20", accent: "text-teal-600 dark:text-teal-300" },
        { label: "Completion tokens", value: formatTokens(completionTokens), icon: Zap, shadow: "nb-shadow-rose", tint: "bg-rose-50 dark:bg-rose-950/20", accent: "text-rose-600 dark:text-rose-300" },
        { label: "Requests", value: formatTokens(requests), icon: BarChart3, shadow: "nb-shadow-amber", tint: "bg-amber-50 dark:bg-amber-950/20", accent: "text-amber-600 dark:text-amber-300" },
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
  );
}
