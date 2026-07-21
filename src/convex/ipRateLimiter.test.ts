import { describe, it, expect, vi } from "vitest";
import {
  getDayWindowStart,
  checkAndLogIpHandler,
  deductIpTokensHandler,
} from "./ipRateLimiter";

describe("IP Rate Limiter & Budgeting", () => {
  describe("getDayWindowStart", () => {
    it("returns correct UTC day window start timestamp", () => {
      const ts = new Date("2026-07-20T15:30:00Z").getTime();
      const dayStart = getDayWindowStart(ts);
      
      const expected = Date.UTC(2026, 6, 20); // July is month index 6
      expect(dayStart).toBe(expected);
    });

    it("moves to next day at UTC midnight", () => {
      const tsBefore = new Date("2026-07-20T23:59:59Z").getTime();
      const tsAfter = new Date("2026-07-21T00:00:01Z").getTime();

      expect(getDayWindowStart(tsBefore)).toBe(Date.UTC(2026, 6, 20));
      expect(getDayWindowStart(tsAfter)).toBe(Date.UTC(2026, 6, 21));
    });
  });

  describe("checkAndLogIpHandler", () => {
    it("denies access if the IP is blocked in rules", async () => {
      // Mock db queries
      const mockQueryUnique = vi.fn().mockResolvedValue({
        ip: "1.2.3.4",
        isBlocked: true,
        customDailyLimit: undefined,
      });

      const mockCtx = {
        db: {
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              unique: mockQueryUnique,
            }),
          }),
        },
      };

      const result = await checkAndLogIpHandler(mockCtx, { ip: "1.2.3.4", estimatedTokens: 1000 });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("blocked");
      expect(mockQueryUnique).toHaveBeenCalled();
    });

    it("allows access and inserts state if IP is clean and new", async () => {
      const mockQueryUnique = vi.fn()
        .mockResolvedValueOnce(null) // no rules (clean)
        .mockResolvedValueOnce(null); // no rate state (new)

      const mockInsert = vi.fn().mockResolvedValue("mock-id");

      const mockCtx = {
        db: {
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              unique: mockQueryUnique,
            }),
          }),
          insert: mockInsert,
        },
      };

      const result = await checkAndLogIpHandler(mockCtx, { ip: "1.2.3.4", estimatedTokens: 1000 });
      expect(result.allowed).toBe(true);
      expect(result.ip).toBe("1.2.3.4");
      expect(mockInsert).toHaveBeenCalledWith("ipRateState", expect.objectContaining({
        ip: "1.2.3.4",
        dayTokensUsed: 0,
        totalRequests: 1,
      }));
    });

    it("denies access if daily budget limit is exceeded", async () => {
      const mockQueryUnique = vi.fn()
        .mockResolvedValueOnce(null) // clean rule
        .mockResolvedValueOnce({
          _id: "state-id",
          ip: "1.2.3.4",
          dayWindowStart: getDayWindowStart(Date.now()),
          dayTokensUsed: 49500, // almost used up (50k limit)
          totalTokensAllTime: 100000,
          totalRequests: 10,
        });

      const mockCtx = {
        db: {
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              unique: mockQueryUnique,
            }),
          }),
        },
      };

      // 1000 estimated tokens would exceed the 50,000 limit
      const result = await checkAndLogIpHandler(mockCtx, { ip: "1.2.3.4", estimatedTokens: 1000 });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Daily token limit");
    });

    it("groups limits and logs dynamic IPs under deviceIdHash if provided", async () => {
      const mockQueryUnique = vi.fn()
        .mockResolvedValueOnce(null) // check rules by deviceIdHash (clean)
        .mockResolvedValueOnce(null) // check rules by ip (clean)
        .mockResolvedValueOnce({
          _id: "state-id",
          ip: "1.2.3.4",
          deviceIdHash: "dev-id-hash",
          associatedIps: ["1.2.3.4"],
          dayWindowStart: getDayWindowStart(Date.now()),
          dayTokensUsed: 1000,
          totalTokensAllTime: 5000,
          totalRequests: 5,
        });

      const mockPatch = vi.fn().mockResolvedValue(undefined);

      const mockCtx = {
        db: {
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              unique: mockQueryUnique,
            }),
          }),
          patch: mockPatch,
        },
      };

      const result = await checkAndLogIpHandler(mockCtx, { 
        ip: "1.2.3.5", // new dynamic IP
        estimatedTokens: 500, 
        deviceIdHash: "dev-id-hash" 
      });

      expect(result.allowed).toBe(true);
      expect(mockPatch).toHaveBeenCalledWith("state-id", expect.objectContaining({
        deviceIdHash: "dev-id-hash",
        associatedIps: ["1.2.3.4", "1.2.3.5"], // groups both IPs!
        ip: "1.2.3.5", // last seen raw IP
        totalRequests: 6,
      }));
    });
  });

  describe("deductIpTokensHandler", () => {
    it("successfully increments dayTokensUsed and totalTokensAllTime in state", async () => {
      const mockState = {
        _id: "state-id",
        ip: "1.2.3.4",
        dayTokensUsed: 1000,
        totalTokensAllTime: 5000,
      };

      const mockQueryUnique = vi.fn().mockResolvedValue(mockState);
      const mockPatch = vi.fn().mockResolvedValue(undefined);

      const mockCtx = {
        db: {
          query: vi.fn().mockReturnValue({
            withIndex: vi.fn().mockReturnValue({
              unique: mockQueryUnique,
            }),
          }),
          patch: mockPatch,
        },
      };

      await deductIpTokensHandler(mockCtx, { ip: "1.2.3.4", tokens: 2500 });
      
      expect(mockPatch).toHaveBeenCalledWith("state-id", expect.objectContaining({
        dayTokensUsed: 3500, // 1000 + 2500
        totalTokensAllTime: 7500, // 5000 + 2500
      }));
    });
  });
});
