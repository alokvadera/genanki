import { useState, useCallback } from "react";
import { ChevronDown, ChevronUp, Eye, Layers, Trash2, Pencil } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { AnkiCard } from "@/lib/anki";
import type { Deck } from "@/hooks/use-deck-store";
import { formatCardText } from "@/lib/formatter";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface CardsListProps {
  activeDeck: Deck | undefined;
  activeDeckId: string;
  onRemoveCard: (deckId: string, idx: number) => void;
  onPreview: (card: AnkiCard) => void;
  onEditCard?: (deckId: string, idx: number, front: string, back: string) => void;
}

export default function CardsList({
  activeDeck,
  activeDeckId,
  onRemoveCard,
  onPreview,
  onEditCard,
}: CardsListProps) {
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editFront, setEditFront] = useState("");
  const [editBack, setEditBack] = useState("");

  const handleExpandToggle = useCallback((cardKey: string) => {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(cardKey)) next.delete(cardKey);
      else next.add(cardKey);
      return next;
    });
  }, []);

  const startEditing = useCallback((idx: number, card: AnkiCard) => {
    setEditingIdx(idx);
    setEditFront(card.front);
    setEditBack(card.back);
  }, []);

  const handleSave = useCallback((idx: number) => {
    if (onEditCard) {
      onEditCard(activeDeckId, idx, editFront, editBack);
    }
    setEditingIdx(null);
  }, [activeDeckId, editFront, editBack, onEditCard]);

  return (
    <div className="nb-border bg-white nb-shadow-indigo">
      <div className="p-4 border-b-[3px] border-black flex items-center justify-between">
        <h2 className="font-bold text-xs uppercase tracking-[0.2em] flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
          <Layers className="w-4 h-4" />
          CARDS ({activeDeck?.cards.length ?? 0})
        </h2>
      </div>
      {activeDeck && activeDeck.cards.length === 0 ? (
        <div className="p-12 text-center">
          <div className="nb-border inline-block p-6 bg-secondary mb-4">
            <Layers className="w-10 h-10 mx-auto" />
          </div>
          <p className="font-bold text-sm">No cards yet</p>
          <p className="text-xs text-muted-foreground mt-1 font-medium">
            Upload a document above or add cards manually
          </p>
        </div>
      ) : (
        <div>
          {activeDeck?.cards.map((card, idx) => {
            const cardKey = `${activeDeckId}-${idx}`;
            const isExpanded = expandedCards.has(cardKey);
            const isLast = idx === activeDeck!.cards.length - 1;
            return (
              <div key={cardKey} data-testid={`card-row-${idx + 1}`}>
                {editingIdx === idx ? (
                  <div
                    className={`p-4 space-y-2 bg-muted/30 ${
                      !isLast ? "border-b-[3px] border-black" : ""
                    }`}
                  >
                    <Input
                      value={editFront}
                      onChange={(e) => setEditFront(e.target.value)}
                      className="nb-border-2 text-sm font-bold bg-white"
                      placeholder="Front"
                    />
                    <Textarea
                      value={editBack}
                      onChange={(e) => setEditBack(e.target.value)}
                      className="nb-border-2 text-sm min-h-[80px] resize-none bg-white"
                      placeholder="Back"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleSave(idx)}
                        className="nb-border nb-shadow-sm font-bold text-xs h-7"
                      >
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingIdx(null)}
                        className="nb-border font-bold text-xs h-7"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div
                    className={`p-3 flex items-start gap-3 hover:bg-muted/30 transition-colors ${
                      !isLast ? "border-b-[3px] border-black" : ""
                    }`}
                  >
                    <span className="nb-border bg-secondary text-xs font-bold px-2 py-0.5 shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <div
                      className="flex-1 min-w-0 cursor-pointer"
                      onClick={() => startEditing(idx, card)}
                    >
                      <p className="text-sm font-semibold truncate">
                        {card.front}
                      </p>
                      <p className="text-xs text-muted-foreground truncate font-medium">
                        {card.back}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        type="button"
                        data-testid="card-preview-button"
                        aria-label={`Preview card ${idx + 1}`}
                        onClick={(e) => { e.stopPropagation(); onPreview(card); }}
                        className="p-1.5 nb-border-2 hover:bg-muted transition-colors"
                        title="Preview"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        data-testid="card-edit-button"
                        aria-label={`Edit card ${idx + 1}: ${card.front}`}
                        onClick={(e) => { e.stopPropagation(); startEditing(idx, card); }}
                        className="p-1.5 nb-border-2 hover:bg-muted transition-colors"
                        title="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        data-testid="card-expand-button"
                        aria-label={`${isExpanded ? "Collapse" : "Expand"} card ${idx + 1}`}
                        aria-expanded={isExpanded}
                        onClick={(e) => { e.stopPropagation(); handleExpandToggle(cardKey); }}
                        className="p-1.5 nb-border-2 hover:bg-muted transition-colors"
                      >
                        {isExpanded ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        data-testid="card-delete-button"
                        aria-label={`Delete card ${idx + 1}: ${card.front}`}
                        onClick={(e) => { e.stopPropagation(); onRemoveCard(activeDeckId, idx); }}
                        className="p-1.5 nb-border-2 hover:bg-destructive/10 text-destructive transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
                <AnimatePresence>
                  {isExpanded && editingIdx !== idx && (
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: "auto" }}
                      exit={{ height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-3 pb-3 pl-10">
                        <div className="nb-border-2 bg-muted/50 p-3">
                          <div className="mb-2">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                              Front
                            </span>
                            <div
                              className="text-sm mt-0.5 prose prose-sm max-w-none font-medium"
                              dangerouslySetInnerHTML={{ __html: formatCardText(card.front) }}
                            />
                          </div>
                          <div className="border-t-2 border-border pt-2">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                              Back
                            </span>
                            <div
                              className="text-sm mt-0.5 prose prose-sm max-w-none"
                              dangerouslySetInnerHTML={{ __html: formatCardText(card.back) }}
                            />
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
