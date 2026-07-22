import { useEffect, useRef, useState } from "react";
import { showRecoveryToast } from "@/lib/utils";

const STORAGE_KEY = "device_token";

function generateToken(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

/**
 * Validates that a localStorage value looks like a real device token.
 * Rejects empty strings, whitespace-only, and tokens shorter than 8 chars
 * (which would indicate corrupted or truncated storage).
 */
function isValidDeviceToken(value: string | null): value is string {
  return typeof value === "string" && value.trim().length >= 8;
}

/**
 * Returns a stable browser device token, persisted in localStorage.
 * Generates and stores a new token if the stored value is missing or invalid.
 * Shows a toast notification when a previously stored token was found but
 * rejected as invalid (indicating corrupted or truncated storage data).
 */
export function useDeviceToken(): string {
  const [{ token, wasInvalid }] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (isValidDeviceToken(stored)) {
        return { token: stored, wasInvalid: false };
      }
      // There was a stored value but it was invalid — worth notifying.
      const wasPresent = stored !== null;
      const newToken = generateToken();
      try {
        localStorage.setItem(STORAGE_KEY, newToken);
      } catch {
        // Ignore storage write errors
      }
      return { token: newToken, wasInvalid: wasPresent };
    } catch {
      const newToken = generateToken();
      try {
        localStorage.setItem(STORAGE_KEY, newToken);
      } catch {
        // Ignore storage write errors
      }
      return { token: newToken, wasInvalid: false };
    }
  });

  // useRef guard prevents duplicate toasts in React StrictMode (mount → unmount → remount).
  const hasShown = useRef(false);
  useEffect(() => {
    if (!wasInvalid || hasShown.current) return;
    hasShown.current = true;
    showRecoveryToast("Your session token was refreshed automatically.");
  }, [wasInvalid]);

  return token;
}
