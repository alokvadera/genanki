import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import type { AnkiCard } from "@/lib/anki";

interface DeckDetailCardItemProps {
  card: AnkiCard;
  index: number;
  onEdit: (front: string, back: string) => void;
  onRemove: () => void;
  onPreview: (card: AnkiCard) => void;
}

export default function DeckDetailCardItem({
  card,
  index,
  onEdit,
  onRemove,
  onPreview,
}: DeckDetailCardItemProps) {
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
