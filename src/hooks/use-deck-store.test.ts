// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { AnkiCard } from "@/lib/anki";
import type { Deck } from "@/hooks/use-deck-store";

// Persistent mock storage shared across resets
const mockStore: Record<string, string> = {};

import { useDeckStore } from "@/hooks/use-deck-store";

beforeEach(() => {
  // Clear storage between tests
  Object.keys(mockStore).forEach((k) => delete mockStore[k]);

  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: vi.fn((key: string) => mockStore[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        mockStore[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete mockStore[key];
      }),
      clear: vi.fn(() => {
        Object.keys(mockStore).forEach((k) => delete mockStore[k]);
      }),
      get length() {
        return Object.keys(mockStore).length;
      },
      key: vi.fn((i: number) => Object.keys(mockStore)[i] ?? null),
    },
    writable: true,
    configurable: true,
  });
});

describe("useDeckStore — initialization", () => {
  it("creates 3 starter decks when localStorage is empty", () => {
    const { result } = renderHook(() => useDeckStore());
    const store = result.current;

    expect(store.decks).toHaveLength(3);
    expect(store.decks[0].name).toBe("My First Deck");
    expect(store.decks[1].name).toBe("Study Deck");
    expect(store.decks[2].name).toBe("Review Deck");
    expect(store.activeDeckId).toBe(store.decks[0].id);
  });

  it("restores decks from localStorage when data exists", () => {
    const existingDecks: Deck[] = [
      { id: "abc123", name: "Saved Deck", cards: [] },
      { id: "def456", name: "Another Deck", cards: [{ front: "Q", back: "A" }] },
    ];
    mockStore["genanki-decks"] = JSON.stringify(existingDecks);

    const { result } = renderHook(() => useDeckStore());

    expect(result.current.decks).toHaveLength(2);
    expect(result.current.decks[0].name).toBe("Saved Deck");
    expect(result.current.decks[1].cards).toHaveLength(1);
    expect(result.current.activeDeckId).toBe("abc123");
  });

  it("falls back to starter decks when localStorage data is corrupted", () => {
    mockStore["genanki-decks"] = "not valid json{{{";

    const { result } = renderHook(() => useDeckStore());

    expect(result.current.decks).toHaveLength(3);
    expect(result.current.decks[0].name).toBe("My First Deck");
  });

  it("falls back to starter decks when localStorage is empty array", () => {
    mockStore["genanki-decks"] = "[]";

    const { result } = renderHook(() => useDeckStore());

    expect(result.current.decks).toHaveLength(3);
  });

  it("falls back when decks have missing id", () => {
    mockStore["genanki-decks"] = JSON.stringify([
      { name: "Bad Deck", cards: [] },
    ]);
    const { result } = renderHook(() => useDeckStore());
    expect(result.current.decks[0].name).toBe("My First Deck");
  });

  it("sanitizes invalid cards but preserves the deck", () => {
    mockStore["genanki-decks"] = JSON.stringify([
      { id: "x", name: "Test", cards: [{ front: "", back: "ok" }, { front: "ok", back: "ok" }] },
    ]);
    const { result } = renderHook(() => useDeckStore());
    expect(result.current.decks[0].name).toBe("Test");
    expect(result.current.decks[0].cards.length).toBe(1);
    expect(result.current.decks[0].cards[0].front).toBe("ok");
  });

  it("falls back when deck name is not a string", () => {
    mockStore["genanki-decks"] = JSON.stringify([
      { id: "x", name: 123, cards: [] },
    ]);
    const { result } = renderHook(() => useDeckStore());
    expect(result.current.decks[0].name).toBe("My First Deck");
  });

  it("falls back when cards is not an array", () => {
    mockStore["genanki-decks"] = JSON.stringify([
      { id: "x", name: "Test", cards: "not-array" },
    ]);
    const { result } = renderHook(() => useDeckStore());
    expect(result.current.decks[0].name).toBe("My First Deck");
  });

  it("initializes openedDeckId as null", () => {
    const { result } = renderHook(() => useDeckStore());
    expect(result.current.openedDeckId).toBeNull();
  });

  it("sets activeDeck from activeDeckId", () => {
    const { result } = renderHook(() => useDeckStore());
    expect(result.current.activeDeck).toBeDefined();
    expect(result.current.activeDeck!.id).toBe(result.current.activeDeckId);
  });
});

describe("useDeckStore — deck operations", () => {
  it("addDeck creates a new deck and makes it active", () => {
    const { result } = renderHook(() => useDeckStore());

    act(() => {
      result.current.addDeck();
    });

    expect(result.current.decks).toHaveLength(4);
    expect(result.current.decks[3].name).toBe("Deck 4");
    expect(result.current.decks[3].cards).toEqual([]);
    expect(result.current.activeDeckId).toBe(result.current.decks[3].id);
  });

  it("removeDeck removes a deck and switches active", () => {
    const { result } = renderHook(() => useDeckStore());
    const firstDeckId = result.current.decks[0].id;

    act(() => {
      result.current.removeDeck(firstDeckId, vi.fn());
    });

    expect(result.current.decks).toHaveLength(2);
    expect(result.current.decks.find((d: Deck) => d.id === firstDeckId)).toBeUndefined();
    // Active should switch to the first remaining deck
    expect(result.current.activeDeckId).toBe(result.current.decks[0].id);
  });

  it("removeDeck shows toast when trying to remove last deck", () => {
    const { result } = renderHook(() => useDeckStore());
    const toast = vi.fn();

    // Remove 2 decks to get down to 1
    act(() => {
      result.current.removeDeck(result.current.decks[0].id, vi.fn());
    });
    act(() => {
      result.current.removeDeck(result.current.decks[0].id, vi.fn());
    });

    // Now try to remove the last one
    act(() => {
      result.current.removeDeck(result.current.decks[0].id, toast);
    });

    expect(toast).toHaveBeenCalledWith("You need at least one deck");
    expect(result.current.decks).toHaveLength(1);
  });

  it("renameDeck updates the deck name", () => {
    const { result } = renderHook(() => useDeckStore());
    const firstId = result.current.decks[0].id;

    act(() => {
      result.current.renameDeck(firstId, "Renamed Deck");
    });

    expect(result.current.decks[0].name).toBe("Renamed Deck");
  });

  it("renameDeck ignores empty names", () => {
    const { result } = renderHook(() => useDeckStore());
    const originalName = result.current.decks[0].name;

    act(() => {
      result.current.renameDeck(result.current.decks[0].id, "  ");
    });

    expect(result.current.decks[0].name).toBe(originalName);
  });
});

describe("useDeckStore — card operations", () => {
  it("addCard appends a card to the specified deck", () => {
    const { result } = renderHook(() => useDeckStore());
    const deckId = result.current.decks[0].id;

    act(() => {
      result.current.addCard(deckId, "Front text", "Back text");
    });

    expect(result.current.decks[0].cards).toHaveLength(1);
    expect(result.current.decks[0].cards[0].front).toBe("Front text");
    expect(result.current.decks[0].cards[0].back).toBe("Back text");
  });

  it("addCards appends multiple cards at once", () => {
    const { result } = renderHook(() => useDeckStore());
    const deckId = result.current.decks[0].id;
    const newCards: AnkiCard[] = [
      { front: "Q1", back: "A1" },
      { front: "Q2", back: "A2" },
    ];

    act(() => {
      result.current.addCards(deckId, newCards);
    });

    expect(result.current.decks[0].cards).toHaveLength(2);
  });

  it("removeCard removes a card by index", () => {
    const { result } = renderHook(() => useDeckStore());
    const deckId = result.current.decks[0].id;

    act(() => {
      result.current.addCard(deckId, "Q1", "A1");
      result.current.addCard(deckId, "Q2", "A2");
      result.current.addCard(deckId, "Q3", "A3");
    });

    act(() => {
      result.current.removeCard(deckId, 1);
    });

    expect(result.current.decks[0].cards).toHaveLength(2);
    expect(result.current.decks[0].cards[0].front).toBe("Q1");
    expect(result.current.decks[0].cards[1].front).toBe("Q3");
  });

  it("editCard updates a card at a specific index", () => {
    const { result } = renderHook(() => useDeckStore());
    const deckId = result.current.decks[0].id;

    act(() => {
      result.current.addCard(deckId, "Old front", "Old back");
    });

    act(() => {
      result.current.editCard(deckId, 0, "New front", "New back");
    });

    expect(result.current.decks[0].cards[0].front).toBe("New front");
    expect(result.current.decks[0].cards[0].back).toBe("New back");
  });

  it("createDeckWithCards creates a deck with pre-populated cards", () => {
    const { result } = renderHook(() => useDeckStore());
    const cards: AnkiCard[] = [
      { front: "Pre Q1", back: "Pre A1" },
      { front: "Pre Q2", back: "Pre A2" },
    ];

    let newDeckId: string;
    act(() => {
      const deck = result.current.createDeckWithCards("Pre-populated", cards);
      newDeckId = deck.id;
    });

    const newDeck = result.current.decks.find((d: Deck) => d.id === newDeckId!);
    expect(newDeck).toBeDefined();
    expect(newDeck!.cards).toHaveLength(2);
    expect(newDeck!.name).toBe("Pre-populated");
    expect(result.current.activeDeckId).toBe(newDeckId!);
    expect(result.current.openedDeckId).toBe(newDeckId!);
  });
});

describe("useDeckStore — store management", () => {
  it("totalCards sums all cards across decks", () => {
    const { result } = renderHook(() => useDeckStore());

    act(() => {
      result.current.addCard(result.current.decks[0].id, "Q1", "A1");
      result.current.addCard(result.current.decks[0].id, "Q2", "A2");
      result.current.addCard(result.current.decks[1].id, "Q3", "A3");
    });

    expect(result.current.totalCards).toBe(3);
  });

  it("setActiveDeckId switches the active deck", () => {
    const { result } = renderHook(() => useDeckStore());
    const secondId = result.current.decks[1].id;

    act(() => {
      result.current.setActiveDeckId(secondId);
    });

    expect(result.current.activeDeckId).toBe(secondId);
    expect(result.current.activeDeck!.id).toBe(secondId);
  });

  it("setOpenedDeckId tracks opened deck separately", () => {
    const { result } = renderHook(() => useDeckStore());

    act(() => {
      result.current.setOpenedDeckId(result.current.decks[2].id);
    });

    expect(result.current.openedDeckId).toBe(result.current.decks[2].id);
    expect(result.current.openedDeck!.id).toBe(result.current.decks[2].id);
  });

  it("removing the opened deck resets openedDeckId to null", () => {
    const { result } = renderHook(() => useDeckStore());
    const deckId = result.current.decks[0].id;

    act(() => {
      result.current.setOpenedDeckId(deckId);
    });
    expect(result.current.openedDeckId).toBe(deckId);

    act(() => {
      result.current.removeDeck(deckId, () => {});
    });
    expect(result.current.openedDeckId).toBeNull();
  });

  it("removing the active deck switches to next available", () => {
    const { result } = renderHook(() => useDeckStore());
    const firstId = result.current.decks[0].id;

    act(() => {
      result.current.setActiveDeckId(firstId);
    });

    act(() => {
      result.current.removeDeck(firstId, () => {});
    });
    expect(result.current.activeDeckId).not.toBe(firstId);
  });

  it("saves to localStorage on state changes", () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useDeckStore());
    const deckId = result.current.decks[0].id;

    act(() => {
      result.current.addCard(deckId, "Save me", "Please");
    });

    // The save is debounced at 500ms — advance timers past the debounce
    act(() => {
      vi.advanceTimersByTime(600);
    });

    // localStorage.setItem should have been called
    expect(localStorage.setItem).toHaveBeenCalled();
    const savedData = (localStorage.setItem as ReturnType<typeof vi.fn>).mock.calls.find(
      (call: unknown[]) => call[0] === "genanki-decks",
    );
    expect(savedData).toBeDefined();

    // Verify the saved data is valid JSON with our card
    const parsed = JSON.parse(savedData![1]);
    expect(parsed[0].cards).toHaveLength(1);
    expect(parsed[0].cards[0].front).toBe("Save me");

    unmount();
    vi.useRealTimers();
  });
});
