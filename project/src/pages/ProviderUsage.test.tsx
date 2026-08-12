// @vitest-environment jsdom
import { createElement, type ReactNode } from "react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import ProviderUsage from "./ProviderUsage";

vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    providerUsage: {
      summary: "providerUsage.summary",
      recent: "providerUsage.recent",
    },
    rateLimits: {
      providerStates: "rateLimits.providerStates",
      cloudflareBudget: "rateLimits.cloudflareBudget",
    },
    generationTelemetry: {
      summary: "generationTelemetry.summary",
    },
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

const mockedUseQuery = vi.mocked(useQuery);
const cloudflareBudgetQuery = api.rateLimits.cloudflareBudget;

function configureQueries(cloudflareBudget: { neuronsUsed: number } | null | undefined) {
  mockedUseQuery.mockImplementation((query: unknown, _args?: unknown) => {
    if (query === cloudflareBudgetQuery) return cloudflareBudget;
    return undefined;
  });
}

describe("ProviderUsage Cloudflare budget states", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not render the budget card while the query is loading", () => {
    configureQueries(undefined);
    render(<ProviderUsage />);

    expect(screen.queryByTestId("cloudflare-budget-card")).not.toBeInTheDocument();
  });

  it("does not render the budget card when no budget record exists", () => {
    configureQueries(null);
    render(<ProviderUsage />);

    expect(screen.queryByTestId("cloudflare-budget-card")).not.toBeInTheDocument();
  });

  it("renders the budget card when a budget record exists", () => {
    configureQueries({ neuronsUsed: 42 });
    render(<ProviderUsage />);

    expect(screen.getByTestId("cloudflare-budget-card")).toHaveTextContent("42");
  });
});
