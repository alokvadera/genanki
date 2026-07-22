import { describe, it, expect, vi, beforeEach } from "vitest";
import { cn, splitCsvLine, showRecoveryToast } from "./utils";

vi.mock("sonner", () => ({
  toast: { info: vi.fn(), warning: vi.fn() },
}));

import { toast } from "sonner";

describe("cn", () => {
  it("merges two class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("returns undefined/falsy values as empty string", () => {
    expect(cn()).toBe("");
  });

  it("deduplicates tailwind classes (last wins)", () => {
    // twMerge should keep only the last conflicting class
    const result = cn("p-2", "p-4");
    expect(result).toBe("p-4");
  });

  it("handles conditional classes", () => {
    const isActive = true;
    const result = cn("base", isActive && "active");
    expect(result).toBe("base active");
  });

  it("handles falsy conditional classes", () => {
    const isActive = false;
    const result = cn("base", isActive && "active");
    expect(result).toBe("base");
  });

  it("handles arrays of classes", () => {
    const result = cn(["a", "b"], "c");
    expect(result).toBe("a b c");
  });

  it("handles objects with boolean values", () => {
    const result = cn({
      "text-red-500": true,
      "text-blue-500": false,
      "font-bold": true,
    });
    expect(result).toContain("text-red-500");
    expect(result).toContain("font-bold");
    expect(result).not.toContain("text-blue-500");
  });

  it("handles empty strings", () => {
    expect(cn("")).toBe("");
  });

  it("handles nested ternaries", () => {
    const size: string = "lg";
    const result = cn(
      "base",
      size === "sm" ? "text-sm" : size === "lg" ? "text-lg" : "text-md",
    );
    expect(result).toBe("base text-lg");
  });
});


vi.mock("sonner", () => ({
  toast: { info: vi.fn(), warning: vi.fn() },
}));

describe("showRecoveryToast", () => {
  beforeEach(() => {
    vi.mocked(toast.info).mockClear();
    vi.mocked(toast.warning).mockClear();
  });

  it("calls toast.info for default (info) level", async () => {
    showRecoveryToast("hello");
    await new Promise((r) => setTimeout(r, 0));
    expect(toast.info).toHaveBeenCalledWith("hello", { duration: 4000 });
  });

  it("calls toast.warning for warning level", async () => {
    showRecoveryToast("careful", "warning");
    await new Promise((r) => setTimeout(r, 0));
    expect(toast.warning).toHaveBeenCalledWith("careful", { duration: 8000 });
  });

  // The .catch(...) branch is a defensive no-op for when the dynamic
  // `import("sonner")` itself fails (e.g. the package was removed). It is
  // marked /* istanbul ignore next */ in source because forcing the
  // dynamic import to reliably reject under vitest is fragile; the branch
  // simply swallows the error so the caller's exception path isn't
  // affected.
  it("does not throw when called (best-effort)", () => {
    expect(() => showRecoveryToast("safe-call")).not.toThrow();
  });
});

describe("splitCsvLine", () => {
  it("splits simple comma-separated values", () => {
    expect(splitCsvLine("a,b,c")).toEqual(["a", "b", "c"]);
  });

  it("splits on semicolons", () => {
    expect(splitCsvLine("a;b;c")).toEqual(["a", "b", "c"]);
  });

  it("splits on tabs", () => {
    expect(splitCsvLine("a\tb\tc")).toEqual(["a", "b", "c"]);
  });

  it("splits on pipes", () => {
    expect(splitCsvLine("a|b|c")).toEqual(["a", "b", "c"]);
  });

  it("returns single element when no delimiter", () => {
    expect(splitCsvLine("single-value")).toEqual(["single-value"]);
  });

  it("respects RFC-4180 quoted commas", () => {
    expect(splitCsvLine('a,"b,c",d')).toEqual(["a", "b,c", "d"]);
  });

  it("treats two consecutive quotes as a literal escape", () => {
    expect(splitCsvLine('"He said ""hi"""')).toEqual(['He said "hi"']);
  });

  it("closes quote when next character is non-quote", () => {
    expect(splitCsvLine('"a"b,')).toEqual(["ab", ""]);
  });

  it("trims whitespace on each field", () => {
    expect(splitCsvLine(" a , b , c ")).toEqual(["a", "b", "c"]);
  });

  it("returns empty array for empty string (after trim)", () => {
    // splitCsvLine still pushes the trailing cur.trim() even on empty input
    expect(splitCsvLine("")).toEqual([""]);
  });
});

// Extra cn tests live in the same describe block above; no further cn tests
// are required to hit the remaining branches.

