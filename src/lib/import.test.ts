import { describe, it, expect } from "vitest";

/**
 * Minimal RFC-4180-aware splitter matching the one in AnkiCreator.tsx.
 * Since it's defined inline in the component, we replicate the logic here
 * for isolated unit testing.
 */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
      else if (c === "," || c === ";" || c === "\t" || c === "|") { out.push(cur.trim()); cur = ""; }
      else cur += c;
  }
  out.push(cur.trim());
  return out;
}

describe("splitCsvLine", () => {
  it("splits a simple comma-separated line", () => {
    expect(splitCsvLine("front,back")).toEqual(["front", "back"]);
  });

  it("splits on semicolons", () => {
    expect(splitCsvLine("hello;world")).toEqual(["hello", "world"]);
  });

  it("splits on tabs", () => {
    expect(splitCsvLine("hello\tworld")).toEqual(["hello", "world"]);
  });

  it("splits on pipes", () => {
    expect(splitCsvLine("hello|world")).toEqual(["hello", "world"]);
  });

  it("preserves commas inside double-quoted fields", () => {
    const parts = splitCsvLine('"Newton, Isaac",physicist who formulated gravitation');
    expect(parts).toHaveLength(2);
    expect(parts[0]).toBe("Newton, Isaac");
    expect(parts[1]).toBe("physicist who formulated gravitation");
  });

  it("preserves commas inside double-quoted fields with pipe delimiter", () => {
    const parts = splitCsvLine('"Newton, Isaac"|physicist who formulated gravitation');
    expect(parts).toHaveLength(2);
    expect(parts[0]).toBe("Newton, Isaac");
    expect(parts[1]).toBe("physicist who formulated gravitation");
  });

  it("preserves comma in quoted field with tab delimiter", () => {
    const parts = splitCsvLine('"Q, with comma"\tback');
    expect(parts).toHaveLength(2);
    expect(parts[0]).toBe("Q, with comma");
    expect(parts[1]).toBe("back");
  });

  it("splits on comma even in tab-delimited line (unquoted commas are field boundaries)", () => {
    const parts = splitCsvLine("Q\tA, with comma");
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe("Q");
    expect(parts[1]).toBe("A");
    expect(parts[2]).toBe("with comma");
  });

  it("handles double-quote escaping inside fields", () => {
    const parts = splitCsvLine('"say ""hello""","world"');
    expect(parts).toHaveLength(2);
    expect(parts[0]).toBe('say "hello"');
    expect(parts[1]).toBe("world");
  });

  it("handles a single field (no delimiter)", () => {
    expect(splitCsvLine("just one field")).toEqual(["just one field"]);
  });

  it("handles empty fields", () => {
    expect(splitCsvLine("front,,back")).toEqual(["front", "", "back"]);
  });

  it("trims surrounding whitespace from each field", () => {
    expect(splitCsvLine("  front  ,  back  ")).toEqual(["front", "back"]);
  });
});

describe("handleImport first-delimiter logic", () => {
  /**
   * Replicates the first-delimiter matching used in AnkiCreator's handleImport:
   * Uses a positive lookahead so the delimiter is NOT consumed in the match.
   * The front is everything before the delimiter; the back is everything after
   * (with the delimiter stripped). Commas inside either field are preserved.
   */
  function splitOnFirstDelimiter(line: string): { front: string; back?: string } | null {
    const delim = line.match(/^\s*[^;\t|]+\s*(?=[;\t|])/);
    const i = delim ? delim[0]!.length : -1;
    if (i > 0) {
      return {
        front: line.slice(0, i).trim(),
        back: line.slice(i).replace(/^[;\t|]\s*/, "").trim(),
      };
    }
    return null;
  }

  it("splits front/back on pipe (comma in front preserved, no quote stripping)", () => {
    const result = splitOnFirstDelimiter('"Newton, Isaac"|physicist who formulated gravitation');
    expect(result).not.toBeNull();
    expect(result!.front).toBe('"Newton, Isaac"');
    expect(result!.back).toBe("physicist who formulated gravitation");
  });

  it("splits front/back on tab (comma in back preserved)", () => {
    const result = splitOnFirstDelimiter("Q\tA, with comma");
    expect(result).not.toBeNull();
    expect(result!.front).toBe("Q");
    expect(result!.back).toBe("A, with comma");
  });

  it("splits front/back on semicolon", () => {
    const result = splitOnFirstDelimiter("front;back content here");
    expect(result).not.toBeNull();
    expect(result!.front).toBe("front");
    expect(result!.back).toBe("back content here");
  });

  it("returns null when no delimiter found", () => {
    expect(splitOnFirstDelimiter("no delimiter")).toBeNull();
  });

  it("handles leading/trailing whitespace", () => {
    const result = splitOnFirstDelimiter("  front  |  back  ");
    expect(result).not.toBeNull();
    expect(result!.front).toBe("front");
    expect(result!.back).toBe("back");
  });

  it("preserves second pipe in back field", () => {
    const result = splitOnFirstDelimiter("front|back|extra");
    expect(result).not.toBeNull();
    expect(result!.front).toBe("front");
    expect(result!.back).toBe("back|extra");
  });
});
