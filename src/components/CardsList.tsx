import { useState, useCallback } from "react";
import { ChevronDown, ChevronUp, Eye, Layers, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { AnkiCard } from "@/lib/anki";
import type { Deck } from "@/hooks/use-deck-store";
import { formatCardText } from "@/lib/formatter";

interface CardsListProps {
  activeDeck: Deck | undefined;
  activeDeckId: string;
  onRemoveCard: (deckId: string, idx: number) => void;
  onPreview: (card: AnkiCard) => void;
}

export default function CardsList({
  activeDeck,
  activeDeckId,
  onRemoveCard,
  onPreview,
}: CardsListProps) {
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  const handleExpandToggle = useCallback((cardKey: string) => {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(cardKey)) next.delete(cardKey);
      else next.add(cardKey);
      return next;
    });
  }, []);

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
              <div key={cardKey}>
                <div
                  className={`p-3 flex items-start gap-3 hover:bg-muted/30 transition-colors ${
                    !isLast ? "border-b-[3px] border-black" : ""
                  }`}
                >
                  <span className="nb-border bg-secondary text-xs font-bold px-2 py-0.5 shrink-0 mt-0.5">
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">
                      {card.front}
                    </p>
                    <p className="text-xs text-muted-foreground truncate font-medium">
                      {card.back}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => onPreview(card)}
                      className="p-1.5 nb-border-2 hover:bg-muted transition-colors"
                      title="Preview"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleExpandToggle(cardKey)}
                      className="p-1.5 nb-border-2 hover:bg-muted transition-colors"
                    >
                      {isExpanded ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <button
                      onClick={() => onRemoveCard(activeDeckId, idx)}
                      className="p-1.5 nb-border-2 hover:bg-destructive/10 text-destructive transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <AnimatePresence>
                  {isExpanded && (
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
