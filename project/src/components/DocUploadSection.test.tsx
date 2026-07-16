// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import DocUploadSection from "./DocUploadSection";
import type { ProviderOption } from "@/types/providers";

const defaultProviders: ProviderOption[] = [
  { provider: "groq", label: "Groq", modelCount: 3 },
  { provider: "cloudflare", label: "Cloudflare Workers AI", modelCount: 2 },
];

const noop = () => {};
const noopAsync = async () => {};

function createRef() {
  return { current: null } as React.RefObject<HTMLInputElement | null>;
}

function renderSection(overrides: Record<string, unknown> = {}) {
  const props = {
    showDocUpload: true,
    docMode: "ai" as const,
    docCardCount: 10,
    docDifficulty: "intermediate" as const,
    docInstructions: "",
    docFileNames: [],
    cardType: "basic" as const,
    docChapters: [],
    chaptersDetected: false,
    selectedChapterIds: new Set<string>(),
    docPreviewCards: null,
    docPreviewText: "",
    docPreviewSummary: "",
    docPreviewWarnings: [],
    processing: false,
    dragActive: false,
    docFileInputRef: createRef(),
    preferredProvider: "auto",
    availableProviders: defaultProviders,
    loadingProviders: false,
    isScanned: false,
    ocrProgress: null,
    onRunOcr: noopAsync,
    onRemoveFile: noop,
    onToggle: noop,
    onModeChange: noop,
    onDocCardCountChange: noop,
    onDocDifficultyChange: noop,
    onCardTypeChange: noop,
    onDocInstructionsChange: noop,
    onToggleChapter: noop,
    onSelectAllChapters: noop,
    onProviderChange: noop,
    onRefreshProviders: noop,
    onStartRun: noopAsync,
    onAcceptCards: noop,
    onDiscard: noop,
    onEditDocCard: noop,
    onRemoveDocCard: noop,
    onDrag: noop,
    onDrop: noop,
    onFileChange: noop,
    onBrowseClick: noop,
    ...overrides,
  };
  return { ...render(<DocUploadSection {...props} />), props };
}

describe("DocUploadSection", () => {
  it("renders the heading", () => {
    renderSection();
    expect(screen.getByText("AUTO-GENERATE FROM DOCUMENT")).toBeInTheDocument();
  });

  it("calls onToggle when Close button is clicked", () => {
    const onToggle = vi.fn();
    renderSection({ onToggle });
    const closeBtn = screen.getAllByText("Close").find(
      (el) => el.tagName === "BUTTON" || el.closest("button")
    );
    fireEvent.click(closeBtn!);
    expect(onToggle).toHaveBeenCalled();
  });

  it("renders AI Smart and Quick Extract mode buttons", () => {
    renderSection();
    // Use getAllByText since text appears in button content
    const aiSmartBtns = screen.getAllByText(/AI Smart/);
    expect(aiSmartBtns.length).toBeGreaterThanOrEqual(1);
    const quickBtns = screen.getAllByText(/Quick Extract/);
    expect(quickBtns.length).toBeGreaterThanOrEqual(1);
  });

  it("calls onModeChange when Quick Extract is clicked", () => {
    const onModeChange = vi.fn();
    renderSection({ onModeChange });
    const quickBtns = screen.getAllByText(/Quick Extract/);
    fireEvent.click(quickBtns[0]);
    expect(onModeChange).toHaveBeenCalledWith("quick");
  });

  it("shows AI mode fields when docMode is ai", () => {
    renderSection({ docMode: "ai" });
    expect(screen.getByText("Card count")).toBeInTheDocument();
    expect(screen.getByText("Difficulty")).toBeInTheDocument();
    expect(screen.getByText("Provider")).toBeInTheDocument();
    expect(screen.getByText("Instructions for this document")).toBeInTheDocument();
  });

  it("hides AI mode fields when docMode is quick", () => {
    renderSection({ docMode: "quick" });
    expect(screen.queryByText("Card count")).not.toBeInTheDocument();
    expect(screen.queryByText("Difficulty")).not.toBeInTheDocument();
  });

  it("renders provider dropdown with options", () => {
    renderSection();
    const selects = screen.getAllByRole("combobox");
    const providerSelect = selects.find(
      (s) => (s as HTMLSelectElement).value === "auto"
    ) as HTMLSelectElement | undefined;
    expect(providerSelect).toBeDefined();
    expect(providerSelect!.options.length).toBe(3); // Auto + Groq + Cloudflare
  });

  it("calls onProviderChange when provider is selected", () => {
    const onProviderChange = vi.fn();
    renderSection({ onProviderChange });
    const selects = screen.getAllByRole("combobox");
    const providerSelect = selects.find(
      (s) => (s as HTMLSelectElement).value === "auto"
    ) as HTMLSelectElement;
    fireEvent.change(providerSelect, { target: { value: "groq" } });
    expect(onProviderChange).toHaveBeenCalledWith("groq");
  });

  it("shows Loading providers... when loadingProviders is true", () => {
    renderSection({ loadingProviders: true });
    expect(screen.getByText("Loading providers...")).toBeInTheDocument();
  });

  it("disables provider dropdown when loading", () => {
    renderSection({ loadingProviders: true });
    const selects = screen.getAllByRole("combobox");
    const providerSelect = selects.find(
      (s) => (s as HTMLSelectElement).value === "auto"
    ) as HTMLSelectElement;
    expect(providerSelect).toBeDisabled();
  });

  it("renders refresh button and calls onRefreshProviders", () => {
    const onRefreshProviders = vi.fn();
    renderSection({ onRefreshProviders });
    const refreshBtn = screen.getByTitle("Refresh providers");
    fireEvent.click(refreshBtn);
    expect(onRefreshProviders).toHaveBeenCalled();
  });

  it("disables refresh button when loading", () => {
    renderSection({ loadingProviders: true });
    const refreshBtn = screen.getByTitle("Refresh providers");
    expect(refreshBtn).toBeDisabled();
  });

  it("shows amber hint when card count is 0 in ai mode", () => {
    renderSection({ docMode: "ai", docCardCount: 0 });
    expect(screen.getByText(/Card count is 0/)).toBeInTheDocument();
  });

  it("does not show amber hint when card count > 0", () => {
    renderSection({ docMode: "ai", docCardCount: 5 });
    expect(screen.queryByText(/Card count is 0/)).not.toBeInTheDocument();
  });

  it("disables Start document run when card count is 0 in ai mode", () => {
    renderSection({
      docMode: "ai",
      docCardCount: 0,
      docFileNames: ["test.pdf"],
    });
    const startBtns = screen.getAllByText("Start document run");
    const startBtn = startBtns[startBtns.length - 1].closest("button");
    expect(startBtn).toBeDisabled();
  });

  it("shows file upload drop zone", () => {
    renderSection();
    expect(screen.getByText(/Drop a document here/)).toBeInTheDocument();
  });

  it("shows processing state", () => {
    renderSection({ processing: true });
    expect(screen.getByText("Processing document...")).toBeInTheDocument();
  });

  it("shows file info when docFileName is set and not processing", () => {
    renderSection({ docFileNames: ["lecture-notes.pdf"] });
    expect(screen.getByText("lecture-notes.pdf")).toBeInTheDocument();
    expect(screen.getByText(/Ready to generate/)).toBeInTheDocument();
  });

  it("does not show file info when processing", () => {
    renderSection({ docFileNames: ["lecture-notes.pdf"], processing: true });
    expect(screen.queryByText(/Ready to generate/)).not.toBeInTheDocument();
  });

  it("renders instructions textarea in ai mode", () => {
    renderSection({ docMode: "ai" });
    expect(screen.getByPlaceholderText(/Only create cards from chapters/)).toBeInTheDocument();
  });

  it("calls onBrowseClick when browse is clicked", () => {
    const onBrowseClick = vi.fn();
    renderSection({ onBrowseClick });
    const browseButtons = screen.getAllByText("browse");
    fireEvent.click(browseButtons[0]);
    expect(onBrowseClick).toHaveBeenCalled();
  });

  it("does not render preview when docPreviewCards is null", () => {
    renderSection({ docPreviewCards: null });
    expect(screen.queryByText(/AI GENERATED/)).not.toBeInTheDocument();
    expect(screen.queryByText(/EXTRACTED CARDS/)).not.toBeInTheDocument();
  });

  it("renders preview when docPreviewCards is provided", () => {
    renderSection({
      docPreviewCards: [{ front: "Q1", back: "A1" }],
      docFileNames: ["notes.pdf"],
      docMode: "ai",
    });
    expect(screen.getByText("AI GENERATED CARDS (1)")).toBeInTheDocument();
    expect(screen.getByText("From: notes.pdf")).toBeInTheDocument();
  });

  it("shows warnings when docPreviewWarnings is non-empty", () => {
    renderSection({
      docPreviewCards: [{ front: "Q", back: "A" }],
      docPreviewWarnings: ["Low quality text detected", "Some pages were blank"],
    });
    expect(screen.getByText("Run warnings")).toBeInTheDocument();
    expect(screen.getByText("Low quality text detected")).toBeInTheDocument();
    expect(screen.getByText("Some pages were blank")).toBeInTheDocument();
  });

  it("shows extracted text preview when docPreviewText is set", () => {
    renderSection({
      docPreviewCards: [{ front: "Q", back: "A" }],
      docPreviewText: "Chapter 1: Introduction to Biology...",
    });
    expect(screen.getByText("Extracted Text Preview")).toBeInTheDocument();
    expect(screen.getByText("Chapter 1: Introduction to Biology...")).toBeInTheDocument();
  });

  it("shows Extracted heading in quick mode preview", () => {
    renderSection({
      docMode: "quick",
      docPreviewCards: [{ front: "Q", back: "A" }],
      docFileNames: ["notes.txt"],
    });
    expect(screen.getByText("EXTRACTED CARDS (1)")).toBeInTheDocument();
  });

  it("hides Create New Deck button in quick mode preview", () => {
    renderSection({
      docMode: "quick",
      docPreviewCards: [{ front: "Q", back: "A" }],
      docFileNames: ["notes.txt"],
    });
    expect(screen.queryByText("Create New Deck")).not.toBeInTheDocument();
    expect(screen.getByText("Add to Current Deck")).toBeInTheDocument();
  });

  it("calls onStartRun with file name present", () => {
    const onStartRun = vi.fn();
    renderSection({ docFileNames: ["test.pdf"], onStartRun });
    const startBtns = screen.getAllByText("Start document run");
    fireEvent.click(startBtns[startBtns.length - 1]);
    expect(onStartRun).toHaveBeenCalled();
  });
});
