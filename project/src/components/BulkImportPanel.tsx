import { Sparkles, Upload } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface BulkImportPanelProps {
  showImport: boolean;
  importText: string;
  onImportTextChange: (value: string) => void;
  onImport: () => void;
  onCancel: () => void;
}

export default function BulkImportPanel({
  showImport,
  importText,
  onImportTextChange,
  onImport,
  onCancel,
}: BulkImportPanelProps) {
  return (
    <AnimatePresence>
      {showImport && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="overflow-hidden mb-6"
        >
          <div className="nb-border bg-card nb-shadow-rose p-5">
            <h2 className="font-bold text-xs uppercase tracking-[0.2em] mb-3 flex items-center gap-2 text-rose-600 dark:text-rose-400">
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
              onChange={(e) => onImportTextChange(e.target.value)}
              placeholder={"hello;你好\ngoodbye;再见\nthank you;谢谢"}
              className="nb-border-2 min-h-[120px] resize-none text-sm font-mono"
            />
            <div className="flex gap-2 mt-3">
              <Button
                onClick={onImport}
                className="nb-border nb-shadow-sm nb-hover-shadow bg-secondary font-bold text-sm"
              >
                <Upload className="w-4 h-4" />
                Import Cards
              </Button>
              <Button
                onClick={onCancel}
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
  );
}
