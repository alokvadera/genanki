import { createContext, createElement, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { AnkiCard } from "@/lib/anki";

export interface Deck {
  id: string;
  name: string;
  cards: AnkiCard[];
}

const STORAGE_KEY = "genanki-decks";
const ACTIVE_ID_KEY = "genanki-active-deck-id";
const SCHEMA_VERSION = 1;
const VERSION_KEY = "genanki-decks-version";

function uid(): string {
  const buf = new Uint32Array(2);
  crypto.getRandomValues(buf);
  return buf[0].toString(36) + buf[1].toString(36);
}

function isValidAnkiCard(card: unknown): card is AnkiCard {
  if (typeof card !== "object" || card === null) return false;
  const obj = card as Record<string, unknown>;
  return (
    typeof obj.front === "string" &&
    typeof obj.back === "string" &&
    obj.front.trim().length > 0 &&
    obj.back.trim().length > 0
  );
}

function sanitizeDeck(deck: unknown): Deck | null {
  if (typeof deck !== "object" || deck === null) return null;
  const obj = deck as Record<string, unknown>;
  if (typeof obj.id !== "string" || obj.id.trim().length === 0) return null;
  if (typeof obj.name !== "string") return null;
  if (!Array.isArray(obj.cards)) return null;
  const validCards = obj.cards.filter(isValidAnkiCard);
  return { id: obj.id, name: obj.name, cards: validCards };
}

function createStarterDecks(): Deck[] {
  return [
    { id: uid(), name: "My First Deck", cards: [] },
    { id: uid(), name: "Study Deck", cards: [] },
    { id: uid(), name: "Review Deck", cards: [] },
  ];
}

function loadFromStorage(): { decks: Deck[]; activeId: string } {
  const fallbackDecks = createStarterDecks();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const validDecks = parsed.map(sanitizeDeck).filter((d): d is Deck => d !== null);
        if (validDecks.length > 0) {
          const savedActiveId = localStorage.getItem(ACTIVE_ID_KEY);
          const activeId = savedActiveId && validDecks.some((d) => d.id === savedActiveId)
            ? savedActiveId
            : validDecks[0].id;
          return { decks: validDecks, activeId };
        }
      }
    }
  } catch {
    // Ignore corrupted storage
  }
  return { decks: fallbackDecks, activeId: fallbackDecks[0].id };
}

function saveToStorage(decks: Deck[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(decks));
    localStorage.setItem(VERSION_KEY, String(SCHEMA_VERSION));
  } catch {
    // Ignore quota errors
  }
}

function useDeckStoreState() {
  const initial = loadFromStorage();
  const [decks, setDecks] = useState<Deck[]>(initial.decks);
  const [activeDeckId, setActiveDeckId] = useState<string>(initial.activeId);
  const [openedDeckId, setOpenedDeckId] = useState<string | null>(null);
  const hasMounted = useRef(false);

  // State updates stay pure so React can safely replay them in StrictMode.
  const setDecksAndSave = useCallback((updater: Deck[] | ((prev: Deck[]) => Deck[])) => {
    setDecks((prev) => {
      return typeof updater === "function" ? updater(prev) : updater;
    });
  }, []);

  // Kept as the public synchronous update path; persistence belongs to effects.
  const setActiveDeckIdAndSave = useCallback((id: string) => {
    setActiveDeckId(id);
  }, []);

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }
    saveToStorage(decks);
  }, [decks]);

  useEffect(() => {
    try {
      localStorage.setItem(ACTIVE_ID_KEY, activeDeckId);
    } catch {
      // Ignore unavailable storage.
    }
  }, [activeDeckId]);

  const activeDeck = decks.find((d) => d.id === activeDeckId);
  const openedDeck = decks.find((d) => d.id === openedDeckId);

  const addDeck = useCallback(() => {
    const newDeck: Deck = { id: uid(), name: `Deck ${decks.length + 1}`, cards: [] };
    setDecksAndSave((prev) => [...prev, newDeck]);
    setActiveDeckIdAndSave(newDeck.id);
    return newDeck;
  }, [decks.length, setDecksAndSave, setActiveDeckIdAndSave]);

  const removeDeck = useCallback(
    (id: string, showToast: (msg: string) => void) => {
      if (decks.length <= 1) {
        showToast("You need at least one deck");
        return;
      }
      const remaining = decks.filter((deck) => deck.id !== id);
      if (activeDeckId === id) setActiveDeckIdAndSave(remaining[0].id);
      setDecksAndSave((prev) => prev.filter((d) => d.id !== id));
      if (openedDeckId === id) {
        setOpenedDeckId(null);
      }
    },
    [decks, activeDeckId, openedDeckId, setDecksAndSave, setActiveDeckIdAndSave],
  );

  const renameDeck = useCallback((id: string, name: string) => {
    if (!name.trim()) return;
    setDecksAndSave((prev) => prev.map((d) => (d.id === id ? { ...d, name: name.trim() } : d)));
  }, [setDecksAndSave]);

  const addCard = useCallback(
    (deckId: string, front: string, back: string) => {
      setDecksAndSave((prev) =>
        prev.map((d) =>
          d.id === deckId ? { ...d, cards: [...d.cards, { front, back }] } : d,
        ),
      );
    },
    [setDecksAndSave],
  );

  const addCards = useCallback((deckId: string, cards: AnkiCard[]) => {
    setDecksAndSave((prev) =>
      prev.map((d) => (d.id === deckId ? { ...d, cards: [...d.cards, ...cards] } : d)),
    );
  }, [setDecksAndSave]);

  const createDeckWithCards = useCallback((name: string, cards: AnkiCard[]) => {
    const newDeck: Deck = { id: uid(), name, cards };
    setDecksAndSave((prev) => [...prev, newDeck]);
    setActiveDeckIdAndSave(newDeck.id);
    setOpenedDeckId(newDeck.id);
    return newDeck;
  }, [setDecksAndSave, setActiveDeckIdAndSave]);

  const removeCard = useCallback((deckId: string, idx: number) => {
    setDecksAndSave((prev) =>
      prev.map((d) =>
        d.id === deckId ? { ...d, cards: d.cards.filter((_, i) => i !== idx) } : d,
      ),
    );
  }, [setDecksAndSave]);

  const editCard = useCallback((deckId: string, idx: number, front: string, back: string) => {
    setDecksAndSave((prev) =>
      prev.map((d) =>
        d.id === deckId
          ? { ...d, cards: d.cards.map((c, i) => (i === idx ? { front, back } : c)) }
          : d,
      ),
    );
  }, [setDecksAndSave]);

  const totalCards = decks.reduce((sum, d) => sum + d.cards.length, 0);

  return {
    decks,
    activeDeckId,
    activeDeck,
    openedDeckId,
    openedDeck,
    setActiveDeckId: setActiveDeckIdAndSave,
    setOpenedDeckId,
    addDeck,
    removeDeck,
    renameDeck,
    addCard,
    addCards,
    createDeckWithCards,
    removeCard,
    editCard,
    totalCards,
  };
}

export type DeckStore = ReturnType<typeof useDeckStoreState>;

const DeckStoreContext = createContext<DeckStore | null>(null);

export function DeckStoreProvider({ children }: { children: ReactNode }) {
  const store = useDeckStoreState();
  return createElement(DeckStoreContext.Provider, { value: store }, children);
}

export function useDeckStore() {
  const store = useContext(DeckStoreContext);
  if (!store) throw new Error("useDeckStore must be used within DeckStoreProvider");
  return store;
}
