// @vitest-environment jsdom
import { createElement, type ReactNode } from "react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import History from "./History";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  params: { jobId: undefined as string | undefined },
  activeRunsAction: vi.fn(),
  archivedRunsAction: vi.fn(),
  cancelMutation: vi.fn(),
  createDeckWithCards: vi.fn(),
  addCards: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useAction: (query: unknown) =>
    query === "decryptActions.listActiveRunsAction"
      ? mocks.activeRunsAction
      : mocks.archivedRunsAction,
  useMutation: () => mocks.cancelMutation,
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    decryptActions: {
      listActiveRunsAction: "decryptActions.listActiveRunsAction",
      listArchivedRunsAction: "decryptActions.listArchivedRunsAction",
    },
    generationJobs: {
      cancel: "generationJobs.cancel",
    },
  },
}));

vi.mock("react-router", () => ({
  Link: ({ to, children }: { to: string; children?: ReactNode }) =>
    createElement("a", { href: to }, children),
  useNavigate: () => mocks.navigate,
  useParams: () => mocks.params,
}));

vi.mock("@/hooks/use-device-token", () => ({
  useDeviceToken: () => "test-device-token",
}));

vi.mock("@/hooks/use-deck-store", () => ({
  useDeckStore: () => ({
    activeDeckId: "active-deck",
    createDeckWithCards: mocks.createDeckWithCards,
    addCards: mocks.addCards,
  }),
}));

vi.mock("@/components/ArchivedRunViewer", () => ({
  ArchivedRunViewer: ({
    job,
  }: {
    job: { resultDeckName?: string; message: string };
  }) =>
    createElement(
      "div",
      { "data-testid": "archived-run-viewer" },
      job.resultDeckName ?? job.message,
    ),
}));

vi.mock("@/components/ThemeToggle", () => ({
  ThemeToggle: () => null,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    asChild: _asChild,
    variant: _variant,
    size: _size,
    ...props
  }: {
    children?: ReactNode;
    asChild?: boolean;
    variant?: string;
    size?: string;
    [key: string]: unknown;
  }) => createElement("button", props, children),
}));

vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: () => createElement("div", { "data-testid": "run-skeleton" }),
}));

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children?: ReactNode }) => children,
  MotionConfig: ({ children }: { children?: ReactNode }) => children,
  motion: {
    div: ({
      children,
      initial: _initial,
      animate: _animate,
      exit: _exit,
      layout: _layout,
      transition: _transition,
      ...props
    }: {
      children?: ReactNode;
      initial?: unknown;
      animate?: unknown;
      exit?: unknown;
      layout?: unknown;
      transition?: unknown;
      [key: string]: unknown;
    }) => createElement("div", props, children),
    button: ({
      children,
      initial: _initial,
      animate: _animate,
      exit: _exit,
      layout: _layout,
      transition: _transition,
      ...props
    }: {
      children?: ReactNode;
      initial?: unknown;
      animate?: unknown;
      exit?: unknown;
      layout?: unknown;
      transition?: unknown;
      [key: string]: unknown;
    }) => createElement("button", props, children),
    section: ({
      children,
      initial: _initial,
      animate: _animate,
      exit: _exit,
      layout: _layout,
      transition: _transition,
      ...props
    }: {
      children?: ReactNode;
      initial?: unknown;
      animate?: unknown;
      exit?: unknown;
      layout?: unknown;
      transition?: unknown;
      [key: string]: unknown;
    }) => createElement("section", props, children),
  },
}));

vi.mock("lucide-react", () => ({
  Activity: () => null,
  ArrowLeft: () => null,
  BarChart3: () => null,
  Clock3: () => null,
  Layers: () => null,
  Search: () => null,
  X: () => null,
}));

const now = Date.now();

function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    _id: "job-1",
    kind: "prompt",
    status: "succeeded",
    requestedCount: 3,
    progress: 1,
    etaSeconds: 0,
    timeoutSeconds: 60,
    deadlineAt: now,
    message: "Generated 3 cards",
    provider: "Groq",
    model: "Llama test model",
    providerIndex: 0,
    modelIndex: 0,
    totalProviders: 1,
    totalModels: 1,
    sectionIndex: 0,
    totalSections: 1,
    createdAt: now - 60_000,
    updatedAt: now,
    resultDeckName: "Biology basics",
    resultCards: [{ front: "What is ATP?", back: "Cellular energy" }],
    resultPartial: false,
    ...overrides,
  };
}

function configureRuns(active: unknown[], archived: unknown[]) {
  mocks.activeRunsAction.mockResolvedValue(active);
  mocks.archivedRunsAction.mockResolvedValue(archived);
}

describe("History dashboard states", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.params.jobId = undefined;
    configureRuns([], []);
  });

  it("shows loading skeletons while runs are being fetched", () => {
    mocks.activeRunsAction.mockReturnValue(new Promise(() => {}));
    mocks.archivedRunsAction.mockReturnValue(new Promise(() => {}));

    render(<History />);

    expect(screen.getAllByTestId("run-skeleton").length).toBeGreaterThan(0);
    expect(screen.getByText("Recent archives")).toBeInTheDocument();
  });

  it("shows the empty dashboard state when there are no active or archived runs", async () => {
    render(<History />);

    await waitFor(() =>
      expect(screen.getByText("No runs in progress")).toBeInTheDocument(),
    );
    expect(screen.getByText("No archived runs yet")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Archived runs will appear here after generation completes.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Nothing selected yet.")).toBeInTheDocument();
  });

  it("shows active generation progress and controls", async () => {
    const activeJob = makeJob({
      _id: "active-1",
      status: "running",
      message: "Generating biology cards",
      resultDeckName: undefined,
      progress: 0.45,
      etaSeconds: 18,
      deadlineAt: now + 18_000,
      resultCards: [],
    });
    configureRuns([activeJob], []);

    render(<History />);

    await waitFor(() =>
      expect(screen.getByText("Active generation runs")).toBeInTheDocument(),
    );
    expect(screen.getByText("Generating biology cards")).toBeInTheDocument();
    expect(screen.getByText("45%")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /view available cards/i }),
    ).toBeInTheDocument();
  });

  it("shows an archived run in the list and selected detail viewer", async () => {
    const archivedJob = makeJob({ _id: "archived-1" });
    mocks.params.jobId = "archived-1";
    configureRuns([], [archivedJob]);

    render(<History />);

    await waitFor(() =>
      expect(screen.getByTestId("run-list-item")).toBeInTheDocument(),
    );
    expect(screen.getAllByText("Biology basics").length).toBeGreaterThanOrEqual(
      2,
    );
    expect(screen.getByTestId("archived-run-viewer")).toHaveTextContent(
      "Biology basics",
    );
    expect(screen.getByText("Showing 1 archived run")).toBeInTheDocument();
  });
});
