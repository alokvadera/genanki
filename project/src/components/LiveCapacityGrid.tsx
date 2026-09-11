import { formatTimeUntilMidnight } from "@/lib/budget-client";
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
    <section className="nb-border bg-card nb-shadow p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between mb-4">
        <div>
          <p className="nb-label text-muted-foreground mb-1">
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
                <span className={`nb-label px-2 py-1 ${cooling ? "bg-status-warn/15 text-status-warn" : "bg-status-ok/15 text-status-ok"}`}>
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
                  <p className="text-2xs text-muted-foreground font-medium mt-2">
                    Last status: {latest.lastStatus ?? "not called"}
                  </p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground font-medium mt-2">No calls tracked yet.</p>
              )}
              {providerKey === "cloudflare" && (
                <div className="mt-4 pt-4 border-t border-border">
                  <p className="nb-label text-muted-foreground mb-1">
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
