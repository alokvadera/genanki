/**
 * Polling data hooks — the `convex/react` replacement.
 *
 * Convex pushed updates over a WebSocket; the REST API is pull-based, so
 * `useApiQuery` polls on an interval (paused when the tab is hidden).
 * `undefined` means "loading", `null` means "server returned null" — the
 * same conventions useQuery consumers already handle.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "@/lib/api";

export function useApiQuery<T>(
  fetcher: (() => Promise<T>) | null,
  options?: { intervalMs?: number },
): T | undefined {
  const [data, setData] = useState<T | undefined>(undefined);

  // Ref is written in an effect (not during render) per react-hooks rules.
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const refresh = useCallback(async (): Promise<T | undefined> => {
    const fn = fetcherRef.current;
    if (!fn) {
      setData(undefined);
      return undefined;
    }
    try {
      const result = await fn();
      setData(result);
      return result;
    } catch (err) {
      // Keep the last good data on transient failures; log for diagnosis.
      if (err instanceof ApiError && err.status === 404) {
        setData(null as T);
        return null as T;
      }
      console.warn("[useApiQuery] fetch failed:", err instanceof Error ? err.message : err);
      return undefined;
    }
  }, []);

  const hasFetcher = fetcher !== null;
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const interval = options?.intervalMs ?? 2_000;

    const loop = async () => {
      await refresh();
      if (cancelled) return;
      const backoff =
        typeof document !== "undefined" && document.visibilityState === "hidden"
          ? interval * 5
          : interval;
      timer = setTimeout(loop, backoff);
    };

    // Defer the first fetch to a microtask so the effect body never
    // synchronously sets state.
    void Promise.resolve().then(loop);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [hasFetcher, options?.intervalMs, refresh]);

  return data;
}

/** One-shot mutation/action runner returning the result (throws on error). */
export function useApiMutation<Args extends unknown[], R>(
  fn: (...args: Args) => Promise<R>,
): (...args: Args) => Promise<R> {
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });
  return useCallback(async (...args: Args) => fnRef.current(...args), []);
}

/** Alias matching the old useAction naming for minimal call-site churn. */
export const useApiAction = useApiMutation;
