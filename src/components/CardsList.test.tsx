// @vitest-environment jsdom
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import CardsList from "./CardsList";
import type { AnkiCard } from "@/lib/anki";
import type { Deck } from "@/hooks/use-deck-store";

const mockCards: AnkiCard[] = [
  { front: "What is 2+2?", back: "4" },
  { front: "Capital of France", back: "Paris" },
  { front: "Largest planet", back: "Jupiter" },
];

const mockDeck: Deck = {
  id: "deck-1",
  name: "Test Deck",
  cards: mockCards,
};

const emptyDeck: Deck = {
  id: "deck-2",
  name: "Empty Deck",
  cards: [],
};

const noop = () => {};

/** Find the card row containing a given card's front text. */
function getCardRow(frontText: string): HTMLElement {
  const front = screen.getByText(frontText);
  return front.closest("[class*='flex']")!.parentElement! as HTMLElement;
}

describe("CardsList", () => {
  const defaultProps = {
    activeDeck: mockDeck,
    activeDeckId: "deck-1",
    onRemoveCard: noop,
    onPreview: noop,
  };

  it("renders the heading with correct card count", () => {
    render(<CardsList {...defaultProps} />);
    expect(screen.getByText("CARDS (3)")).toBeInTheDocument();
  });

  it("renders all cards with front and back", () => {
    render(<CardsList {...defaultProps} />);
    expect(screen.getByText("What is 2+2?")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("Capital of France")).toBeInTheDocument();
    expect(screen.getByText("Paris")).toBeInTheDocument();
    expect(screen.getByText("Largest planet")).toBeInTheDocument();
    expect(screen.getByText("Jupiter")).toBeInTheDocument();
  });

  it("renders card numbers (1-indexed)", () => {
    render(<CardsList {...defaultProps} />);
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("shows empty state when deck has no cards", () => {
    render(<CardsList {...defaultProps} activeDeck={emptyDeck} />);
    expect(screen.getByText("CARDS (0)")).toBeInTheDocument();
    expect(screen.getByText("No cards yet")).toBeInTheDocument();
    expect(screen.getByText("Upload a document above or add cards manually")).toBeInTheDocument();
  });

  it("shows empty state when activeDeck is undefined", () => {
    render(<CardsList {...defaultProps} activeDeck={undefined} />);
    expect(screen.getByText("CARDS (0)")).toBeInTheDocument();
  });

  it("calls onPreview when preview button is clicked", () => {
    const onPreview = vi.fn();
    render(<CardsList {...defaultProps} onPreview={onPreview} />);
    const previewButtons = screen.getAllByTitle("Preview");
    fireEvent.click(previewButtons[0]);
    expect(onPreview).toHaveBeenCalledWith(mockCards[0]);
  });

  it("calls onPreview for the correct card when clicking second preview", () => {
    const onPreview = vi.fn();
    render(<CardsList {...defaultProps} onPreview={onPreview} />);
    const previewButtons = screen.getAllByTitle("Preview");
    fireEvent.click(previewButtons[1]);
    expect(onPreview).toHaveBeenCalledWith(mockCards[1]);
  });

  it("calls onRemoveCard when delete button is clicked for first card", () => {
    const onRemoveCard = vi.fn();
    render(<CardsList {...defaultProps} onRemoveCard={onRemoveCard} />);
    const cardRow = getCardRow("What is 2+2?");
    const buttons = within(cardRow).getAllByRole("button");
    // Delete button is the last one (has destructive class)
    fireEvent.click(buttons[buttons.length - 1]);
    expect(onRemoveCard).toHaveBeenCalledWith("deck-1", 0);
  });

  it("expands card details when expand button is clicked", () => {
    render(<CardsList {...defaultProps} />);
    const cardRow = getCardRow("What is 2+2?");
    const buttons = within(cardRow).getAllByRole("button");
    // Click chevron to expand
    fireEvent.click(buttons[2]);
    expect(screen.getByText("Front")).toBeInTheDocument();
    expect(screen.getByText("Back")).toBeInTheDocument();
  });

  it("collapses expanded card when expand button is clicked again", async () => {
    render(<CardsList {...defaultProps} />);
    const cardRow = getCardRow("What is 2+2?");
    const buttons = within(cardRow).getAllByRole("button");
    // Expand
    fireEvent.click(buttons[2]);
    expect(screen.getByText("Front")).toBeInTheDocument();
    // Collapse
    fireEvent.click(buttons[2]);
    // framer-motion AnimatePresence keeps the element briefly during exit animation
    await waitFor(() => {
      const frontLabels = screen.queryAllByText("Front");
      expect(frontLabels.length).toBe(0);
    });
  });

  it("can expand multiple cards simultaneously", () => {
    render(<CardsList {...defaultProps} />);
    const card0Row = getCardRow("What is 2+2?");
    const card1Row = getCardRow("Capital of France");
    const card0Buttons = within(card0Row).getAllByRole("button");
    const card1Buttons = within(card1Row).getAllByRole("button");
    // Expand both
    fireEvent.click(card0Buttons[2]);
    fireEvent.click(card1Buttons[2]);
    // Both should have Front/Back labels
    const frontLabels = screen.queryAllByText("Front");
    expect(frontLabels.length).toBe(2);
  });

  it("shows card front and back in expanded detail view", () => {
    render(<CardsList {...defaultProps} />);
    const card0Row = getCardRow("What is 2+2?");
    const buttons = within(card0Row).getAllByRole("button");
    fireEvent.click(buttons[2]);
    expect(screen.getByText("Front")).toBeInTheDocument();
    expect(screen.getByText("Back")).toBeInTheDocument();
  });
});
