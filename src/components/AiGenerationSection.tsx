import React, { useState, useCallback, lazy, Suspense } from "react";
import { useAction, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { AnkiCard } from "@/lib/anki";
import { estimatePromptTimeoutSeconds } from "@/lib/generationTiming";
import type { ProviderOption } from "@/types/providers";
import { useDeckStore } from "@/hooks/use-deck-store";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import SectionFallback from "@/components/SectionFallback";

const AiDeckBuilder = lazy(() => import("@/components/AiDeckBuilder"));

interface AiGenerationSectionProps {
  showToast: (msg: string) => void;
  deviceToken: string;
  preferredProvider: string;
  onProviderChange: (provider: string) => void;
  cardType: "basic" | "cloze";
  onCardTypeChange: (type: "basic" | "cloze") => void;
  availableProviders: ProviderOption[];
  loadingProviders: boolean;
  onRefreshProviders: () => void;
  activeDeckName?: string;
}

export default function AiGenerationSection({
  showToast,
  deviceToken,
  preferredProvider,
  onProviderChange,
  cardType,
  onCardTypeChange,
  availableProviders,
  loadingProviders,
  onRefreshProviders,
  activeDeckName,
}: AiGenerationSectionProps) {
  const { activeDeckId, addCards, createDeckWithCards } = useDeckStore();

  const [showAiBuilder, setShowAiBuilder] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiDeckName, setAiDeckName] = useState("");
  const [aiCardCount, setAiCardCount] = useState(12);
  const [aiDifficulty, setAiDifficulty] = useState<"beginner" | "intermediate" | "advanced">("intermediate");
  const [aiPreviewCards, setAiPreviewCards] = useState<AnkiCard[] | null>(null);
  const [aiPreviewDeckName, setAiPreviewDeckName] = useState("");
  const [aiPreviewSummary, setAiPreviewSummary] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);

  const createGenerationJob = useMutation(api.generationJobs.create);
  const generateDeckFromPrompt = useAction(api.deckGeneration.generateDeckFromPrompt);

  const handleAiGenerate = useCallback(async () => {
    const prompt = aiPrompt.trim();
    if (!prompt) { showToast("Describe the deck you want to generate"); return; }
    setAiGenerating(true);
    try {
      const timeoutSeconds = estimatePromptTimeoutSeconds(aiCardCount);
      const etaSeconds = Math.max(18, Math.round(8 + aiCardCount * 1.2));
      const jobId = await createGenerationJob({
        kind: "prompt", requestedCount: aiCardCount,
        totalProviders: 0, totalModels: 0, totalSections: 1,
        message: "Queued AI deck generation", etaSeconds, timeoutSeconds,
        deadlineAt: Date.now() + timeoutSeconds * 1000,
      });
      const result = await generateDeckFromPrompt({
        prompt, deckName: aiDeckName.trim() || undefined,
        cardCount: aiCardCount, difficulty: aiDifficulty, jobId,
        preferredProvider: preferredProvider === "auto" ? undefined : preferredProvider,
        cardType,
        deviceToken,
      });
      const cards = result.cards.map((card: { front: string; back: string }) => ({
        front: card.front.trim(), back: card.back.trim(),
      }));
      if (cards.length === 0) { showToast("AI returned no usable cards"); return; }
      setAiPreviewCards(cards);
      setAiPreviewDeckName(result.deckName);
      setAiPreviewSummary(result.summary);
      showToast(`Generated ${cards.length} card(s)`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "AI generation failed");
    } finally {
      setAiGenerating(false);
    }
  }, [aiPrompt, aiDeckName, aiCardCount, aiDifficulty, preferredProvider, cardType, deviceToken, generateDeckFromPrompt, showToast, createGenerationJob]);

  const acceptAiCards = useCallback((createNewDeck: boolean) => {
    if (!aiPreviewCards || aiPreviewCards.length === 0) { showToast("No AI cards to add"); return; }
    const deckName = aiPreviewDeckName.trim() || aiDeckName.trim() || "AI Deck";
    if (createNewDeck) {
      createDeckWithCards(deckName, aiPreviewCards);
      showToast(`Created "${deckName}" with ${aiPreviewCards.length} card(s)`);
    } else {
      addCards(activeDeckId, aiPreviewCards);
      showToast(`Added ${aiPreviewCards.length} AI card(s) to the active deck`);
    }
    setAiPreviewCards(null);
    setAiPreviewDeckName("");
    setAiPreviewSummary("");
  }, [aiPreviewCards, aiPreviewDeckName, aiDeckName, activeDeckId, createDeckWithCards, addCards, showToast]);

  const clearAiState = useCallback(() => {
    setAiPreviewCards(null);
    setAiPreviewDeckName("");
    setAiPreviewSummary("");
  }, []);

  const editAiPreviewCard = useCallback((idx: number, front: string, back: string) => {
    setAiPreviewCards((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      next[idx] = { front, back };
      return next;
    });
  }, []);

  const removeAiPreviewCard = useCallback((idx: number) => {
    setAiPreviewCards((prev) => (prev ? prev.filter((_, i) => i !== idx) : prev));
  }, []);

  return (
    <ErrorBoundary
      fallback={
        <div className="nb-border bg-white p-5 mb-6 text-sm text-destructive font-bold">
          AI deck builder failed to load. Please refresh the page.
        </div>
      }
    >
      <Suspense fallback={<SectionFallback />}>
        <AiDeckBuilder
          showAiBuilder={showAiBuilder}
          aiPrompt={aiPrompt}
          aiDeckName={aiDeckName}
          aiCardCount={aiCardCount}
          aiDifficulty={aiDifficulty}
          cardType={cardType}
          onCardTypeChange={onCardTypeChange}
          aiPreviewCards={aiPreviewCards}
          aiPreviewDeckName={aiPreviewDeckName}
          aiPreviewSummary={aiPreviewSummary}
          aiGenerating={aiGenerating}
          activeDeckName={activeDeckName}
          preferredProvider={preferredProvider}
          availableProviders={availableProviders}
          loadingProviders={loadingProviders}
          onToggle={() => setShowAiBuilder((v) => !v)}
          onPromptChange={setAiPrompt}
          onDeckNameChange={setAiDeckName}
          onCardCountChange={setAiCardCount}
          onDifficultyChange={setAiDifficulty}
          onProviderChange={onProviderChange}
          onRefreshProviders={onRefreshProviders}
          onGenerate={handleAiGenerate}
          onAcceptCards={acceptAiCards}
          onDiscard={clearAiState}
          onAiPreviewEdit={editAiPreviewCard}
          onAiPreviewRemove={removeAiPreviewCard}
        />
      </Suspense>
    </ErrorBoundary>
  );
}
