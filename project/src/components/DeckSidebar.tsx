import { BookOpen, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Deck } from "@/hooks/use-deck-store";

interface DeckSidebarProps {
  decks: Deck[];
  activeDeckId: string;
  editingDeckName: string | null;
  editNameValue: string;
  onSetActiveDeckId: (id: string) => void;
  onSetOpenedDeckId: (id: string | null) => void;
  onAddDeck: () => Deck;
  onRemoveDeck: (id: string, showToast: (msg: string) => void) => void;
  onStartRename: (deck: Deck) => void;
  onSetEditNameValue: (value: string) => void;
  onCommitRename: () => void;
  onSetEditingDeckName: (id: string | null) => void;
  showToast: (msg: string) => void;
}

export default function DeckSidebar({
  decks,
  activeDeckId,
  editingDeckName,
  editNameValue,
  onSetActiveDeckId,
  onSetOpenedDeckId,
  onAddDeck,
  onRemoveDeck,
  onStartRename,
  onSetEditNameValue,
  onCommitRename,
  onSetEditingDeckName,
  showToast,
}: DeckSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredDecks = useMemo(() => {
    if (!searchQuery.trim()) return decks;
    const q = searchQuery.toLowerCase().trim();
    return decks.filter((d) => d.name.toLowerCase().includes(q));
  }, [decks, searchQuery]);

  return (
    <aside className="lg:w-64 shrink-0 lg:sticky lg:top-6 lg:self-start">
      <div className="nb-border bg-card text-card-foreground nb-shadow-indigo p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-bold text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-400">
              DECKS
            </h2>
            <p className="text-[11px] text-muted-foreground font-medium mt-1">
              Your study library
            </p>
          </div>
          <Button
            onClick={onAddDeck}
            size="sm"
            aria-label="Create a new deck"
            title="Create a new deck"
            className="nb-border-2 nb-shadow-sm nb-hover-shadow bg-secondary font-bold text-xs h-7 px-2"
          >
            <Plus className="w-3 h-3" />
          </Button>
        </div>

        {/* Deck search */}
        <div className="relative mb-3">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter decks..."
            aria-label="Search decks"
            className="h-8 pl-7 text-xs nb-border-2 font-medium"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          {filteredDecks.length === 0 ? (
            searchQuery.trim() ? (
              <p className="text-xs text-muted-foreground font-medium text-center py-3">
                No decks match "{searchQuery.trim()}"
              </p>
            ) : (
              <div className="nb-border-2 border-dashed bg-muted/20 p-4 text-center">
                <BookOpen className="w-5 h-5 mx-auto text-indigo-500 mb-2" />
                <p className="text-xs font-bold">No decks yet</p>
                <p className="text-[11px] text-muted-foreground font-medium mt-1 leading-relaxed">
                  Create a deck to give your next idea a home.
                </p>
                <button
                  type="button"
                  onClick={onAddDeck}
                  className="nb-border nb-shadow-sm nb-hover-shadow bg-secondary px-3 py-1.5 mt-3 text-[11px] font-bold"
                >
                  Create first deck
                </button>
              </div>
            )
          ) : (
            filteredDecks.map((deck) => (
              <div
                key={deck.id}
                className={`nb-border-2 p-2.5 cursor-pointer transition-all nb-hover-shadow group ${
                  activeDeckId === deck.id
                    ? "bg-secondary font-bold nb-shadow-sm"
                    : "bg-card dark:bg-card hover:bg-muted"
                }`}
              >
                {editingDeckName === deck.id ? (
                  <div className="flex gap-1">
                    <Input
                      aria-label={`Rename ${deck.name}`}
                      value={editNameValue}
                      onChange={(e) => onSetEditNameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") onCommitRename();
                        if (e.key === "Escape") onSetEditingDeckName(null);
                      }}
                      onBlur={onCommitRename}
                      autoFocus
                      className="h-6 text-xs nb-border-2 font-bold"
                    />
                  </div>
                ) : (
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label={`Open ${deck.name}`}
                    onClick={() => {
                      onSetActiveDeckId(deck.id);
                      onSetOpenedDeckId(deck.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSetActiveDeckId(deck.id);
                        onSetOpenedDeckId(deck.id);
                      }
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm truncate flex items-center gap-1.5">
                          <BookOpen className="w-3.5 h-3.5 shrink-0 opacity-60" />
                          {deck.name}
                        </p>
                        <p
                          className="text-xs text-muted-foreground font-normal ml-5"
                          data-testid="deck-card-count"
                          data-deck-id={deck.id}
                        >
                          {deck.cards.length} card
                          {deck.cards.length !== 1 ? "s" : ""}
                        </p>
                      </div>
                      <div className="flex gap-1 ml-2 shrink-0">
                        <button
                          type="button"
                          aria-label={`Rename ${deck.name}`}
                          title={`Rename ${deck.name}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onStartRename(deck);
                          }}
                          className="p-1 hover:bg-muted transition-colors"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        {decks.length > 1 && (
                          <button
                            type="button"
                            aria-label={`Delete ${deck.name}`}
                            title={`Delete ${deck.name}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onRemoveDeck(deck.id, showToast);
                            }}
                            className="p-1 hover:bg-destructive/10 text-destructive transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </aside>
  );
}
