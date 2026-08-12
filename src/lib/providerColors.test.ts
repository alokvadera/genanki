import { describe, it, expect } from "vitest";
import { PROVIDER_COLORS, getProviderColor } from "./providerColors";

describe("PROVIDER_COLORS", () => {
  it("has entries for all 5 providers", () => {
    expect(Object.keys(PROVIDER_COLORS).sort()).toEqual([
      "cerebras",
      "cloudflare",
      "groq",
      "kilo",
      "openrouter",
    ]);
  });

  it("each entry has bar, bg, and text class strings", () => {
    for (const [, v] of Object.entries(PROVIDER_COLORS)) {
      expect(v.bar).toMatch(/^bg-/);
      expect(v.bg).toMatch(/^bg-/);
      expect(v.text).toMatch(/^text-/);
    }
  });
});

describe("getProviderColor", () => {
  it("matches groq by provider name", () => {
    const color = getProviderColor("groq");
    expect(color.bar).toBe("bg-indigo-500");
  });

  it("matches cloudflare by lowercase substring", () => {
    const color = getProviderColor("cloudflare");
    expect(color.bar).toBe("bg-amber-500");
  });

  it("returns default for unknown provider", () => {
    const color = getProviderColor("nonexistent");
    expect(color.bar).toBe("bg-primary");
    expect(color.bg).toBe("bg-muted/20");
    expect(color.text).toBe("text-foreground");
  });

  it("is case-insensitive", () => {
    const color = getProviderColor("GROQ");
    expect(color.bar).toBe("bg-indigo-500");
  });
});
