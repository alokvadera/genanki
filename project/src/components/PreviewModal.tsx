import { Button } from "@/components/ui/button";
import { ModalShell } from "@/components/ModalShell";
import type { AnkiCard } from "@/lib/anki";
import { FormattedCardText } from "@/components/FormattedCardText";

interface PreviewModalProps {
  previewCard: AnkiCard | null;
  onClose: () => void;
}

export default function PreviewModal({ previewCard, onClose }: PreviewModalProps) {
  return (
    <ModalShell
      open={Boolean(previewCard)}
      onClose={onClose}
      labelledBy="card-preview-title"
      zClass="z-[60]"
      panelClassName="nb-border nb-shadow-lg bg-card max-w-lg w-full max-h-[90vh] overflow-y-auto overscroll-contain p-6"
    >
      {previewCard && (
        <>
          <h2 id="card-preview-title" className="sr-only">
            Card preview
          </h2>
          <div className="mb-4">
            <p className="nb-label text-muted-foreground mb-1">Front</p>
            <div className="nb-border-2 bg-secondary text-secondary-foreground p-4 min-h-[80px] flex items-center justify-center">
              <FormattedCardText
                text={previewCard.front}
                className="text-base font-bold w-full text-left md:text-center prose prose-sm max-w-none"
              />
            </div>
          </div>
          <div className="border-t-[3px] border-border pt-4">
            <p className="nb-label text-muted-foreground mb-1">Back</p>
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
        </>
      )}
    </ModalShell>
  );
}
