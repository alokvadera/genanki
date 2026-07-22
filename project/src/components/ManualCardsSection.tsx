import { useState, useCallback, useRef } from "react";
import type { AnkiCard } from "@/lib/anki";
import { splitCsvLine } from "@/lib/utils";
import { useDeckStore } from "@/hooks/use-deck-store";
import AddCardForm from "@/components/AddCardForm";
import BulkImportPanel from "@/components/BulkImportPanel";
import CardsList from "@/components/CardsList";

interface ManualCardsSectionProps {
  showToast: (msg: string) => void;
  recordAppEvent: (event: string, metric?: number) => void;
  onPreview: (card: AnkiCard) => void;
}

export default function ManualCardsSection({ showToast, recordAppEvent, onPreview }: ManualCardsSectionProps) {
  const {
    activeDeckId,
    activeDeck,
    addCard: addCardToDeckStore,
    addCards,
    removeCard,
    editCard,
  } = useDeckStore();

  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [importText, setImportText] = useState("");
  const [showImport, setShowImport] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addCard = useCallback(() => {
    if (!front.trim() || !back.trim()) {
      showToast("Fill in both Front and Back fields");
      return;
    }
    addCardToDeckStore(activeDeckId, front.trim(), back.trim());
    recordAppEvent("card_added", 1);
    setFront("");
    setBack("");
    showToast("Card added!");
  }, [front, back, activeDeckId, addCardToDeckStore, showToast, recordAppEvent]);

  const handleImport = useCallback(() => {
    const lines = importText.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) { showToast("No cards to import"); return; }
    const newCards: AnkiCard[] = [];
    for (const line of lines) {
      const parts = splitCsvLine(line);
      if (parts.length >= 2) {
        newCards.push({
          front: parts[0]!.replace(/^["']|["']$/g, ""),
          back: parts.slice(1).join(", ").replace(/^["']|["']$/g, ""),
        });
      }
    }
    if (newCards.length === 0) { showToast("Use comma, semicolon, tab, or pipe to separate front/back"); return; }
    addCards(activeDeckId, newCards);
    recordAppEvent("cards_imported", newCards.length);
    setImportText("");
    setShowImport(false);
    showToast(`Imported ${newCards.length} card(s)`);
  }, [importText, activeDeckId, addCards, showToast, recordAppEvent]);

  const handleCsvUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
      const newCards: AnkiCard[] = [];
      for (const line of lines) {
        if (line.toLowerCase().startsWith("front")) continue;
        const parts = splitCsvLine(line);
        if (parts.length >= 2) {
          newCards.push({
            front: parts[0]!.trim().replace(/^["']|["']$/g, ""),
            back: parts[1]!.trim().replace(/^["']|["']$/g, ""),
          });
        }
      }
      if (newCards.length > 0) {
        addCards(activeDeckId, newCards);
        recordAppEvent("cards_imported", newCards.length);
        showToast(`Imported ${newCards.length} card(s) from file`);
      } else {
        showToast("No valid cards found in file");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }, [activeDeckId, addCards, showToast, recordAppEvent]);

  return (
    <>
      <AddCardForm
        front={front}
        back={back}
        onFrontChange={setFront}
        onBackChange={setBack}
        onAddCard={addCard}
        onToggleImport={() => setShowImport((v) => !v)}
        onCsvUpload={handleCsvUpload}
        fileInputRef={fileInputRef}
      />

      <BulkImportPanel
        showImport={showImport}
        importText={importText}
        onImportTextChange={setImportText}
        onImport={handleImport}
        onCancel={() => { setShowImport(false); setImportText(""); }}
      />

      <CardsList
        activeDeck={activeDeck}
        activeDeckId={activeDeckId}
        onRemoveCard={removeCard}
        onPreview={onPreview}
        onEditCard={editCard}
      />
    </>
  );
}
