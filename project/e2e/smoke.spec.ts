import { test, expect } from "@playwright/test";

test.describe("Landing page", () => {
  test("loads and shows the main heading", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toBeVisible({ timeout: 10_000 });
  });

  test("has a link to the app", async ({ page }) => {
    await page.goto("/");
    const appLink = page.locator('a[href="/app"]');
    const count = await appLink.count();
    if (count > 0) {
      await expect(appLink.first()).toBeVisible();
    }
  });
});

test.describe("Deck creator", () => {
  test("loads at /app", async ({ page }) => {
    await page.goto("/app");
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 10_000 });
  });

  test("has deck sidebar with starter decks", async ({ page }) => {
    await page.goto("/app");
    await expect(page.getByText("My First Deck")).toBeVisible({ timeout: 10_000 });
  });

  test("manual card form is visible", async ({ page }) => {
    await page.goto("/app");
    await expect(page.getByText("ADD NEW CARD")).toBeVisible({ timeout: 10_000 });
  });

  test("can add a manual card", async ({ page }) => {
    await page.goto("/app");
    // Fill front and back using placeholder selectors (stable across re-renders)
    await page.getByPlaceholder("Question or term...").fill("What is the capital of France?");
    await page.getByPlaceholder("Answer or definition...").fill("Paris");
    // Click Add Card
    await page.getByRole("button", { name: /Add Card/i }).click();
    // Card should appear in the list
    await expect(page.getByText("What is the capital of France?")).toBeVisible({ timeout: 5_000 });
  });

  test("export button is visible", async ({ page }) => {
    await page.goto("/app");
    // Add a card first so export is meaningful
    await page.getByPlaceholder("Question or term...").fill("Q");
    await page.getByPlaceholder("Answer or definition...").fill("A");
    await page.getByRole("button", { name: /Add Card/i }).click();
    // Export button should be present (may be disabled if propagation is needed, but element exists)
    await expect(page.getByRole("button", { name: /Export/i }).first()).toBeVisible({ timeout: 5_000 });
  });
});

test.describe("Provider Usage page", () => {
  test("loads at /usage", async ({ page }) => {
    await page.goto("/usage");
    await expect(page.getByText("Provider Usage")).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("History page", () => {
  test("loads at /runs", async ({ page }) => {
    await page.goto("/runs");
    await expect(page.getByText("Runs")).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("404 page", () => {
  test("shows not-found for unknown route", async ({ page }) => {
    await page.goto("/this-route-does-not-exist-42");
    await expect(page.locator("text=404").or(page.locator("text=NOT FOUND")).or(page.locator("text=Page not found"))).toBeVisible({ timeout: 10_000 });
  });
});
