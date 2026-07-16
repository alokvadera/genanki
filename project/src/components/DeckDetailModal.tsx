import { BookOpen, Download, Layers, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import DeckDetailCardItem from "@/components/DeckDetailCardItem";
import type { Deck } from "@/hooks/use-deck-store";
import type { AnkiCard } from "@/lib/anki";

interface DeckDetailModalProps {
  openedDeck: Deck | null | undefined;
  exporting: boolean;
  onClose: () => void;
  onExport: (deck: Deck) => Promise<void>;
  onEditCard: (deckId: string, idx: number, front: string, back: string) => void;
  onRemoveCard: (deckId: string, idx: number) => void;
  onPreview: (card: AnkiCard) => void;
}

export default function DeckDetailModal({
  openedDeck,
  exporting,
  onClose,
  onExport,
  onEditCard,
  onRemoveCard,
  onPreview,
}: DeckDetailModalProps) {
  return (
    <AnimatePresence>
      {openedDeck && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="nb-border nb-shadow-lg bg-white max-w-3xl w-full max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-5 border-b-[3px] border-black flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <BookOpen className="w-5 h-5" />
                  {openedDeck.name}
                </h2>
                <p className="text-xs text-muted-foreground font-medium mt-0.5">
                  {openedDeck.cards.length} card{openedDeck.cards.length !== 1 ? "s" : ""}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => onExport(openedDeck)}
                  disabled={exporting || openedDeck.cards.length === 0}
                  className="nb-border nb-shadow-sm nb-hover-shadow bg-primary text-primary-foreground font-bold text-sm"
                >
                  <Download className="w-4 h-4" />
                  Export .apkg
                </Button>
                <button
                  onClick={onClose}
                  className="nb-border nb-shadow-sm p-2 hover:bg-muted transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto">
              {openedDeck.cards.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="nb-border inline-block p-6 bg-secondary mb-4">
                    <Layers className="w-10 h-10 mx-auto" />
                  </div>
                  <p className="font-bold text-sm">This deck is empty</p>
                  <p className="text-xs text-muted-foreground mt-1 font-medium">
                    Add cards using the form on the main page, or upload a document to auto-generate cards
                  </p>
                </div>
              ) : (
                <div>
                  {openedDeck.cards.map((card, idx) => (
                    <DeckDetailCardItem
                      key={idx}
                      card={card}
                      index={idx}
                      onEdit={(f, b) => onEditCard(openedDeck.id, idx, f, b)}
                      onRemove={() => onRemoveCard(openedDeck.id, idx)}
                      onPreview={onPreview}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t-[3px] border-black shrink-0 bg-muted/30">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground font-medium">
                  Click any card to preview · Use pencil to edit · Use trash to delete
                </p>
                <Button
                  onClick={onClose}
                  variant="outline"
                  className="nb-border nb-shadow-sm nb-hover-shadow font-bold text-sm"
                >
                  Close
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
