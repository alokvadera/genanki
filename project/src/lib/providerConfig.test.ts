import { describe, it, expect } from "vitest";
import {
  PROVIDERS,
  PROVIDER_MAP,
  LABEL_TO_KEY,
  getKeyFromLabel,

} from "./providerConfig";

describe("providerConfig", () => {
  describe("PROVIDERS", () => {
    it("contains 5 providers", () => {
      expect(PROVIDERS).toHaveLength(5);
    });

    it("has correct structure for each provider", () => {
      PROVIDERS.forEach((p) => {
        expect(p).toHaveProperty("key");
        expect(p).toHaveProperty("label");
        expect(p).toHaveProperty("role");
        expect(typeof p.key).toBe("string");
        expect(typeof p.label).toBe("string");
        expect(["primary", "fallback"]).toContain(p.role);
      });
    });

    it("has Groq as the first (primary) provider", () => {
      expect(PROVIDERS[0].key).toBe("groq");
      expect(PROVIDERS[0].role).toBe("primary");
    });

    it("has all expected provider keys", () => {
      const keys = PROVIDERS.map((p) => p.key);
      expect(keys).toContain("groq");
      expect(keys).toContain("cerebras");
      expect(keys).toContain("kilo");
      expect(keys).toContain("openrouter");
      expect(keys).toContain("cloudflare");
    });
  });

  describe("PROVIDER_MAP", () => {
    it("is a Map with 5 entries", () => {
      expect(PROVIDER_MAP.size).toBe(5);
    });

    it("maps key to provider config", () => {
      const groq = PROVIDER_MAP.get("groq");
      expect(groq).toBeDefined();
      expect(groq?.label).toBe("Groq");
      expect(groq?.role).toBe("primary");
    });

    it("maps all provider keys", () => {
      PROVIDERS.forEach((p) => {
        expect(PROVIDER_MAP.has(p.key)).toBe(true);
        expect(PROVIDER_MAP.get(p.key)).toEqual(p);
      });
    });

    it("returns undefined for unknown key", () => {
      expect(PROVIDER_MAP.get("unknown")).toBeUndefined();
    });
  });

  describe("LABEL_TO_KEY", () => {
    it("is a Map with 5 entries", () => {
      expect(LABEL_TO_KEY.size).toBe(5);
    });

    it("maps lowercase label to key", () => {
      expect(LABEL_TO_KEY.get("groq")).toBe("groq");
      expect(LABEL_TO_KEY.get("cerebras")).toBe("cerebras");
      expect(LABEL_TO_KEY.get("cloudflare workers ai")).toBe("cloudflare");
    });

    it("returns undefined for unknown label", () => {
      expect(LABEL_TO_KEY.get("unknown provider")).toBeUndefined();
    });
  });

  describe("getKeyFromLabel", () => {
    it("returns key for exact label match (case-insensitive)", () => {
      expect(getKeyFromLabel("Groq")).toBe("groq");
      expect(getKeyFromLabel("GROQ")).toBe("groq");
      expect(getKeyFromLabel("groq")).toBe("groq");
    });

    it("returns key for exact label match with spaces", () => {
      expect(getKeyFromLabel("Cloudflare Workers AI")).toBe("cloudflare");
      expect(getKeyFromLabel("OpenRouter")).toBe("openrouter");
    });

    it("returns key for partial key match", () => {
      expect(getKeyFromLabel("cloudflare something")).toBe("cloudflare");
    });

    it("trims whitespace from input", () => {
      expect(getKeyFromLabel("  groq  ")).toBe("groq");
    });

    it("returns undefined for unknown label", () => {
      expect(getKeyFromLabel("unknown")).toBeUndefined();
    });

    it("returns undefined for empty string", () => {
      expect(getKeyFromLabel("")).toBeUndefined();
    });

    it("matches all provider labels", () => {
      PROVIDERS.forEach((p) => {
        expect(getKeyFromLabel(p.label)).toBe(p.key);
      });
    });

    it("matches provider keys directly", () => {
      PROVIDERS.forEach((p) => {
        expect(getKeyFromLabel(p.key)).toBe(p.key);
      });
    });
  });
});
