import { motion, AnimatePresence } from "framer-motion";
import { Check, Layers, Loader, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import DocCardItem from "@/components/DocCardItem";
import type { AnkiCard } from "@/lib/anki";
import type { ProviderOption } from "@/types/providers";

interface AiDeckBuilderProps {
  showAiBuilder: boolean;
  aiPrompt: string;
  aiDeckName: string;
  aiCardCount: number;
  aiDifficulty: "beginner" | "intermediate" | "advanced";
  cardType: "basic" | "cloze";
  aiPreviewCards: AnkiCard[] | null;
  aiPreviewDeckName: string;
  aiPreviewSummary: string;
  aiGenerating: boolean;
  activeDeckName?: string;
  preferredProvider: string;
  availableProviders: ProviderOption[];
  loadingProviders: boolean;
  onToggle: () => void;
  onPromptChange: (value: string) => void;
  onDeckNameChange: (value: string) => void;
  onCardCountChange: (count: number) => void;
  onDifficultyChange: (difficulty: "beginner" | "intermediate" | "advanced") => void;
  onCardTypeChange: (type: "basic" | "cloze") => void;
  onProviderChange: (provider: string) => void;
  onRefreshProviders: () => void;
  onGenerate: () => Promise<void>;
  onAcceptCards: (createNewDeck: boolean) => void;
  onDiscard: () => void;
  onAiPreviewEdit: (idx: number, front: string, back: string) => void;
  onAiPreviewRemove: (idx: number) => void;
}

export default function AiDeckBuilder({
  showAiBuilder,
  aiPrompt,
  aiDeckName,
  aiCardCount,
  aiDifficulty,
  cardType,
  aiPreviewCards,
  aiPreviewDeckName,
  aiPreviewSummary,
  aiGenerating,
  activeDeckName,
  preferredProvider,
  availableProviders,
  loadingProviders,
  onToggle,
  onPromptChange,
  onDeckNameChange,
  onCardCountChange,
  onDifficultyChange,
  onCardTypeChange,
  onProviderChange,
  onRefreshProviders,
  onGenerate,
  onAcceptCards,
  onDiscard,
  onAiPreviewEdit,
  onAiPreviewRemove,
}: AiDeckBuilderProps) {
  return (
    <>
      {/* AI Deck Builder */}
      <div className="nb-border bg-white nb-shadow-sm p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-sm flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            AI DECK BUILDER
          </h2>
          <Button
            onClick={onToggle}
            variant="outline"
            size="sm"
            className="nb-border nb-shadow-sm nb-hover-shadow font-bold text-xs h-7"
          >
            {showAiBuilder ? "Close" : "Open"}
          </Button>
        </div>

        <AnimatePresence>
          {showAiBuilder && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <p className="text-xs text-muted-foreground mb-4 font-medium">
                Describe a topic, chapter, or source idea. The provider chain will generate a deck title and editable cards you can save as a new deck or add to the current one.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-[1.5fr_0.8fr_1fr_1.2fr_2fr_1.2fr] gap-3 mb-3">
                <div>
                  <label className="text-xs font-bold text-muted-foreground mb-1.5 block uppercase tracking-wide">
                    Deck name
                  </label>
                  <Input
                    value={aiDeckName}
                    onChange={(e) => onDeckNameChange(e.target.value)}
                    placeholder={activeDeckName || "AI generated deck"}
                    className="nb-border-2 h-10 text-sm font-medium"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-muted-foreground mb-1.5 block uppercase tracking-wide">
                    Card count
                  </label>
                  <Input
                    type="number"
                    min={0}
                    max={1000}
                    value={aiCardCount}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "") {
                        onCardCountChange(0);
                        return;
                      }
                      onCardCountChange(Math.max(0, Math.min(1000, Math.round(Number(val)))));
                    }}
                    className="nb-border-2 h-10 text-sm font-medium"
                  />
                  {aiCardCount === 0 && (
                    <p className="text-[11px] text-amber-600 font-medium mt-1.5 flex items-center gap-1">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                      Card count is 0 — no cards will be generated. Set to 1 or more to create cards.
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-xs font-bold text-muted-foreground mb-1.5 block uppercase tracking-wide">
                    Difficulty
                  </label>
                  <select
                    value={aiDifficulty}
                    onChange={(e) =>
                      onDifficultyChange(e.target.value as "beginner" | "intermediate" | "advanced")
                    }
                    className="nb-border-2 h-10 w-full bg-background px-3 text-sm font-medium outline-none"
                  >
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-muted-foreground mb-1.5 block uppercase tracking-wide">
                    Card Format
                  </label>
                  <select
                    value={cardType}
                    onChange={(e) =>
                      onCardTypeChange(e.target.value as "basic" | "cloze")
                    }
                    className="nb-border-2 h-10 w-full bg-background px-3 text-sm font-medium outline-none"
                  >
                    <option value="basic">Standard Q&A</option>
                    <option value="cloze">Cloze Deletion</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-muted-foreground mb-1.5 block uppercase tracking-wide">
                    Provider
                  </label>
                  <div className="flex gap-1.5">
                    <select
                      value={preferredProvider}
                      onChange={(e) => onProviderChange(e.target.value)}
                      disabled={loadingProviders}
                      className="nb-border-2 h-10 flex-1 bg-background px-3 text-sm font-medium outline-none disabled:opacity-60"
                    >
                      {loadingProviders ? (
                        <option value="auto">Loading providers...</option>
                      ) : (
                        <>
                          <option value="auto">Auto (best available)</option>
                          {availableProviders.map((p) => (
                            <option key={p.provider} value={p.provider}>
                              {p.label} ({p.modelCount} model{p.modelCount !== 1 ? "s" : ""})
                            </option>
                          ))}
                        </>
                      )}
                    </select>
                    <button
                      onClick={onRefreshProviders}
                      disabled={loadingProviders}
                      title="Refresh providers"
                      className="nb-border nb-shadow-sm nb-hover-shadow h-10 w-10 flex items-center justify-center shrink-0 disabled:opacity-40"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${loadingProviders ? "animate-spin" : ""}`} />
                    </button>
                  </div>
                </div>
                <div className="flex flex-col justify-end gap-1.5">
                  <Button
                    onClick={onGenerate}
                    disabled={aiCardCount === 0}
                    className="nb-border nb-shadow-sm nb-hover-shadow bg-primary text-primary-foreground font-bold text-sm h-10 w-full disabled:opacity-40"
                  >
                    {aiGenerating ? (
                      <>
                        <Loader className="w-4 h-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Generate
                      </>
                    )}
                  </Button>
                  {aiCardCount === 0 && (
                    <p className="text-[11px] text-amber-600 font-medium text-center leading-tight">
                      Set card count to 1 or more to generate
                    </p>
                  )}
                </div>
              </div>

              <div className="mb-3">
                <label className="text-xs font-bold text-muted-foreground mb-1.5 block uppercase tracking-wide">
                  Topic or notes
                </label>
                <Textarea
                  value={aiPrompt}
                  onChange={(e) => onPromptChange(e.target.value)}
                  placeholder="Example: Create a deck on cell respiration for first-year biology students, focusing on core terms, stages, and key differences."
                  className="nb-border-2 min-h-[130px] resize-none text-sm font-medium"
                />
              </div>

              <p className="text-[11px] text-muted-foreground font-medium">
                Tip: The prompt can be as short as a topic name or as detailed as lecture notes.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* AI Preview Cards */}
      <AnimatePresence>
        {aiPreviewCards && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mb-6"
          >
            <div className="nb-border bg-white nb-shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-bold text-sm flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    AI GENERATED CARDS ({aiPreviewCards.length})
                  </h2>
                  <p className="text-xs text-muted-foreground font-medium mt-0.5">
                    {aiPreviewDeckName || aiDeckName || "AI deck"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 justify-end">
                  <Button
                    onClick={() => onAcceptCards(false)}
                    className="nb-border nb-shadow-sm nb-hover-shadow bg-secondary font-bold text-sm"
                  >
                    <Check className="w-4 h-4" />
                    Add to Current Deck
                  </Button>
                  <Button
                    onClick={() => onAcceptCards(true)}
                    className="nb-border nb-shadow-sm nb-hover-shadow bg-primary text-primary-foreground font-bold text-sm"
                  >
                    <Layers className="w-4 h-4" />
                    Create New Deck
                  </Button>
                  <Button
                    onClick={onDiscard}
                    variant="outline"
                    className="nb-border nb-shadow-sm nb-hover-shadow font-bold text-sm"
                  >
                    Discard
                  </Button>
                </div>
              </div>

              {aiPreviewSummary && (
                <div className="nb-border-2 bg-muted/30 p-3 mb-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
                    AI Summary
                  </p>
                  <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                    {aiPreviewSummary}
                  </p>
                </div>
              )}

              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {aiPreviewCards.map((card, idx) => (
                  <DocCardItem
                    key={idx}
                    card={card}
                    index={idx}
                    onEdit={(f, b) => onAiPreviewEdit(idx, f, b)}
                    onRemove={() => onAiPreviewRemove(idx)}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
