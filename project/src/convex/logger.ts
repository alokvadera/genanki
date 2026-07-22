"use node";

/**
 * Structured JSON logger for backend observability.
 *
 * Usage:
 *   import { logger } from "./logger";
 *   logger.info("Starting generation", { jobId, kind: "document" });
 *   logger.error("Provider failed", { provider: "groq", model: "llama-3.3-70b", error: err.message });
 *
 * Format: { ts: "2024-03-10T12:34:56.789Z", lvl: "INFO", msg: "...", ...context }
 *
 * Environment control:
 *   LOG_LEVEL=debug | info | warn | error  (default: info)
 *   LOG_REDACT=true (default: true) — redacts tokens/content from log output
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export type LogContext = Record<string, unknown>;

/** Sensitive keys that should be redacted by default. */
const SENSITIVE_KEYS = new Set([
  "content",
  "systemPrompt",
  "userContent",
  "apiKey",
  "token",
  "secret",
  "password",
  "authorization",
]);

function shouldRedact(): boolean {
  return process.env.LOG_REDACT !== "false";
}

function redactValue(key: string, value: unknown): unknown {
  if (!shouldRedact()) return value;
  if (SENSITIVE_KEYS.has(key)) return "[redacted]";
  if (typeof value === "string" && value.length > 500) return value.slice(0, 500) + "...[truncated]";
  return value;
}

function redactContext(context: LogContext): LogContext {
  if (!shouldRedact()) return context;
  const out: LogContext = {};
  for (const [key, value] of Object.entries(context)) {
    out[key] = redactValue(key, value);
  }
  return out;
}

function getMinLevel(): LogLevel {
  const env = process.env.LOG_LEVEL?.toLowerCase();
  if (env === "debug" || env === "info" || env === "warn" || env === "error") return env;
  return "info";
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[getMinLevel()];
}

function formatLog(level: LogLevel, message: string, context?: LogContext): string {
  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(),
    lvl: level.toUpperCase(),
    msg: message,
  };

  if (context) {
    const safe = redactContext(context);
    Object.assign(entry, safe);
  }

  return JSON.stringify(entry);
}

function log(level: LogLevel, message: string, context?: LogContext): void {
  if (!shouldLog(level)) return;
  const formatted = formatLog(level, message, context);

  switch (level) {
    case "error":
      console.error(formatted);
      break;
    case "warn":
      console.warn(formatted);
      break;
    default:
      console.log(formatted);
  }
}

export const logger = {
  debug(message: string, context?: LogContext): void {
    log("debug", message, context);
  },
  info(message: string, context?: LogContext): void {
    log("info", message, context);
  },
  warn(message: string, context?: LogContext): void {
    log("warn", message, context);
  },
  error(message: string, context?: LogContext): void {
    log("error", message, context);
  },
};
