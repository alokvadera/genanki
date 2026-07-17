import { useState, useCallback, useEffect } from "react";
import type { AnkiCard } from "@/lib/anki";

export interface Deck {
  id: string;
  name: string;
  cards: AnkiCard[];
}

const STORAGE_KEY = "genanki-decks";

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
          const savedActiveId = localStorage.getItem("genanki-active-deck-id");
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
  } catch {
    // Ignore quota errors
  }
}

export function useDeckStore() {
  const initial = loadFromStorage();
  const [decks, setDecks] = useState<Deck[]>(initial.decks);
  const [activeDeckId, setActiveDeckId] = useState<string>(initial.activeId);
  const [openedDeckId, setOpenedDeckId] = useState<string | null>(null);

  // Helper to update decks and save synchronously
  const setDecksAndSave = useCallback((updater: Deck[] | ((prev: Deck[]) => Deck[])) => {
    setDecks((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      saveToStorage(next);
      return next;
    });
  }, []);

  // Helper to update active deck ID and save synchronously
  const setActiveDeckIdAndSave = useCallback((id: string) => {
    setActiveDeckId(id);
    localStorage.setItem("genanki-active-deck-id", id);
  }, []);

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
      setDecksAndSave((prev) => prev.filter((d) => d.id !== id));
      if (activeDeckId === id) {
        const remaining = decks.filter((d) => d.id !== id);
        setActiveDeckIdAndSave(remaining[0].id);
      }
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

export type DeckStore = ReturnType<typeof useDeckStore>;
