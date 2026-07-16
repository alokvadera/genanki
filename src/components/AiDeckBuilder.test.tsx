// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import AiDeckBuilder from "./AiDeckBuilder";
import type { ProviderOption } from "@/types/providers";

const defaultProviders: ProviderOption[] = [
  { provider: "groq", label: "Groq", modelCount: 3 },
  { provider: "cerebras", label: "Cerebras", modelCount: 2 },
];

const noop = () => {};
const noopAsync = async () => {};

function renderBuilder(overrides: Record<string, unknown> = {}) {
  const props = {
    showAiBuilder: true,
    aiPrompt: "",
    aiDeckName: "",
    aiCardCount: 10,
    aiDifficulty: "intermediate" as const,
    aiPreviewCards: null,
    aiPreviewDeckName: "",
    aiPreviewSummary: "",
    aiGenerating: false,
    activeDeckName: undefined,
    preferredProvider: "auto",
    cardType: "basic" as const,
    availableProviders: defaultProviders,
    loadingProviders: false,
    onToggle: noop,
    onPromptChange: noop,
    onCardTypeChange: noop,
    onDeckNameChange: noop,
    onCardCountChange: noop,
    onDifficultyChange: noop,
    onProviderChange: noop,
    onRefreshProviders: noop,
    onGenerate: noopAsync,
    onAcceptCards: noop,
    onDiscard: noop,
    onAiPreviewEdit: noop,
    onAiPreviewRemove: noop,
    ...overrides,
  };
  return { ...render(<AiDeckBuilder {...props} />), props };
}

describe("AiDeckBuilder", () => {
  it("renders the heading", () => {
    renderBuilder();
    expect(screen.getByText("AI DECK BUILDER")).toBeInTheDocument();
  });

  it("calls onToggle when Close button is clicked", () => {
    const onToggle = vi.fn();
    renderBuilder({ onToggle });
    // Find the toggle button (it says "Close" when open)
    const closeBtn = screen.getAllByText("Close").find(
      (el) => el.tagName === "BUTTON" || el.closest("button")
    );
    fireEvent.click(closeBtn!);
    expect(onToggle).toHaveBeenCalled();
  });

  it("shows form fields when showAiBuilder is true", () => {
    renderBuilder();
    // Labels are rendered as <label> elements
    expect(screen.getByText("Deck name")).toBeInTheDocument();
    expect(screen.getByText("Card count")).toBeInTheDocument();
    expect(screen.getByText("Difficulty")).toBeInTheDocument();
    expect(screen.getByText("Provider")).toBeInTheDocument();
  });

  it("renders provider dropdown with available providers", () => {
    renderBuilder();
    // The provider select has Auto as default
    const selects = screen.getAllByRole("combobox");
    const providerSelect = selects.find(
      (s) => (s as HTMLSelectElement).value === "auto"
    ) as HTMLSelectElement | undefined;
    expect(providerSelect).toBeDefined();
    expect(providerSelect!.options.length).toBe(3); // Auto + Groq + Cerebras
  });

  it("calls onProviderChange when provider is selected", () => {
    const onProviderChange = vi.fn();
    renderBuilder({ onProviderChange });
    const selects = screen.getAllByRole("combobox");
    const providerSelect = selects.find(
      (s) => (s as HTMLSelectElement).value === "auto"
    ) as HTMLSelectElement;
    fireEvent.change(providerSelect, { target: { value: "groq" } });
    expect(onProviderChange).toHaveBeenCalledWith("groq");
  });

  it("shows Loading providers... when loadingProviders is true", () => {
    renderBuilder({ loadingProviders: true });
    expect(screen.getByText("Loading providers...")).toBeInTheDocument();
  });

  it("disables provider dropdown when loading", () => {
    renderBuilder({ loadingProviders: true });
    const selects = screen.getAllByRole("combobox");
    const providerSelect = selects.find(
      (s) => (s as HTMLSelectElement).value === "auto"
    ) as HTMLSelectElement;
    expect(providerSelect).toBeDisabled();
  });

  it("renders refresh button and calls onRefreshProviders", () => {
    const onRefreshProviders = vi.fn();
    renderBuilder({ onRefreshProviders });
    const refreshBtn = screen.getByTitle("Refresh providers");
    fireEvent.click(refreshBtn);
    expect(onRefreshProviders).toHaveBeenCalled();
  });

  it("disables refresh button when loading", () => {
    renderBuilder({ loadingProviders: true });
    const refreshBtn = screen.getByTitle("Refresh providers");
    expect(refreshBtn).toBeDisabled();
  });

  it("shows amber hint when card count is 0", () => {
    renderBuilder({ aiCardCount: 0 });
    expect(screen.getByText(/Card count is 0/)).toBeInTheDocument();
  });

  it("does not show amber hint when card count > 0", () => {
    renderBuilder({ aiCardCount: 5 });
    expect(screen.queryByText(/Card count is 0/)).not.toBeInTheDocument();
  });

  it("disables Generate button when card count is 0", () => {
    renderBuilder({ aiCardCount: 0 });
    const genBtn = screen.getByText("Generate").closest("button");
    expect(genBtn).toBeDisabled();
  });

  it("enables Generate button when card count > 0", () => {
    renderBuilder({ aiCardCount: 5 });
    const genBtn = screen.getByText("Generate").closest("button");
    expect(genBtn).not.toBeDisabled();
  });

  it("shows loading spinner when generating", () => {
    renderBuilder({ aiGenerating: true });
    expect(screen.getByText("Generating...")).toBeInTheDocument();
  });

  it("calls onCardCountChange with rounded value", () => {
    const onCardCountChange = vi.fn();
    renderBuilder({ onCardCountChange });
    // Find the number input (type=number)
    const inputs = screen.getAllByRole("spinbutton");
    fireEvent.change(inputs[0], { target: { value: "15" } });
    expect(onCardCountChange).toHaveBeenCalledWith(15);
  });

  it("calls onCardCountChange with 0 when input is cleared", () => {
    const onCardCountChange = vi.fn();
    renderBuilder({ onCardCountChange });
    const inputs = screen.getAllByRole("spinbutton");
    fireEvent.change(inputs[0], { target: { value: "" } });
    expect(onCardCountChange).toHaveBeenCalledWith(0);
  });

  it("renders prompt textarea", () => {
    renderBuilder();
    expect(screen.getByPlaceholderText(/Example: Create a deck/)).toBeInTheDocument();
  });

  it("does not render preview section when aiPreviewCards is null", () => {
    renderBuilder({ aiPreviewCards: null });
    expect(screen.queryByText(/AI GENERATED CARDS/)).not.toBeInTheDocument();
  });

  it("renders preview section when aiPreviewCards is provided", () => {
    renderBuilder({
      aiPreviewCards: [
        { front: "What is ATP?", back: "Energy" },
        { front: "What is DNA?", back: "Genetic" },
      ],
      aiPreviewDeckName: "Biology",
      aiPreviewSummary: "Key biology terms",
    });
    expect(screen.getByText("AI GENERATED CARDS (2)")).toBeInTheDocument();
    expect(screen.getByText("Biology")).toBeInTheDocument();
    expect(screen.getByText("Key biology terms")).toBeInTheDocument();
  });

  it("shows Add to Current Deck and Create New Deck buttons in preview", () => {
    const onAcceptCards = vi.fn();
    renderBuilder({
      aiPreviewCards: [{ front: "Q", back: "A" }],
      onAcceptCards,
    });
    const addBtn = screen.getByText("Add to Current Deck");
    fireEvent.click(addBtn);
    expect(onAcceptCards).toHaveBeenCalledWith(false);

    const createBtn = screen.getByText("Create New Deck");
    fireEvent.click(createBtn);
    expect(onAcceptCards).toHaveBeenCalledWith(true);
  });

  it("shows Discard button in preview", () => {
    const onDiscard = vi.fn();
    renderBuilder({
      aiPreviewCards: [{ front: "Q", back: "A" }],
      onDiscard,
    });
    const discardBtns = screen.getAllByText("Discard");
    fireEvent.click(discardBtns[discardBtns.length - 1]);
    expect(onDiscard).toHaveBeenCalled();
  });
});
