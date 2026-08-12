import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import type { AnkiCard } from "@/lib/anki";
import { FormattedCardText } from "@/components/FormattedCardText";

interface PreviewModalProps {
  previewCard: AnkiCard | null;
  onClose: () => void;
}

export default function PreviewModal({ previewCard, onClose }: PreviewModalProps) {
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
    if (!previewCard) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [previewCard, onClose]);

  return (
    <AnimatePresence>
      {previewCard && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0.9 }}
            className="nb-border nb-shadow-lg bg-card max-w-lg w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
                Front
              </p>
              <div className="nb-border-2 bg-secondary p-4 min-h-[80px] flex items-center justify-center">
                <FormattedCardText
                  text={previewCard.front}
                  className="text-base font-bold w-full text-left md:text-center prose prose-sm max-w-none"
                />
              </div>
            </div>
            <div className="border-t-[3px] border-border pt-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
                Back
              </p>
              <div className="nb-border-2 bg-card p-4 min-h-[80px] flex items-center justify-center">
                <FormattedCardText
                  text={previewCard.back}
                  className="text-base w-full text-left md:text-center prose prose-sm max-w-none"
                />
              </div>
            </div>
            <Button
              onClick={onClose}
              className="w-full mt-4 nb-border nb-shadow-sm nb-hover-shadow font-bold"
            >
              Close Preview
            </Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
