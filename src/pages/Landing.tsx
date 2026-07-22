import { motion } from "framer-motion";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  Layers,
  Download,
  ArrowRight,
  Sparkles,
  BookOpen,
  Files,
  Camera,
  HelpCircle,
  Calculator,
} from "lucide-react";

const features = [
  {
    icon: <Layers className="w-6 h-6" />,
    title: "Create Decks",
    desc: "Organize your flashcards into custom decks. Rename, add, and manage multiple decks at once.",
    color: "bg-secondary",
    shadow: "nb-shadow-amber",
  },
  {
    icon: <HelpCircle className="w-6 h-6" />,
    title: "Cloze Deletion Support",
    desc: "Generate fill-in-the-blank style cards automatically. Perfect for memorizing terms, phrases, and key definitions.",
    color: "bg-[#ffe066]",
    shadow: "nb-shadow-indigo",
  },
  {
    icon: <Calculator className="w-6 h-6" />,
    title: "LaTeX & Rich Markdown",
    desc: "Format math equations ($x$) and code snippets beautifully. Auto-escapes HTML for native compatibility in Anki.",
    color: "bg-[#4ecdc4]",
    shadow: "nb-shadow-teal",
  },
  {
    icon: <Camera className="w-6 h-6" />,
    title: "Client-Side OCR Engine",
    desc: "Extract text from scanned PDFs directly in your browser using local Tesseract.js. Your documents never leave your device.",
    color: "bg-accent",
    shadow: "nb-shadow-rose",
  },
  {
    icon: <Files className="w-6 h-6" />,
    title: "Multi-File Upload & Merge",
    desc: "Upload and parse multiple PDF, Word, TXT, or MD documents concurrently, merging them automatically into a single custom deck.",
    color: "bg-[#a8e6cf]",
    shadow: "nb-shadow-indigo",
  },
  {
    icon: <Download className="w-6 h-6" />,
    title: "Export .apkg",
    desc: "Download production-ready Anki packages. Import directly into Anki desktop or mobile.",
    color: "bg-white",
    shadow: "nb-shadow-amber",
  },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="border-b-[3px] border-border bg-card text-card-foreground">
        <div className="w-full px-6 lg:px-10 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="nb-border nb-shadow-sm bg-secondary text-secondary-foreground p-2">
              <Layers className="w-5 h-5" />
            </div>
            <span className="font-bold text-lg tracking-tight">genanki</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <a
              href="/app"
              className="nb-border nb-shadow-sm nb-hover-shadow bg-primary text-primary-foreground px-5 py-2 font-bold text-sm inline-flex items-center gap-2"
            >
              Open App
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="w-full px-6 lg:px-10 pt-16 sm:pt-24 pb-16">
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
            Create flashcard decks using AI smart text extractions, local PDF OCR scanning, 
            multi-file aggregation, and Cloze deletions. Export as{" "}
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
          <div className="nb-border nb-shadow-indigo bg-white p-1">
            <div className="nb-border-2 bg-muted p-3 flex items-center gap-2 mb-3">
              <div className="w-3 h-3 bg-accent nb-border-2" />
              <div className="w-3 h-3 bg-secondary nb-border-2" />
              <div className="w-3 h-3 bg-[#4ecdc4] nb-border-2" />
              <span className="text-[10px] font-bold text-muted-foreground ml-2 uppercase tracking-widest">
                genanki
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
      <section id="features" className="border-t-[3px] border-black bg-white">
        <div className="w-full px-6 lg:px-10 py-16 sm:py-20">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
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
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
              >
                <div className={`nb-border ${f.shadow} nb-hover-shadow bg-white p-6 h-full`}>
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
      <section className="border-t-[3px] border-black bg-secondary/30">
        <div className="w-full px-6 lg:px-10 py-16 sm:py-20">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
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
                title: "Add Documents or Topics",
                desc: "Paste a topic, drag-and-drop multiple documents (PDF/Word/TXT/MD), or scan physical sheets directly in-browser using local OCR.",
              },
              {
                step: "02",
                title: "Configure & Edit Cards",
                desc: "Select card format (Basic Q&A or Cloze deletions), edit generated Markdown math/LaTeX text, and control difficulty scoping page-by-page.",
              },
              {
                step: "03",
                title: "Export & Study",
                desc: "Instantly download your custom database package (.apkg) containing all formatting and cards, ready to study.",
              },
            ].map((s, i) => (
              <motion.div
                key={s.step}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className="relative"
              >
                <span className={`nb-border inline-block text-3xl font-bold px-3 py-1 mb-4 ${["bg-primary text-primary-foreground", "bg-secondary", "bg-accent text-accent-foreground"][i]}`}>
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
      <section className="border-t-[3px] border-black bg-white">
        <div className="w-full px-6 lg:px-10 py-16 sm:py-20 text-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
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
              Open genanki
            </a>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t-[3px] border-black">
        <div className="w-full px-6 lg:px-10 py-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground font-medium">
            © {new Date().getFullYear()} genanki. All rights reserved.
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
