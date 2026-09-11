import { motion } from "framer-motion";
import { formatTokens } from "@/lib/utils";

/**
 * Usage ledger — one strip, four readings, with the total as the anchor.
 * Deliberately not four equal cards: these numbers are read together, and
 * only one of them is the headline.
 */
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
  const readings = [
    { label: "Prompt", value: formatTokens(promptTokens) },
    { label: "Completion", value: formatTokens(completionTokens) },
    { label: "Requests", value: formatTokens(requests) },
  ];

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="nb-border bg-card"
    >
      <dl className="grid grid-cols-2 sm:grid-cols-4">
        <div className="col-span-2 sm:col-span-1 bg-secondary text-secondary-foreground p-4 sm:p-5">
          <dt className="nb-label text-secondary-foreground/80">
            Total tokens
          </dt>
          <dd className="text-3xl font-bold tracking-tight mt-1">
            {formatTokens(totalTokens)}
          </dd>
        </div>
        {readings.map((r) => (
          <div
            key={r.label}
            className="border-t-[3px] border-border sm:border-t-0 sm:border-l-[3px] p-4 sm:p-5"
          >
            <dt className="nb-label text-muted-foreground">{r.label}</dt>
            <dd className="text-xl font-bold tracking-tight mt-1">
              {r.value}
            </dd>
          </div>
        ))}
      </dl>
    </motion.section>
  );
}
