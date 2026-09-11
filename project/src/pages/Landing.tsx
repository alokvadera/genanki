import { motion } from "framer-motion";
import { SkipLink } from "@/components/SkipLink";
import { Link } from "react-router";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  Layers,
  Download,
  ArrowRight,
  BookOpen,
  Files,
  Camera,
  HelpCircle,
  Calculator,
} from "lucide-react";

/** The supporting capabilities. Rendered as a spec list, not a card grid —
 *  these are comparable options, so they should scan as rows, not compete. */
const capabilities = [
  {
    icon: Camera,
    title: "Local OCR",
    desc: "Scanned PDFs are read in your browser by Tesseract. The file never leaves the device.",
  },
  {
    icon: Files,
    title: "Many documents, one deck",
    desc: "Drop in PDF, Word, TXT and Markdown together and merge them into a single deck.",
  },
  {
    icon: HelpCircle,
    title: "Cloze or basic",
    desc: "Fill-in-the-blank cards for terms and definitions, or straight question-and-answer pairs.",
  },
  {
    icon: Calculator,
    title: "LaTeX and Markdown",
    desc: "Math and code render natively in Anki. HTML is escaped on the way out.",
  },
  {
    icon: Layers,
    title: "Several decks at once",
    desc: "Keep separate decks side by side and move between them without losing your place.",
  },
  {
    icon: Download,
    title: "Real .apkg output",
    desc: "Export a package that opens directly in Anki desktop and AnkiMobile.",
  },
];

const steps = [
  {
    title: "Bring the material",
    desc: "Paste a topic, drop in documents, or type one card at a time.",
  },
  {
    title: "Shape the cards",
    desc: "Choose basic or cloze, set the difficulty, and edit any card before it is kept.",
  },
  {
    title: "Export and study",
    desc: "Download the .apkg and open it in Anki. Formatting comes with it.",
  },
];

/** Entrance for content below the fold.
 *
 *  Uses `animate` (fires on mount) rather than `whileInView`. A scroll-triggered
 *  reveal leaves the section at opacity 0 until it is observed, which hides real
 *  content from print, full-page capture, and any case where the observer does
 *  not fire. Mount animation always resolves.
 *
 *  `prefers-reduced-motion` is honoured globally by MotionConfig in main.tsx,
 *  which drops the transform and opacity transitions for those users. */
const reveal = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
};

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SkipLink />

      {/* Nav */}
      <nav className="border-b-[3px] border-border bg-card text-card-foreground">
        <div className="w-full px-6 lg:px-10 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="nb-border nb-shadow-sm bg-secondary text-secondary-foreground p-2">
              <Layers className="w-5 h-5" />
            </div>
            <span className="font-bold text-lg tracking-tight">genanki</span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link
              to="/app"
              className="nb-border nb-shadow-sm nb-hover-shadow bg-primary text-primary-foreground px-5 py-2 font-bold text-sm inline-flex items-center gap-2"
            >
              Open App
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <main id="main-content" className="w-full px-6 lg:px-10 pt-16 sm:pt-24 pb-16 scroll-mt-4">
        <div className="mx-auto max-w-7xl">
          <div className="grid items-center gap-12 lg:grid-cols-[1fr_1fr] lg:gap-12">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="max-w-3xl lg:pt-4"
            >
              <p className="nb-label text-muted-foreground mb-5">
                No account · Runs in the browser
              </p>
              {/* Sized per column measure. At lg the 2-col grid gives the text
                  only ~448px, where 52px would orphan "in."; that size waits
                  for xl (~576px), where both lines stay whole. */}
              <h1 className="text-4xl sm:text-5xl lg:text-4xl xl:text-[3.25rem] font-bold leading-[1.08] mb-6">
                A document goes in.
                <br />
                <span className="bg-secondary text-secondary-foreground px-2.5 -rotate-1 inline-block mt-2">
                  A deck comes out.
                </span>
              </h1>
              <p className="text-base sm:text-lg text-muted-foreground max-w-xl leading-relaxed mb-8">
                genanki reads your PDFs, notes and topics and writes Anki
                flashcards you can edit before you keep them. Export the{" "}
                <span className="font-bold text-foreground">.apkg</span> and
                open it in Anki.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  to="/app"
                  className="nb-border nb-shadow nb-hover-shadow bg-primary text-primary-foreground px-7 py-3 font-bold text-base inline-flex items-center gap-2"
                >
                  Start a deck
                  <ArrowRight className="w-5 h-5" />
                </Link>
                <a
                  href="#how"
                  className="nb-border nb-shadow-sm nb-hover-shadow bg-card px-7 py-3 font-bold text-base inline-flex items-center gap-2"
                >
                  See how it works
                </a>
              </div>
            </motion.div>

            {/* The artifact itself — a real card pair, not an illustration */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.5,
                delay: 0.12,
                ease: [0.16, 1, 0.3, 1],
              }}
              className="mt-10 lg:mt-0 max-w-2xl mx-auto w-full"
            >
              <div className="nb-border nb-shadow-pen bg-card p-1">
                <div className="nb-border-2 bg-muted p-3 flex items-center gap-2 mb-3">
                  <div className="w-3 h-3 bg-secondary nb-border-2" />
                  <div className="w-3 h-3 bg-foreground nb-border-2" />
                  <div className="w-3 h-3 bg-accent nb-border-2" />
                  <span className="nb-label text-muted-foreground ml-2">
                    biology-101.apkg
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 p-3">
                  <div className="nb-border-2 bg-secondary text-secondary-foreground p-4">
                    <p className="nb-label text-secondary-foreground/70 mb-2">
                      Front
                    </p>
                    <p className="font-bold text-lg">
                      What is photosynthesis?
                    </p>
                  </div>
                  <div className="nb-border-2 bg-card p-4">
                    <p className="nb-label text-muted-foreground mb-2">Back</p>
                    <p className="text-sm">
                      The process by which green plants convert light energy
                      into chemical energy.
                    </p>
                  </div>
                </div>
                <div className="p-3 pt-0 flex flex-wrap gap-2">
                  <div className="nb-border-2 bg-card px-3 py-1.5 text-xs font-bold flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5" />
                    From a 14-page PDF
                  </div>
                  <div className="nb-border-2 bg-accent text-accent-foreground px-3 py-1.5 text-xs font-bold flex items-center gap-1.5">
                    <Download className="w-3.5 h-3.5" />
                    Ready for Anki
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </main>

      {/* Capabilities — full-width header, then a two-column spec sheet.
          A spec sheet, not a card grid: the rows carry dividers, not borders. */}
      <section id="features" className="border-t-[3px] border-border bg-card">
        <div className="w-full px-6 lg:px-10 py-16 sm:py-20">
          <motion.div {...reveal} transition={{ duration: 0.4 }} className="max-w-2xl">
            <p className="nb-label text-muted-foreground mb-4">
              What it does
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Two ways in. One file out.
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              Give it a topic and it writes the cards. Give it a stack of
              documents and it reads them, splits them into sections, and works
              through each one. Either way you review everything before it
              becomes a deck.
            </p>
          </motion.div>

          <motion.dl
            {...reveal}
            transition={{ duration: 0.4, delay: 0.08 }}
            className="mt-10 grid gap-x-10 border-t-[3px] border-border md:grid-cols-2"
          >
            {capabilities.map((c) => {
              const Icon = c.icon;
              return (
                <div
                  key={c.title}
                  className="flex gap-4 border-b-[3px] border-border py-4"
                >
                  <Icon className="w-4 h-4 mt-1 shrink-0 text-muted-foreground" />
                  <div>
                    <dt className="font-bold text-base mb-1">{c.title}</dt>
                    <dd className="text-sm text-muted-foreground leading-relaxed">
                      {c.desc}
                    </dd>
                  </div>
                </div>
              );
            })}
          </motion.dl>

          <motion.p
            {...reveal}
            transition={{ duration: 0.4, delay: 0.12 }}
            className="mt-8 nb-border bg-muted px-5 py-4 text-sm font-medium leading-relaxed max-w-3xl"
          >
            Nothing is saved to an account and no document is uploaded for
            storage. OCR runs locally, and the deck lives in your browser until
            you export it.
          </motion.p>
        </div>
      </section>

      {/* How it works — a numbered rule, not three monuments */}
      <section id="how" className="border-t-[3px] border-border bg-muted/40">
        <div className="w-full px-6 lg:px-10 py-16 sm:py-20">
          <motion.div {...reveal} transition={{ duration: 0.4 }}>
            <p className="nb-label text-muted-foreground mb-4">The path</p>
            <h2 className="text-3xl sm:text-4xl font-bold mb-10">
              Three moves, start to study
            </h2>
          </motion.div>

          <ol className="grid grid-cols-1 sm:grid-cols-3 gap-8 sm:gap-6">
            {steps.map((s, i) => (
              <motion.li
                key={s.title}
                {...reveal}
                transition={{ duration: 0.35, delay: i * 0.07 }}
                className="border-t-[3px] border-border pt-4"
              >
                <span className="nb-label text-muted-foreground">
                  Step {i + 1}
                </span>
                <h3 className="font-bold text-lg mt-1.5 mb-2">{s.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {s.desc}
                </p>
              </motion.li>
            ))}
          </ol>
        </div>
      </section>

      {/* Closing statement — statement left, action right */}
      <section className="border-t-[3px] border-border bg-card">
        <div className="w-full px-6 lg:px-10 py-14 sm:py-16">
          <motion.div
            {...reveal}
            transition={{ duration: 0.4 }}
            className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <h2 className="text-3xl sm:text-4xl font-bold mb-3">
                Bring the reading. Leave with the deck.
              </h2>
              <p className="text-muted-foreground max-w-xl">
                No signup, no upload, no per-card limit.
              </p>
            </div>
            <Link
              to="/app"
              className="nb-border nb-shadow nb-hover-shadow bg-primary text-primary-foreground px-8 py-3.5 font-bold text-base inline-flex items-center gap-2 shrink-0 self-start sm:self-auto"
            >
              Open genanki
              <ArrowRight className="w-5 h-5" />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t-[3px] border-border bg-background">
        <div className="w-full px-6 lg:px-10 py-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} genanki
          </p>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <Link to="/" className="hover:text-foreground transition-colors">
              Home
            </Link>
            <Link to="/app" className="hover:text-foreground transition-colors">
              App
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
