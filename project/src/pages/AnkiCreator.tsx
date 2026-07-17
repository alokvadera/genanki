import React, { useState, useCallback, useEffect, useRef, lazy, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, Layers, ArrowLeft, BarChart3, Clock3, Check } from "lucide-react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import type { AnkiCard } from "@/lib/anki";
import { generateCardsFromText } from "@/lib/cardGenerator";
import { detectChapters, sliceSelectedChapters, type DetectedChapter } from "@/lib/chapterDetection";
import { estimateDocumentTimeoutSeconds, estimatePromptTimeoutSeconds } from "@/lib/generationTiming";
import { useDeckStore, type Deck } from "@/hooks/use-deck-store";
import DeckSidebar from "@/components/DeckSidebar";
import AddCardForm from "@/components/AddCardForm";
import BulkImportPanel from "@/components/BulkImportPanel";
import CardsList from "@/components/CardsList";
import PreviewModal from "@/components/PreviewModal";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// Lazy-load the heavy AI-powered sections — these import convex actions, docParser,
// cardGenerator, and their transitive deps (pdfjs-dist, mammoth, etc.).
// Vite will create separate chunks for them, reducing the main bundle size.
const DocUploadSection = lazy(() => import("@/components/DocUploadSection"));
const AiDeckBuilder = lazy(() => import("@/components/AiDeckBuilder"));
const DeckDetailModal = lazy(() => import("@/components/DeckDetailModal"));

/**
 * Split a single CSV/TSV/Semicolon/Pipe-delimited line into fields,
 * respecting RFC-4180 double-quoted fields (a comma inside quotes is
 * NOT a separator). Accepts comma, semicolon, tab, or pipe as delimiters.
 */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
      else if (c === "," || c === ";" || c === "	" || c === "|") { out.push(cur.trim()); cur = ""; }
      else cur += c;
  }
  out.push(cur.trim());
  return out;
}

/** Suspense fallback for lazy-loaded sections */
function SectionFallback() {
  return (
    <div className="nb-border bg-white nb-shadow-sm p-5 mb-6 animate-pulse">
      <div className="h-5 bg-muted rounded w-1/3 mb-4" />
      <div className="h-20 bg-muted rounded" />
    </div>
  );
}

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
  } = deckStore;

  // UI state
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [editingDeckName, setEditingDeckName] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState("");
  const [exporting, setExporting] = useState(false);
  const [importText, setImportText] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [previewCard, setPreviewCard] = useState<AnkiCard | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Doc upload state
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
  const [docFiles, setDocFiles] = useState<File[]>([]);
  const docFileNames = docFiles.map((f) => f.name);

  const clearDocState = useCallback(() => {
    setDocPreviewCards(null);
    setDocPreviewText("");
    setDocPreviewSummary("");
    setDocPreviewDeckName("");
    setDocPreviewWarnings([]);
    setDocInstructions("");
    docFullTextRef.current = "";
    setDocChapters([]);
    setChaptersDetected(false);
    setSelectedChapterIds(new Set());
    setIsScanned(false);
    setScannedFile(null);
    setDocFiles([]);
  }, []);

  const [docInstructions, setDocInstructions] = useState("");
  const [docCardCount, setDocCardCount] = useState(12);
  const [docDifficulty, setDocDifficulty] = useState<"beginner" | "intermediate" | "advanced">("intermediate");
  const docFileInputRef = useRef<HTMLInputElement>(null);
  const docFullTextRef = useRef<string>("");

  // Chapter-aware scoping state
  const [docChapters, setDocChapters] = useState<DetectedChapter[]>([]);
  const [chaptersDetected, setChaptersDetected] = useState(false);
  const [selectedChapterIds, setSelectedChapterIds] = useState<Set<string>>(new Set());

  // AI deck builder state
  const [showAiBuilder, setShowAiBuilder] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiDeckName, setAiDeckName] = useState("");
  const [aiCardCount, setAiCardCount] = useState(12);
  const [aiDifficulty, setAiDifficulty] = useState<"beginner" | "intermediate" | "advanced">("intermediate");
  const [aiPreviewCards, setAiPreviewCards] = useState<AnkiCard[] | null>(null);
  const [aiPreviewDeckName, setAiPreviewDeckName] = useState("");
  const [aiPreviewSummary, setAiPreviewSummary] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);

  // Provider selection state (shared by AI deck builder and document generation)
  const [preferredProvider, setPreferredProvider] = useState("auto");
  const [cardType, setCardType] = useState<"basic" | "cloze">("basic");
  const [ocrProgress, setOcrProgress] = useState<string | null>(null);
  const [isScanned, setIsScanned] = useState(false);
  const [scannedFile, setScannedFile] = useState<File | null>(null);

  // Real-time provider catalog subscription from Convex
  const providerCatalog = useQuery(api.providerCatalog.catalog);
  const catalogUpdatedAt = useQuery(api.providerCatalog.latestUpdatedAt);
  const availableProviders = providerCatalog ?? [];
  const loadingProviders = providerCatalog === undefined;

  // Only refresh the catalog when it's empty or stale (older than 5 minutes)
  const STALE_MS = 5 * 60 * 1000;
  const refreshProviders = useAction(api.availableProviders.refresh);
  const [refreshingProviders, setRefreshingProviders] = useState(false);
  const handleRefreshProviders = useCallback(() => {
    setRefreshingProviders(true);
    refreshProviders()
      .catch(() => {})
      .finally(() => setRefreshingProviders(false));
  }, [refreshProviders]);
  useEffect(() => {
    if (catalogUpdatedAt === undefined) return; // still loading
    const isStale = catalogUpdatedAt === 0 || Date.now() - catalogUpdatedAt > STALE_MS;
    if (isStale) {
      React.startTransition(() => {
        handleRefreshProviders();
      });
    }
  }, [catalogUpdatedAt, handleRefreshProviders, STALE_MS]);

  // Convex actions
  const createGenerationJob = useMutation(api.generationJobs.create);
  const recordTelemetry = useMutation(api.generationTelemetry.record);
  const generateDeckFromPrompt = useAction(api.deckGeneration.generateDeckFromPrompt);
  const generateDeckFromDocument = useAction(api.deckGeneration.generateDeckFromDocument);

  // Toast helper
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  // Telemetry helper (silent failure)
  const recordAppEvent = useCallback(
    (event: string, metric?: number) => {
      void recordTelemetry({ event, metric }).catch(() => {});
    },
    [recordTelemetry],
  );

  // Clear document cache on page unload
  useEffect(() => {
    const clearCache = () => { docFullTextRef.current = ""; };
    window.addEventListener("pagehide", clearCache);
    return () => window.removeEventListener("pagehide", clearCache);
  }, []);

  // --- Deck/Rename helpers ---
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

  // --- Card add/import/export helpers ---
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
  }, [front, back, activeDeckId, addCardToDeckStore, recordAppEvent, showToast]);

  const handleImport = useCallback(() => {
    const lines = importText.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) { showToast("No cards to import"); return; }
    const newCards: AnkiCard[] = [];
    for (const line of lines) {
      // Split on the FIRST delimiter only, so back fields with commas/semicolons are preserved
      // Use a positive lookahead so the delimiter is NOT consumed in the match
      const delim = line.match(/^\s*[^;\t|]+\s*(?=[;\t|])/);
      const i = delim ? delim[0].length : -1;
      if (i > 0) {
        newCards.push({ front: line.slice(0, i).trim(), back: line.slice(i).replace(/^[;\t|]\s*/, "").trim() });
      }
    }
    if (newCards.length === 0) { showToast("Use semicolon, tab, or pipe to separate front/back"); return; }
    addCards(activeDeckId, newCards);
    recordAppEvent("cards_imported", newCards.length);
    setImportText("");
    setShowImport(false);
    showToast(`Imported ${newCards.length} card(s)`);
  }, [importText, activeDeckId, addCards, recordAppEvent, showToast]);

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
        // Use RFC-4180-aware split so commas inside double-quoted fields are preserved
        const parts = splitCsvLine(line);
        if (parts.length >= 2) {
          newCards.push({
            front: parts[0].trim().replace(/^["']|["']$/g, ""),
            back: parts[1].trim().replace(/^["']|["']$/g, ""),
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
  }, [activeDeckId, addCards, recordAppEvent, showToast]);

  // --- Document processing helpers ---
  const processFiles = useCallback(async (newFiles: File[]) => {
    setProcessing(true);
    setDocPreviewCards(null);
    setDocPreviewText("");
    setDocPreviewSummary("");
    setDocPreviewDeckName("");
    setDocPreviewWarnings([]);

    const updatedFiles = [...docFiles, ...newFiles];
    setDocFiles(updatedFiles);

    try {
      const parsedDocs = await Promise.all(
        updatedFiles.map(async (file) => {
          const { extractDocument } = await import("@/lib/docParser");
          const doc = await extractDocument(file);
          return { file, doc };
        })
      );

      const scannedPdf = parsedDocs.find((d) => d.doc.isScanned);
      if (scannedPdf) {
        setIsScanned(true);
        setScannedFile(scannedPdf.file);
        setProcessing(false);
        showToast(`Scanned PDF "${scannedPdf.file.name}" detected. Click 'Run OCR Extraction' to extract text.`);
        return;
      }

      const text = parsedDocs
        .map((pd) => `# File: ${pd.file.name}\n\n${pd.doc.text}`)
        .join("\n\n");

      if (!text.trim() || text.trim().length < 30) {
        showToast("Could not extract enough text from the document(s)");
        setDocFiles([]);
        return;
      }

      docFullTextRef.current = text;
      recordAppEvent("document_extracted", text.length);
      setDocPreviewText(text.slice(0, 500) + (text.length > 500 ? "..." : ""));

      const detection = detectChapters({ text });
      if (detection.detected) {
        setDocChapters(detection.chapters);
        setChaptersDetected(true);
        setSelectedChapterIds(new Set(detection.chapters.map((c) => c.id)));
        recordAppEvent("chapters_detected", detection.chapters.length);
        showToast(`Detected ${detection.chapters.length} chapters — pick which to include.`);
      } else {
        setDocChapters([]);
        setChaptersDetected(false);
        setSelectedChapterIds(new Set());
        showToast("Documents parsed successfully. Ready to generate cards.");
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to process document(s)");
    } finally {
      setProcessing(false);
    }
  }, [docFiles, recordAppEvent, showToast]);

  const handleRemoveFile = useCallback(async (idx: number) => {
    const updated = docFiles.filter((_, i) => i !== idx);
    setDocFiles(updated);
    if (updated.length === 0) {
      clearDocState();
      return;
    }
    setProcessing(true);
    try {
      const parsedDocs = await Promise.all(
        updated.map(async (file) => {
          const { extractDocument } = await import("@/lib/docParser");
          const doc = await extractDocument(file);
          return { file, doc };
        })
      );
      const text = parsedDocs
        .map((pd) => `# File: ${pd.file.name}\n\n${pd.doc.text}`)
        .join("\n\n");

      docFullTextRef.current = text;
      setDocPreviewText(text.slice(0, 500) + (text.length > 500 ? "..." : ""));

      const detection = detectChapters({ text });
      if (detection.detected) {
        setDocChapters(detection.chapters);
        setChaptersDetected(true);
        setSelectedChapterIds(new Set(detection.chapters.map((c) => c.id)));
      } else {
        setDocChapters([]);
        setChaptersDetected(false);
        setSelectedChapterIds(new Set());
      }
    } catch {
      showToast("Error updating document list");
    } finally {
      setProcessing(false);
    }
  }, [docFiles, clearDocState, showToast]);

  const runOcr = useCallback(async () => {
    if (!scannedFile) return;
    setProcessing(true);
    setOcrProgress("Initializing OCR...");
    try {
      const { runOcrOnPdf } = await import("@/lib/ocr");
      const text = await runOcrOnPdf(scannedFile, (p) => {
        setOcrProgress(`OCR: Scanning page ${p.currentPage}/${p.totalPages} (${Math.round(p.progress * 100)}%)...`);
      });

      if (!text || text.trim().length < 30) {
        showToast("Could not extract text via OCR");
        return;
      }

      docFullTextRef.current = text;
      setDocPreviewText(text.slice(0, 500) + (text.length > 500 ? "..." : ""));
      setIsScanned(false);
      setScannedFile(null);
      showToast("OCR complete! Ready to generate cards.");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "OCR failed");
    } finally {
      setProcessing(false);
      setOcrProgress(null);
    }
  }, [scannedFile, showToast]);

  const handleDocFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) processFiles(files);
    e.target.value = "";
  }, [processFiles]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      dragDepth.current++;
      setDragActive(true);
    } else if (e.type === "dragleave") {
      dragDepth.current--;
      if (dragDepth.current <= 0) { dragDepth.current = 0; setDragActive(false); }
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current = 0;
    setDragActive(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length > 0) processFiles(files);
  }, [processFiles]);

  const startDocumentRun = useCallback(async () => {
    const fullText = docFullTextRef.current.trim();
    if (!fullText || docFiles.length === 0) { showToast("Upload a document before starting the run"); return; }

    // Scope the text to the selected chapters when chapter detection is active.
    let text = fullText;
    if (chaptersDetected && docChapters.length > 0) {
      if (selectedChapterIds.size === 0) {
        showToast("Select at least one chapter to include");
        return;
      }
      const scoped = sliceSelectedChapters(fullText, docChapters, selectedChapterIds).trim();
      if (!scoped) { showToast("Selected chapters contain no usable text"); return; }
      text = scoped;
    }

    setProcessing(true);
    setDocPreviewCards(null);
    setDocPreviewSummary("");
    setDocPreviewDeckName("");
    setDocPreviewWarnings([]);
    try {
      if (docMode === "quick") {
        const cards = generateCardsFromText(text, docCardCount);
        if (cards.length === 0) { showToast("No cards could be extracted from this document"); return; }
        setDocPreviewCards(cards);
        showToast(`Found ${cards.length} card(s) — review below`);
        return;
      }
      const totalSections = Math.min(10, Math.max(1, Math.ceil(text.length / 9000)));
      const etaSeconds = Math.max(24, Math.round(12 + docCardCount * 1.4 + totalSections * 5));
      const timeoutSeconds = estimateDocumentTimeoutSeconds(docCardCount, totalSections);
      const jobId = await createGenerationJob({
        kind: "document", requestedCount: docCardCount,
        totalProviders: 0, totalModels: 0, totalSections,
        message: "Queued document generation", etaSeconds, timeoutSeconds,
        deadlineAt: Date.now() + timeoutSeconds * 1000,
      });
      const result = await generateDeckFromDocument({
        text, instructions: docInstructions.trim() || undefined,
        cardCount: docCardCount, difficulty: docDifficulty, jobId,
        preferredProvider: preferredProvider === "auto" ? undefined : preferredProvider,
        cardType,
      });
      const cards = result.cards.map((card: { front: string; back: string }) => ({
        front: card.front.trim(), back: card.back.trim(),
      }));
      if (cards.length === 0) { showToast("AI could not generate cards from this document"); return; }
      setDocPreviewCards(cards);
      setDocPreviewDeckName(result.deckName);
      setDocPreviewSummary(result.summary);
      setDocPreviewWarnings(result.warnings ?? []);
      showToast(`AI generated ${cards.length} card(s)${result.partial ? " (some sections failed)" : ""} — review below`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Document generation failed");
    } finally {
      setProcessing(false);
    }
  }, [createGenerationJob, docCardCount, docDifficulty, docFiles, docInstructions, docMode, preferredProvider, cardType, generateDeckFromDocument, showToast, chaptersDetected, docChapters, selectedChapterIds]);

  const toggleChapter = useCallback((id: string) => {
    setSelectedChapterIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAllChapters = useCallback((selectAll: boolean) => {
    setSelectedChapterIds(selectAll ? new Set(docChapters.map((c) => c.id)) : new Set());
  }, [docChapters]);

  const acceptDocCards = useCallback((createNewDeck: boolean) => {
    if (!docPreviewCards) return;
    if (createNewDeck) {
      const deckName = docPreviewDeckName.trim() || (docFiles[0]?.name.replace(/\.[^.]+$/, "") || "") || "Document Deck";
      createDeckWithCards(deckName, docPreviewCards);
      showToast(`Created "${deckName}" with ${docPreviewCards.length} card(s)`);
    } else {
      addCards(activeDeckId, docPreviewCards);
      showToast(`Added ${docPreviewCards.length} card(s) to deck`);
    }
    clearDocState();
  }, [docPreviewCards, docPreviewDeckName, docFiles, activeDeckId, createDeckWithCards, addCards, showToast, clearDocState]);

  const editDocCard = useCallback((idx: number, front: string, back: string) => {
    if (!docPreviewCards) return;
    const updated = [...docPreviewCards];
    updated[idx] = { front, back };
    setDocPreviewCards(updated);
  }, [docPreviewCards]);

  const removeDocCard = useCallback((idx: number) => {
    if (!docPreviewCards) return;
    setDocPreviewCards(docPreviewCards.filter((_, i) => i !== idx));
  }, [docPreviewCards]);

  // --- AI generation helpers ---
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
  }, [aiPrompt, aiDeckName, aiCardCount, aiDifficulty, preferredProvider, cardType, generateDeckFromPrompt, showToast, createGenerationJob]);

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

  // --- Export helpers ---
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

  const deckCardCount = decks.reduce((sum, d) => sum + d.cards.length, 0);

  return (
    <div className="min-h-screen bg-background">
      {/* Toast Notification */}
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

      {/* Header */}
      <header className="border-b-[3px] border-black bg-white">
        <div className="w-full px-6 lg:px-10 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/" className="nb-border nb-shadow-sm px-3 py-1.5 bg-secondary font-bold text-sm nb-hover-shadow">
              <ArrowLeft className="w-4 h-4 inline -mt-0.5" />
            </a>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2">
                <Layers className="w-6 h-6" />
                genanki
              </h1>
              <p className="text-xs text-muted-foreground font-medium mt-0.5">
                {decks.length} deck{decks.length !== 1 ? "s" : ""} · {deckCardCount} card{deckCardCount !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" className="nb-border nb-shadow-sm nb-hover-shadow font-bold text-sm px-4 h-9">
              <Link to="/runs"><Clock3 className="w-4 h-4" /> Runs</Link>
            </Button>
            <Button asChild variant="outline" className="nb-border nb-shadow-sm nb-hover-shadow font-bold text-sm px-4 h-9">
              <Link to="/usage"><BarChart3 className="w-4 h-4" /> Usage</Link>
            </Button>
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
        </div>
      </header>

      {/* Main Layout */}
      <div className="w-full px-6 lg:px-10 py-6 flex flex-col lg:flex-row gap-6">
        {/* Sidebar */}
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

        {/* Main Content */}
        <main className="flex-1 min-w-0">
          {/* Doc Upload Section — lazy-loaded */}
          <ErrorBoundary fallback={<div className="nb-border bg-white p-5 mb-6 text-sm text-destructive font-bold">Document upload section failed to load. Please refresh the page.</div>}>
            <Suspense fallback={<SectionFallback />}>
              <DocUploadSection
                showDocUpload={showDocUpload}
                docMode={docMode}
                docCardCount={docCardCount}
                docDifficulty={docDifficulty}
                cardType={cardType}
                onCardTypeChange={setCardType}
                docInstructions={docInstructions}
                docFileNames={docFileNames}
                docChapters={docChapters}
                chaptersDetected={chaptersDetected}
                selectedChapterIds={selectedChapterIds}
                docPreviewCards={docPreviewCards}
                docPreviewText={docPreviewText}
                docPreviewSummary={docPreviewSummary}
                docPreviewWarnings={docPreviewWarnings}
                processing={processing}
                dragActive={dragActive}
                docFileInputRef={docFileInputRef}
                preferredProvider={preferredProvider}
                availableProviders={availableProviders}
                loadingProviders={loadingProviders || refreshingProviders}
                isScanned={isScanned}
                ocrProgress={ocrProgress}
                onRunOcr={runOcr}
                onRemoveFile={handleRemoveFile}
                onToggle={() => setShowDocUpload((v) => !v)}
                onModeChange={setDocMode}
                onDocCardCountChange={setDocCardCount}
                onDocDifficultyChange={setDocDifficulty}
                onDocInstructionsChange={setDocInstructions}
                onToggleChapter={toggleChapter}
                onSelectAllChapters={selectAllChapters}
                onProviderChange={setPreferredProvider}
                onRefreshProviders={handleRefreshProviders}
                onStartRun={startDocumentRun}
                onAcceptCards={acceptDocCards}
                onDiscard={clearDocState}
                onEditDocCard={editDocCard}
                onRemoveDocCard={removeDocCard}
                onDrag={handleDrag}
                onDrop={handleDrop}
                onFileChange={handleDocFileChange}
                onBrowseClick={() => docFileInputRef.current?.click()}
              />
            </Suspense>
          </ErrorBoundary>

          {/* AI Deck Builder — lazy-loaded */}
          <ErrorBoundary fallback={<div className="nb-border bg-white p-5 mb-6 text-sm text-destructive font-bold">AI deck builder failed to load. Please refresh the page.</div>}>
            <Suspense fallback={<SectionFallback />}>
              <AiDeckBuilder
                showAiBuilder={showAiBuilder}
                aiPrompt={aiPrompt}
                aiDeckName={aiDeckName}
                aiCardCount={aiCardCount}
                aiDifficulty={aiDifficulty}
                cardType={cardType}
                onCardTypeChange={setCardType}
                aiPreviewCards={aiPreviewCards}
                aiPreviewDeckName={aiPreviewDeckName}
                aiPreviewSummary={aiPreviewSummary}
                aiGenerating={aiGenerating}
                activeDeckName={activeDeck?.name}
                preferredProvider={preferredProvider}
                availableProviders={availableProviders}
                loadingProviders={loadingProviders || refreshingProviders}
                onToggle={() => setShowAiBuilder((v) => !v)}
                onPromptChange={setAiPrompt}
                onDeckNameChange={setAiDeckName}
                onCardCountChange={setAiCardCount}
                onDifficultyChange={setAiDifficulty}
                onProviderChange={setPreferredProvider}
                onRefreshProviders={handleRefreshProviders}
                onGenerate={handleAiGenerate}
                onAcceptCards={acceptAiCards}
                onDiscard={clearAiState}
                onAiPreviewEdit={editAiPreviewCard}
                onAiPreviewRemove={removeAiPreviewCard}
              />
            </Suspense>
          </ErrorBoundary>

          {/* Add Card Form */}
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

          {/* Bulk Import Panel */}
          <BulkImportPanel
            showImport={showImport}
            importText={importText}
            onImportTextChange={setImportText}
            onImport={handleImport}
            onCancel={() => { setShowImport(false); setImportText(""); }}
          />

          {/* Cards List */}
          <CardsList
            activeDeck={activeDeck}
            activeDeckId={activeDeckId}
            onRemoveCard={removeCard}
            onPreview={setPreviewCard}
          />
        </main>
      </div>

      {/* Deck Detail Modal — lazy-loaded */}
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

      {/* Preview Modal */}
      <PreviewModal
        previewCard={previewCard}
        onClose={() => setPreviewCard(null)}
      />
    </div>
  );
}
