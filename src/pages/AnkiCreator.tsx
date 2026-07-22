import React, { useState, useCallback, useEffect, lazy, Suspense } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check } from "lucide-react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { AnkiCard } from "@/lib/anki";
import type { ProviderOption } from "@/types/providers";
import {
  sanitizeProviderOptions,
  PROVIDERS_CACHE_VERSION,
  PROVIDERS_CACHE_KEY,
  PROVIDERS_CACHE_VERSION_KEY,
} from "@/types/providers";
import { useDeckStore, type Deck } from "@/hooks/use-deck-store";
import { useDeviceToken } from "@/hooks/use-device-token";
import { showRecoveryToast } from "@/lib/utils";
import DeckSidebar from "@/components/DeckSidebar";
import AnkiCreatorHeader from "@/components/AnkiCreatorHeader";
import DocumentGenerationSection from "@/components/DocumentGenerationSection";
import AiGenerationSection from "@/components/AiGenerationSection";
import ManualCardsSection from "@/components/ManualCardsSection";
import PreviewModal from "@/components/PreviewModal";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const DeckDetailModal = lazy(() => import("@/components/DeckDetailModal"));

export default function AnkiCreator() {
  const deckStore = useDeckStore();
  const {
    decks,
    activeDeckId,
    activeDeck,
    openedDeck,
    setActiveDeckId,
    setOpenedDeckId,
    addDeck,
    removeDeck,
    renameDeck,
    removeCard,
    editCard,
  } = deckStore;

  // UI state
  const [editingDeckName, setEditingDeckName] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState("");
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [previewCard, setPreviewCard] = useState<AnkiCard | null>(null);

  // Shared generation settings
  const [preferredProvider, setPreferredProvider] = useState("auto");
  const [cardType, setCardType] = useState<"basic" | "cloze">("basic");

  // Provider catalog
  const providerCatalog = useQuery(api.providerCatalog.catalog);
  const catalogUpdatedAt = useQuery(api.providerCatalog.latestUpdatedAt);

  const [{ providers: cachedProviders, cacheRecoveryReason }] = useState(() => {
    try {
      const savedVersion = localStorage.getItem(PROVIDERS_CACHE_VERSION_KEY);
      if (savedVersion !== String(PROVIDERS_CACHE_VERSION)) {
        return {
          providers: [] as ProviderOption[],
          cacheRecoveryReason: savedVersion !== null ? "stale-version" as const : undefined,
        };
      }
      const cached = localStorage.getItem(PROVIDERS_CACHE_KEY);
      if (!cached) return { providers: [] as ProviderOption[], cacheRecoveryReason: undefined };
      const sanitized = sanitizeProviderOptions(JSON.parse(cached));
      return {
        providers: sanitized,
        cacheRecoveryReason: sanitized.length === 0 ? "invalid-data" as const : undefined,
      };
    } catch {
      return { providers: [] as ProviderOption[], cacheRecoveryReason: "parse-error" as const };
    }
  });

  const availableProviders = providerCatalog ?? cachedProviders;

  useEffect(() => {
    if (providerCatalog) {
      try {
        localStorage.setItem(PROVIDERS_CACHE_KEY, JSON.stringify(providerCatalog));
        localStorage.setItem(PROVIDERS_CACHE_VERSION_KEY, String(PROVIDERS_CACHE_VERSION));
      } catch {
        // ignore localStorage write errors
      }
    }
  }, [providerCatalog]);

  // Notify user if provider cache was recovered from stale/corrupted data.
  // useRef guard prevents duplicate toasts in React StrictMode (mount → unmount → remount).
  const hasShownCacheRecovery = React.useRef(false);
  useEffect(() => {
    if (!cacheRecoveryReason || hasShownCacheRecovery.current) return;
    hasShownCacheRecovery.current = true;
    const messages: Record<string, string> = {
      "stale-version": "Provider cache was outdated and has been refreshed.",
      "invalid-data": "Provider cache was corrupted and has been cleared.",
      "parse-error": "Provider cache could not be read and has been reset.",
    };
    const msg = messages[cacheRecoveryReason];
    if (msg) showRecoveryToast(msg);
  }, [cacheRecoveryReason]);

  const loadingProviders = providerCatalog === undefined && availableProviders.length === 0;

  // Device token
  const deviceToken = useDeviceToken();

  // Toast helper
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  // Provider refresh
  const refreshProviders = useAction(api.availableProviders.refresh);
  const handleRefreshProviders = useCallback(() => {
    refreshProviders().catch(() => {});
  }, [refreshProviders]);

  const STALE_MS = 24 * 60 * 60 * 1000;
  useEffect(() => {
    if (catalogUpdatedAt === undefined) return;
    const isStale = catalogUpdatedAt === 0 || Date.now() - catalogUpdatedAt > STALE_MS;
    if (isStale) {
      React.startTransition(() => {
        handleRefreshProviders();
      });
    }
  }, [catalogUpdatedAt, handleRefreshProviders, STALE_MS]);

  // Deck rename helpers
  const startRename = useCallback((deck: Deck) => {
    setEditingDeckName(deck.id);
    setEditNameValue(deck.name);
  }, []);

  const commitRename = useCallback(() => {
    if (editingDeckName && editNameValue.trim()) {
      renameDeck(editingDeckName, editNameValue.trim());
    }
    setEditingDeckName(null);
  }, [editingDeckName, editNameValue, renameDeck]);

  // Export helpers
  const recordTelemetry = useMutation(api.generationTelemetry.record);
  const recordAppEvent = useCallback(
    (event: string, metric?: number) => {
      void recordTelemetry({ event, metric }).catch(() => {});
    },
    [recordTelemetry],
  );

  const handleExport = useCallback(async () => {
    if (!activeDeck) return;
    setExporting(true);
    try {
      const { generateAnkiPackage } = await import("@/lib/anki");
      await generateAnkiPackage({ name: activeDeck.name, cards: activeDeck.cards });
      recordAppEvent("export_succeeded", activeDeck.cards.length);
      showToast(`Exported "${activeDeck.name}" successfully!`);
    } catch (err) {
      recordAppEvent("export_failed");
      showToast(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }, [activeDeck, recordAppEvent, showToast]);

  const deckCardCount = decks.reduce((sum, d) => sum + d.cards.length, 0);

  const handleExportDeck = useCallback(async (deck: Deck) => {
    setExporting(true);
    try {
      const { generateAnkiPackage } = await import("@/lib/anki");
      await generateAnkiPackage({ name: deck.name, cards: deck.cards });
      recordAppEvent("export_succeeded", deck.cards.length);
      showToast(`Exported "${deck.name}" successfully!`);
    } catch (err) {
      recordAppEvent("export_failed");
      showToast(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }, [recordAppEvent, showToast]);

  return (
    <div className="min-h-screen bg-background">
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] nb-border nb-shadow-sm bg-secondary px-5 py-2.5 text-sm font-semibold"
          >
            <Check className="inline-block w-4 h-4 mr-2 -mt-0.5" />
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      <AnkiCreatorHeader
        deckCount={decks.length}
        cardCount={deckCardCount}
        activeDeck={activeDeck}
        exporting={exporting}
        onExport={handleExport}
      />

      <div className="w-full px-6 lg:px-10 py-6 flex flex-col lg:flex-row gap-6">
        <DeckSidebar
          decks={decks}
          activeDeckId={activeDeckId}
          editingDeckName={editingDeckName}
          editNameValue={editNameValue}
          onSetActiveDeckId={setActiveDeckId}
          onSetOpenedDeckId={setOpenedDeckId}
          onAddDeck={addDeck}
          onRemoveDeck={removeDeck}
          onStartRename={startRename}
          onSetEditNameValue={setEditNameValue}
          onCommitRename={commitRename}
          onSetEditingDeckName={setEditingDeckName}
          showToast={showToast}
        />

        <main className="flex-1 min-w-0">
          <DocumentGenerationSection
            showToast={showToast}
            recordAppEvent={recordAppEvent}
            deviceToken={deviceToken}
            preferredProvider={preferredProvider}
            onProviderChange={setPreferredProvider}
            cardType={cardType}
            onCardTypeChange={setCardType}
            availableProviders={availableProviders}
            loadingProviders={loadingProviders}
            onRefreshProviders={handleRefreshProviders}
          />

          <AiGenerationSection
            showToast={showToast}
            deviceToken={deviceToken}
            preferredProvider={preferredProvider}
            onProviderChange={setPreferredProvider}
            cardType={cardType}
            onCardTypeChange={setCardType}
            availableProviders={availableProviders}
            loadingProviders={loadingProviders}
            onRefreshProviders={handleRefreshProviders}
            activeDeckName={activeDeck?.name}
          />

          <ManualCardsSection
            showToast={showToast}
            recordAppEvent={recordAppEvent}
            onPreview={setPreviewCard}
          />
        </main>
      </div>

      <ErrorBoundary fallback={null}>
        <Suspense fallback={null}>
          <DeckDetailModal
            openedDeck={openedDeck}
            exporting={exporting}
            onClose={() => setOpenedDeckId(null)}
            onExport={handleExportDeck}
            onEditCard={editCard}
            onRemoveCard={removeCard}
            onPreview={setPreviewCard}
          />
        </Suspense>
      </ErrorBoundary>

      <PreviewModal
        previewCard={previewCard}
        onClose={() => setPreviewCard(null)}
      />
    </div>
  );
}
