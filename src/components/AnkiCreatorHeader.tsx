import { Download, Layers, ArrowLeft, BarChart3, Clock3 } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { Deck } from "@/hooks/use-deck-store";

interface AnkiCreatorHeaderProps {
  deckCount: number;
  cardCount: number;
  activeDeck?: Deck;
  exporting: boolean;
  onExport: () => void;
}

export default function AnkiCreatorHeader({
  deckCount,
  cardCount,
  activeDeck,
  exporting,
  onExport,
}: AnkiCreatorHeaderProps) {
  return (
    <header className="border-b-[3px] border-border bg-card text-card-foreground">
      <div className="w-full px-6 lg:px-10 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a
            href="/"
            className="nb-border nb-shadow-sm px-3 py-1.5 bg-secondary text-secondary-foreground font-bold text-sm nb-hover-shadow"
          >
            <ArrowLeft className="w-4 h-4 inline -mt-0.5" />
          </a>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2">
              <Layers className="w-6 h-6" />
              genanki
            </h1>
            <p className="text-xs text-muted-foreground font-medium mt-0.5">
              {deckCount} deck{deckCount !== 1 ? "s" : ""} · {cardCount} card{cardCount !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button
            asChild
            variant="outline"
            className="nb-border nb-shadow-sm nb-hover-shadow font-bold text-sm px-4 h-9"
          >
            <Link to="/runs"><Clock3 className="w-4 h-4" /> Runs</Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="nb-border nb-shadow-sm nb-hover-shadow font-bold text-sm px-4 h-9"
          >
            <Link to="/usage"><BarChart3 className="w-4 h-4" /> Usage</Link>
          </Button>
          <Button
            onClick={onExport}
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
  );
}
