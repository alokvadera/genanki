import { describe, it, expect } from "vitest";
import { GenError, isGenError, isTimeoutError, isGenerationCanceledError } from "./errors";

describe("GenError", () => {
  it("creates an error with kind and message", () => {
    const err = new GenError("timeout", "Request timed out");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(GenError);
    expect(err.name).toBe("GenError");
    expect(err.kind).toBe("timeout");
    expect(err.message).toBe("Request timed out");
  });

  it("sets optional details", () => {
    const err = new GenError("provider_http", "HTTP 500", {
      status: 500,
      provider: "groq",
      model: "llama-3.3-70b-versatile",
    });
    expect(err.status).toBe(500);
    expect(err.provider).toBe("groq");
    expect(err.model).toBe("llama-3.3-70b-versatile");
  });

  it("omits details when not provided", () => {
    const err = new GenError("canceled", "User canceled");
    expect(err.status).toBeUndefined();
    expect(err.provider).toBeUndefined();
    expect(err.model).toBeUndefined();
  });

  it("creates valid stack trace", () => {
    const err = new GenError("parse", "Bad JSON");
    expect(err.stack).toBeDefined();
    expect(err.stack).toContain("GenError");
  });

  it("supports all GenErrorKind values", () => {
    const kinds = [
      "canceled", "timeout", "rate_limited", "provider_http",
      "parse", "no_providers", "empty_output", "deadline",
    ] as const;
    for (const kind of kinds) {
      const err = new GenError(kind, `Error: ${kind}`);
      expect(err.kind).toBe(kind);
    }
  });
});

describe("isGenError", () => {
  it("returns true for GenError instances", () => {
    const err = new GenError("timeout", "timed out");
    expect(isGenError(err)).toBe(true);
  });

  it("returns false for plain Error", () => {
    expect(isGenError(new Error("plain"))).toBe(false);
  });

  it("returns false for non-Error values", () => {
    expect(isGenError(null)).toBe(false);
    expect(isGenError(undefined)).toBe(false);
    expect(isGenError("string")).toBe(false);
    expect(isGenError(42)).toBe(false);
    expect(isGenError({})).toBe(false);
  });
});

describe("isTimeoutError", () => {
  it("returns true for AbortError", () => {
    const err = new DOMException("Aborted", "AbortError");
    expect(isTimeoutError(err)).toBe(true);
  });

  it("returns true for Error with 'timeout' in message", () => {
    expect(isTimeoutError(new Error("request timeout after 30s"))).toBe(true);
    expect(isTimeoutError(new Error("Timeout exceeded"))).toBe(true);
  });

  it("returns false for unrelated Error", () => {
    expect(isTimeoutError(new Error("network error"))).toBe(false);
  });

  it("returns false for non-Error values", () => {
    expect(isTimeoutError(null)).toBe(false);
    expect(isTimeoutError(undefined)).toBe(false);
    expect(isTimeoutError("timeout")).toBe(false);
    expect(isTimeoutError(42)).toBe(false);
  });

  it("returns false for plain DOMException without AbortError name", () => {
    expect(isTimeoutError(new DOMException("test", "InvalidStateError"))).toBe(false);
  });
});

describe("isGenerationCanceledError", () => {
  it("returns true for GenError with kind 'canceled'", () => {
    const err = new GenError("canceled", "User canceled the generation");
    expect(isGenerationCanceledError(err)).toBe(true);
  });

  it("returns false for GenError with other kinds", () => {
    expect(isGenerationCanceledError(new GenError("timeout", "timed out"))).toBe(false);
    expect(isGenerationCanceledError(new GenError("parse", "bad json"))).toBe(false);
  });

  it("returns false for non-GenError values", () => {
    expect(isGenerationCanceledError(new Error("canceled"))).toBe(false);
    expect(isGenerationCanceledError(null)).toBe(false);
    expect(isGenerationCanceledError(undefined)).toBe(false);
  });
});
