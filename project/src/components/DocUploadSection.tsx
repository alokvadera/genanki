import { motion, AnimatePresence } from "framer-motion";
import {
  Check, FileUp, Layers, Loader, RefreshCw, Sparkles, Zap, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import DocCardItem from "@/components/DocCardItem";
import type { AnkiCard } from "@/lib/anki";
import type { DetectedChapter } from "@/lib/chapterDetection";

import type { ProviderOption } from "@/types/providers";

interface DocUploadSectionProps {
  showDocUpload: boolean;
  docMode: "ai" | "quick";
  docCardCount: number;
  docDifficulty: "beginner" | "intermediate" | "advanced";
  cardType: "basic" | "cloze";
  docInstructions: string;
  docFileNames: string[];
  docChapters: DetectedChapter[];
  chaptersDetected: boolean;
  selectedChapterIds: Set<string>;
  docPreviewCards: AnkiCard[] | null;
  docPreviewText: string;
  docPreviewSummary: string;
  docPreviewWarnings: string[];
  processing: boolean;
  dragActive: boolean;
  docFileInputRef: React.RefObject<HTMLInputElement | null>;
  preferredProvider: string;
  availableProviders: ProviderOption[];
  loadingProviders: boolean;
  isScanned: boolean;
  ocrProgress: string | null;
  onRunOcr: () => Promise<void>;
  onRemoveFile: (idx: number) => void;
  onToggle: () => void;
  onModeChange: (mode: "ai" | "quick") => void;
  onDocCardCountChange: (count: number) => void;
  onDocDifficultyChange: (difficulty: "beginner" | "intermediate" | "advanced") => void;
  onCardTypeChange: (type: "basic" | "cloze") => void;
  onDocInstructionsChange: (value: string) => void;
  onToggleChapter: (id: string) => void;
  onSelectAllChapters: (selectAll: boolean) => void;
  onProviderChange: (provider: string) => void;
  onRefreshProviders: () => void;
  onStartRun: () => Promise<void>;
  onAcceptCards: (createNewDeck: boolean) => void;
  onDiscard: () => void;
  onEditDocCard: (idx: number, front: string, back: string) => void;
  onRemoveDocCard: (idx: number) => void;
  onDrag: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBrowseClick: () => void;
}

export default function DocUploadSection({
  showDocUpload,
  docMode,
  docCardCount,
  docDifficulty,
  cardType,
  docInstructions,
  docFileNames,
  docChapters,
  chaptersDetected,
  selectedChapterIds,
  docPreviewCards,
  docPreviewText,
  docPreviewSummary,
  docPreviewWarnings,
  processing,
  dragActive,
  docFileInputRef,
  preferredProvider,
  availableProviders,
  loadingProviders,
  isScanned,
  ocrProgress,
  onRunOcr,
  onRemoveFile,
  onToggle,
  onModeChange,
  onDocCardCountChange,
  onDocDifficultyChange,
  onCardTypeChange,
  onDocInstructionsChange,
  onToggleChapter,
  onSelectAllChapters,
  onProviderChange,
  onRefreshProviders,
  onStartRun,
  onAcceptCards,
  onDiscard,
  onEditDocCard,
  onRemoveDocCard,
  onDrag,
  onDrop,
  onFileChange,
  onBrowseClick,
}: DocUploadSectionProps) {
  return (
    <>
      {/* Upload Section */}
      <div className="nb-border bg-white nb-shadow-teal p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-xs uppercase tracking-[0.2em] flex items-center gap-2 text-teal-600 dark:text-teal-400">
            <Zap className="w-4 h-4" />
            AUTO-GENERATE FROM DOCUMENT
          </h2>
          <Button
            onClick={onToggle}
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
                  onClick={() => onModeChange("ai")}
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
                  onClick={() => onModeChange("quick")}
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
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[0.8fr_1fr_1.2fr_1.8fr] gap-3 mb-4">
                  <div>
                    <label className="text-xs font-bold text-muted-foreground mb-1.5 block uppercase tracking-wide">
                      Card count
                    </label>
                    <Input
                      type="number"
                      min={0}
                      max={1000}
                      value={docCardCount}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "") {
                          onDocCardCountChange(0);
                          return;
                        }
                        onDocCardCountChange(Math.max(0, Math.min(1000, Math.round(Number(val)))));
                      }}
                      className="nb-border-2 h-9 text-sm font-medium"
                    />
                    {docCardCount === 0 && (
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
                      value={docDifficulty}
                      onChange={(e) =>
                        onDocDifficultyChange(e.target.value as "beginner" | "intermediate" | "advanced")
                      }
                      className="nb-border-2 h-9 w-full bg-background px-3 text-sm font-medium outline-none"
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
                      className="nb-border-2 h-9 w-full bg-background px-3 text-sm font-medium outline-none"
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
                        className="nb-border-2 h-9 flex-1 bg-background px-3 text-sm font-medium outline-none disabled:opacity-60"
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
                        className="nb-border nb-shadow-sm nb-hover-shadow h-9 w-9 flex items-center justify-center shrink-0 disabled:opacity-40"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${loadingProviders ? "animate-spin" : ""}`} />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {docMode === "ai" && (
                <div className="mb-4">
                  <label className="text-xs font-bold text-muted-foreground mb-1.5 block uppercase tracking-wide">
                    Instructions for this document
                  </label>
                  <Textarea
                    value={docInstructions}
                    onChange={(e) => onDocInstructionsChange(e.target.value)}
                    placeholder="Example: Only create cards from chapters 2 and 4. Focus on definitions and key formulas. Skip historical examples."
                    className="nb-border-2 min-h-[96px] text-sm font-medium"
                  />
                  <p className="text-[11px] text-muted-foreground font-medium mt-1.5">
                    These instructions refine an already-scoped selection and guide coverage and card style.
                  </p>
                </div>
              )}

              {/* Chapter selection */}
              {docMode === "ai" && docFileNames.length > 0 && !processing && chaptersDetected && docChapters.length > 0 && (
                <div className="mb-4 nb-border-2 bg-white p-3">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
                      Chapters ({selectedChapterIds.size}/{docChapters.length} selected)
                    </label>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => onSelectAllChapters(true)}
                        className="nb-border nb-shadow-sm nb-hover-shadow px-2 py-1 text-[11px] font-bold bg-secondary"
                      >
                        Select all
                      </button>
                      <button
                        onClick={() => onSelectAllChapters(false)}
                        className="nb-border nb-shadow-sm nb-hover-shadow px-2 py-1 text-[11px] font-bold bg-white"
                      >
                        None
                      </button>
                    </div>
                  </div>
                  <div className="max-h-[220px] overflow-y-auto space-y-1">
                    {docChapters.map((chapter) => {
                      const checked = selectedChapterIds.has(chapter.id);
                      const chars = chapter.end - chapter.start;
                      return (
                        <label
                          key={chapter.id}
                          className={`flex items-start gap-2 nb-border-2 px-2.5 py-1.5 cursor-pointer transition-colors ${
                            checked ? "bg-secondary/50" : "bg-muted/20 hover:bg-muted/40"
                          }`}
                          style={{ marginLeft: `${Math.min(chapter.level ?? 0, 3) * 12}px` }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => onToggleChapter(chapter.id)}
                            className="mt-0.5 shrink-0 accent-primary"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-xs font-bold truncate">{chapter.title}</span>
                            <span className="block text-[10px] text-muted-foreground font-medium">
                              ~{Math.round(chars / 1000)}k chars · {chapter.source}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  {selectedChapterIds.size === 0 && (
                    <p className="text-[11px] text-amber-600 font-medium mt-2 flex items-center gap-1">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                      Select at least one chapter to generate cards.
                    </p>
                  )}
                </div>
              )}

              {/* No chapters detected note */}
              {docMode === "ai" && docFileNames.length > 0 && !processing && !chaptersDetected && (
                <div className="mb-4 nb-border-2 bg-muted/20 px-3 py-2">
                  <p className="text-[11px] text-muted-foreground font-medium">
                    No chapters detected — using the whole document. Use the instructions above to focus on specific sections.
                  </p>
                </div>
              )}

              {docFileNames.length > 0 && isScanned && !processing && (
                <div className="mb-4 nb-border-2 border-amber-600 bg-amber-50 p-4">
                  <p className="text-xs font-bold text-amber-800 uppercase tracking-wide mb-1">
                    ⚠️ Scanned PDF Detected
                  </p>
                  <p className="text-xs text-amber-900 font-medium mb-3">
                    This document appears to contain scanned pages or images (no text could be extracted directly). You can run OCR (Optical Character Recognition) to extract the text.
                  </p>
                  <Button
                    onClick={onRunOcr}
                    className="nb-border nb-shadow-sm nb-hover-shadow bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs"
                  >
                    Run OCR Extraction
                  </Button>
                </div>
              )}

              <div
                onDragEnter={onDrag}
                onDragLeave={onDrag}
                onDragOver={onDrag}
                onDrop={onDrop}
                className={`nb-border-2 border-dashed p-8 text-center transition-all ${
                  dragActive
                    ? "bg-secondary border-primary"
                    : "bg-muted/30 hover:bg-muted/50"
                }`}
              >
                {processing ? (
                  <div className="flex flex-col items-center gap-3">
                    <Loader className="w-8 h-8 animate-spin text-primary" />
                    <p className="text-sm font-bold">{ocrProgress || "Processing document..."}</p>
                    <p className="text-xs text-muted-foreground font-medium">
                      {ocrProgress 
                        ? "Extracting text from images client-side" 
                        : (docMode === "ai" ? "Extracting text and generating AI cards" : "Extracting text and finding cards")}
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
                          onClick={onBrowseClick}
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
                  onChange={onFileChange}
                  multiple
                />
              </div>

              {docFileNames.length > 0 && !processing && (
                <div className="mt-4 nb-border-2 bg-secondary/40 p-4 flex flex-col gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground mb-2">
                      Ready to generate ({docFileNames.length} file{docFileNames.length !== 1 ? "s" : ""})
                    </p>
                    <div className="space-y-2 mb-3">
                      {docFileNames.map((name, idx) => (
                        <div key={idx} className="flex items-center justify-between bg-white nb-border-2 px-3 py-1.5 text-xs font-bold">
                          <span className="truncate mr-2">{name}</span>
                          <button
                            onClick={() => onRemoveFile(idx)}
                            className="p-1 text-destructive hover:bg-destructive/10 transition-colors"
                            title="Remove file"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground font-medium">
                      Files are held in memory only until you finish or discard them.
                    </p>
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0 sm:items-end">
                    <Button
                      onClick={onStartRun}
                      disabled={
                        docMode === "ai" &&
                        (docCardCount === 0 ||
                          (chaptersDetected && selectedChapterIds.size === 0))
                      }
                      className="nb-border nb-shadow-sm nb-hover-shadow bg-primary text-primary-foreground font-bold text-sm disabled:opacity-40 w-full sm:w-auto"
                    >
                      <Sparkles className="w-4 h-4" />
                      {docMode === "ai" ? "Start document run" : "Extract cards"}
                    </Button>
                    {docMode === "ai" && docCardCount === 0 && (
                      <p className="text-[11px] text-amber-600 font-medium text-right leading-tight">
                        Set card count to 1 or more to generate
                      </p>
                    )}
                  </div>
                </div>
              )}
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
                    From: {docFileNames.join(", ")}
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
                  {docMode === "ai" && (
                    <Button
                      onClick={() => onAcceptCards(true)}
                      className="nb-border nb-shadow-sm nb-hover-shadow bg-primary text-primary-foreground font-bold text-sm"
                    >
                      <Layers className="w-4 h-4" />
                      Create New Deck
                    </Button>
                  )}
                  <Button
                    onClick={onDiscard}
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

              {docPreviewWarnings.length > 0 && (
                <div className="nb-border-2 bg-amber-50 p-3 mb-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-amber-800 mb-1">
                    Run warnings
                  </p>
                  <ul className="text-xs text-amber-900 font-medium space-y-1">
                    {docPreviewWarnings.map((warning) => <li key={warning}>{warning}</li>)}
                  </ul>
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
                    onEdit={(f, b) => onEditDocCard(idx, f, b)}
                    onRemove={() => onRemoveDocCard(idx)}
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
