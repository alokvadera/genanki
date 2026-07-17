# GenAnki / Anki Maker - Product Requirements Document (PRD)

## 1. Product Overview & Value Proposition
GenAnki (Anki Maker) is a fast, offline-first web application designed to accelerate learning by automagic flashcard generation. It allows students, educators, and professionals to build study-ready Anki Flashcard Decks (`.apkg` packages) in seconds using state-of-the-art Large Language Models (LLMs) and advanced client-side processing.

Users can create decks by typing simple text prompts (e.g., "Advanced chemistry nomenclature") or by uploading full text-heavy documents (PDFs, Word documents, Markdown files, or scanned images).

---

## 2. Key Features

### A. Topic-Based Flashcard Generation
* **Functionality**: Users input a study topic, specify a target card count, select a difficulty level (Beginner, Intermediate, Advanced), and choose a card type (Basic Q&A or Cloze Deletion).
* **AI Output**: Generates structured, high-quality question/answer pairs styled with rich Markdown and LaTeX.

### B. Document-Based Upload & Parsing
* **File Types**: Accepts PDF, DOCX (Word), TXT, and Markdown files up to 50MB.
* **Text Extraction**: Uses local browser-based libraries (Mammoth.js, PDF.js) to parse document text without sending files to external servers.
* **Chapter Scoping**: Automatically detects chapters, structural headers, and outline sections. Users can select/deselect specific chapters to scope flashcard generation to custom sections.

### C. In-Browser OCR for Scanned Documents
* **Functionality**: Recognizes when an uploaded PDF consists of scanned images instead of text.
* **OCR Engine**: Runs a local, client-side instance of Tesseract.js to scan pages, extract text, and render page-by-page progress inside the browser.

### D. Rich formatting & LaTeX Support
* **Math Delimiters**: Formats math formulas and LaTeX equations (`$$...$$` block, `$` inline) accurately using KaTeX.
* **Card Preview**: Interactive live preview panel displaying compiled Markdown, code syntax highlighting, and styled equations before export.
* **Anki Compatibility**: Translates standard math boundaries to native Anki-compatible delimiters (`\[...\]`, `\(...\)`) during export.

### E. SQLite-Backed Binary Exporter (`.apkg`)
* **Local Database Construction**: Builds a fully valid SQLite collection database in the client browser using `sql.js`.
* **Export**: Packages notes, cards, templates, and schemas into a standard compressed ZIP package with the `.apkg` extension.
* **Importing**: Seamlessly imports directly into Anki Desktop, AnkiMobile (iOS), and AnkiDroid (Android).

---

## 3. Advanced Backend Architecture & Orchestration

### A. Optimus Load Balancer & Auto-Router
To handle rate limits and service outages, the backend ranks and orchestrates API queries across a chain of serverless providers:
1. **Groq** (Primary low-latency inference layer)
2. **Cerebras** (Ultra-fast failover cluster)
3. **Kilo** (Custom private endpoints)
4. **OpenRouter** (Free tier backup models)
5. **Cloudflare Workers AI** (Stable daily neuron budget pool)

### B. Intelligent Fallback Routing
* If a provider returns a rate limit (`429`), server error (`503`), or times out, the backend automatically flags the model with a cooldown timer, falls back to the next healthy provider in line, and resumes generation without client interruption.
* Detailed attempt lists, success ratios, response latency, and fallback logs are written to the database.

---

## 4. App Structure & User Navigation Flow

The app contains four distinct view paths:

1. **Landing Page (`/`)**:
   * Introduces key features and provides an interactive mockup deck card to try out styles.
2. **Main Workspace Dashboard (`/app`)**:
   * **Left Sidebar**: Manage, rename, add, or delete decks.
   * **Main Area**: Select document upload or text prompt builder. Includes file list drag-and-drop container, chapter selectors, settings configuration (card count, provider, difficulty, card type), and the live progress monitor.
   * **Interactive Card Grid**: View generated flashcards. Click on any card to edit front/back text, delete cards, or preview KaTeX math.
   * **Controls**: Export `.apkg` package, import bulk CSV/TSV data, or manually add cards.
3. **Runs Telemetry History (`/runs`)**:
   * Select and inspect current and past generation jobs. Shows live progress percentage, ETA timer, succeeded/failed status, warnings, and the detailed provider fallback trail.
4. **Provider Usage Dashboard (`/usage`)**:
   * Displays token metrics (Total, Prompt, Completion) and call volumes.
   * Visualizes real-time performance breakdowns, signature color-coded progress bars per-provider, and active rate-limit state limits.

---

## 5. Security & Persistence Model
* **Guest Access**: No login walls; anyone can start creating decks instantly.
* **Offline-First Storage**: User decks, cards, and active settings are stored locally in the browser's `localStorage`.
* **Private Documents**: Uploaded documents never leave the client's device. Text extraction and OCR are executed entirely inside the browser container.
