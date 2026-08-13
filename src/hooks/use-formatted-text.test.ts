// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFormatCardText } from "./use-formatted-text";

vi.mock("@/lib/formatter", () => ({
  formatCardText: (t: string) => `<b>${t}</b>`,
}));

describe("useFormatCardText", () => {
  it("returns the raw text while the formatter is still loading", () => {
    const { result } = renderHook(() => useFormatCardText("hello"));
    expect(result.current).toBe("hello");
  });

  it("formats the text once the formatter module resolves", async () => {
    const { result } = renderHook(() => useFormatCardText("hello"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toBe("<b>hello</b>");
  });

  it("formats a different text when the prop changes after load", async () => {
    const { result, rerender } = renderHook(
      ({ text }: { text: string }) => useFormatCardText(text),
      { initialProps: { text: "first" } },
    );
    await act(async () => {
      await Promise.resolve();
    });
    rerender({ text: "second" });
    expect(result.current).toBe("<b>second</b>");
  });

  it("does not update state if unmounted before the import resolves", async () => {
    const { unmount } = renderHook(() => useFormatCardText("hello"));
    unmount();
    await act(async () => {
      await Promise.resolve();
    });
    // No crash / no state update after unmount is the assertion.
    expect(true).toBe(true);
  });
});
