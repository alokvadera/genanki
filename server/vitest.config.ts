import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

/**
 * Vitest does not populate process.env from .env files, but server modules
 * (db/index.ts, encryption.ts, auth.ts) read secrets at import time and fail
 * closed when they are missing. Load server/.env before the test files are
 * imported so pure-function tests can import those modules without a real
 * database or Neon deploy. Existing shell vars always win.
 */
function loadEnvFile(): void {
  let contents: string;
  try {
    contents = readFileSync(new URL("./.env", import.meta.url), "utf8");
  } catch {
    return; // .env is optional (e.g. CI injects the vars directly)
  }
  for (const line of contents.split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)="?(.*?)"?\s*$/);
    if (match && process.env[match[1]!] === undefined) {
      process.env[match[1]!] = match[2];
    }
  }
}

loadEnvFile();

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
  },
});
