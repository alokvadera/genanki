import initSqlJs, { type Database } from "sql.js";
import sqlWasmUrl from "sql.js/dist/sql-wasm-browser.wasm?url";
import JSZip from "jszip";
import { saveAs } from "file-saver";

export interface AnkiCard {
  front: string;
  back: string;
}

export interface AnkiDeckData {
  name: string;
  cards: AnkiCard[];
}

const ANKI_SCHEMA_VERSION = 18;
export { ANKI_SCHEMA_VERSION };

export function generateGuid(): string {
  const buf = new Uint32Array(5);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n: number) => n.toString(36)).join("");
}

/**
 * Generate a random positive integer ID (mod 2^31) that fits in Anki's
 * INTEGER PRIMARY KEY column. Uses crypto for entropy to avoid collisions
 * across exports and same-millisecond runs.
 */
export function randomAnkiId(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0]! % 0x7fffffff || 1;
}

/**
 * Anki uses a CRC32 checksum of the first field (sfld) to detect duplicate
 * notes. This implementation matches Anki's `fieldChecksum` using the
 * standard CRC32 (reflected) polynomial 0xEDB88320, taken mod 2^31.
 */
const CRC32_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
    table[i] = crc >>> 0;
  }
  return table;
})();

export function crc32(text: string): number {
  let crc = 0xffffffff;
  for (let i = 0; i < text.length; i++) {
    const byte = text.charCodeAt(i) & 0xff;
    crc = (crc >>> 8) ^ (CRC32_TABLE[(crc ^ byte) & 0xff] ?? 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Strip Anki field-delimiter characters (\x1f unit separator) and the
 * full C0 control range plus DEL (\x7f) that would corrupt the flds field.
 * The \x1f is replaced with a space (Anki's field separator convention);
 * all other control characters are stripped entirely.
 */
export function sanitizeField(text: string): string {
  return text
    // Anki uses \x1f as its internal field delimiter — replace with space
    // eslint-disable-next-line no-control-regex
    .replace(/\x1f/g, " ")
    // Strip remaining C0 controls (0x00-0x1f except \x1f which we already handled)
    // plus DEL (0x7f). This covers carriage-return (\x0d), form-feed (\x0c), null (\x00), etc.
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "")
    .trim();
}

const NOW = Math.floor(Date.now() / 1000);

async function createDB(): Promise<Database> {
  const SQL = await initSqlJs({
    locateFile: () => sqlWasmUrl,
  });
  const db = new SQL.Database();

  db.run(`
    CREATE TABLE col (
      id INTEGER PRIMARY KEY,
      crt INTEGER NOT NULL,
      mod INTEGER NOT NULL,
      scm INTEGER NOT NULL,
      ver INTEGER NOT NULL,
      dty INTEGER NOT NULL,
      usn INTEGER NOT NULL,
      ls INTEGER NOT NULL,
      conf TEXT NOT NULL,
      models TEXT NOT NULL,
      decks TEXT NOT NULL,
      dconf TEXT NOT NULL,
      tags TEXT NOT NULL
    );
  `);

  db.run(`
    CREATE TABLE notes (
      id INTEGER PRIMARY KEY,
      guid TEXT NOT NULL,
      mid INTEGER NOT NULL,
      mod INTEGER NOT NULL,
      usn INTEGER NOT NULL,
      tags TEXT NOT NULL,
      flds TEXT NOT NULL,
      sfld TEXT NOT NULL,
      csum INTEGER NOT NULL,
      flags INTEGER NOT NULL,
      data TEXT NOT NULL
    );
  `);

  db.run(`
    CREATE TABLE cards (
      id INTEGER PRIMARY KEY,
      nid INTEGER NOT NULL,
      did INTEGER NOT NULL,
      ord INTEGER NOT NULL,
      mod INTEGER NOT NULL,
      usn INTEGER NOT NULL,
      type INTEGER NOT NULL,
      queue INTEGER NOT NULL,
      due INTEGER NOT NULL,
      ivl INTEGER NOT NULL,
      factor INTEGER NOT NULL,
      reps INTEGER NOT NULL,
      lapses INTEGER NOT NULL,
      left INTEGER NOT NULL,
      odue INTEGER NOT NULL,
      odid INTEGER NOT NULL,
      flags INTEGER NOT NULL,
      data TEXT NOT NULL
    );
  `);

  db.run(`
    CREATE TABLE revlog (
      id INTEGER PRIMARY KEY,
      cid INTEGER NOT NULL,
      usn INTEGER NOT NULL,
      ease INTEGER NOT NULL,
      ivl INTEGER NOT NULL,
      lastIvl INTEGER NOT NULL,
      factor INTEGER NOT NULL,
      time INTEGER NOT NULL,
      type INTEGER NOT NULL
    );
  `);

  db.run(`
    CREATE TABLE graves (
      usn INTEGER NOT NULL,
      oid INTEGER NOT NULL,
      type INTEGER NOT NULL
    );
  `);

  return db;
}

export function populateDb(db: Database, deckData: AnkiDeckData): { deckId: number; cardsInserted: number } {
  const now = Math.floor(Date.now() / 1000);
  const modelId = randomAnkiId();
  const deckId = randomAnkiId();
  const isCloze = deckData.cards.some((card) => /\{\{c\d+::/i.test(card.front));
  let cardsInserted = 0;

  const model = isCloze
    ? {
        css: ".card {\n  font-family: Arial, sans-serif;\n  font-size: 20px;\n  text-align: center;\n  color: #000;\n  background: #fff;\n}\n.cloze {\n  font-weight: bold;\n  color: blue;\n}\nhr { border: none; border-top: 2px solid #ccc; margin: 15px 0; }",
        did: deckId,
        flds: [
          { media: [], name: "Text", ord: 0, size: 20, font: "Arial", rtl: false, plainText: false },
          { media: [], name: "Back Extra", ord: 1, size: 20, font: "Arial", rtl: false, plainText: false },
        ],
        id: modelId,
        latexPost: "\\end{document}",
        latexPre:
          "\\documentclass[12pt]{article}\n\\special{papersize=3in,4in}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n",
        name: deckData.name + " Cloze",
        req: [[0, "any", [0]]],
        sortf: 0,
        tags: [],
        tmpls: [
          {
            afmt: "{{cloze:Text}}<br>\n{{Back Extra}}",
            bafmt: "",
            bfont: "",
            bsize: 0,
            did: null,
            name: "Card 1",
            ord: 0,
            qfmt: "{{cloze:Text}}",
            rqfmt: "",
          },
        ],
        type: 1,
        usn: -1,
        ver: 14,
      }
    : {
        css: ".card {\n  font-family: Arial, sans-serif;\n  font-size: 20px;\n  text-align: center;\n  color: #000;\n  background: #fff;\n}\nhr { border: none; border-top: 2px solid #ccc; margin: 15px 0; }",
        did: deckId,
        flds: [
          { media: [], name: "Front", ord: 0, size: 20, font: "Arial", rtl: false, plainText: false },
          { media: [], name: "Back", ord: 1, size: 20, font: "Arial", rtl: false, plainText: false },
        ],
        id: modelId,
        latexPost: "\\end{document}",
        latexPre:
          "\\documentclass[12pt]{article}\n\\special{papersize=3in,4in}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n",
        name: deckData.name + " Basic",
        req: [[0, "any", [0]]],
        sortf: 0,
        tags: [],
        tmpls: [
          {
            afmt: "{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}",
            bafmt: "",
            bfont: "",
            bsize: 0,
            did: null,
            name: "Card 1",
            ord: 0,
            qfmt: "{{Front}}",
            rqfmt: "",
          },
        ],
        type: 0,
        usn: -1,
        ver: 14,
      };

  const conf = {
    activeDecks: [deckId],
    curDeck: deckId,
    newSpread: 0,
    collapseTime: 1200,
    timeLim: 0,
    estTimes: true,
    dueCounts: true,
    curModel: modelId,
    nextPos: 1,
    sortType: "noteFld",
    sortOrder: true,
    addToCur: true,
    dayLearnFirst: false,
    schedVer: 2,
  };

  const dconf: Record<string, unknown> = {
    "1": {
      autoplay: true,
      browserCollapsed: false,
      delays: [1, 10, 1440],
      dyn: false,
      expired: 0,
      heapLimit: 0,
      interGivenLearningSteps: true,
      lace: "",
      lastUnburied: 0,
      maxTaken: 60,
      mod: 0,
      name: "Default",
      new: { bury: true, delays: [1, 10], initialFactor: 2500, order: 1, perDay: 20, separate: true },
      reps: 0,
      reviews: { browserCollapsed: false, bury: true, ease4: 1.3, hardFactor: 1.2, ivlFct: 1, maxIvl: 36500, perDay: 200 },
      se: false,
      sortOrder: 0,
      timer: 0,
    },
  };

  const decks: Record<string, unknown> = {
    [String(deckId)]: {
      collapsed: false,
      conf: 1,
      desc: "",
      dyn: 0,
      extendNew: 0,
      extendRev: 0,
      id: deckId,
      lrnToday: [0, 0],
      mod: now,
      name: deckData.name,
      nameTooLong: false,
      repToday: [0, 0],
      revToday: [0, 0],
      today: [0, 0, 0],
      usn: -1,
    },
  };

  const models: Record<string, unknown> = {
    [String(modelId)]: model,
  };

  db.run(
    `INSERT INTO col (id, crt, mod, scm, ver, dty, usn, ls, conf, models, decks, dconf, tags)
     VALUES (1, $1, $2, $3, $4, 0, -1, 0, $5, $6, $7, $8, '{}')`,
    [
      now,
      now,
      now * 1000,
      ANKI_SCHEMA_VERSION,
      JSON.stringify(conf),
      JSON.stringify(models),
      JSON.stringify(decks),
      JSON.stringify(dconf),
    ]
  );

  deckData.cards.forEach((card, i) => {
    const nid = randomAnkiId();
    const guid = generateGuid();
    const sfld = sanitizeField(card.front);
    const back = sanitizeField(card.back);
    const flds = sfld + "\x1f" + back;
    const csum = crc32(sfld) % 0x7fffffff;

    db.run(
      `INSERT INTO notes (id, guid, mid, mod, usn, tags, flds, sfld, csum, flags, data)
       VALUES ($1, $2, $3, $4, -1, '', $5, $6, $7, 0, '')`,
      [nid, guid, modelId, now, flds, sfld, csum]
    );

    if (isCloze) {
      const matches = [...card.front.matchAll(/\{\{c(\d+)::/gi)];
      const indices = Array.from(new Set(matches.map((m) => parseInt(m[1]!)))).filter((n) => !isNaN(n));

      // Skip cards without cloze syntax in a cloze-flagged deck —
      // the deck-level isCloze check is inclusive, but individual
      // cards may be Basic cards mixed in. Creating a spurious
      // ord:0 entry would corrupt the Anki import.
      if (indices.length === 0) return;

      indices.forEach((clozeIdx) => {
        const cid = randomAnkiId();
        const ord = Math.max(0, clozeIdx - 1);
        db.run(
          `INSERT INTO cards (id, nid, did, ord, mod, usn, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags, data)
           VALUES ($1, $2, $3, $4, $5, -1, 0, 0, $6, 0, 0, 0, 0, 0, 0, 0, 0, '')`,
          [cid, nid, deckId, ord, now, i + 1]
        );
        cardsInserted++;
      });
    } else {
      const cid = randomAnkiId();
      db.run(
        `INSERT INTO cards (id, nid, did, ord, mod, usn, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags, data)
         VALUES ($1, $2, $3, 0, $4, -1, 0, 0, $5, 0, 0, 0, 0, 0, 0, 0, 0, '')`,
        [cid, nid, deckId, now, i + 1]
      );
      cardsInserted++;
    }
  });

  return { deckId, cardsInserted };
}

export async function generateAnkiPackage(deckData: AnkiDeckData): Promise<void> {
  if (deckData.cards.length === 0) {
    throw new Error("Add at least one card before exporting.");
  }

  const db = await createDB();
  const { cardsInserted } = populateDb(db, deckData);

  /* istanbul ignore next -- defense-in-depth: isCloze uses the same regex as per-card matchAll, so cardsInserted >= 1 whenever isCloze is true. Protects against future logic divergence. */
  if (cardsInserted === 0) {
    throw new Error(
      "No cards were generated. If your deck uses cloze syntax ({{c1::...}}), " +
      "ensure at least one card contains valid cloze markers.",
    );
  }

  const buf = new Uint8Array(db.export());

  const zip = new JSZip();
  zip.file("collection.anki2", buf);
  zip.file("media", "{}");

  const blob = await zip.generateAsync({ type: "blob" });
  const safeName = deckData.name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  saveAs(blob, `${safeName}.apkg`);
}
