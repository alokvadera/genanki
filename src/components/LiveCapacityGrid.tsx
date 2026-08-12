import { formatTimeUntilMidnight } from "@/convex/budget";
import { PROVIDERS, getKeyFromLabel } from "@/lib/providerConfig";
import { getProviderColor } from "@/lib/providerColors";

export type LiveCapacityRow = {
  provider: string;
  model: string;
  cooldownUntil: number;
  remainingRequests?: number;
  remainingTokens?: number;
  lastStatus?: number;
};

export function LiveCapacityGrid({
  providerStates,
  now,
}: {
  providerStates: LiveCapacityRow[];
  now: number;
}) {
  const providerOrder = PROVIDERS.map((p) => p.label);

  return (
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
          const rows = providerStates.filter((row) => row.provider === providerKey);
          const cooling = rows.some((row) => row.cooldownUntil > now);
          const latest = rows[0];
          return (
            <div key={providerName} className={`nb-border-2 p-4 ${getProviderColor(providerName).bg}`}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold tracking-tight">{providerName}</h3>
                <span className={`text-[10px] font-bold uppercase tracking-[0.15em] px-2 py-1 ${cooling ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"}`}>
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
  );
}
