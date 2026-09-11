import { motion } from "framer-motion";
import { SkipLink } from "@/components/SkipLink";
import { Link } from "react-router";
import { Layers, ArrowRight } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <SkipLink />

      <nav className="border-b-[3px] border-border bg-card text-card-foreground">
        <div className="w-full px-6 lg:px-10 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="nb-border nb-shadow-sm bg-secondary text-secondary-foreground p-2">
              <Layers className="w-5 h-5" />
            </div>
            <span className="font-bold text-lg tracking-tight">genanki</span>
          </Link>
        </div>
      </nav>

      <main id="main-content" className="flex-1 flex items-center justify-center px-6 py-16 scroll-mt-4">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-lg"
        >
          <div className="nb-border nb-shadow bg-card p-6 sm:p-8">
            <p className="nb-label text-muted-foreground mb-3">
              404 · Nothing filed here
            </p>
            <h1 className="text-3xl sm:text-4xl font-bold mb-3">
              This card is blank.
            </h1>
            <p className="text-muted-foreground leading-relaxed mb-6">
              There is no page at that address. It may have been renamed, or
              the link may have been mistyped.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/app"
                className="nb-border nb-shadow-sm nb-hover-shadow bg-primary text-primary-foreground px-5 py-2.5 font-bold text-sm inline-flex items-center gap-2"
              >
                Go to the deck creator
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                to="/"
                className="nb-border nb-shadow-sm nb-hover-shadow bg-card px-5 py-2.5 font-bold text-sm"
              >
                Back home
              </Link>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
