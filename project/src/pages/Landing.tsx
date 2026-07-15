import { motion } from "framer-motion";
import {
  Layers,
  Zap,
  Download,
  FileText,
  ArrowRight,
  Sparkles,
  BookOpen,
} from "lucide-react";

const features = [
  {
    icon: <Layers className="w-6 h-6" />,
    title: "Create Decks",
    desc: "Organize your flashcards into custom decks. Rename, add, and manage multiple decks at once.",
    color: "bg-secondary",
  },
  {
    icon: <Zap className="w-6 h-6" />,
    title: "Instant Cards",
    desc: "Add front/back cards with a single click. Bulk import from CSV files for speed.",
    color: "bg-[#4ecdc4]",
  },
  {
    icon: <Download className="w-6 h-6" />,
    title: "Export .apkg",
    desc: "Download production-ready Anki packages. Import directly into Anki desktop or mobile.",
    color: "bg-accent",
  },
  {
    icon: <FileText className="w-6 h-6" />,
    title: "CSV Import",
    desc: "Paste semicolon-separated text or upload CSV/TSV files to add hundreds of cards at once.",
    color: "bg-[#a8e6cf]",
  },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="nb-border-b bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="nb-border nb-shadow-sm bg-secondary p-2">
              <Layers className="w-5 h-5" />
            </div>
            <span className="font-bold text-lg tracking-tight">Anki Maker</span>
          </div>
          <a
            href="/app"
            className="nb-border nb-shadow-sm nb-hover-shadow bg-primary text-primary-foreground px-5 py-2 font-bold text-sm inline-flex items-center gap-2"
          >
            Open App
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="max-w-3xl"
        >
          <div className="inline-block nb-border nb-shadow-sm bg-secondary px-3 py-1 text-xs font-bold mb-6 uppercase tracking-widest">
            100% Free · Browser-Based
          </div>
          <h1 className="text-4xl sm:text-6xl font-bold tracking-tight leading-[1.05] mb-5">
            Build Anki decks
            <br />
            <span className="bg-accent text-accent-foreground px-2 -rotate-1 inline-block mt-1">
              in seconds
            </span>
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground max-w-xl leading-relaxed mb-8 font-medium">
            Create flashcard decks with a clean, fast interface. Add cards one by one
            or bulk-import from CSV. Export as{" "}
            <span className="font-bold text-foreground">.apkg</span> and open directly in Anki.
          </p>
          <div className="flex flex-wrap gap-3">
            <a
              href="/app"
              className="nb-border nb-shadow nb-hover-shadow bg-primary text-primary-foreground px-7 py-3 font-bold text-base inline-flex items-center gap-2"
            >
              <Sparkles className="w-5 h-5" />
              Start Creating
            </a>
            <a
              href="#features"
              className="nb-border nb-shadow-sm nb-hover-shadow bg-white px-7 py-3 font-bold text-base inline-flex items-center gap-2"
            >
              Learn More
            </a>
          </div>
        </motion.div>

        {/* Preview Card */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="mt-14 sm:mt-20 max-w-2xl mx-auto"
        >
          <div className="nb-border nb-shadow-lg bg-white p-1">
            <div className="nb-border-2 bg-muted p-3 flex items-center gap-2 mb-3">
              <div className="w-3 h-3 bg-accent nb-border-2" />
              <div className="w-3 h-3 bg-secondary nb-border-2" />
              <div className="w-3 h-3 bg-[#4ecdc4] nb-border-2" />
              <span className="text-[10px] font-bold text-muted-foreground ml-2 uppercase tracking-widest">
                Anki Maker
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 p-3">
              <div className="nb-border-2 bg-secondary p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
                  Front
                </p>
                <p className="font-bold text-lg">What is photosynthesis?</p>
              </div>
              <div className="nb-border-2 bg-white p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
                  Back
                </p>
                <p className="text-sm">
                  The process by which green plants convert light energy into chemical energy.
                </p>
              </div>
            </div>
            <div className="p-3 pt-0 flex gap-2">
              <div className="nb-border-2 bg-[#4ecdc4] px-3 py-1.5 text-xs font-bold flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5" />
                Biology 101
              </div>
              <div className="nb-border-2 bg-white px-3 py-1.5 text-xs font-bold flex items-center gap-1.5">
                <Download className="w-3.5 h-3.5" />
                Export .apkg
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Features */}
      <section id="features" className="nb-border-t bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2">
              Everything you need
            </h2>
            <p className="text-muted-foreground font-medium max-w-md">
              A focused tool for creating Anki flashcard decks without the bloat.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-10">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
              >
                <div className="nb-border nb-shadow-sm nb-hover-shadow bg-white p-6 h-full">
                  <div
                    className={`nb-border-2 ${f.color} inline-block p-2.5 mb-4`}
                  >
                    {f.icon}
                  </div>
                  <h3 className="font-bold text-base mb-1.5">{f.title}</h3>
                  <p className="text-sm text-muted-foreground font-medium leading-relaxed">
                    {f.desc}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="nb-border-t">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2">
              Three steps
            </h2>
            <p className="text-muted-foreground font-medium max-w-md">
              From idea to Anki deck in under a minute.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-10">
            {[
              {
                step: "01",
                title: "Add Cards",
                desc: "Type your question and answer, or paste a whole batch from a spreadsheet.",
              },
              {
                step: "02",
                title: "Organize Decks",
                desc: "Create multiple decks, rename them, and manage your collection in one place.",
              },
              {
                step: "03",
                title: "Export & Study",
                desc: "Download the .apkg file and open it in Anki. Start learning immediately.",
              },
            ].map((s, i) => (
              <motion.div
                key={s.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="relative"
              >
                <span className="nb-border inline-block bg-secondary text-3xl font-bold px-3 py-1 mb-4">
                  {s.step}
                </span>
                <h3 className="font-bold text-lg mb-1.5">{s.title}</h3>
                <p className="text-sm text-muted-foreground font-medium leading-relaxed">
                  {s.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="nb-border-t bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20 text-center">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            <div className="inline-block nb-border nb-shadow bg-accent px-4 py-1.5 text-xs font-bold mb-6 uppercase tracking-widest text-accent-foreground">
              No signup required
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              Start building your deck now
            </h2>
            <p className="text-muted-foreground font-medium max-w-md mx-auto mb-8">
              Everything runs in your browser. No data leaves your device.
            </p>
            <a
              href="/app"
              className="nb-border nb-shadow nb-hover-shadow bg-primary text-primary-foreground px-8 py-3.5 font-bold text-base inline-flex items-center gap-2"
            >
              <Sparkles className="w-5 h-5" />
              Open Anki Maker
            </a>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="nb-border-t">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground font-medium">
            Built with <span className="font-bold text-foreground">Freebuff</span> — freebuff.com
          </p>
          <div className="flex gap-4 text-xs text-muted-foreground font-medium">
            <a href="/" className="hover:text-foreground transition-colors">
              Home
            </a>
            <a href="/app" className="hover:text-foreground transition-colors">
              App
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
