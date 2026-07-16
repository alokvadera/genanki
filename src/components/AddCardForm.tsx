import { FileText, Plus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface AddCardFormProps {
  front: string;
  back: string;
  onFrontChange: (value: string) => void;
  onBackChange: (value: string) => void;
  onAddCard: () => void;
  onToggleImport: () => void;
  onCsvUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}

export default function AddCardForm({
  front,
  back,
  onFrontChange,
  onBackChange,
  onAddCard,
  onToggleImport,
  onCsvUpload,
  fileInputRef,
}: AddCardFormProps) {
  return (
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
            onChange={(e) => onFrontChange(e.target.value)}
            placeholder="Question or term..."
            className="nb-border-2 min-h-[100px] resize-none text-sm font-medium"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onAddCard();
            }}
          />
        </div>
        <div>
          <label className="text-xs font-bold text-muted-foreground mb-1.5 block uppercase tracking-wide">
            Back
          </label>
          <Textarea
            value={back}
            onChange={(e) => onBackChange(e.target.value)}
            placeholder="Answer or definition..."
            className="nb-border-2 min-h-[100px] resize-none text-sm font-medium"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onAddCard();
            }}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={onAddCard}
          className="nb-border nb-shadow-sm nb-hover-shadow bg-primary text-primary-foreground font-bold text-sm"
        >
          <Plus className="w-4 h-4" />
          Add Card
        </Button>
        <Button
          onClick={onToggleImport}
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
            onChange={onCsvUpload}
          />
        </label>
      </div>
      <p className="text-xs text-muted-foreground mt-2 font-medium">
        Tip: Press <kbd className="nb-border px-1 py-0.5 text-[10px] font-bold mx-0.5">Ctrl</kbd>+<kbd className="nb-border px-1 py-0.5 text-[10px] font-bold mx-0.5">Enter</kbd> to quickly add a card
      </p>
    </div>
  );
}
