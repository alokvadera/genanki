import { BookOpen, Pencil, Plus, Trash2 } from "lucide-react";
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
  return (
    <aside className="lg:w-64 shrink-0">
      <div className="nb-border bg-white nb-shadow-indigo p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-400">DECKS</h2>
          <Button
            onClick={onAddDeck}
            size="sm"
            className="nb-border-2 nb-shadow-sm nb-hover-shadow bg-secondary font-bold text-xs h-7 px-2"
          >
            <Plus className="w-3 h-3" />
          </Button>
        </div>
        <div className="flex flex-col gap-1.5">
          {decks.map((deck) => (
            <div
              key={deck.id}
              className={`nb-border-2 p-2.5 cursor-pointer transition-all nb-hover-shadow group ${
                activeDeckId === deck.id
                  ? "bg-secondary font-bold nb-shadow-sm"
                  : "bg-white hover:bg-muted"
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
                  onClick={() => {
                    onSetActiveDeckId(deck.id);
                    onSetOpenedDeckId(deck.id);
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
                        {deck.cards.length} card{deck.cards.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <div className="flex gap-1 ml-2 shrink-0">
                      <button
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
          ))}
        </div>
      </div>
    </aside>
  );
}
