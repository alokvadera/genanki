import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Unmount React trees rendered by @testing-library/react after each test so
// repeated render() calls don't stack duplicate DOM nodes across tests.
afterEach(() => {
  if (typeof document !== "undefined") {
    cleanup();
  }
});
