import React, { useState, useCallback, useEffect, useRef, lazy, Suspense } from "react";
import { useAction, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { AnkiCard } from "@/lib/anki";
import { generateCardsFromText } from "@/lib/cardGenerator";
import { detectChapters, sliceSelectedChapters, type DetectedChapter } from "@/lib/chapterDetection";
import { estimateDocumentTimeoutSeconds } from "@/lib/generationTiming";
import type { ProviderOption } from "@/types/providers";
import { useDeckStore } from "@/hooks/use-deck-store";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import SectionFallback from "@/components/SectionFallback";

const DocUploadSection = lazy(() => import("@/components/DocUploadSection"));

interface DocumentGenerationSectionProps {
  showToast: (msg: string) => void;
  recordAppEvent: (event: string, metric?: number) => void;
  deviceToken: string;
  preferredProvider: string;
  onProviderChange: (provider: string) => void;
  cardType: "basic" | "cloze";
  onCardTypeChange: (type: "basic" | "cloze") => void;
  availableProviders: ProviderOption[];
  loadingProviders: boolean;
  onRefreshProviders: () => void;
}

export default function DocumentGenerationSection({
  showToast,
  recordAppEvent,
  deviceToken,
  preferredProvider,
  onProviderChange,
  cardType,
  onCardTypeChange,
  availableProviders,
  loadingProviders,
  onRefreshProviders,
}: DocumentGenerationSectionProps) {
  const { activeDeckId, addCards, createDeckWithCards } = useDeckStore();

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

  const [docInstructions, setDocInstructions] = useState("");
  const [docCardCount, setDocCardCount] = useState(12);
  const [docDifficulty, setDocDifficulty] = useState<"beginner" | "intermediate" | "advanced">("intermediate");
  const docFileInputRef = useRef<HTMLInputElement>(null);
  const docFullTextRef = useRef<string>("");

  const [docChapters, setDocChapters] = useState<DetectedChapter[]>([]);
  const [chaptersDetected, setChaptersDetected] = useState(false);
  const [selectedChapterIds, setSelectedChapterIds] = useState<Set<string>>(new Set());

  const [ocrProgress, setOcrProgress] = useState<string | null>(null);
  const [isScanned, setIsScanned] = useState(false);
  const [scannedFile, setScannedFile] = useState<File | null>(null);

  const createGenerationJob = useMutation(api.generationJobs.create);
  const generateDeckFromDocument = useAction(api.deckGeneration.generateDeckFromDocument);

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

  // Clear document cache on page unload
  useEffect(() => {
    const clearCache = () => { docFullTextRef.current = ""; };
    window.addEventListener("pagehide", clearCache);
    return () => window.removeEventListener("pagehide", clearCache);
  }, []);

  const processFiles = useCallback(async (newFiles: File[]) => {
    setProcessing(true);
    setDocPreviewCards(null);
    setDocPreviewText("");
    setDocPreviewSummary("");
    setDocPreviewDeckName("");
    setDocPreviewWarnings([]);

    const updatedFiles = [...docFiles, ...newFiles];

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
        setDocFiles(updatedFiles);
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
      setDocFiles(updatedFiles);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to process document(s)");
    } finally {
      setProcessing(false);
    }
  }, [docFiles, showToast, recordAppEvent]);

  const handleRemoveFile = useCallback(async (idx: number) => {
    const updated = docFiles.filter((_, i) => i !== idx);
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
      setDocFiles(updated);
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
        deviceToken,
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
  }, [createGenerationJob, docCardCount, docDifficulty, docFiles, docInstructions, docMode, preferredProvider, cardType, deviceToken, generateDeckFromDocument, showToast, chaptersDetected, docChapters, selectedChapterIds]);

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

  return (
    <ErrorBoundary
      fallback={
        <div className="nb-border bg-card p-5 mb-6 text-sm text-destructive font-bold">
          Document upload section failed to load. Please refresh the page.
        </div>
      }
    >
      <Suspense fallback={<SectionFallback />}>
        <DocUploadSection
          showDocUpload={showDocUpload}
          docMode={docMode}
          docCardCount={docCardCount}
          docDifficulty={docDifficulty}
          cardType={cardType}
          onCardTypeChange={onCardTypeChange}
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
          loadingProviders={loadingProviders}
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
          onProviderChange={onProviderChange}
          onRefreshProviders={onRefreshProviders}
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
  );
}
