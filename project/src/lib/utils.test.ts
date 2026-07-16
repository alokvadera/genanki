import { describe, it, expect } from "vitest";
import { cn } from "./utils";

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
