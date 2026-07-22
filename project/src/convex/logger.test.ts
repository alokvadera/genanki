import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logger } from "./logger";

describe("logger", () => {
  let consoleLog: ReturnType<typeof vi.fn>;
  let consoleWarn: ReturnType<typeof vi.fn>;
  let consoleError: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    consoleLog = vi.fn();
    consoleWarn = vi.fn();
    consoleError = vi.fn();
    vi.stubGlobal("console", { ...console, log: consoleLog, warn: consoleWarn, error: consoleError });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  function parseLog(call: ReturnType<typeof vi.fn>): Record<string, unknown> | null {
    const args = call.mock.calls[0];
    if (!args || args.length === 0) return null;
    try {
      return JSON.parse(args[0] as string);
    } catch {
      return null;
    }
  }

  it("info writes to console.log with structured JSON", () => {
    logger.info("test message", { key: "value" });
    expect(consoleLog).toHaveBeenCalledOnce();
    const parsed = parseLog(consoleLog);
    expect(parsed).not.toBeNull();
    expect(parsed!.lvl).toBe("INFO");
    expect(parsed!.msg).toBe("test message");
    expect(parsed!.key).toBe("value");
  });

  it("warn writes to console.warn", () => {
    logger.warn("warning message");
    expect(consoleWarn).toHaveBeenCalledOnce();
    const parsed = parseLog(consoleWarn);
    expect(parsed!.lvl).toBe("WARN");
    expect(parsed!.msg).toBe("warning message");
  });

  it("error writes to console.error", () => {
    logger.error("error message");
    expect(consoleError).toHaveBeenCalledOnce();
    const parsed = parseLog(consoleError);
    expect(parsed!.lvl).toBe("ERROR");
    expect(parsed!.msg).toBe("error message");
  });

  it("debug writes to console.log", () => {
    vi.stubEnv("LOG_LEVEL", "debug");
    logger.debug("debug message");
    expect(consoleLog).toHaveBeenCalledOnce();
    const parsed = parseLog(consoleLog);
    expect(parsed!.lvl).toBe("DEBUG");
    expect(parsed!.msg).toBe("debug message");
  });

  it("includes timestamp in ISO format", () => {
    logger.info("timestamped");
    const parsed = parseLog(consoleLog);
    expect(parsed!.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("handles empty context", () => {
    logger.info("no context");
    const parsed = parseLog(consoleLog);
    expect(parsed!.msg).toBe("no context");
    expect(parsed!.ts).toBeDefined();
    expect(parsed!.lvl).toBe("INFO");
    // Only ts, lvl, msg should be present
    expect(Object.keys(parsed!).sort()).toEqual(["lvl", "msg", "ts"]);
  });

  it("redacts sensitive keys by default", () => {
    logger.info("sensitive", { apiKey: "sk-12345", model: "llama-3" });
    const parsed = parseLog(consoleLog);
    expect(parsed!.apiKey).toBe("[redacted]");
    expect(parsed!.model).toBe("llama-3"); // non-sensitive passes through
  });

  it("redacts content key", () => {
    logger.info("content", { content: "Very long generated text..." });
    const parsed = parseLog(consoleLog);
    expect(parsed!.content).toBe("[redacted]");
  });

  it("redacts systemPrompt and userContent", () => {
    logger.info("prompts", {
      systemPrompt: "You are a helpful assistant",
      userContent: "What is mitochondria?",
    });
    const parsed = parseLog(consoleLog);
    expect(parsed!.systemPrompt).toBe("[redacted]");
    expect(parsed!.userContent).toBe("[redacted]");
  });

  it("truncates long strings (>500 chars)", () => {
    const longString = "x".repeat(600);
    logger.info("long value", { description: longString });
    const parsed = parseLog(consoleLog);
    expect(parsed!.description).toContain("[truncated]");
    expect((parsed!.description as string).length).toBeLessThan(600);
  });

  it("passes number and boolean values through unredacted", () => {
    logger.info("numbers", { latencyMs: 234, tokensUsed: 1500, timedOut: true });
    const parsed = parseLog(consoleLog);
    expect(parsed!.latencyMs).toBe(234);
    expect(parsed!.tokensUsed).toBe(1500);
    expect(parsed!.timedOut).toBe(true);
  });

  it("handles nested context objects (shallow pass-through)", () => {
    logger.info("nested", { nested: { a: 1, b: "two" } });
    const parsed = parseLog(consoleLog);
    expect(parsed!.nested).toEqual({ a: 1, b: "two" });
  });

  it("skips debug when LOG_LEVEL=info (default)", () => {
    logger.debug("should not appear");
    expect(consoleLog).not.toHaveBeenCalled();
  });

  it("filters by LOG_LEVEL=error (only error visible)", () => {
    vi.stubEnv("LOG_LEVEL", "error");
    logger.debug("d");
    logger.info("i");
    logger.warn("w");
    logger.error("visible");
    expect(consoleLog).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledOnce();
    vi.unstubAllEnvs();
  });

  it("shows debug when LOG_LEVEL=debug", () => {
    vi.stubEnv("LOG_LEVEL", "debug");
    logger.debug("visible debug");
    expect(consoleLog).toHaveBeenCalledOnce();
    vi.unstubAllEnvs();
  });

  it("defaults to info when LOG_LEVEL is invalid", () => {
    vi.stubEnv("LOG_LEVEL", "blah");
    logger.debug("suppressed");
    logger.info("shown");
    expect(consoleLog).toHaveBeenCalledOnce();
    vi.unstubAllEnvs();
  });
});
