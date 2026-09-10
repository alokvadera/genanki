/**
 * Server-side smoke tests. These run under the server package's own vitest
 * config (`server/vitest.config.ts`) because the server is a self-contained
 * package with its own node_modules.
 */
import { describe, expect, it } from "vitest";
import { timingSafeEqual, generateSessionToken, getDayWindowStart } from "./services/ipRateLimiter";
import { getUtcDayString } from "./budget";
import { computeBackoffCooldown } from "./providerOrchestrator";

describe("server services (no DB required)", () => {
  it("timingSafeEqual matches identical secrets", async () => {
    expect(await timingSafeEqual("same", "same")).toBe(true);
  });

  it("timingSafeEqual rejects different secrets", async () => {
    expect(await timingSafeEqual("same", "other")).toBe(false);
  });

  it("generateSessionToken is 64 hex chars and unique", () => {
    const token = generateSessionToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    const seen = new Set(Array.from({ length: 20 }, () => generateSessionToken()));
    expect(seen.size).toBe(20);
  });

  it("getDayWindowStart returns UTC midnight", () => {
    const ts = new Date("2026-09-09T15:30:00Z").getTime();
    expect(getDayWindowStart(ts)).toBe(Date.UTC(2026, 8, 9));
  });

  it("getUtcDayString formats YYYY-MM-DD", () => {
    expect(getUtcDayString(Date.UTC(2026, 8, 9))).toBe("2026-09-09");
  });

  it("computeBackoffCooldown respects the deadline clamp", () => {
    const deadline = Date.now() + 1000;
    expect(computeBackoffCooldown(0, deadline)).toBeLessThanOrEqual(1.001);
  });
});
