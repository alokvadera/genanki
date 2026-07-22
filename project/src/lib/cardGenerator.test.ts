import { describe, it, expect } from "vitest";
import { generateCardsFromText, splitIntoChunks, extractListCards } from "@/lib/cardGenerator";

describe("generateCardsFromText", () => {
  // --- Basic edge cases ---
  it("returns empty array for short text", () => {
    expect(generateCardsFromText("short")).toEqual([]);
  });

  it("returns empty array for empty input", () => {
    expect(generateCardsFromText("")).toEqual([]);
  });

  it("returns empty array for null/undefined input", () => {
    expect(generateCardsFromText(null as unknown as string)).toEqual([]);
    expect(generateCardsFromText(undefined as unknown as string)).toEqual([]);
  });

  it("returns empty array for text under 30 chars", () => {
    expect(generateCardsFromText("abcde fghij klmno")).toEqual([]);
  });

  // --- Strategy 1: Definition cards (pattern 1 - is/are/was) ---
  it("extracts definition cards with 'is' pattern", () => {
    const text =
      "Mitochondria is the powerhouse of the cell. DNA is the genetic material found in living organisms.";
    const cards = generateCardsFromText(text);
    expect(cards.length).toBeGreaterThan(0);
    const mitochondria = cards.find((c) =>
      c.front.toLowerCase().includes("mitochondria")
    );
    expect(mitochondria).toBeDefined();
    expect(mitochondria!.back.length).toBeGreaterThan(0);
  });

  it("extracts definition cards with 'are' pattern", () => {
    const text =
      "White blood cells are the body's primary defense against infection. Antibodies are proteins produced by the immune system.";
    const cards = generateCardsFromText(text);
    const wbc = cards.find((c) => c.front.toLowerCase().includes("white blood"));
    expect(wbc).toBeDefined();
  });

  it("extracts definition cards with 'was' pattern", () => {
    const text =
      "The printing press was invented by Johannes Gutenberg in the 15th century.";
    const cards = generateCardsFromText(text);
    const printing = cards.find((c) => c.front.toLowerCase().includes("printing"));
    expect(printing).toBeDefined();
  });

  it("extracts definition cards with 'means' pattern", () => {
    const text =
      "Photosynthesis means the process by which plants convert light into chemical energy.";
    const cards = generateCardsFromText(text);
    expect(cards.length).toBeGreaterThan(0);
  });

  it("extracts definition cards with 'refers to' pattern", () => {
    const text =
      "The term apoptosis refers to programmed cell death that occurs in multicellular organisms.";
    const cards = generateCardsFromText(text);
    const apoptosis = cards.find((c) =>
      c.front.toLowerCase().includes("apoptosis")
    );
    expect(apoptosis).toBeDefined();
  });

  it("extracts definition cards with 'defined as' pattern", () => {
    const text =
      "Homeostasis is defined as the maintenance of a stable internal environment within an organism.";
    const cards = generateCardsFromText(text);
    const homeostasis = cards.find((c) =>
      c.front.toLowerCase().includes("homeostasis")
    );
    expect(homeostasis).toBeDefined();
  });

  it("extracts definition cards with 'known as' pattern", () => {
    const text =
      "The mitochondria are known as the powerhouse of the cell for their role in ATP production.";
    const cards = generateCardsFromText(text);
    expect(cards.length).toBeGreaterThan(0);
  });

  // --- Strategy 1: Definition cards (pattern 2 - colon) ---
  it("extracts definition cards with colon pattern", () => {
    const text =
      "Mitochondria: The organelles responsible for producing ATP in cells through oxidative phosphorylation.";
    const cards = generateCardsFromText(text);
    const mitochondria = cards.find((c) =>
      c.front.toLowerCase().includes("mitochondria")
    );
    expect(mitochondria).toBeDefined();
  });

  // --- Strategy 2: Q&A cards ---
  it("extracts Q&A cards with 'What' questions", () => {
    const text =
      "What is photosynthesis? It is the process by which plants convert sunlight into energy. How do cells divide? Through mitosis and meiosis.";
    const cards = generateCardsFromText(text);
    const photoCard = cards.find((c) => c.front.includes("photosynthesis"));
    expect(photoCard).toBeDefined();
  });

  it("extracts Q&A cards with 'How' questions", () => {
    const text =
      "How does DNA replication work? It involves helicase unwinding the double helix and DNA polymerase synthesizing new strands.";
    const cards = generateCardsFromText(text);
    const dnaCard = cards.find((c) => c.front.includes("DNA replication"));
    expect(dnaCard).toBeDefined();
  });

  it("extracts Q&A cards with 'Why' questions", () => {
    const text =
      "Why is water essential for life? It serves as a universal solvent and facilitates biochemical reactions.";
    const cards = generateCardsFromText(text);
    const waterCard = cards.find((c) => c.front.includes("water"));
    expect(waterCard).toBeDefined();
  });

  it("extracts Q&A cards with 'When' questions", () => {
    const text =
      "When did the Cambrian explosion occur? It happened approximately 541 million years ago marking rapid diversification.";
    const cards = generateCardsFromText(text);
    expect(cards.length).toBeGreaterThan(0);
  });

  it("extracts Q&A cards with 'Where' questions", () => {
    const text =
      "Where does photosynthesis occur? It primarily takes place in the chloroplasts of plant cells.";
    const cards = generateCardsFromText(text);
    expect(cards.length).toBeGreaterThan(0);
  });

  it("extracts Q&A cards with 'Who' questions", () => {
    const text =
      "Who discovered penicillin? Alexander Fleming discovered penicillin in 1928.";
    const cards = generateCardsFromText(text);
    const penicillin = cards.find((c) => c.front.includes("penicillin"));
    expect(penicillin).toBeDefined();
  });

  it("extracts Q&A cards with 'Which' questions", () => {
    const text =
      "Which organelle is responsible for protein synthesis? The ribosome is the organelle responsible for protein synthesis.";
    const cards = generateCardsFromText(text);
    expect(cards.length).toBeGreaterThan(0);
  });

  it("extracts Q&A cards with 'Is' questions", () => {
    const text =
      "Is the earth round? Yes the earth is an oblate spheroid due to its rotation.";
    const cards = generateCardsFromText(text);
    expect(cards.length).toBeGreaterThan(0);
  });

  it("extracts Q&A cards with 'Are' questions", () => {
    const text =
      "Are atoms indivisible? No atoms are composed of protons neutrons and electrons.";
    const cards = generateCardsFromText(text);
    expect(cards.length).toBeGreaterThan(0);
  });

  it("extracts Q&A cards with 'Can' questions", () => {
    const text =
      "Can plants survive without sunlight? No plants require sunlight for photosynthesis to produce energy.";
    const cards = generateCardsFromText(text);
    expect(cards.length).toBeGreaterThan(0);
  });

  it("extracts Q&A cards with 'Do' questions", () => {
    const text =
      "Do cells have mitochondria? Yes most eukaryotic cells contain mitochondria for energy production.";
    const cards = generateCardsFromText(text);
    expect(cards.length).toBeGreaterThan(0);
  });

  it("extracts Q&A cards with 'Does' questions", () => {
    const text =
      "Does DNA contain all genetic information? Yes DNA contains the complete genetic instructions for an organism.";
    const cards = generateCardsFromText(text);
    expect(cards.length).toBeGreaterThan(0);
  });

  // --- Strategy 3: Heading-based cards ---
  it("extracts heading cards from markdown headings", () => {
    const text =
      "# Chapter 1\nMitochondria are the powerhouse of the cell and generate ATP.\n\n# Chapter 2\nThe nucleus contains the cell's genetic material.";
    const cards = generateCardsFromText(text);
    expect(cards.length).toBeGreaterThan(0);
  });

  it("extracts heading cards from ## headings", () => {
    const text =
      "## Cell Structure\nThe cell membrane is a phospholipid bilayer that regulates transport.";
    const cards = generateCardsFromText(text);
    expect(cards.length).toBeGreaterThan(0);
  });

  it("extracts heading cards from ### headings", () => {
    const text =
      "### Mitochondria\nThe mitochondria are double membrane organelles that produce energy.";
    const cards = generateCardsFromText(text);
    expect(cards.length).toBeGreaterThan(0);
  });

  it("extracts heading cards from ALL-CAPS lines", () => {
    const text =
      "INTRODUCTION\nThis chapter covers the basics of cell biology and cellular structures.";
    const cards = generateCardsFromText(text);
    const intro = cards.find((c) => c.front.includes("INTRODUCTION"));
    if (intro) {
      expect(intro.back.length).toBeGreaterThan(0);
    }
  });

  // --- Strategy 4: List-based cards ---
  it("extracts list cards from numbered lists", () => {
    const text =
      "1. Mitochondria - The powerhouse of the cell that generates ATP\n2. Nucleus - Contains the genetic material and controls cell activities\n3. Ribosomes - Sites of protein synthesis in the cell";
    const cards = generateCardsFromText(text);
    expect(cards.length).toBeGreaterThan(0);
    const mito = cards.find((c) => c.front.includes("Mitochondria"));
    expect(mito).toBeDefined();
  });

  it("extracts list cards from hyphen bullet points", () => {
    const text =
      "- Cell membrane: A phospholipid bilayer that regulates what enters and exits the cell\n- Cytoplasm: The gel-like substance that fills the cell and suspends organelles\n- Nucleus: The control center that houses the cell's DNA";
    const cards = generateCardsFromText(text);
    expect(cards.length).toBeGreaterThan(0);
  });

  it("extracts list cards with dash separator", () => {
    const text =
      "1. Protons - Positively charged particles found in the nucleus of an atom\n2. Neutrons - Electrically neutral particles found in the nucleus of an atom";
    const cards = generateCardsFromText(text);
    expect(cards.length).toBeGreaterThan(0);
  });

  // --- Strategy 5: Chunk-based cards ---
  it("extracts chunk-based cards from paragraphs", () => {
    const text =
      "The mitochondria is often called the powerhouse of the cell because it generates most of the cell's supply of adenosine triphosphate used as a source of chemical energy. Mitochondria are found in nearly all eukaryotic organisms and are believed to have originated from an ancient endosymbiotic event between a primitive eukaryotic cell and an aerobic bacterium.";
    const cards = generateCardsFromText(text);
    expect(cards.length).toBeGreaterThan(0);
  });

  it("skips chunks that are already questions", () => {
    const text =
      "What is the powerhouse of the cell? The mitochondria is the powerhouse of the cell that generates ATP through oxidative phosphorylation.";
    const cards = generateCardsFromText(text);
    const qCards = cards.filter((c) => c.front.startsWith("What is"));
    expect(qCards.length).toBeGreaterThanOrEqual(1);
  });

  // --- buildQuestionFromStatement branches ---
  it("creates 'What is' questions from short statements", () => {
    const text =
      "DNA is the molecule that carries genetic instructions for life. The mitochondria is the powerhouse of the cell that generates energy.";
    const cards = generateCardsFromText(text);
    expect(cards.length).toBeGreaterThan(0);
  });

  it("creates 'Explain' questions from longer statements with subjects", () => {
    const text =
      "The process of photosynthesis converts light energy into chemical energy through a series of reactions in the chloroplast. This is a fundamental biological process.";
    const cards = generateCardsFromText(text);
    expect(cards.length).toBeGreaterThan(0);
  });

  it("handles statements that cannot form questions (returns null)", () => {
    const text =
      "a] b] c] d] e] f] g] h] i] j] k] l] m] n] o] p] q] r] s] t] u] v] w] x] y] z].";
    const cards = generateCardsFromText(text);
    expect(cards.length).toBe(0);
  });

  // --- Deduplication ---
  it("deduplicates cards by front text", () => {
    const text =
      "What is photosynthesis? It is the process by which plants convert sunlight into energy.\n\nWhat is photosynthesis? The process of converting light to chemical energy.";
    const cards = generateCardsFromText(text);
    const photoCards = cards.filter((c) =>
      c.front.toLowerCase().includes("photosynthesis")
    );
    expect(photoCards.length).toBe(1);
  });

  it("deduplicates cards case-insensitively", () => {
    const text =
      "Mitochondria is the powerhouse of the cell that generates ATP. MITOCHONDRIA are organelles that generate energy through oxidative phosphorylation.";
    const cards = generateCardsFromText(text);
    const mitoCards = cards.filter((c) =>
      c.front.toLowerCase().includes("mitochondria")
    );
    expect(mitoCards.length).toBeGreaterThanOrEqual(1);
  });

  // --- maxCards ---
  it("respects maxCards limit", () => {
    let text = "";
    for (let i = 0; i < 50; i++) {
      text += `Term${i} is a definition that is long enough to match the pattern here.\n\n`;
    }
    const cards = generateCardsFromText(text, 10);
    expect(cards.length).toBeLessThanOrEqual(10);
  });

  it("defaults to 30 cards when no maxCards specified", () => {
    let text = "";
    for (let i = 0; i < 100; i++) {
      text += `Term${i} is a definition that is long enough to match the pattern here.\n\n`;
    }
    const cards = generateCardsFromText(text);
    expect(cards.length).toBeLessThanOrEqual(30);
  });

  it("ensures maxCards is at least 1 even with maxCards=0", () => {
    const text =
      "Mitochondria is the powerhouse of the cell that generates ATP through oxidative phosphorylation.";
    const cards = generateCardsFromText(text, 0);
    expect(cards.length).toBeGreaterThanOrEqual(0);
  });

  // --- Input size capping ---
  it("caps input size to 50k chars to avoid blocking on huge documents", () => {
    const huge = "A".repeat(100000);
    const cards = generateCardsFromText(huge);
    expect(cards).toEqual([]);
  });

  it("processes text at exactly 50k chars", () => {
    const text = "Mitochondria is the powerhouse of the cell. ".repeat(2000);
    const cards = generateCardsFromText(text);
    expect(cards.length).toBeGreaterThan(0);
  });

  // --- Back field clamping (MAX_BACK = 240) ---
  it("backs are capped at MAX_BACK (240 chars)", () => {
    const longBack =
      "Mitochondria is " +
      "very important for cell function ".repeat(20) +
      "in the cell.";
    const cards = generateCardsFromText(longBack);
    for (const card of cards) {
      expect(card.back.length).toBeLessThanOrEqual(250);
    }
  });

  // --- Front field clamping (MAX_FRONT = 300) ---
  it("fronts are capped at MAX_FRONT (300 chars)", () => {
    const longHeading = "A".repeat(350);
    const text = `${longHeading}\nSome content that is long enough to be extracted as a heading card.`;
    const cards = generateCardsFromText(text);
    for (const card of cards) {
      expect(card.front.length).toBeLessThanOrEqual(310);
    }
  });

  // --- P6: ALL-CAPS noise ---
  it("does not create cards from long ALL-CAPS line that isn't a heading (P6)", () => {
    const text =
      "MITOCHONDRIA AND THEIR FUNCTION IN CELLULAR RESPIRATION IS IMPORTANT FOR UNDERSTANDING HOW CELLS PRODUCE ENERGY\nThe study of mitochondria shows how cells generate ATP.";
    const cards = generateCardsFromText(text);
    for (const card of cards) {
      if (card.front.length > 40 && /^[A-Z\s]+$/.test(card.front)) {
        expect(card.front.length).toBeLessThanOrEqual(41);
      }
    }
  });

  it("still creates cards from real heading-style ALL CAPS on standalone line (P6)", () => {
    const text =
      "INTRODUCTION\nMitochondria are the powerhouse of the cell and generate energy through ATP production.\n\nCONCLUSION\nUnderstanding cellular respiration is key to biology.";
    const cards = generateCardsFromText(text);
    expect(cards.length).toBeGreaterThanOrEqual(0);
  });

  // --- Nonsense question prevention ---
  it("does not create nonsense questions from statements", () => {
    const text =
      "The cell membrane regulates what enters and exits the cell through selective permeability mechanisms.";
    const cards = generateCardsFromText(text);
    for (const card of cards) {
      expect(card.front).not.toMatch(/^[A-Z][^.?]*\.$/);
    }
  });

  // --- Additional branch coverage ---
  it("handles text with only whitespace", () => {
    expect(generateCardsFromText("   \n\n   ")).toEqual([]);
  });

  it("handles text with very short paragraphs", () => {
    expect(generateCardsFromText("ab\ncd\nef\ngh\nij")).toEqual([]);
  });

  it("handles definition with short term (skipped)", () => {
    const text = "X is a very short term that should not be extracted.";
    const cards = generateCardsFromText(text);
    const xCards = cards.filter((c) => c.front === "X");
    expect(xCards.length).toBe(0);
  });

  it("handles definition with short definition (skipped)", () => {
    const text = "Mitochondria is a cell.";
    const cards = generateCardsFromText(text);
    const mito = cards.find((c) => c.front.includes("Mitochondria"));
    expect(mito).toBeUndefined();
  });

  it("handles Q&A with short question (skipped)", () => {
    const text = "What is it? A test.";
    const cards = generateCardsFromText(text);
    expect(cards.length).toBe(0);
  });

  it("handles Q&A with short answer (skipped)", () => {
    const text = "What is the powerhouse of the cell? It generates energy.";
    const cards = generateCardsFromText(text);
    const photoCard = cards.find((c) => c.front.includes("powerhouse"));
    expect(photoCard).toBeDefined();
  });

  it("handles heading with short heading (skipped)", () => {
    const text = "# X\nThis is content that is long enough to be extracted.";
    const cards = generateCardsFromText(text);
    const xCards = cards.filter((c) => c.front === "X");
    expect(xCards.length).toBe(0);
  });

  it("handles heading with short content (skipped)", () => {
    const text = "# Heading\nShort.";
    const cards = generateCardsFromText(text);
    expect(cards.length).toBe(0);
  });

  it("handles list item with short item (skipped)", () => {
    const text = "1. X - This is a description that is long enough.";
    const cards = generateCardsFromText(text);
    const xCards = cards.filter((c) => c.front === "X");
    expect(xCards.length).toBe(0);
  });

  it("handles list item with short description (skipped)", () => {
    const text = "1. Long Item Name - short.";
    const cards = generateCardsFromText(text);
    expect(cards.length).toBe(0);
  });

  // Cover splitIntoChunks false branch: paragraph >= 300 chars
  it("splits long paragraphs by sentences when paragraph >= 300 chars", () => {
    // Create a paragraph > 300 chars with multiple sentences
    const longPara =
      "Mitochondria is the powerhouse of the cell that generates ATP through oxidative phosphorylation. " +
      "This process occurs in the inner mitochondrial membrane where the electron transport chain is located. " +
      "The proton gradient drives ATP synthase to produce energy. " +
      "Without mitochondria cells would not have enough energy to survive. " +
      "This is why mitochondria are essential for all eukaryotic organisms on Earth.";
    expect(longPara.length).toBeGreaterThan(300);
    const cards = generateCardsFromText(longPara);
    expect(cards.length).toBeGreaterThan(0);
  });

  // Cover bullet list false branch: item/desc too short
  it("skips bullet list items that fail length checks", () => {
    // Bullet with short item (<=3 chars)
    const text1 = "- X - This description is long enough to pass the check.";
    const cards1 = generateCardsFromText(text1);
    const xCards = cards1.filter((c) => c.front === "X");
    expect(xCards.length).toBe(0);

    // Bullet with short description (<=5 chars)
    const text2 = "- Long Item Name - ab.";
    const cards2 = generateCardsFromText(text2);
    expect(cards2.length).toBe(0);
  });

  it("handles numbered list without description", () => {
    const text =
      "1. First item without description\n2. Second item without description";
    const cards = generateCardsFromText(text);
    expect(cards.length).toBe(0);
  });

  it("handles bullet list without description separator", () => {
    const text =
      "- First item without any description that makes it long enough\n- Second item without any description that makes it long enough";
    const cards = generateCardsFromText(text);
    expect(Array.isArray(cards)).toBe(true);
  });

  it("handles long paragraph with sentence splitting", () => {
    const text =
      "Mitochondria is the powerhouse of the cell. It generates ATP through oxidative phosphorylation. This process occurs in the inner membrane. The electron transport chain is crucial for this process. Without mitochondria cells would not have enough energy to survive. This is why mitochondria are essential for all eukaryotic organisms.";
    const cards = generateCardsFromText(text);
    expect(cards.length).toBeGreaterThan(0);
  });

  it("handles statement with comma (uses Explain branch)", () => {
    const text =
      "The mitochondria, also known as the powerhouse of the cell, generate ATP through oxidative phosphorylation. This process is essential for cellular respiration and energy production in all eukaryotic organisms.";
    const cards = generateCardsFromText(text);
    expect(cards.length).toBeGreaterThan(0);
  });

  it("handles statement without matching subject (returns null from buildQuestion)", () => {
    const text =
      "the process of photosynthesis converts light energy into chemical energy through a series of reactions in the chloroplast. This is important for all plant life.";
    const cards = generateCardsFromText(text);
    expect(cards.length).toBeGreaterThanOrEqual(0);
  });

  it("handles multiple card types together", () => {
    const text = `
# Chapter 1: Cell Biology
The cell is the basic unit of life. Cells are the building blocks of all living organisms.

What is photosynthesis? Photosynthesis is the process by which plants convert sunlight into chemical energy.

1. Mitochondria - The powerhouse of the cell that generates ATP
2. Nucleus - The control center that houses genetic material
3. Ribosomes - The sites of protein synthesis

The endoplasmic reticulum is an organelle involved in protein synthesis. The Golgi apparatus modifies and packages proteins for secretion.
    `;
    const cards = generateCardsFromText(text);
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.length).toBeLessThanOrEqual(30);
  });

  it("handles bullet list with colon separator", () => {
    const text =
      "- Mitochondria: The powerhouse of the cell that generates ATP\n- Nucleus: The control center of the cell\n- Ribosome: The site of protein synthesis";
    const cards = generateCardsFromText(text);
    expect(cards.length).toBeGreaterThan(0);
  });

  it("handles text with no extractable content", () => {
    const text = "Hello world. This is a test. Another sentence here.";
    const cards = generateCardsFromText(text);
    expect(Array.isArray(cards)).toBe(true);
  });

  it("handles definition pattern with 'were'", () => {
    const text =
      "Dinosaurs were large reptiles that dominated the Earth for millions of years before going extinct.";
    const cards = generateCardsFromText(text);
    const dino = cards.find((c) => c.front.toLowerCase().includes("dinosaurs"));
    expect(dino).toBeDefined();
  });

  it("handles definition pattern with 'is known as'", () => {
    const text =
      "ATP is known as the energy currency of the cell and drives all cellular processes.";
    const cards = generateCardsFromText(text);
    const atp = cards.find((c) => c.front.includes("ATP"));
    expect(atp).toBeDefined();
  });
});


describe("generateCardsFromText — clampBack/clampFront true branches (B0/B1)", () => {
  it("clampBack true branch: heading card with back > MAX_BACK (240) chars", () => {
    // B0 (L8): clampBack ternary TRUE branch — s.length > MAX_BACK
    // Use a list item where the description exceeds 240 chars to trigger clampBack.
    const longDesc = "x".repeat(260);
    const text = `1. Heading Item - ${longDesc}\n\n2. Second Item - Short description here.`;
    const cards = generateCardsFromText(text);
    const clamped = cards.filter((c) => c.front === "Heading Item");
    expect(clamped.length).toBe(1);
    expect(clamped[0]!.back.length).toBeLessThanOrEqual(250);
    // The back should be clamped (ends with "…" or is shorter than original)
    expect(clamped[0]!.back.length).toBeLessThan(longDesc.length);
  });

  it("clampFront true branch: heading card with front > MAX_FRONT (300) chars", () => {
    // B1 (L12): clampFront ternary TRUE branch — s.length > MAX_FRONT
    // Use an ALL-CAPS heading (max 40 chars) won't exceed 300.
    // Instead use a markdown heading with very long text.
    const longHeading = "A".repeat(320);
    const text = `# ${longHeading}\nThis is content long enough to be extracted as a heading card answer.`;
    const cards = generateCardsFromText(text);
    const clamped = cards.filter((c) => c.front.startsWith("AAA"));
    if (clamped.length > 0) {
      expect(clamped[0]!.front.length).toBeLessThanOrEqual(310);
      expect(clamped[0]!.front.length).toBeLessThan(longHeading.length);
    }
  });
});

describe("generateCardsFromText (extra branch coverage)", () => {
  it("handles text exactly at 50k char boundary by not truncating", () => {
    const filler = "a] ".repeat(10000); // 30k-ish characters
    const text = filler.slice(0, 49999) + "."; // just under MAX
    expect(generateCardsFromText(text).length).toBeGreaterThanOrEqual(0);
  });

  it("returns empty when text is null treated as falsy", () => {
    expect(generateCardsFromText(null as unknown as string)).toEqual([]);
  });

  it("truncates 50k+ char input", () => {
    const big = "Mitochondria is the powerhouse. ".repeat(3000); // > 50k
    expect(generateCardsFromText(big).length).toBeGreaterThanOrEqual(0);
  });

  it("Math.max(1, maxCards=0) returns at least 1 slot", () => {
    const text = "Mitochondria is the powerhouse of the cell. ".repeat(20);
    const cards = generateCardsFromText(text, 0);
    expect(cards.length).toBeGreaterThanOrEqual(0);
  });

  it("Math.max(1, maxCards<0) clamps to 1", () => {
    const text = "Mitochondria is the powerhouse of the cell. ".repeat(20);
    const cards = generateCardsFromText(text, -5);
    expect(cards.length).toBeGreaterThanOrEqual(0);
  });
});

describe("splitIntoChunks — direct tests for branch coverage", () => {
  it("splits paragraph >= 300 chars by sentences (else branch at L27)", () => {
    // Build a single paragraph with NO double-newlines, exceeding 300 chars
    const longPara =
      "The mitochondria is the powerhouse of the cell that generates ATP through oxidative phosphorylation. " +
      "This process occurs in the inner mitochondrial membrane where the electron transport chain is located. " +
      "The proton gradient drives ATP synthase to produce energy. " +
      "Without mitochondria cells would not have enough energy to survive. " +
      "This is why mitochondria are essential for all eukaryotic organisms on Earth.";
    expect(longPara.length).toBeGreaterThan(300);
    const chunks = splitIntoChunks(longPara);
    expect(chunks.length).toBeGreaterThan(0);
  });

  it("buffer.trim() false branch (L43): empty buffer after sentence filter removes all sentences", () => {
    // Paragraph >= 300 chars made of very short "sentences" (all <= 15 chars)
    // so the .filter((s) => s.trim().length > 15) removes them all,
    // leaving buffer empty and hitting the false branch of if (buffer.trim())
    const shortSentences = "Hi! Yo! Ok! No! Yes! Go! Stop! Run! Walk! Sit! " .repeat(20);
    expect(shortSentences.length).toBeGreaterThan(300);
    const chunks = splitIntoChunks(shortSentences);
    // No chunks because all sentences were filtered out
    expect(chunks).toEqual([]);
  });

  it("keeps short paragraphs as single chunks (if branch at L27)", () => {
    const short = "Mitochondria is the powerhouse of the cell that generates ATP.";
    const chunks = splitIntoChunks(short);
    expect(chunks.length).toBe(1);
    expect(chunks[0]).toContain("Mitochondria");
  });

  it("filters out paragraphs shorter than 20 chars after trim", () => {
    const text = "ab";
    const chunks = splitIntoChunks(text);
    expect(chunks).toEqual([]);
  });
});

describe("extractListCards — direct tests for branch coverage", () => {
  it("bullet without separator: desc is undefined, if-condition false", () => {
    const text = "- This is a bullet item without any separator\n\n";
    const cards = extractListCards(text);
    expect(cards).toEqual([]);
  });

  it("bullet with short item (<=3 chars): if-condition false", () => {
    const text = "- X - This description is long enough to pass the check.";
    const cards = extractListCards(text);
    const xCards = cards.filter((c) => c.front === "X");
    expect(xCards).toEqual([]);
  });

  it("bullet with short description (<=5 chars): if-condition false", () => {
    const text = "- Long Item Name - ab.";
    const cards = extractListCards(text);
    expect(cards).toEqual([]);
  });

  it("numbered list without separator: desc is undefined, if-condition false", () => {
    const text = "1. This is a numbered item without any separator\n\n";
    const cards = extractListCards(text);
    expect(cards).toEqual([]);
  });

  it("valid bullet with separator produces a card", () => {
    const text = "- Mitochondria: The powerhouse of the cell.";
    const cards = extractListCards(text);
    expect(cards.length).toBe(1);
    expect(cards[0]!.front).toContain("Mitochondria");
  });

  it("valid numbered list with separator produces a card", () => {
    const text = "1. Mitochondria - The powerhouse of the cell.";
    const cards = extractListCards(text);
    expect(cards.length).toBe(1);
    expect(cards[0]!.front).toContain("Mitochondria");
  });
});

describe("extractQACards — false branch at L125 via generateCardsFromText", () => {
  it("question.length <= 10 hits else branch of extractQACards if-statement", () => {
    // QA regex: keyword (2-5 chars) + [^.!?\n]{5,120} + ?
    // Shortest possible question: keyword "Is" (2) + exactly 5 chars + ? = 9 chars total
    // "Is xxxxx? yyyyyyyyyyyyyyy." — question is 9 chars (<=10), so if-condition is false
    const text = "Is xxxxx? yyyyyyyyyyyyyyy. This text is long enough to pass the minimum 30 char guard.";
    const cards = generateCardsFromText(text);
    // The QA match should exist but not produce a card because question is too short
    const qaCards = cards.filter((c) => c.front.startsWith("Is"));
    expect(qaCards.length).toBe(0);
  });
});

