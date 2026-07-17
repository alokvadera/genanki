import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Mock file-saver to capture the blob instead of triggering a download
const savedBlobs: { blob: Blob; filename: string }[] = [];
vi.mock("file-saver", () => ({
  saveAs: (blob: Blob, filename: string) => {
    savedBlobs.push({ blob, filename });
  },
}));

// Mock the ?url import to prevent Vite asset resolution issues in Node
vi.mock("sql.js/dist/sql-wasm-browser.wasm?url", () => ({
  default: "mocked-wasm-url",
}));

// Mock sql.js to load WASM from the filesystem (Node.js compatible)
vi.mock("sql.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("sql.js")>();
  const wasmPath = path.join(
    process.cwd(),
    "node_modules",
    "sql.js",
    "dist",
    "sql-wasm-browser.wasm",
  );
  const wasmBinary = fs.readFileSync(wasmPath);
   return {
     ...mod,
     default: (opts?: Record<string, unknown>) =>
       mod.default({ ...opts, wasmBinary } as Parameters<typeof mod.default>[0]),
   };
});

// Import after mocks are set up
const {
  crc32,
  sanitizeField,
  randomAnkiId,
  generateGuid,
  ANKI_SCHEMA_VERSION,
  generateAnkiPackage,
} = await import("@/lib/anki");

describe("crc32", () => {
  it("returns 0 for empty string", () => {
    expect(crc32("")).toBe(0);
  });

  it("produces consistent results for same input", () => {
    expect(crc32("hello")).toBe(crc32("hello"));
  });

  it("produces different results for different inputs", () => {
    expect(crc32("hello")).not.toBe(crc32("world"));
  });

  it("matches known CRC32 value for '123456789'", () => {
    // Standard CRC32 test vector
    expect(crc32("123456789")).toBe(0xcbf43926);
  });

  it("fits in 32 bits (unsigned)", () => {
    const result = crc32("test string with more content");
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(0xffffffff);
  });
});

describe("sanitizeField", () => {
  it("strips unit separator characters", () => {
    expect(sanitizeField("hello\x1fworld")).toBe("hello world");
  });

  it("strips other control characters", () => {
    expect(sanitizeField("hello\x00\x01\x02world")).toBe("helloworld");
  });

  it("strips form feed (\\x0c) and DEL (\\x7f)", () => {
    expect(sanitizeField("hello\x0cworld\x7f!")).toBe("helloworld!");
  });

  it("strips full C0 control range except \x1f which becomes space", () => {
    const input = "a\x01b\x08c\x0ed\x0cf\x7fg";
    const result = sanitizeField(input);
    // \x0e (shift-out) is stripped, so d is immediately followed by f
    expect(result).toBe("abcdfg");
  });

  it("preserves normal text", () => {
    expect(sanitizeField("What is photosynthesis?")).toBe(
      "What is photosynthesis?",
    );
  });

  it("preserves newlines and tabs", () => {
    expect(sanitizeField("line1\nline2\ttabbed")).toBe("line1\nline2\ttabbed");
  });

  it("trims whitespace", () => {
    expect(sanitizeField("  hello  ")).toBe("hello");
  });
});

describe("randomAnkiId — edge cases", () => {
  it("never returns 0 across 10,000 calls", () => {
    for (let i = 0; i < 10_000; i++) {
      const id = randomAnkiId();
      expect(id).not.toBe(0);
    }
  });

  it("never exceeds 2^31 - 1 (0x7fffffff)", () => {
    for (let i = 0; i < 10_000; i++) {
      const id = randomAnkiId();
      expect(id).toBeLessThanOrEqual(0x7fffffff);
    }
  });

  it("always returns an integer (no floating point from modulo)", () => {
    for (let i = 0; i < 1000; i++) {
      const id = randomAnkiId();
      expect(id % 1).toBe(0);
    }
  });

  it("modulo wrapping: uniform distribution across full range", () => {
    // Implementation: buf[0] % 0x7fffffff || 1 → range [1, 0x7fffffff]
    const ids = Array.from({ length: 10_000 }, () => randomAnkiId());
    const min = Math.min(...ids);
    const max = Math.max(...ids);
    // Full range bounds
    expect(min).toBeGreaterThanOrEqual(1);
    expect(max).toBeLessThanOrEqual(0x7fffffff);
    // Distribution: with 10k draws from uniform, min should be low and max should be high
    expect(min).toBeLessThan(0x7fffffff * 0.01);  // bottom 1%
    expect(max).toBeGreaterThan(0x7fffffff * 0.9);  // top 10%
  });

  it("produces unique values across 1000 calls (collision resistance)", () => {
    const ids = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      ids.add(randomAnkiId());
    }
    // With 31-bit random IDs, collisions in 1000 draws are astronomically unlikely
    expect(ids.size).toBeGreaterThan(990);
  });

  it("is safe for SQLite INTEGER PRIMARY KEY", () => {
    for (let i = 0; i < 5000; i++) {
      const id = randomAnkiId();
      expect(id).toBeGreaterThan(0);
      expect(Number.isInteger(id)).toBe(true);
      expect(id).toBeLessThanOrEqual(0x7fffffff);
      expect(Number.isFinite(id)).toBe(true);
    }
  });
});

describe("generateGuid", () => {
  it("returns a non-empty string", () => {
    const guid = generateGuid();
    expect(typeof guid).toBe("string");
    expect(guid.length).toBeGreaterThan(0);
  });

  it("returns only valid base-36 characters (0-9, a-z, no uppercase)", () => {
    const base36Regex = /^[0-9a-z]+$/;
    for (let i = 0; i < 100; i++) {
      const guid = generateGuid();
      expect(guid).toMatch(base36Regex);
      expect(guid).not.toMatch(/[A-Z]/);
    }
  });

  it("produces unique values across 1000 calls (crypto entropy)", () => {
    const guids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      guids.add(generateGuid());
    }
    // With 160 bits of crypto entropy, collisions in 1000 draws are astronomically unlikely
    expect(guids.size).toBe(1000);
  });

  it("produces strings of varying but reasonable length", () => {
    const lengths = new Set<number>();
    for (let i = 0; i < 200; i++) {
      lengths.add(generateGuid().length);
    }
    // Each Uint32 produces 1-7 base-36 chars; 5 values joined should be 5-35 chars
    const allLengths = Array.from(lengths);
    const minLength = Math.min(...allLengths);
    const maxLength = Math.max(...allLengths);
    expect(minLength).toBeGreaterThanOrEqual(5);
    expect(maxLength).toBeLessThanOrEqual(35);
    // Should have some variation (not all the same length)
    expect(lengths.size).toBeGreaterThan(1);
  });
});

describe("ANKI_SCHEMA_VERSION", () => {
  it("is a consistent current version", () => {
    expect(ANKI_SCHEMA_VERSION).toBe(18);
  });
});

describe("generateAnkiPackage", () => {
  it("throws on empty cards array", async () => {
    await expect(
      generateAnkiPackage({ name: "Test", cards: [] }),
    ).rejects.toThrow("Add at least one card before exporting");
  });

  it("produces a valid .apkg blob that opens with sql.js", async () => {
    savedBlobs.length = 0;

    const deckData = {
      name: "Test Deck",
      cards: [
        { front: "What is 2+2?", back: "4" },
        { front: "What is the capital of France?", back: "Paris" },
        { front: "What is H2O?", back: "Water" },
      ],
    };

    await generateAnkiPackage(deckData);

    expect(savedBlobs).toHaveLength(1);
    const { blob, filename } = savedBlobs[0];
    expect(filename).toBe("Test_Deck.apkg");
    expect(blob.size).toBeGreaterThan(0);

    // Open the .apkg (which is a zip) and verify collection.anki2 is a valid SQLite DB
    const { default: JSZip } = await import("jszip");
    const buffer = Buffer.from(await blob.arrayBuffer());
    const zip = await JSZip.loadAsync(buffer);
    const anki2File = zip.file("collection.anki2");
    expect(anki2File).not.toBeNull();

    const dbBuffer = await anki2File!.async("uint8array");

    // Re-open with sql.js to verify it's a valid SQLite database
    const initSqlJs = (await import("sql.js")).default;
    const wasmPath = path.join(
      process.cwd(),
      "node_modules",
      "sql.js",
      "dist",
      "sql-wasm-browser.wasm",
    );
    const wasmBinary = fs.readFileSync(wasmPath);
    const SQL = await initSqlJs({ wasmBinary } as Parameters<typeof initSqlJs>[0]);
    const db = new SQL.Database(dbBuffer);

    // Verify the collection table exists and has the correct schema version
    const colResult = db.exec("SELECT ver FROM col LIMIT 1");
    expect(colResult).toHaveLength(1);
    expect(colResult[0].values[0][0]).toBe(ANKI_SCHEMA_VERSION);

    // Verify notes were inserted
    const notesResult = db.exec("SELECT COUNT(*) FROM notes");
    expect(notesResult[0].values[0][0]).toBe(3);

    // Verify cards were inserted
    const cardsResult = db.exec("SELECT COUNT(*) FROM cards");
    expect(cardsResult[0].values[0][0]).toBe(3);

    // Verify checksums are non-zero (proper CRC32, not the old char-sum)
    const csumResult = db.exec("SELECT csum FROM notes WHERE sfld = 'What is 2+2?'");
    expect(csumResult).toHaveLength(1);
    const csum = csumResult[0].values[0][0] as number;
    expect(csum).toBeGreaterThan(0);
    expect(csum).toBe(crc32("What is 2+2?") % 0x7fffffff);

    db.close();
  });

  it("sanitizes field delimiters in card content", async () => {
    savedBlobs.length = 0;

    await generateAnkiPackage({
      name: "Delimiter Test",
      cards: [
        { front: "Question with\x1fseparator", back: "Answer\x1fwith\0nulls" },
      ],
    });

    expect(savedBlobs).toHaveLength(1);

    // Open and verify the field delimiter was stripped
    const { default: JSZip } = await import("jszip");
    const buffer = Buffer.from(await savedBlobs[0].blob.arrayBuffer());
    const zip = await JSZip.loadAsync(buffer);
    const dbBuffer = await zip.file("collection.anki2")!.async("uint8array");

    const initSqlJs = (await import("sql.js")).default;
    const wasmPath = path.join(
      process.cwd(),
      "node_modules",
      "sql.js",
      "dist",
      "sql-wasm-browser.wasm",
    );
    const wasmBinary = fs.readFileSync(wasmPath);
    const SQL = await initSqlJs({ wasmBinary } as Parameters<typeof initSqlJs>[0]);
    const db = new SQL.Database(dbBuffer);

    const fldsResult = db.exec("SELECT flds FROM notes LIMIT 1");
    const flds = fldsResult[0].values[0][0] as string;
    // The \x1f in the front should have been replaced with space;
    // only the field separator \x1f added by populateDb should remain
    const parts = flds.split("\x1f");
    expect(parts).toHaveLength(2);
    expect(parts[0]).not.toContain("\x1f");
    expect(parts[1]).not.toContain("\x1f");
    expect(parts[1]).not.toContain("\0");

    db.close();
  });

  it("handles CJK characters in card content", async () => {
    savedBlobs.length = 0;

    await generateAnkiPackage({
      name: "CJK Test",
      cards: [
        { front: "什么是光合作用？", back: "光合作用" },
        { front: "什么是DNA？", back: "脱氧核糖核酸" },
      ],
    });

    expect(savedBlobs).toHaveLength(1);

    const { default: JSZip } = await import("jszip");
    const buffer = Buffer.from(await savedBlobs[0].blob.arrayBuffer());
    const zip = await JSZip.loadAsync(buffer);
    const dbBuffer = await zip.file("collection.anki2")!.async("uint8array");

    const initSqlJs = (await import("sql.js")).default;
    const wasmPath = path.join(
      process.cwd(),
      "node_modules",
      "sql.js",
      "dist",
      "sql-wasm-browser.wasm",
    );
    const wasmBinary = fs.readFileSync(wasmPath);
    const SQL = await initSqlJs({ wasmBinary } as Parameters<typeof initSqlJs>[0]);
    const db = new SQL.Database(dbBuffer);

    const notesResult = db.exec("SELECT COUNT(*) FROM notes");
    expect(notesResult[0].values[0][0]).toBe(2);

    const fldsResult = db.exec("SELECT sfld FROM notes ORDER BY id");
    const fronts = fldsResult[0].values.map((row) => row[0] as string);
    const frontSet = new Set(fronts);
    expect(frontSet.size).toBe(2);
    expect([...frontSet].some((f) => f.includes("光合作用"))).toBe(true);
    expect([...frontSet].some((f) => f.includes("DNA"))).toBe(true);

    db.close();
  });

  it("handles emoji in card content", async () => {
    savedBlobs.length = 0;

    await generateAnkiPackage({
      name: "Emoji Test",
      cards: [
        { front: "What is 🔬 science?", back: "Study of nature 🌿" },
        { front: "What is 💻 coding?", back: "Writing code 📝" },
      ],
    });

    expect(savedBlobs).toHaveLength(1);

    const { default: JSZip } = await import("jszip");
    const buffer = Buffer.from(await savedBlobs[0].blob.arrayBuffer());
    const zip = await JSZip.loadAsync(buffer);
    const dbBuffer = await zip.file("collection.anki2")!.async("uint8array");

    const initSqlJs = (await import("sql.js")).default;
    const wasmPath = path.join(
      process.cwd(),
      "node_modules",
      "sql.js",
      "dist",
      "sql-wasm-browser.wasm",
    );
    const wasmBinary = fs.readFileSync(wasmPath);
    const SQL = await initSqlJs({ wasmBinary } as Parameters<typeof initSqlJs>[0]);
    const db = new SQL.Database(dbBuffer);

    const fldsResult = db.exec("SELECT flds FROM notes ORDER BY id");
    const allFlds = fldsResult[0].values.map((row) => row[0] as string).join("");
    expect(allFlds).toContain("🔬");
    expect(allFlds).toContain("💻");
    expect(allFlds).toContain("📝");

    db.close();
  });

  it("handles mixed scripts in card content", async () => {
    savedBlobs.length = 0;

    await generateAnkiPackage({
      name: "Mixed Script",
      cards: [
        { front: "What is アキ族?", back: "Anki means memory in Japanese" },
        { front: "Привет means?", back: "Hello in Russian" },
        { front: "مرحبا", back: "Hello in Arabic" },
      ],
    });

    expect(savedBlobs).toHaveLength(1);

    const { default: JSZip } = await import("jszip");
    const buffer = Buffer.from(await savedBlobs[0].blob.arrayBuffer());
    const zip = await JSZip.loadAsync(buffer);
    const dbBuffer = await zip.file("collection.anki2")!.async("uint8array");

    const initSqlJs = (await import("sql.js")).default;
    const wasmPath = path.join(
      process.cwd(),
      "node_modules",
      "sql.js",
      "dist",
      "sql-wasm-browser.wasm",
    );
    const wasmBinary = fs.readFileSync(wasmPath);
    const SQL = await initSqlJs({ wasmBinary } as Parameters<typeof initSqlJs>[0]);
    const db = new SQL.Database(dbBuffer);

    const notesResult = db.exec("SELECT COUNT(*) FROM notes");
    expect(notesResult[0].values[0][0]).toBe(3);

    const fldsResult = db.exec("SELECT sfld FROM notes ORDER BY id");
    const fronts = fldsResult[0].values.map((row) => row[0] as string);
    const frontSet = new Set(fronts);
    expect(frontSet.size).toBe(3);
    expect([...frontSet].some((f) => f.includes("アキ族"))).toBe(true);
    expect([...frontSet].some((f) => f.includes("Привет"))).toBe(true);
    expect([...frontSet].some((f) => f.includes("مرحبا"))).toBe(true);

    db.close();
  });

  it("handles special characters and mixed content", async () => {
    savedBlobs.length = 0;

    await generateAnkiPackage({
      name: "Special Chars",
      cards: [
        { front: "What is C++?", back: "A programming language" },
        { front: "What does || mean?", back: "Logical OR operator" },
        { front: "What is 2^10?", back: "1024" },
        { front: "What is O(n)?", back: "Linear time complexity" },
      ],
    });

    expect(savedBlobs).toHaveLength(1);

    const { default: JSZip } = await import("jszip");
    const buffer = Buffer.from(await savedBlobs[0].blob.arrayBuffer());
    const zip = await JSZip.loadAsync(buffer);
    const dbBuffer = await zip.file("collection.anki2")!.async("uint8array");

    const initSqlJs = (await import("sql.js")).default;
    const wasmPath = path.join(
      process.cwd(),
      "node_modules",
      "sql.js",
      "dist",
      "sql-wasm-browser.wasm",
    );
    const wasmBinary = fs.readFileSync(wasmPath);
    const SQL = await initSqlJs({ wasmBinary } as Parameters<typeof initSqlJs>[0]);
    const db = new SQL.Database(dbBuffer);

    const notesResult = db.exec("SELECT COUNT(*) FROM notes");
    expect(notesResult[0].values[0][0]).toBe(4);

    const fldsResult = db.exec("SELECT sfld FROM notes ORDER BY id");
    const fronts = fldsResult[0].values.map((row) => row[0] as string);
    // Use Set membership instead of index-based to avoid ordering issues
    const frontSet = new Set(fronts);
    expect(frontSet.size).toBe(4);
    expect([...frontSet].some((f) => f.includes("C++"))).toBe(true);
    expect([...frontSet].some((f) => f.includes("||"))).toBe(true);
    expect([...frontSet].some((f) => f.includes("2^10"))).toBe(true);
    expect([...frontSet].some((f) => f.includes("O(n)"))).toBe(true);

    db.close();
  });

  it("generates cloze cards when front contains {{c1::...}} syntax", async () => {
    savedBlobs.length = 0;

    await generateAnkiPackage({
      name: "Cloze Deck",
      cards: [
        { front: "The {{c1::mitochondria}} is the powerhouse of the cell", back: "organelle" },
        { front: "Water is {{c1::H2O}}", back: "chemical formula" },
      ],
    });

    expect(savedBlobs).toHaveLength(1);

    const { default: JSZip } = await import("jszip");
    const buffer = Buffer.from(await savedBlobs[0].blob.arrayBuffer());
    const zip = await JSZip.loadAsync(buffer);
    const dbBuffer = await zip.file("collection.anki2")!.async("uint8array");

    const initSqlJs = (await import("sql.js")).default;
    const wasmPath = path.join(
      process.cwd(),
      "node_modules",
      "sql.js",
      "dist",
      "sql-wasm-browser.wasm",
    );
    const wasmBinary = fs.readFileSync(wasmPath);
    const SQL = await initSqlJs({ wasmBinary } as Parameters<typeof initSqlJs>[0]);
    const db = new SQL.Database(dbBuffer);

    // Verify notes were inserted
    const notesResult = db.exec("SELECT COUNT(*) FROM notes");
    expect(notesResult[0].values[0][0]).toBe(2);

    // Verify cards were inserted (cloze cards have ord >= 0)
    const cardsResult = db.exec("SELECT COUNT(*) FROM cards");
    expect(cardsResult[0].values[0][0]).toBeGreaterThanOrEqual(2);

    // Verify cards have ord column matching cloze indices
    const ordResult = db.exec("SELECT ord FROM cards ORDER BY ord");
    const ords = ordResult[0].values.map((row) => row[0] as number);
    expect(ords).toContain(0);

    db.close();
  });

  it("generates basic cards when no cloze syntax present", async () => {
    savedBlobs.length = 0;

    await generateAnkiPackage({
      name: "Basic Deck",
      cards: [
        { front: "What is 2+2?", back: "4" },
      ],
    });

    const { default: JSZip } = await import("jszip");
    const buffer = Buffer.from(await savedBlobs[0].blob.arrayBuffer());
    const zip = await JSZip.loadAsync(buffer);
    const dbBuffer = await zip.file("collection.anki2")!.async("uint8array");

    const initSqlJs = (await import("sql.js")).default;
    const wasmPath = path.join(
      process.cwd(),
      "node_modules",
      "sql.js",
      "dist",
      "sql-wasm-browser.wasm",
    );
    const wasmBinary = fs.readFileSync(wasmPath);
    const SQL = await initSqlJs({ wasmBinary } as Parameters<typeof initSqlJs>[0]);
    const db = new SQL.Database(dbBuffer);

    // Verify notes were inserted
    const notesResult = db.exec("SELECT COUNT(*) FROM notes");
    expect(notesResult[0].values[0][0]).toBe(1);

    // Verify basic card has ord=0
    const cardsResult = db.exec("SELECT ord FROM cards");
    expect(cardsResult[0].values[0][0]).toBe(0);

    db.close();
  });

  it("handles cloze cards with multiple cloze indices", async () => {
    savedBlobs.length = 0;

    await generateAnkiPackage({
      name: "Multi Cloze",
      cards: [
        { front: "The {{c1::mitochondria}} is the {{c2::powerhouse}} of the cell", back: "biology" },
      ],
    });

    const { default: JSZip } = await import("jszip");
    const buffer = Buffer.from(await savedBlobs[0].blob.arrayBuffer());
    const zip = await JSZip.loadAsync(buffer);
    const dbBuffer = await zip.file("collection.anki2")!.async("uint8array");

    const initSqlJs = (await import("sql.js")).default;
    const wasmPath = path.join(
      process.cwd(),
      "node_modules",
      "sql.js",
      "dist",
      "sql-wasm-browser.wasm",
    );
    const wasmBinary = fs.readFileSync(wasmPath);
    const SQL = await initSqlJs({ wasmBinary } as Parameters<typeof initSqlJs>[0]);
    const db = new SQL.Database(dbBuffer);

    // Multiple cloze indices should produce multiple cards
    const cardsResult = db.exec("SELECT COUNT(*) FROM cards");
    expect(cardsResult[0].values[0][0]).toBeGreaterThanOrEqual(2);

    const notesResult = db.exec("SELECT COUNT(*) FROM notes");
    expect(notesResult[0].values[0][0]).toBe(1);

    // Verify ord values match cloze indices
    const ordResult = db.exec("SELECT ord FROM cards ORDER BY ord");
    const ords = ordResult[0].values.map((row) => row[0] as number);
    expect(ords).toContain(0);
    expect(ords).toContain(1);

    db.close();
  });

  it("handles mixed cloze and non-cloze cards in same deck", async () => {
    savedBlobs.length = 0;

    await generateAnkiPackage({
      name: "Mixed Deck",
      cards: [
        { front: "The {{c1::mitochondria}} is the powerhouse", back: "organelle" },
        { front: "What is 2+2?", back: "4" },
      ],
    });

    const { default: JSZip } = await import("jszip");
    const buffer = Buffer.from(await savedBlobs[0].blob.arrayBuffer());
    const zip = await JSZip.loadAsync(buffer);
    const dbBuffer = await zip.file("collection.anki2")!.async("uint8array");

    const initSqlJs = (await import("sql.js")).default;
    const wasmPath = path.join(
      process.cwd(),
      "node_modules",
      "sql.js",
      "dist",
      "sql-wasm-browser.wasm",
    );
    const wasmBinary = fs.readFileSync(wasmPath);
    const SQL = await initSqlJs({ wasmBinary } as Parameters<typeof initSqlJs>[0]);
    const db = new SQL.Database(dbBuffer);

    const notesResult = db.exec("SELECT COUNT(*) FROM notes");
    expect(notesResult[0].values[0][0]).toBe(2);

    const cardsResult = db.exec("SELECT COUNT(*) FROM cards");
    expect(cardsResult[0].values[0][0]).toBe(2);

    db.close();
  });

  it("randomAnkiId returns 1 when crypto returns 0", () => {
    const original = crypto.getRandomValues;
    try {
      crypto.getRandomValues = vi.fn((arr: Uint32Array) => {
        arr[0] = 0;
        return arr;
      });
      const id = randomAnkiId();
      expect(id).toBe(1);
    } finally {
      crypto.getRandomValues = original;
    }
  });

  it("handles control characters in card content", async () => {
    savedBlobs.length = 0;

    await generateAnkiPackage({
      name: "Control Chars",
      cards: [
        { front: "What is \x1funit separator?", back: "Should be stripped" },
        { front: "What is \x00null?", back: "Should be stripped" },
        { front: "What is \x7fdel?", back: "Should be stripped" },
      ],
    });

    expect(savedBlobs).toHaveLength(1);

    const { default: JSZip } = await import("jszip");
    const buffer = Buffer.from(await savedBlobs[0].blob.arrayBuffer());
    const zip = await JSZip.loadAsync(buffer);
    const dbBuffer = await zip.file("collection.anki2")!.async("uint8array");

    const initSqlJs = (await import("sql.js")).default;
    const wasmPath = path.join(
      process.cwd(),
      "node_modules",
      "sql.js",
      "dist",
      "sql-wasm-browser.wasm",
    );
    const wasmBinary = fs.readFileSync(wasmPath);
    const SQL = await initSqlJs({ wasmBinary } as Parameters<typeof initSqlJs>[0]);
    const db = new SQL.Database(dbBuffer);

    const fldsResult = db.exec("SELECT flds FROM notes ORDER BY id");
    const allFlds = fldsResult[0].values.map((row) => row[0] as string).join("");
    // Control characters should be sanitized
    expect(allFlds).not.toContain("\x00");
    expect(allFlds).not.toContain("\x7f");
    // \x1f in front should become space; only the field separator remains
    expect(allFlds).toContain("unit separator");

    db.close();
  });
});
