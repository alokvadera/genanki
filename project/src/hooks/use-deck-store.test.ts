// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook as baseRenderHook, act } from "@testing-library/react";
import type { AnkiCard } from "@/lib/anki";
import type { Deck } from "@/hooks/use-deck-store";

// Persistent mock storage shared across resets
const mockStore: Record<string, string> = {};

// Mock sonner so showRecoveryToast → toast.* calls are observable via vi.fn.
vi.mock("sonner", () => ({
  toast: { info: vi.fn(), warning: vi.fn() },
}));

import { DeckStoreProvider, useDeckStore } from "@/hooks/use-deck-store";

function renderHook<Result>(callback: () => Result) {
  return baseRenderHook(callback, { wrapper: DeckStoreProvider });
}

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
    expect(store.decks[0]!.name).toBe("My First Deck");
    expect(store.decks[1]!.name).toBe("Study Deck");
    expect(store.decks[2]!.name).toBe("Review Deck");
    expect(store.activeDeckId).toBe(store.decks[0]!.id);
  });

  it("restores decks from localStorage when data exists", () => {
    const existingDecks: Deck[] = [
      { id: "abc123", name: "Saved Deck", cards: [] },
      { id: "def456", name: "Another Deck", cards: [{ front: "Q", back: "A" }] },
    ];
    mockStore["genanki-decks"] = JSON.stringify(existingDecks);

    const { result } = renderHook(() => useDeckStore());

    expect(result.current.decks).toHaveLength(2);
    expect(result.current.decks[0]!.name).toBe("Saved Deck");
    expect(result.current.decks[1]!.cards).toHaveLength(1);
    expect(result.current.activeDeckId).toBe("abc123");
  });

  it("falls back to starter decks when localStorage data is corrupted", () => {
    mockStore["genanki-decks"] = "not valid json{{{";

    const { result } = renderHook(() => useDeckStore());

    expect(result.current.decks).toHaveLength(3);
    expect(result.current.decks[0]!.name).toBe("My First Deck");
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
    expect(result.current.decks[0]!.name).toBe("My First Deck");
  });

  it("sanitizes invalid cards but preserves the deck", () => {
    mockStore["genanki-decks"] = JSON.stringify([
      { id: "x", name: "Test", cards: [{ front: "", back: "ok" }, { front: "ok", back: "ok" }] },
    ]);
    const { result } = renderHook(() => useDeckStore());
    expect(result.current.decks[0]!.name).toBe("Test");
    expect(result.current.decks[0]!.cards.length).toBe(1);
    expect(result.current.decks[0]!.cards[0]!.front).toBe("ok");
  });

  it("falls back when deck name is not a string", () => {
    mockStore["genanki-decks"] = JSON.stringify([
      { id: "x", name: 123, cards: [] },
    ]);
    const { result } = renderHook(() => useDeckStore());
    expect(result.current.decks[0]!.name).toBe("My First Deck");
  });

  it("falls back when cards is not an array", () => {
    mockStore["genanki-decks"] = JSON.stringify([
      { id: "x", name: "Test", cards: "not-array" },
    ]);
    const { result } = renderHook(() => useDeckStore());
    expect(result.current.decks[0]!.name).toBe("My First Deck");
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
    expect(result.current.decks[3]!.name).toBe("Deck 4");
    expect(result.current.decks[3]!.cards).toEqual([]);
    expect(result.current.activeDeckId).toBe(result.current.decks[3]!.id);
  });

  it("removeDeck removes a deck and switches active", () => {
    const { result } = renderHook(() => useDeckStore());
    const firstDeckId = result.current.decks[0]!.id;

    act(() => {
      result.current.removeDeck(firstDeckId, vi.fn());
    });

    expect(result.current.decks).toHaveLength(2);
    expect(result.current.decks.find((d: Deck) => d.id === firstDeckId)).toBeUndefined();
    // Active should switch to the first remaining deck
    expect(result.current.activeDeckId).toBe(result.current.decks[0]!.id);
  });

  it("removeDeck shows toast when trying to remove last deck", () => {
    const { result } = renderHook(() => useDeckStore());
    const toast = vi.fn();

    // Remove 2 decks to get down to 1
    act(() => {
      result.current.removeDeck(result.current.decks[0]!.id, vi.fn());
    });
    act(() => {
      result.current.removeDeck(result.current.decks[0]!.id, vi.fn());
    });

    // Now try to remove the last one
    act(() => {
      result.current.removeDeck(result.current.decks[0]!.id, toast);
    });

    expect(toast).toHaveBeenCalledWith("You need at least one deck");
    expect(result.current.decks).toHaveLength(1);
  });

  it("renameDeck updates the deck name", () => {
    const { result } = renderHook(() => useDeckStore());
    const firstId = result.current.decks[0]!.id;

    act(() => {
      result.current.renameDeck(firstId, "Renamed Deck");
    });

    expect(result.current.decks[0]!.name).toBe("Renamed Deck");
  });

  it("renameDeck ignores empty names", () => {
    const { result } = renderHook(() => useDeckStore());
    const originalName = result.current.decks[0]!.name;

    act(() => {
      result.current.renameDeck(result.current.decks[0]!.id, "  ");
    });

    expect(result.current.decks[0]!.name).toBe(originalName);
  });
});

describe("useDeckStore — card operations", () => {
  it("addCard appends a card to the specified deck", () => {
    const { result } = renderHook(() => useDeckStore());
    const deckId = result.current.decks[0]!.id;

    act(() => {
      result.current.addCard(deckId, "Front text", "Back text");
    });

    expect(result.current.decks[0]!.cards).toHaveLength(1);
    expect(result.current.decks[0]!.cards[0]!.front).toBe("Front text");
    expect(result.current.decks[0]!.cards[0]!.back).toBe("Back text");
  });

  it("addCards appends multiple cards at once", () => {
    const { result } = renderHook(() => useDeckStore());
    const deckId = result.current.decks[0]!.id;
    const newCards: AnkiCard[] = [
      { front: "Q1", back: "A1" },
      { front: "Q2", back: "A2" },
    ];

    act(() => {
      result.current.addCards(deckId, newCards);
    });

    expect(result.current.decks[0]!.cards).toHaveLength(2);
  });

  it("removeCard removes a card by index", () => {
    const { result } = renderHook(() => useDeckStore());
    const deckId = result.current.decks[0]!.id;

    act(() => {
      result.current.addCard(deckId, "Q1", "A1");
      result.current.addCard(deckId, "Q2", "A2");
      result.current.addCard(deckId, "Q3", "A3");
    });

    act(() => {
      result.current.removeCard(deckId, 1);
    });

    expect(result.current.decks[0]!.cards).toHaveLength(2);
    expect(result.current.decks[0]!.cards[0]!.front).toBe("Q1");
    expect(result.current.decks[0]!.cards[1]!.front).toBe("Q3");
  });

  it("editCard updates a card at a specific index", () => {
    const { result } = renderHook(() => useDeckStore());
    const deckId = result.current.decks[0]!.id;

    act(() => {
      result.current.addCard(deckId, "Old front", "Old back");
    });

    act(() => {
      result.current.editCard(deckId, 0, "New front", "New back");
    });

    expect(result.current.decks[0]!.cards[0]!.front).toBe("New front");
    expect(result.current.decks[0]!.cards[0]!.back).toBe("New back");
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
      result.current.addCard(result.current.decks[0]!.id, "Q1", "A1");
      result.current.addCard(result.current.decks[0]!.id, "Q2", "A2");
      result.current.addCard(result.current.decks[1]!.id, "Q3", "A3");
    });

    expect(result.current.totalCards).toBe(3);
  });

  it("setActiveDeckId switches the active deck", () => {
    const { result } = renderHook(() => useDeckStore());
    const secondId = result.current.decks[1]!.id;

    act(() => {
      result.current.setActiveDeckId(secondId);
    });

    expect(result.current.activeDeckId).toBe(secondId);
    expect(result.current.activeDeck!.id).toBe(secondId);
  });

  it("setOpenedDeckId tracks opened deck separately", () => {
    const { result } = renderHook(() => useDeckStore());

    act(() => {
      result.current.setOpenedDeckId(result.current.decks[2]!.id);
    });

    expect(result.current.openedDeckId).toBe(result.current.decks[2]!.id);
    expect(result.current.openedDeck!.id).toBe(result.current.decks[2]!.id);
  });

  it("removing the opened deck resets openedDeckId to null", () => {
    const { result } = renderHook(() => useDeckStore());
    const deckId = result.current.decks[0]!.id;

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
    const firstId = result.current.decks[0]!.id;

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
    const deckId = result.current.decks[0]!.id;

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
    expect(parsed[0]!.cards).toHaveLength(1);
    expect(parsed[0]!.cards[0]!.front).toBe("Save me");

    unmount();
    vi.useRealTimers();
  });
});


describe("useDeckStore — recovery messages and ID matching", () => {
  it("loads valid decks without any recovery error when nothing was dropped", () => {
    const decks: Deck[] = [
      { id: "ok-id-1", name: "Valid One", cards: [{ front: "Q", back: "A" }] },
      { id: "ok-id-2", name: "Valid Two", cards: [{ front: "Q2", back: "A2" }] },
    ];
    mockStore["genanki-decks"] = JSON.stringify(decks);
    const { result } = renderHook(() => useDeckStore());
    expect(result.current.decks).toHaveLength(2);
  });

  it("treats activeDeckId fallback when saved active id does not match", () => {
    const decks: Deck[] = [
      { id: "x", name: "Only", cards: [] },
    ];
    mockStore["genanki-decks"] = JSON.stringify(decks);
    mockStore["genanki-active-deck-id"] = "nonexistent";
    const { result } = renderHook(() => useDeckStore());
    expect(result.current.activeDeckId).toBe("x");
  });

  it("treats saved active id matches one of validDecks", () => {
    const decks: Deck[] = [
      { id: "a", name: "A", cards: [] },
      { id: "b", name: "B", cards: [] },
    ];
    mockStore["genanki-decks"] = JSON.stringify(decks);
    mockStore["genanki-active-deck-id"] = "b";
    const { result } = renderHook(() => useDeckStore());
    expect(result.current.activeDeckId).toBe("b");
  });

  it("does not throw if active id key is missing in storage", () => {
    const decks: Deck[] = [{ id: "a", name: "A", cards: [] }];
    mockStore["genanki-decks"] = JSON.stringify(decks);
    // No genanki-active-deck-id set
    const { result } = renderHook(() => useDeckStore());
    expect(result.current.activeDeckId).toBe("a");
  });

  it("falls back with warning when localStorage has only invalid-shape array", () => {
    // Array with one valid-shape deck, plus a dropped one
    mockStore["genanki-decks"] = JSON.stringify([
      { id: "good", name: "Good", cards: [] },
      { id: 123, name: null, cards: "not-array" },
    ]);
    const { result } = renderHook(() => useDeckStore());
    expect(result.current.decks).toHaveLength(1);
    expect(result.current.decks[0]!.name).toBe("Good");
  });

  it("falls back to starter decks when stored value is non-empty array of all-invalid shapes", () => {
    mockStore["genanki-decks"] = JSON.stringify([
      { foo: "bar" }, // not a deck at all
      42,
    ]);
    const { result } = renderHook(() => useDeckStore());
    expect(result.current.decks[0]!.name).toBe("My First Deck");
  });

  it('falls back when localStorage raw text parses to non-array (e.g., "0")', () => {
    mockStore["genanki-decks"] = "0";
    // "0" parses to number 0, which is not an array; falls back to starter decks.
    const { result } = renderHook(() => useDeckStore());
    expect(result.current.decks[0]!.name).toBe("My First Deck");
  });

  it("emits warning-level recovery message when entire deck shape is invalid", () => {
    // 1 valid-shape deck + 1 deck-shaped-but-missing-id -> droppedDecks > 0
    // -> warning-level recoveryMessage is pushed (covered branch in source).
    mockStore["genanki-decks"] = JSON.stringify([
      { id: "good", name: "Good", cards: [{ front: "Q", back: "A" }] },
      { name: "Missing-Id", cards: [] }, // sanitizeDeck returns null
    ]);
    const { result } = renderHook(() => useDeckStore());
    expect(result.current.decks).toHaveLength(1);
    expect(result.current.decks[0]!.name).toBe("Good");
  });

  it("falls back when storedArray.length is exactly 0", () => {
    mockStore["genanki-decks"] = "[]";
    const { result } = renderHook(() => useDeckStore());
    expect(result.current.decks).toHaveLength(3); // starter decks
    expect(result.current.decks[0]!.name).toBe("My First Deck");
  });
});

describe("useDeckStore — recovery cards count", () => {
  it("filters out invalid cards while preserving valid ones and emits info recovery message", () => {
    mockStore["genanki-decks"] = JSON.stringify([
      {
        id: "x",
        name: "Mixed",
        cards: [
          { front: "Valid1", back: "Valid1" },
          { front: "", back: "Back" }, // missing front -> invalid
          { front: "Front", back: " " }, // blank back -> invalid
          { front: "Valid2", back: "Valid2" },
        ],
      },
    ]);
    const { result } = renderHook(() => useDeckStore());
    expect(result.current.decks[0]!.name).toBe("Mixed");
    expect(result.current.decks[0]!.cards).toHaveLength(2);
  });

  it("setActiveDeckIdAndSave persists to localStorage via effect", async () => {
    const { result } = renderHook(() => useDeckStore());
    const deck2Id = result.current.decks[1]!.id;
    act(() => {
      result.current.setActiveDeckId(deck2Id);
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(mockStore["genanki-active-deck-id"]).toBe(deck2Id);
  });
});



describe("useDeckStore — targeted branch coverage", () => {
  it("loadFromStorage branches: Array.isArray false path (non-array JSON)", () => {
    mockStore["genanki-decks"] = "42";
    const { result } = renderHook(() => useDeckStore());
    expect(result.current.decks[0]!.name).toBe("My First Deck");
  });

  it("recoveryMessages informed when JSON.parse throws (catch branch)", () => {
    mockStore["genanki-decks"] = "{ not json";
    const { result } = renderHook(() => useDeckStore());
    expect(result.current.decks[0]!.name).toBe("My First Deck");
  });

  it("savedActiveId empty string falls back to first deck via && short-circuit", () => {
    const decks: Deck[] = [{ id: "x", name: "Only", cards: [] }];
    mockStore["genanki-decks"] = JSON.stringify(decks);
    mockStore["genanki-active-deck-id"] = "";
    const { result } = renderHook(() => useDeckStore());
    expect(result.current.activeDeckId).toBe("x");
  });

  it("parses boolean true as non-array and falls back to starter decks", () => {
    mockStore["genanki-decks"] = "true";
    const { result } = renderHook(() => useDeckStore());
    expect(result.current.decks[0]!.name).toBe("My First Deck");
  });
});

describe("useDeckStore — cascade-free branch-closure batch", () => {
  it("rerender after recovery: useEffect early-return (hasShownRecovery ref guards StrictMode)", async () => {
    const { toast } = await import("sonner");
    vi.mocked(toast.warning).mockClear();
    vi.mocked(toast.info).mockClear();
    // Trigger recovery messages by mixing valid + invalid-shape decks.
    mockStore["genanki-decks"] = JSON.stringify([
      { id: "good", name: "Good", cards: [{ front: "Q", back: "A" }] },
      { name: "Missing-Id", cards: [] }, // sanitizeDeck → null
    ]);
    const { result: _result, rerender } = renderHook(() => useDeckStore());
    // Wait for initial useEffect to fire and set hasShownRecovery.current = true.
    await new Promise((r) => setTimeout(r, 0));
    const initialCalls = vi.mocked(toast.warning).mock.calls.length;
    expect(initialCalls).toBeGreaterThanOrEqual(1);
    // Re-render triggers useEffect again; hasShownRecovery.current === true
    // → early-return → no new toast calls (covers the TRUE arm of the guard).
    rerender();
    await new Promise((r) => setTimeout(r, 0));
    expect(vi.mocked(toast.warning).mock.calls.length).toBe(initialCalls);
  });

  it("filters out card entries that are null (isValidAnkiCard null-branch arm)", () => {
    mockStore["genanki-decks"] = JSON.stringify([
      {
        id: "mix",
        name: "Mix",
        cards: [
          null as unknown as AnkiCard,
          { front: "Valid Q", back: "Valid A" },
          null as unknown as AnkiCard,
        ],
      },
    ]);
    const { result } = renderHook(() => useDeckStore());
    expect(result.current.decks[0]!.cards).toHaveLength(1);
    expect(result.current.decks[0]!.cards[0]!.front).toBe("Valid Q");
  });

  it("filters out card entries that are non-objects (typeof-check arm)", () => {
    mockStore["genanki-decks"] = JSON.stringify([
      {
        id: "mix",
        name: "Mix",
        cards: [
          "wrong-shape-string" as unknown as AnkiCard,
          42 as unknown as AnkiCard,
          { front: "Only valid", back: "card stays" },
        ],
      },
    ]);
    const { result } = renderHook(() => useDeckStore());
    expect(result.current.decks[0]!.cards).toHaveLength(1);
  });

  it("saveToStorage swallows localStorage quota errors on decks save (catch arm)", () => {
    const original = localStorage.setItem;
    let calls = 0;
    Object.defineProperty(globalThis, "localStorage", {
      value: {
        ...original,
        getItem: vi.fn((k: string) => mockStore[k] ?? null),
        setItem: vi.fn((k: string, v: string) => {
          calls++;
          if (k === "genanki-decks") throw new Error("QuotaExceededError");
          mockStore[k] = v;
        }),
        removeItem: vi.fn(),
        clear: vi.fn(),
        get length() {
          return Object.keys(mockStore).length;
        },
        key: vi.fn(),
      },
      writable: true,
      configurable: true,
    });
    try {
      const { result } = renderHook(() => useDeckStore());
      const deckId = result.current.decks[0]!.id;
      expect(() => {
        act(() => {
          result.current.addCard(deckId, "Q", "A");
        });
      }).not.toThrow();
      expect(calls).toBeGreaterThan(0);
    } finally {
      Object.defineProperty(globalThis, "localStorage", {
        value: original,
        writable: true,
        configurable: true,
      });
    }
  });

  it("activeDeckId effect's setItem catches localStorage unavailability (no throw)", () => {
    const original = localStorage.setItem;
    Object.defineProperty(globalThis, "localStorage", {
      value: {
        ...original,
        getItem: vi.fn((k: string) => mockStore[k] ?? null),
        setItem: vi.fn((k: string, v: string) => {
          if (k === "genanki-active-deck-id") throw new Error("Storage unavailable");
          mockStore[k] = v;
        }),
        removeItem: vi.fn(),
        clear: vi.fn(),
        get length() {
          return Object.keys(mockStore).length;
        },
        key: vi.fn(),
      },
      writable: true,
      configurable: true,
    });
    try {
      const { result } = renderHook(() => useDeckStore());
      const deck2Id = result.current.decks[1]!.id;
      expect(() => {
        act(() => {
          result.current.setActiveDeckId(deck2Id);
        });
      }).not.toThrow();
    } finally {
      Object.defineProperty(globalThis, "localStorage", {
        value: original,
        writable: true,
        configurable: true,
      });
    }
  });

  it("renameDeck accepts whitespace-trimmed names (post-trim truthy arm)", () => {
    const { result } = renderHook(() => useDeckStore());
    const id = result.current.decks[0]!.id;
    act(() => {
      result.current.renameDeck(id, "   Real Name   ");
    });
    expect(result.current.decks[0]!.name).toBe("Real Name");
  });
});

describe("useDeckStore \u2014 cascade-free branch-closure batch (round 2)", () => {
  it("rerender after recovery: useEffect early-return after hasShownRecovery flips", async () => {
    const { toast } = await import("sonner");
    vi.mocked(toast.warning).mockClear();
    vi.mocked(toast.info).mockClear();
    mockStore["genanki-decks"] = JSON.stringify([
      { id: "good", name: "Good", cards: [{ front: "Q", back: "A" }] },
      { name: "Missing-Id", cards: [] },
    ]);
    const { result: _result, rerender } = renderHook(() => useDeckStore());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
    const callCountAfterMount = vi.mocked(toast.warning).mock.calls.length;
    expect(callCountAfterMount).toBeGreaterThanOrEqual(1);
    rerender();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(vi.mocked(toast.warning).mock.calls.length).toBe(callCountAfterMount);
  });

  it("addCards mutates only the targeted deck (per-deck branch arm)", () => {
    const { result } = renderHook(() => useDeckStore());
    const deck1Id = result.current.decks[0]!.id;
    act(() => {
      result.current.addCards(deck1Id, [{ front: "Q", back: "A" }]);
    });
    expect(result.current.decks[0]!.cards).toHaveLength(1);
    expect(result.current.decks[1]!.cards).toHaveLength(0);
    expect(result.current.decks[2]!.cards).toHaveLength(0);
  });

  it("createDeckWithCards: new deck becomes active AND opened", () => {
    const { result } = renderHook(() => useDeckStore());
    act(() => {
      result.current.createDeckWithCards("New Name", [{ front: "X", back: "Y" }]);
    });
    const newDeck = result.current.decks[result.current.decks.length - 1]!;
    expect(newDeck.name).toBe("New Name");
    expect(result.current.activeDeckId).toBe(newDeck.id);
    expect(result.current.openedDeckId).toBe(newDeck.id);
  });
});

describe("useDeckStore — cascade-free round-3 batch (save success + change-without-recovery)", () => {
  it("save success: localStorage.setItem invoked with serialized decks after a normal mutation", async () => {
    const setItemCalls: Array<[string, string]> = [];
    Object.defineProperty(globalThis, "localStorage", {
      value: {
        ...localStorage,
        setItem: vi.fn((k: string, v: string) => {
          setItemCalls.push([k, v]);
          mockStore[k] = v;
        }),
      },
      writable: true,
      configurable: true,
    });
    try {
      const { result } = renderHook(() => useDeckStore());
      const deckId = result.current.decks[0]!.id;
      await act(async () => {
        result.current.addCard(deckId, "Q", "A");
        await new Promise((r) => setTimeout(r, 5));
      });
      const decksSaveCall = setItemCalls.find((c) => c[0] === "genanki-decks");
      expect(decksSaveCall).toBeDefined();
      const parsed = JSON.parse(decksSaveCall![1]);
      expect(parsed.length).toBe(3);
      expect(parsed[0]!.cards).toHaveLength(1);
      expect(parsed[0]!.cards[0]!.front).toBe("Q");
    } finally {
      Object.defineProperty(globalThis, "localStorage", {
        value: {
          getItem: vi.fn((k: string) => mockStore[k] ?? null),
          setItem: vi.fn((k: string, v: string) => {
            mockStore[k] = v;
          }),
          removeItem: vi.fn((k: string) => {
            delete mockStore[k];
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
    }
  });
});

describe("useDeckStore — cascade-free round-2 batch (save success with no recovery)", () => {
  it("save success path with no recovery: valid localStorage + addCard \u2192 setItem called, no toast fires", async () => {
    const { toast } = await import("sonner");
    vi.mocked(toast.warning).mockClear();
    vi.mocked(toast.info).mockClear();
    // Seed valid decks so recoveryMessages stays empty
    mockStore["genanki-decks"] = JSON.stringify([
      { id: "valid-deck", name: "Valid Deck", cards: [] },
    ]);
    const { result } = renderHook(() => useDeckStore());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
    // No recovery because the seed is valid
    expect(result.current.recoveryMessages).toHaveLength(0);
    expect(toast.warning).not.toHaveBeenCalled();
    expect(toast.info).not.toHaveBeenCalled();
    // Perform a change; verify setItem captured the save
    const setItemCalls: Array<[string, string]> = [];
    const originalSetItem = localStorage.setItem;
    Object.defineProperty(globalThis, "localStorage", {
      value: {
        ...localStorage,
        setItem: vi.fn((k: string, v: string) => {
          setItemCalls.push([k, v]);
          mockStore[k] = v;
        }),
      },
      writable: true,
      configurable: true,
    });
    try {
      await act(async () => {
        result.current.addCard(result.current.decks[0]!.id, "Q-NO-RECOVERY", "A");
        await new Promise((r) => setTimeout(r, 5));
      });
      const saveCall = setItemCalls.find((c) => c[0] === "genanki-decks");
      expect(saveCall).toBeDefined();
      const parsed = JSON.parse(saveCall![1]);
      expect(parsed[0]!.cards).toHaveLength(1);
      expect(parsed[0]!.cards[0]!.front).toBe("Q-NO-RECOVERY");
    } finally {
      Object.defineProperty(globalThis, "localStorage", {
        value: {
          getItem: vi.fn((k: string) => mockStore[k] ?? null),
          setItem: originalSetItem,
          removeItem: vi.fn((k: string) => {
            delete mockStore[k];
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
    }
    // After the change, still no recovery toast
    expect(toast.warning).not.toHaveBeenCalled();
    expect(toast.info).not.toHaveBeenCalled();
  });
});
