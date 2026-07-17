import { useState, useCallback, useEffect, useRef } from "react";
import type { AnkiCard } from "@/lib/anki";

export interface Deck {
  id: string;
  name: string;
  cards: AnkiCard[];
}

const STORAGE_KEY = "genanki-decks";
const SAVE_DEBOUNCE_MS = 500;

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

function isValidDeck(deck: unknown): deck is Deck {
  if (typeof deck !== "object" || deck === null) return false;
  const obj = deck as Record<string, unknown>;
  if (typeof obj.id !== "string" || obj.id.trim().length === 0) return false;
  if (typeof obj.name !== "string") return false;
  if (!Array.isArray(obj.cards)) return false;
  return obj.cards.every(isValidAnkiCard);
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
        const validDecks = parsed.filter(isValidDeck);
        if (validDecks.length > 0) {
          return { decks: validDecks, activeId: validDecks[0].id };
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
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Update ref to latest decks on every render
  const latestDecks = useRef(decks);
  latestDecks.current = decks;

  // Debounced save to localStorage
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveToStorage(decks);
      saveTimer.current = null;
    }, SAVE_DEBOUNCE_MS);
  }, [decks]);

  // Flush pending save on unmount only
  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveToStorage(latestDecks.current);
      }
    };
  }, []);

  const activeDeck = decks.find((d) => d.id === activeDeckId);
  const openedDeck = decks.find((d) => d.id === openedDeckId);

  const addDeck = useCallback(() => {
    const newDeck: Deck = { id: uid(), name: `Deck ${decks.length + 1}`, cards: [] };
    setDecks((prev) => [...prev, newDeck]);
    setActiveDeckId(newDeck.id);
    return newDeck;
  }, [decks.length]);

  const removeDeck = useCallback(
    (id: string, showToast: (msg: string) => void) => {
      if (decks.length <= 1) {
        showToast("You need at least one deck");
        return;
      }
      setDecks((prev) => prev.filter((d) => d.id !== id));
      if (activeDeckId === id) {
        const remaining = decks.filter((d) => d.id !== id);
        setActiveDeckId(remaining[0].id);
      }
      if (openedDeckId === id) {
        setOpenedDeckId(null);
      }
    },
    [decks, activeDeckId, openedDeckId],
  );

  const renameDeck = useCallback((id: string, name: string) => {
    if (!name.trim()) return;
    setDecks((prev) => prev.map((d) => (d.id === id ? { ...d, name: name.trim() } : d)));
  }, []);

  const addCard = useCallback(
    (deckId: string, front: string, back: string) => {
      setDecks((prev) =>
        prev.map((d) =>
          d.id === deckId ? { ...d, cards: [...d.cards, { front, back }] } : d,
        ),
      );
    },
    [],
  );

  const addCards = useCallback((deckId: string, cards: AnkiCard[]) => {
    setDecks((prev) =>
      prev.map((d) => (d.id === deckId ? { ...d, cards: [...d.cards, ...cards] } : d)),
    );
  }, []);

  const createDeckWithCards = useCallback((name: string, cards: AnkiCard[]) => {
    const newDeck: Deck = { id: uid(), name, cards };
    setDecks((prev) => [...prev, newDeck]);
    setActiveDeckId(newDeck.id);
    setOpenedDeckId(newDeck.id);
    return newDeck;
  }, []);

  const removeCard = useCallback((deckId: string, idx: number) => {
    setDecks((prev) =>
      prev.map((d) =>
        d.id === deckId ? { ...d, cards: d.cards.filter((_, i) => i !== idx) } : d,
      ),
    );
  }, []);

  const editCard = useCallback((deckId: string, idx: number, front: string, back: string) => {
    setDecks((prev) =>
      prev.map((d) =>
        d.id === deckId
          ? { ...d, cards: d.cards.map((c, i) => (i === idx ? { front, back } : c)) }
          : d,
      ),
    );
  }, []);

  const totalCards = decks.reduce((sum, d) => sum + d.cards.length, 0);

  return {
    decks,
    activeDeckId,
    activeDeck,
    openedDeckId,
    openedDeck,
    setActiveDeckId,
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
