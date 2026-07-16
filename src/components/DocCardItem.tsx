import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import type { AnkiCard } from "@/lib/anki";

interface DocCardItemProps {
  card: AnkiCard;
  index: number;
  onEdit: (front: string, back: string) => void;
  onRemove: () => void;
}

export default function DocCardItem({ card, index, onEdit, onRemove }: DocCardItemProps) {
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
