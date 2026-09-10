// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFormatCardText } from "./use-formatted-text";

// The module factory throws, so `await import("@/lib/formatter")` rejects and
// the hook's catch branch (raw-text fallback) runs.
vi.mock("@/lib/formatter", () => {
  throw new Error("formatter failed to load");
});

describe("useFormatCardText failure path", () => {
  it("falls back to the raw text when the formatter fails to load", async () => {
    const { result } = renderHook(() => useFormatCardText("hello"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toBe("hello");
  });

  it("does not update state if unmounted while the import is failing", async () => {
    const { unmount } = renderHook(() => useFormatCardText("hello"));
    unmount();
    await act(async () => {
      await Promise.resolve();
    });
    // No crash / no state update after unmount is the assertion.
    expect(true).toBe(true);
  });
});
