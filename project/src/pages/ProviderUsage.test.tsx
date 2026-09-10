// @vitest-environment jsdom
import { createElement, type ReactNode } from "react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import ProviderUsage from "./ProviderUsage";

/**
 * The page consumes `useApiQuery(fetcher)` where fetcher resolves async data.
 * For these tests we replace the hook with a synchronous state machine keyed
 * on the fetcher's function identity, mapped to configured values below.
 */
const queryValues = vi.hoisted(() => new Map<unknown, unknown>());
void queryValues;

vi.mock("@/hooks/use-api-query", async () => {
  const { useState, useEffect } = await import("react");
  type Fetcher = (() => Promise<unknown>) | null;
  return {
    useApiQuery: (fetcher: Fetcher): unknown => {
      const [value, setValue] = useState<unknown>(undefined);
      useEffect(() => {
        if (!fetcher) {
          setValue(undefined);
          return;
        }
        let cancelled = false;
        void (async () => {
          try {
            const result = await fetcher();
            if (!cancelled) setValue(result);
          } catch {
            if (!cancelled) setValue(undefined);
          }
        })();
        return () => {
          cancelled = true;
        };
      }, [fetcher]);
      return value;
    },
    useApiMutation: (fn: unknown) => fn,
  };
});

// The api module mock returns Promises; the hook above awaits them, so tests
// configure outcomes by patching the mock functions through this handle.
const apiMocks = vi.hoisted(() => ({
  usageSummary: vi.fn(),
  usageRecent: vi.fn(),
  providerStates: vi.fn(),
  cloudflareBudget: vi.fn(),
  telemetrySummary: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    usageSummary: apiMocks.usageSummary,
    usageRecent: apiMocks.usageRecent,
    providerStates: apiMocks.providerStates,
    cloudflareBudget: apiMocks.cloudflareBudget,
    telemetrySummary: apiMocks.telemetrySummary,
  },
}));

vi.mock("@/components/OptimusDashboard", () => ({
  OptimusDashboard: () => null,
}));

vi.mock("@/components/TelemetryDashboard", () => ({
  TelemetryDashboard: () => null,
}));

vi.mock("@/components/CloudflareBudgetCard", () => ({
  CloudflareBudgetCard: ({ budget }: { budget: { neuronsUsed: number } }) =>
    createElement("div", { "data-testid": "cloudflare-budget-card" }, budget.neuronsUsed),
}));

vi.mock("@/components/ProviderStatCards", () => ({
  ProviderStatCards: () => null,
}));

vi.mock("@/components/LiveCapacityGrid", () => ({
  LiveCapacityGrid: () => null,
}));

vi.mock("@/components/ThemeToggle", () => ({
  ThemeToggle: () => null,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children }: { children?: ReactNode }) => createElement("button", null, children),
}));

vi.mock("react-router", () => ({
  Link: ({ to, children }: { to: string; children?: ReactNode }) =>
    createElement("a", { href: to }, children),
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) =>
      createElement("div", props, children),
  },
}));

vi.mock("lucide-react", () => ({
  ArrowLeft: () => null,
  BarChart3: () => null,
  Clock3: () => null,
  Layers: () => null,
}));

function configureQueries(cloudflareBudget: { neuronsUsed: number } | null | undefined) {
  apiMocks.usageSummary.mockResolvedValue(undefined);
  apiMocks.usageRecent.mockResolvedValue([]);
  apiMocks.providerStates.mockResolvedValue([]);
  apiMocks.telemetrySummary.mockResolvedValue(undefined);
  apiMocks.cloudflareBudget.mockResolvedValue(cloudflareBudget);
}

describe("ProviderUsage Cloudflare budget states", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not render the budget card while the query is loading", async () => {
    configureQueries(undefined);
    render(<ProviderUsage />);

    await screen.findByText("Provider control room");
    expect(screen.queryByTestId("cloudflare-budget-card")).not.toBeInTheDocument();
  });

  it("does not render the budget card when no budget record exists", async () => {
    configureQueries(null);
    render(<ProviderUsage />);

    await screen.findByText("Provider control room");
    expect(screen.queryByTestId("cloudflare-budget-card")).not.toBeInTheDocument();
  });

  it("renders the budget card when a budget record exists", async () => {
    configureQueries({ neuronsUsed: 42 });
    render(<ProviderUsage />);

    const card = await screen.findByTestId("cloudflare-budget-card");
    expect(card).toHaveTextContent("42");
  });
});
