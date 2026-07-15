import initSqlJs, { type Database } from "sql.js";
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

function stableId(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    const char = name.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash) || 1;
}

function generateGuid(): string {
  const hex = "0123456789abcdef";
  let guid = "";
  for (let i = 0; i < 10; i++) {
    guid += hex[Math.floor(Math.random() * 16)];
  }
  return guid;
}

const NOW = Math.floor(Date.now() / 1000);

async function createDB(): Promise<Database> {
  const SQL = await initSqlJs({
    locateFile: (file: string) => `https://sql.js.org/dist/${file}`,
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

function populateDb(db: Database, deckData: AnkiDeckData): number {
  const modelId = stableId(deckData.name + "_model_14");
  const deckId = stableId(deckData.name + "_deck");

  const model = {
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
      mod: NOW,
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
     VALUES (1, $1, $2, $3, 11, 0, -1, 0, $4, $5, $6, $7, '{}')`,
    [
      NOW,
      NOW,
      NOW * 1000,
      JSON.stringify(conf),
      JSON.stringify(models),
      JSON.stringify(decks),
      JSON.stringify(dconf),
    ]
  );

  deckData.cards.forEach((card, i) => {
    const nid = NOW * 1000 + i;
    const cid = nid + 1;
    const guid = generateGuid();
    const flds = card.front + "\x1f" + card.back;
    const csum = Array.from(card.front).reduce((s, c) => s + c.charCodeAt(0), 0);

    db.run(
      `INSERT INTO notes (id, guid, mid, mod, usn, tags, flds, sfld, csum, flags, data)
       VALUES ($1, $2, $3, $4, -1, '', $5, $6, $7, 0, '')`,
      [nid, guid, modelId, NOW, flds, card.front, csum]
    );

    db.run(
      `INSERT INTO cards (id, nid, did, ord, mod, usn, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags, data)
       VALUES ($1, $2, $3, 0, $4, -1, 0, 0, $5, 0, 0, 0, 0, 0, 0, 0, 0, '')`,
      [cid, nid, deckId, NOW, i + 1]
    );
  });

  return deckId;
}

export async function generateAnkiPackage(deckData: AnkiDeckData): Promise<void> {
  if (deckData.cards.length === 0) {
    throw new Error("Add at least one card before exporting.");
  }

  const db = await createDB();
  populateDb(db, deckData);

  const buf = new Uint8Array(db.export());

  const zip = new JSZip();
  zip.file("collection.anki2", buf);
  zip.file("media", "{}");

  const blob = await zip.generateAsync({ type: "blob" });
  const safeName = deckData.name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  saveAs(blob, `${safeName}.apkg`);
}
