import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Trash2,
  Download,
  Upload,
  FileText,
  Layers,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Check,
  ArrowLeft,
  Pencil,
  Eye,
  FileUp,
  Loader,
  Zap,
  X,
  BookOpen,
} from "lucide-react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { generateAnkiPackage, type AnkiCard } from "@/lib/anki";
import { extractTextFromFile } from "@/lib/docParser";
import { generateCardsFromText } from "@/lib/cardGenerator";
import { useDeckStore, type Deck } from "@/hooks/use-deck-store";

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
    addCard: addCardToDeckStore,
    addCards,
    createDeckWithCards,
    removeCard,
    editCard,
    totalCards,
  } = deckStore;

  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [editingDeckName, setEditingDeckName] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState("");
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [previewCard, setPreviewCard] = useState<AnkiCard | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importText, setImportText] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const dragDepth = useRef(0);
  const [processing, setProcessing] = useState(false);
  const [showDocUpload, setShowDocUpload] = useState(false);
  const [docMode, setDocMode] = useState<"ai" | "quick">("ai");
  const [docPreviewCards, setDocPreviewCards] = useState<AnkiCard[] | null>(null);
  const [docPreviewText, setDocPreviewText] = useState("");
  const [docPreviewDeckName, setDocPreviewDeckName] = useState("");
  const [docPreviewSummary, setDocPreviewSummary] = useState("");
  const [docPreviewWarnings, setDocPreviewWarnings] = useState<string[]>([]);
  const [docFileName, setDocFileName] = useState("");
  const [docCardCount, setDocCardCount] = useState(12);
  const [docDifficulty, setDocDifficulty] = useState<
    "beginner" | "intermediate" | "advanced"
  >("intermediate");
  const [showAiBuilder, setShowAiBuilder] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiDeckName, setAiDeckName] = useState("");
  const [aiCardCount, setAiCardCount] = useState(12);
  const [aiDifficulty, setAiDifficulty] = useState<
    "beginner" | "intermediate" | "advanced"
  >("intermediate");
  const [aiPreviewCards, setAiPreviewCards] = useState<AnkiCard[] | null>(null);
  const [aiPreviewDeckName, setAiPreviewDeckName] = useState("");
  const [aiPreviewSummary, setAiPreviewSummary] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docFileInputRef = useRef<HTMLInputElement>(null);
  const docFullTextRef = useRef<string>("");
  const createGenerationJob = useMutation(api.generationJobs.create);
  const recentGenerationJobs = useQuery(api.generationJobs.listRecent, { limit: 8 }) ?? [];
  const generateDeckFromPrompt = useAction(api.deckGeneration.generateDeckFromPrompt);
  const generateDeckFromDocument = useAction(api.deckGeneration.generateDeckFromDocument);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  useEffect(() => {
    if (recentGenerationJobs.length === 0) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [recentGenerationJobs.length]);

  const formatDuration = useCallback((seconds: number) => {
    const safe = Math.max(0, Math.ceil(seconds));
    const minutes = Math.floor(safe / 60);
    const remainder = safe % 60;
    if (minutes === 0) return `${remainder}s`;
    return `${minutes}m ${String(remainder).padStart(2, "0")}s`;
  }, []);

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

  const addCard = useCallback(() => {
    if (!front.trim() || !back.trim()) {
      showToast("Fill in both Front and Back fields");
      return;
    }
    addCardToDeckStore(activeDeckId, front.trim(), back.trim());
    setFront("");
    setBack("");
    showToast("Card added!");
  }, [front, back, activeDeckId, addCardToDeckStore, showToast]);

  const handleImport = useCallback(() => {
    const lines = importText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      showToast("No cards to import");
      return;
    }
    const newCards: AnkiCard[] = [];
    for (const line of lines) {
      const parts = line.split(/[;\t|]/);
      if (parts.length >= 2) {
        newCards.push({ front: parts[0].trim(), back: parts[1].trim() });
      }
    }
    if (newCards.length === 0) {
      showToast("Use semicolon, tab, or pipe to separate front/back");
      return;
    }
    addCards(activeDeckId, newCards);
    setImportText("");
    setShowImport(false);
    showToast(`Imported ${newCards.length} card(s)`);
  }, [importText, activeDeckId, addCards, showToast]);

  const handleCsvUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result as string;
        const lines = text
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean);
        const newCards: AnkiCard[] = [];
        for (const line of lines) {
          if (line.toLowerCase().startsWith("front")) continue;
          const parts = line.split(/[,;\t|]/);
          if (parts.length >= 2) {
            newCards.push({
              front: parts[0].trim().replace(/^["']|["']$/g, ""),
              back: parts[1].trim().replace(/^["']|["']$/g, ""),
            });
          }
        }
        if (newCards.length > 0) {
          addCards(activeDeckId, newCards);
          showToast(`Imported ${newCards.length} card(s) from file`);
        } else {
          showToast("No valid cards found in file");
        }
      };
      reader.readAsText(file);
      e.target.value = "";
    },
    [activeDeckId, addCards, showToast]
  );

  const processDocument = useCallback(
    async (file: File) => {
      setProcessing(true);
      setDocFileName(file.name);
      setDocPreviewCards(null);
      setDocPreviewSummary("");
      setDocPreviewDeckName("");
      try {
        const text = await extractTextFromFile(file);
        if (!text || text.trim().length < 30) {
          showToast("Could not extract enough text from the document");
          return;
        }
        docFullTextRef.current = text;
        setDocPreviewText(text.slice(0, 500) + (text.length > 500 ? "..." : ""));

        if (docMode === "ai") {
          const jobId = await createGenerationJob({
            kind: "document",
            requestedCount: docCardCount,
            totalProviders: 0,
            totalModels: 0,
            totalSections: Math.min(3, Math.max(1, Math.ceil(text.length / 6000))),
            message: "Queued document generation",
            etaSeconds: Math.max(20, Math.round(14 + docCardCount * 1.8)),
          });
          const result = await generateDeckFromDocument({
            text,
            cardCount: docCardCount,
            difficulty: docDifficulty,
            jobId,
          });
          const cards = result.cards.map((card: { front: string; back: string }) => ({
            front: card.front.trim(),
            back: card.back.trim(),
          }));
          if (cards.length === 0) {
            showToast("AI could not generate cards from this document");
            return;
          }
          setDocPreviewCards(cards);
          setDocPreviewDeckName(result.deckName);
          setDocPreviewSummary(result.summary);
          setDocPreviewWarnings(result.warnings ?? []);
          const warnNote = result.partial ? " (some sections failed)" : "";
          showToast(`AI generated ${cards.length} card(s)${warnNote} — review below`);
        } else {
          const cards = generateCardsFromText(text, docCardCount);
          if (cards.length === 0) {
            showToast("No cards could be auto-generated from this document");
            return;
          }
          setDocPreviewCards(cards);
          showToast(`Found ${cards.length} card(s) — review below`);
        }
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Failed to process document");
      } finally {
        setProcessing(false);
      }
    },
    [docMode, docCardCount, docDifficulty, generateDeckFromDocument, showToast, createGenerationJob]
  );

  const handleDocFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processDocument(file);
      e.target.value = "";
    },
    [processDocument]
  );

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      dragDepth.current++;
      setDragActive(true);
    } else if (e.type === "dragleave") {
      dragDepth.current--;
      if (dragDepth.current <= 0) {
        dragDepth.current = 0;
        setDragActive(false);
      }
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragDepth.current = 0;
      setDragActive(false);
      const file = e.dataTransfer.files?.[0];
      if (file) processDocument(file);
    },
    [processDocument]
  );

  const acceptDocCards = useCallback(
    (createNewDeck: boolean) => {
      if (!docPreviewCards) return;

      if (createNewDeck) {
        const deckName = docPreviewDeckName.trim() || docFileName.replace(/\.[^.]+$/, "") || "Document Deck";
        createDeckWithCards(deckName, docPreviewCards);
        showToast(`Created "${deckName}" with ${docPreviewCards.length} card(s)`);
      } else {
        addCards(activeDeckId, docPreviewCards);
        showToast(`Added ${docPreviewCards.length} card(s) to deck`);
      }

      setDocPreviewCards(null);
      setDocPreviewText("");
      setDocFileName("");
      setDocPreviewSummary("");
      setDocPreviewDeckName("");
      setDocPreviewWarnings([]);
      docFullTextRef.current = "";
    },
    [docPreviewCards, docPreviewDeckName, docFileName, activeDeckId, createDeckWithCards, addCards, showToast]
  );

  const acceptAiCards = useCallback(
    (createNewDeck: boolean) => {
      if (!aiPreviewCards || aiPreviewCards.length === 0) {
        showToast("No AI cards to add");
        return;
      }

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
    },
    [aiPreviewCards, aiPreviewDeckName, aiDeckName, activeDeckId, createDeckWithCards, addCards, showToast]
  );

  const editDocCard = useCallback(
    (idx: number, front: string, back: string) => {
      if (!docPreviewCards) return;
      const updated = [...docPreviewCards];
      updated[idx] = { front, back };
      setDocPreviewCards(updated);
    },
    [docPreviewCards]
  );

  const removeDocCard = useCallback(
    (idx: number) => {
      if (!docPreviewCards) return;
      setDocPreviewCards(docPreviewCards.filter((_, i) => i !== idx));
    },
    [docPreviewCards]
  );

  const handleAiGenerate = useCallback(async () => {
    const prompt = aiPrompt.trim();
    if (!prompt) {
      showToast("Describe the deck you want to generate");
      return;
    }

    setAiGenerating(true);
    try {
      const jobId = await createGenerationJob({
        kind: "prompt",
        requestedCount: aiCardCount,
        totalProviders: 0,
        totalModels: 0,
        totalSections: 1,
        message: "Queued AI deck generation",
        etaSeconds: Math.max(18, Math.round(10 + aiCardCount * 1.6)),
      });
      const result = await generateDeckFromPrompt({
        prompt,
        deckName: aiDeckName.trim() || undefined,
        cardCount: aiCardCount,
        difficulty: aiDifficulty,
        jobId,
      });

      const cards = result.cards.map((card: { front: string; back: string }) => ({
        front: card.front.trim(),
        back: card.back.trim(),
      }));

      if (cards.length === 0) {
        showToast("AI returned no usable cards");
        return;
      }

      setAiPreviewCards(cards);
      setAiPreviewDeckName(result.deckName);
      setAiPreviewSummary(result.summary);
      showToast(`Generated ${cards.length} card(s)`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "AI generation failed");
    } finally {
      setAiGenerating(false);
    }
  }, [
    aiPrompt,
    aiDeckName,
    aiCardCount,
    aiDifficulty,
    generateDeckFromPrompt,
    showToast,
    createGenerationJob,
  ]);

  const handleExport = useCallback(async () => {
    if (!activeDeck) return;
    setExporting(true);
    try {
      await generateAnkiPackage({ name: activeDeck.name, cards: activeDeck.cards });
      showToast(`Exported "${activeDeck.name}" successfully!`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }, [activeDeck, showToast]);

  const handleExportDeck = useCallback(async (deck: Deck) => {
    setExporting(true);
    try {
      await generateAnkiPackage({ name: deck.name, cards: deck.cards });
      showToast(`Exported "${deck.name}" successfully!`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  },     [showToast]);

  const deckCardCount = decks.reduce((sum, d) => sum + d.cards.length, 0);

  return (
    <div className="min-h-screen bg-background">
      {/* Toast */}
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

      {recentGenerationJobs.length > 0 && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-4">
          <div className="nb-border bg-white nb-shadow-sm p-4 sm:p-5">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between mb-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-1">
                  Live Queue
                </p>
                <h2 className="text-base sm:text-lg font-bold tracking-tight">
                  {recentGenerationJobs.filter((job) => job.status === "running" || job.status === "queued").length > 0
                    ? "Generating decks"
                    : "Recent generations"}
                </h2>
              </div>
              <p className="text-xs text-muted-foreground font-medium">
                Showing the latest {recentGenerationJobs.length} request{recentGenerationJobs.length !== 1 ? "s" : ""}
              </p>
            </div>

            <div className="grid gap-3">
              {recentGenerationJobs.map((job) => {
                const liveEtaSeconds =
                  job.status === "running" || job.status === "queued"
                    ? Math.max(0, job.etaSeconds - Math.floor((now - job.updatedAt) / 1000))
                    : 0;
                const statusLabel =
                  job.status === "queued"
                    ? "Queued"
                    : job.status === "running"
                      ? "Running"
                      : job.status === "succeeded"
                        ? "Complete"
                        : "Failed";
                const statusTone =
                  job.status === "succeeded"
                    ? "bg-emerald-100 text-emerald-800"
                    : job.status === "failed"
                      ? "bg-red-100 text-red-800"
                      : job.status === "running"
                        ? "bg-blue-100 text-blue-800"
                        : "bg-amber-100 text-amber-800";
                const providerLabel = job.provider || "Provider pending";
                const modelLabel = job.model || "Model pending";
                const providerChain =
                  job.totalProviders > 0
                    ? `Provider ${Math.min(job.providerIndex + 1, job.totalProviders)} / ${job.totalProviders}`
                    : "Provider chain pending";
                const modelChain =
                  job.totalModels > 0
                    ? `Model ${Math.min(job.modelIndex + 1, job.totalModels)} / ${job.totalModels}`
                    : "Model chain pending";

                return (
                  <div key={job._id} className="nb-border-2 bg-muted/20 p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span className={`text-[10px] font-bold uppercase tracking-[0.2em] px-2 py-1 ${statusTone}`}>
                            {statusLabel}
                          </span>
                          <span className="text-[10px] font-bold uppercase tracking-[0.2em] px-2 py-1 bg-white nb-border">
                            {job.kind}
                          </span>
                          <span className="text-[10px] font-bold uppercase tracking-[0.2em] px-2 py-1 bg-white nb-border">
                            {job.requestedCount} cards
                          </span>
                        </div>
                        <h3 className="text-sm sm:text-base font-bold tracking-tight">
                          {providerLabel} / {modelLabel}
                        </h3>
                        <p className="text-sm text-muted-foreground font-medium mt-1 break-words">
                          {job.message}
                        </p>
                        <p className="text-xs text-muted-foreground font-medium mt-2">
                          {providerChain} · {modelChain}
                        </p>
                        {job.error && (
                          <p className="text-xs text-red-700 font-semibold mt-2 break-words">
                            {job.error}
                          </p>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-3 lg:min-w-[250px]">
                        <div className="text-right lg:text-left">
                          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                            ETA
                          </p>
                          <p className="text-2xl font-bold tracking-tight">
                            {job.status === "running" || job.status === "queued"
                              ? formatDuration(liveEtaSeconds)
                              : "0s"}
                          </p>
                        </div>
                        <div className="text-right lg:text-left">
                          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                            Progress
                          </p>
                          <p className="text-2xl font-bold tracking-tight">
                            {Math.round(Math.max(0, Math.min(1, job.progress)) * 100)}%
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="h-2 w-full bg-white overflow-hidden nb-border-2">
                        <motion.div
                          className="h-full bg-primary"
                          initial={false}
                          animate={{ width: `${Math.max(4, Math.min(100, job.progress * 100))}%` }}
                          transition={{ duration: 0.2 }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="border-b-[3px] border-black bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/" className="nb-border nb-shadow-sm px-3 py-1.5 bg-secondary font-bold text-sm nb-hover-shadow">
              <ArrowLeft className="w-4 h-4 inline -mt-0.5" />
            </a>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2">
                <Layers className="w-6 h-6" />
                Anki Deck Creator
              </h1>
              <p className="text-xs text-muted-foreground font-medium mt-0.5">
                {decks.length} deck{decks.length !== 1 ? "s" : ""} · {deckCardCount} card{deckCardCount !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <Button
            onClick={handleExport}
            disabled={exporting || !activeDeck || activeDeck.cards.length === 0}
            className="nb-border nb-shadow-sm nb-hover-shadow bg-primary text-primary-foreground font-bold text-sm px-4 h-9 disabled:opacity-40"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">{exporting ? "Exporting..." : "Export .apkg"}</span>
            <span className="sm:hidden">.apkg</span>
          </Button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex flex-col lg:flex-row gap-6">
        {/* Sidebar: Deck List */}
        <aside className="lg:w-64 shrink-0">
          <div className="nb-border bg-white nb-shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-sm">DECKS</h2>
              <Button
                onClick={addDeck}
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
                        value={editNameValue}
                        onChange={(e) => setEditNameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename();
                          if (e.key === "Escape") setEditingDeckName(null);
                        }}
                        onBlur={commitRename}
                        autoFocus
                        className="h-6 text-xs nb-border-2 font-bold"
                      />
                    </div>
                  ) : (
                    <div
                      onClick={() => {
                        setActiveDeckId(deck.id);
                        setOpenedDeckId(deck.id);
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm truncate flex items-center gap-1.5">
                            <BookOpen className="w-3.5 h-3.5 shrink-0 opacity-60" />
                            {deck.name}
                          </p>
                          <p className="text-xs text-muted-foreground font-normal ml-5">
                            {deck.cards.length} card{deck.cards.length !== 1 ? "s" : ""}
                          </p>
                        </div>
                        <div className="flex gap-1 ml-2 shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              startRename(deck);
                            }}
                            className="p-1 hover:bg-muted transition-colors"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          {decks.length > 1 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                removeDeck(deck.id, showToast);
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

        {/* Main Content */}
        <main className="flex-1 min-w-0">
          {/* Auto-Generate from Document */}
          <div className="nb-border bg-white nb-shadow-sm p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-sm flex items-center gap-2">
                <Zap className="w-4 h-4" />
                AUTO-GENERATE FROM DOCUMENT
              </h2>
              <Button
                onClick={() => setShowDocUpload(!showDocUpload)}
                variant="outline"
                size="sm"
                className="nb-border nb-shadow-sm nb-hover-shadow font-bold text-xs h-7"
              >
                {showDocUpload ? "Close" : "Open"}
              </Button>
            </div>

            <AnimatePresence>
              {showDocUpload && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <p className="text-xs text-muted-foreground mb-3 font-medium">
                    Upload a document (PDF, Word, TXT, or MD) and we'll create flashcards from it.
                  </p>

                  {/* Mode toggle */}
                  <div className="flex gap-2 mb-4">
                    <button
                      onClick={() => setDocMode("ai")}
                      className={`flex-1 nb-border-2 px-3 py-2 text-xs font-bold transition-all ${
                        docMode === "ai"
                          ? "bg-primary text-primary-foreground nb-shadow-sm"
                          : "bg-white hover:bg-muted"
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />
                      AI Smart
                    </button>
                    <button
                      onClick={() => setDocMode("quick")}
                      className={`flex-1 nb-border-2 px-3 py-2 text-xs font-bold transition-all ${
                        docMode === "quick"
                          ? "bg-primary text-primary-foreground nb-shadow-sm"
                          : "bg-white hover:bg-muted"
                      }`}
                    >
                      <Zap className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />
                      Quick Extract
                    </button>
                  </div>

                  {docMode === "ai" && (
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div>
                        <label className="text-xs font-bold text-muted-foreground mb-1.5 block uppercase tracking-wide">
                          Card count
                        </label>
                      <Input
                        type="number"
                        min={4}
                        max={100}
                        value={docCardCount}
                        onChange={(e) =>
                          setDocCardCount(
                            Math.max(4, Math.min(100, Number(e.target.value) || 12))
                          )
                        }
                        className="nb-border-2 h-9 text-sm font-medium"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-muted-foreground mb-1.5 block uppercase tracking-wide">
                          Difficulty
                        </label>
                        <select
                          value={docDifficulty}
                          onChange={(e) =>
                            setDocDifficulty(e.target.value as
                              | "beginner"
                              | "intermediate"
                              | "advanced")
                          }
                          className="nb-border-2 h-9 w-full bg-background px-3 text-sm font-medium outline-none"
                        >
                          <option value="beginner">Beginner</option>
                          <option value="intermediate">Intermediate</option>
                          <option value="advanced">Advanced</option>
                        </select>
                      </div>
                    </div>
                  )}

                  <div
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                    className={`nb-border-2 border-dashed p-8 text-center transition-all ${
                      dragActive
                        ? "bg-secondary border-primary"
                        : "bg-muted/30 hover:bg-muted/50"
                    }`}
                  >
                    {processing ? (
                      <div className="flex flex-col items-center gap-3">
                        <Loader className="w-8 h-8 animate-spin text-primary" />
                        <p className="text-sm font-bold">Processing document...</p>
                        <p className="text-xs text-muted-foreground font-medium">
                          {docMode === "ai" ? "Extracting text and generating AI cards" : "Extracting text and finding cards"}
                        </p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-3">
                        <div className="nb-border bg-secondary p-3">
                          <FileUp className="w-8 h-8" />
                        </div>
                        <div>
                          <p className="text-sm font-bold">
                            Drop a document here, or{" "}
                            <button
                              onClick={() => docFileInputRef.current?.click()}
                              className="underline font-bold hover:text-primary"
                            >
                              browse
                            </button>
                          </p>
                          <p className="text-xs text-muted-foreground mt-1 font-medium">
                            Supports PDF, Word (.docx), TXT, and Markdown files
                          </p>
                        </div>
                      </div>
                    )}
                    <input
                      ref={docFileInputRef}
                      type="file"
                      accept=".pdf,.docx,.txt,.md,.markdown,.text"
                      className="hidden"
                      onChange={handleDocFileChange}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Document Preview Cards */}
          <AnimatePresence>
            {docPreviewCards && (
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
                        {docMode === "ai" ? "AI GENERATED" : "EXTRACTED"} CARDS ({docPreviewCards.length})
                      </h2>
                      <p className="text-xs text-muted-foreground font-medium mt-0.5">
                        From: {docFileName}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 justify-end">
                      <Button
                        onClick={() => acceptDocCards(false)}
                        className="nb-border nb-shadow-sm nb-hover-shadow bg-secondary font-bold text-sm"
                      >
                        <Check className="w-4 h-4" />
                        Add to Current Deck
                      </Button>
                      {docMode === "ai" && (
                        <Button
                          onClick={() => acceptDocCards(true)}
                          className="nb-border nb-shadow-sm nb-hover-shadow bg-primary text-primary-foreground font-bold text-sm"
                        >
                          <Layers className="w-4 h-4" />
                          Create New Deck
                        </Button>
                      )}
                      <Button
                        onClick={() => {
                          setDocPreviewCards(null);
                          setDocPreviewText("");
                          setDocFileName("");
                          setDocPreviewSummary("");
                          setDocPreviewDeckName("");
                          docFullTextRef.current = "";
                        }}
                        variant="outline"
                        className="nb-border nb-shadow-sm nb-hover-shadow font-bold text-sm"
                      >
                        Discard
                      </Button>
                    </div>
                  </div>

                  {docPreviewSummary && (
                    <div className="nb-border-2 bg-muted/30 p-3 mb-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
                        AI Summary
                      </p>
                      <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                        {docPreviewSummary}
                      </p>
                    </div>
                  )}

                  {docPreviewText && (
                    <div className="nb-border-2 bg-muted/30 p-3 mb-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
                        Extracted Text Preview
                      </p>
                      <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                        {docPreviewText}
                      </p>
                    </div>
                  )}

                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {docPreviewCards.map((card, idx) => (
                      <DocCardItem
                        key={idx}
                        card={card}
                        index={idx}
                        onEdit={(f, b) => editDocCard(idx, f, b)}
                        onRemove={() => removeDocCard(idx)}
                      />
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* AI Deck Builder */}
          <div className="nb-border bg-white nb-shadow-sm p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-sm flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                AI DECK BUILDER
              </h2>
              <Button
                onClick={() => setShowAiBuilder(!showAiBuilder)}
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

                  <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr_0.5fr_0.8fr] gap-3 mb-3">
                    <div>
                      <label className="text-xs font-bold text-muted-foreground mb-1.5 block uppercase tracking-wide">
                        Deck name
                      </label>
                      <Input
                        value={aiDeckName}
                        onChange={(e) => setAiDeckName(e.target.value)}
                        placeholder={activeDeck?.name || "AI generated deck"}
                        className="nb-border-2 h-10 text-sm font-medium"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-muted-foreground mb-1.5 block uppercase tracking-wide">
                        Card count
                      </label>
                      <Input
                        type="number"
                        min={4}
                        max={100}
                        value={aiCardCount}
                        onChange={(e) =>
                          setAiCardCount(
                            Math.max(4, Math.min(100, Number(e.target.value) || 12))
                          )
                        }
                        className="nb-border-2 h-10 text-sm font-medium"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-muted-foreground mb-1.5 block uppercase tracking-wide">
                        Difficulty
                      </label>
                      <select
                        value={aiDifficulty}
                        onChange={(e) =>
                          setAiDifficulty(e.target.value as
                            | "beginner"
                            | "intermediate"
                            | "advanced")
                        }
                        className="nb-border-2 h-10 w-full bg-background px-3 text-sm font-medium outline-none"
                      >
                        <option value="beginner">Beginner</option>
                        <option value="intermediate">Intermediate</option>
                        <option value="advanced">Advanced</option>
                      </select>
                    </div>
                    <div className="flex items-end">
                      <Button
                        onClick={handleAiGenerate}
                        className="nb-border nb-shadow-sm nb-hover-shadow bg-primary text-primary-foreground font-bold text-sm h-10 w-full"
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
                    </div>
                  </div>

                  <div className="mb-3">
                    <label className="text-xs font-bold text-muted-foreground mb-1.5 block uppercase tracking-wide">
                      Topic or notes
                    </label>
                    <Textarea
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
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
                        onClick={() => acceptAiCards(false)}
                        className="nb-border nb-shadow-sm nb-hover-shadow bg-secondary font-bold text-sm"
                      >
                        <Check className="w-4 h-4" />
                        Add to Current Deck
                      </Button>
                      <Button
                        onClick={() => acceptAiCards(true)}
                        className="nb-border nb-shadow-sm nb-hover-shadow bg-primary text-primary-foreground font-bold text-sm"
                      >
                        <Layers className="w-4 h-4" />
                        Create New Deck
                      </Button>
                      <Button
                        onClick={() => {
                          setAiPreviewCards(null);
                          setAiPreviewDeckName("");
                          setAiPreviewSummary("");
                        }}
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
                        onEdit={(f, b) => {
                          setAiPreviewCards((prev) => {
                            if (!prev) return prev;
                            const next = [...prev];
                            next[idx] = { front: f, back: b };
                            return next;
                          });
                        }}
                        onRemove={() =>
                          setAiPreviewCards((prev) =>
                            prev ? prev.filter((_, i) => i !== idx) : prev
                          )
                        }
                      />
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Add Card Form */}
          <div className="nb-border bg-white nb-shadow-sm p-5 mb-6">
            <h2 className="font-bold text-sm mb-4 flex items-center gap-2">
              <Plus className="w-4 h-4" />
              ADD NEW CARD
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-xs font-bold text-muted-foreground mb-1.5 block uppercase tracking-wide">
                  Front
                </label>
                <Textarea
                  value={front}
                  onChange={(e) => setFront(e.target.value)}
                  placeholder="Question or term..."
                  className="nb-border-2 min-h-[100px] resize-none text-sm font-medium"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) addCard();
                  }}
                />
              </div>
              <div>
                <label className="text-xs font-bold text-muted-foreground mb-1.5 block uppercase tracking-wide">
                  Back
                </label>
                <Textarea
                  value={back}
                  onChange={(e) => setBack(e.target.value)}
                  placeholder="Answer or definition..."
                  className="nb-border-2 min-h-[100px] resize-none text-sm font-medium"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) addCard();
                  }}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={addCard}
                className="nb-border nb-shadow-sm nb-hover-shadow bg-primary text-primary-foreground font-bold text-sm"
              >
                <Plus className="w-4 h-4" />
                Add Card
              </Button>
              <Button
                onClick={() => setShowImport(!showImport)}
                variant="outline"
                className="nb-border nb-shadow-sm nb-hover-shadow font-bold text-sm"
              >
                <Upload className="w-4 h-4" />
                Bulk Import
              </Button>
              <label className="nb-border nb-shadow-sm nb-hover-shadow bg-white px-4 h-9 inline-flex items-center gap-2 text-sm font-bold cursor-pointer hover:bg-muted transition-colors">
                <FileText className="w-4 h-4" />
                CSV File
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.tsv,.txt"
                  className="hidden"
                  onChange={handleCsvUpload}
                />
              </label>
            </div>
            <p className="text-xs text-muted-foreground mt-2 font-medium">
              Tip: Press <kbd className="nb-border px-1 py-0.5 text-[10px] font-bold mx-0.5">Ctrl</kbd>+<kbd className="nb-border px-1 py-0.5 text-[10px] font-bold mx-0.5">Enter</kbd> to quickly add a card
            </p>
          </div>

          {/* Bulk Import Panel */}
          <AnimatePresence>
            {showImport && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden mb-6"
              >
                <div className="nb-border bg-white nb-shadow-sm p-5">
                  <h2 className="font-bold text-sm mb-3 flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    BULK IMPORT
                  </h2>
                  <p className="text-xs text-muted-foreground mb-3 font-medium">
                    One card per line. Separate front and back with{" "}
                    <kbd className="nb-border px-1 py-0.5 text-[10px] font-bold">;</kbd>,{" "}
                    <kbd className="nb-border px-1 py-0.5 text-[10px] font-bold">Tab</kbd>, or{" "}
                    <kbd className="nb-border px-1 py-0.5 text-[10px] font-bold">|</kbd>
                  </p>
                  <Textarea
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    placeholder={"hello;你好\ngoodbye;再见\nthank you;谢谢"}
                    className="nb-border-2 min-h-[120px] resize-none text-sm font-mono"
                  />
                  <div className="flex gap-2 mt-3">
                    <Button
                      onClick={handleImport}
                      className="nb-border nb-shadow-sm nb-hover-shadow bg-secondary font-bold text-sm"
                    >
                      <Upload className="w-4 h-4" />
                      Import Cards
                    </Button>
                    <Button
                      onClick={() => {
                        setShowImport(false);
                        setImportText("");
                      }}
                      variant="outline"
                      className="nb-border nb-shadow-sm nb-hover-shadow font-bold text-sm"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Card List */}
          <div className="nb-border bg-white nb-shadow-sm">
            <div className="p-4 border-b-[3px] border-black flex items-center justify-between">
              <h2 className="font-bold text-sm flex items-center gap-2">
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
                            onClick={() => setPreviewCard(card)}
                            className="p-1.5 nb-border-2 hover:bg-muted transition-colors"
                            title="Preview"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() =>
                              setExpandedCards((prev) => {
                                const next = new Set(prev);
                                if (next.has(cardKey)) next.delete(cardKey);
                                else next.add(cardKey);
                                return next;
                              })
                            }
                            className="p-1.5 nb-border-2 hover:bg-muted transition-colors"
                          >
                            {isExpanded ? (
                              <ChevronUp className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            onClick={() => removeCard(activeDeckId, idx)}
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
                                  <p className="text-sm mt-0.5 whitespace-pre-wrap">{card.front}</p>
                                </div>
                                <div className="border-t-2 border-border pt-2">
                                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                    Back
                                  </span>
                                  <p className="text-sm mt-0.5 whitespace-pre-wrap">{card.back}</p>
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
        </main>
      </div>

      {/* Deck Detail Modal */}
      <AnimatePresence>
        {openedDeck && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => setOpenedDeckId(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="nb-border nb-shadow-lg bg-white max-w-3xl w-full max-h-[90vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
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
                    onClick={() => handleExportDeck(openedDeck)}
                    disabled={exporting || openedDeck.cards.length === 0}
                    className="nb-border nb-shadow-sm nb-hover-shadow bg-primary text-primary-foreground font-bold text-sm"
                  >
                    <Download className="w-4 h-4" />
                    Export .apkg
                  </Button>
                  <button
                    onClick={() => setOpenedDeckId(null)}
                    className="nb-border nb-shadow-sm p-2 hover:bg-muted transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Modal Body - Cards */}
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
                        onEdit={(f, b) => editCard(openedDeck.id, idx, f, b)}
                        onRemove={() => removeCard(openedDeck.id, idx)}
                        onPreview={setPreviewCard}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="p-4 border-t-[3px] border-black shrink-0 bg-muted/30">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground font-medium">
                    Click any card to preview · Use pencil to edit · Use trash to delete
                  </p>
                  <Button
                    onClick={() => setOpenedDeckId(null)}
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

      {/* Preview Modal */}
      <AnimatePresence>
        {previewCard && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
            onClick={() => setPreviewCard(null)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="nb-border nb-shadow-lg bg-white max-w-lg w-full p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
                  Front
                </p>
                <div className="nb-border-2 bg-secondary p-4 text-center min-h-[80px] flex items-center justify-center">
                  <p className="text-base font-bold">{previewCard.front}</p>
                </div>
              </div>
              <div className="border-t-[3px] border-black pt-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
                  Back
                </p>
                <div className="nb-border-2 bg-white p-4 text-center min-h-[80px] flex items-center justify-center">
                  <p className="text-base">{previewCard.back}</p>
                </div>
              </div>
              <Button
                onClick={() => setPreviewCard(null)}
                className="w-full mt-4 nb-border nb-shadow-sm nb-hover-shadow font-bold"
              >
                Close Preview
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Sub-component for editable doc preview cards
function DocCardItem({
  card,
  index,
  onEdit,
  onRemove,
}: {
  card: AnkiCard;
  index: number;
  onEdit: (front: string, back: string) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editFront, setEditFront] = useState(card.front);
  const [editBack, setEditBack] = useState(card.back);

  return (
    <div className="nb-border-2 p-3">
      {editing ? (
        <div className="space-y-2">
          <Input
            value={editFront}
            onChange={(e) => setEditFront(e.target.value)}
            className="nb-border-2 text-sm font-bold h-8"
            placeholder="Front"
          />
          <Textarea
            value={editBack}
            onChange={(e) => setEditBack(e.target.value)}
            className="nb-border-2 text-sm min-h-[60px] resize-none"
            placeholder="Back"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                onEdit(editFront, editBack);
                setEditing(false);
              }}
              className="nb-border nb-shadow-sm font-bold text-xs h-7"
            >
              Save
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditing(false)}
              className="nb-border font-bold text-xs h-7"
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3">
          <span className="nb-border bg-secondary text-xs font-bold px-2 py-0.5 shrink-0 mt-0.5">
            {index + 1}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{card.front}</p>
            <p className="text-xs text-muted-foreground truncate font-medium">{card.back}</p>
          </div>
          <div className="flex gap-1 shrink-0">
            <button
              onClick={() => setEditing(true)}
              className="p-1.5 nb-border-2 hover:bg-muted transition-colors"
            >
              <Pencil className="w-3 h-3" />
            </button>
            <button
              onClick={onRemove}
              className="p-1.5 nb-border-2 hover:bg-destructive/10 text-destructive transition-colors"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Sub-component for deck detail modal cards
function DeckDetailCardItem({
  card,
  index,
  onEdit,
  onRemove,
  onPreview,
}: {
  card: AnkiCard;
  index: number;
  onEdit: (front: string, back: string) => void;
  onRemove: () => void;
  onPreview: (card: AnkiCard) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editFront, setEditFront] = useState(card.front);
  const [editBack, setEditBack] = useState(card.back);

  return (
    <div className="border-b-[3px] border-black last:border-b-0">
      {editing ? (
        <div className="p-4 space-y-2 bg-muted/30">
          <Input
            value={editFront}
            onChange={(e) => setEditFront(e.target.value)}
            className="nb-border-2 text-sm font-bold"
            placeholder="Front"
          />
          <Textarea
            value={editBack}
            onChange={(e) => setEditBack(e.target.value)}
            className="nb-border-2 text-sm min-h-[80px] resize-none"
            placeholder="Back"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                onEdit(editFront, editBack);
                setEditing(false);
              }}
              className="nb-border nb-shadow-sm font-bold text-xs h-7"
            >
              Save
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditFront(card.front);
                setEditBack(card.back);
                setEditing(false);
              }}
              className="nb-border font-bold text-xs h-7"
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div
          className="p-4 flex items-start gap-3 hover:bg-muted/20 transition-colors cursor-pointer"
          onClick={() => onPreview(card)}
        >
          <span className="nb-border bg-secondary text-xs font-bold px-2 py-0.5 shrink-0 mt-0.5">
            {index + 1}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{card.front}</p>
            <p className="text-xs text-muted-foreground truncate font-medium mt-0.5">
              {card.back}
            </p>
          </div>
          <div
            className="flex gap-1 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setEditing(true)}
              className="p-1.5 nb-border-2 hover:bg-muted transition-colors"
              title="Edit"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onRemove}
              className="p-1.5 nb-border-2 hover:bg-destructive/10 text-destructive transition-colors"
              title="Delete"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
