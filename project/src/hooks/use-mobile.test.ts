// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useIsMobile } from "./use-mobile";

// Mock window.matchMedia (not available in jsdom by default)
function setupMatchMediaMock() {
  const listeners: Array<() => void> = [];
  const mql = {
    matches: false,
    addEventListener: vi.fn((event: string, cb: () => void) => {
      if (event === "change") listeners.push(cb);
    }),
    removeEventListener: vi.fn((event: string, cb: () => void) => {
      const idx = listeners.indexOf(cb);
      if (idx >= 0) listeners.splice(idx, 1);
    }),
  };

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn(() => mql),
  });

  return { mql, listeners };
}

describe("useIsMobile", () => {
  let originalInnerWidth: number;
  let originalMatchMedia: typeof window.matchMedia | undefined;

  beforeEach(() => {
    originalInnerWidth = window.innerWidth;
    originalMatchMedia = window.matchMedia as typeof window.matchMedia | undefined;
  });

  afterEach(() => {
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: originalInnerWidth,
    });
    if (originalMatchMedia) {
      Object.defineProperty(window, "matchMedia", {
        writable: true,
        configurable: true,
        value: originalMatchMedia,
      });
    }
  });

  function setWidth(width: number) {
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: width,
    });
  }

  it("returns false when window is wider than 767px", () => {
    setupMatchMediaMock();
    setWidth(1024);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("returns true when window is narrower than 768px", () => {
    setupMatchMediaMock();
    setWidth(500);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it("returns false at exactly 768px (mobile breakpoint is < 768)", () => {
    setupMatchMediaMock();
    setWidth(768);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("returns true at 767px", () => {
    setupMatchMediaMock();
    setWidth(767);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it("responds to matchMedia change events", () => {
    const { listeners } = setupMatchMediaMock();
    setWidth(1024);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    // Simulate viewport change: update innerWidth then fire the matchMedia listener
    act(() => {
      setWidth(500);
      for (const cb of listeners) cb();
    });
    expect(result.current).toBe(true);
  });

  it("cleans up event listener on unmount", () => {
    const { mql } = setupMatchMediaMock();
    setWidth(1024);
    const { unmount } = renderHook(() => useIsMobile());
    unmount();
    expect(mql.removeEventListener).toHaveBeenCalled();
  });

  it("handles window.innerWidth being 0", () => {
    setupMatchMediaMock();
    setWidth(0);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it("handles very large window.innerWidth", () => {
    setupMatchMediaMock();
    setWidth(99999);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });
});

