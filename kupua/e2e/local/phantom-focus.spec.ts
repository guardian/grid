/**
 * Phantom focus mode — E2E tests.
 *
 * Validates that phantom mode (click-to-open, no focus ring, arrows scroll)
 * works correctly, and that switching modes works at runtime.
 */

import { test, expect } from "../shared/helpers";

// ---------------------------------------------------------------------------
// Helper: set focus mode via localStorage before navigating
// ---------------------------------------------------------------------------

async function setPhantomMode(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      "kupua-ui-prefs",
      JSON.stringify({ state: { focusMode: "phantom" }, version: 0 }),
    );
  });
}

// ---------------------------------------------------------------------------
// Phantom mode: click behaviour
// ---------------------------------------------------------------------------

test.describe("Phantom focus mode — click behaviour", () => {
  test("single-click opens image detail in grid", async ({ kupua }) => {
    await setPhantomMode(kupua.page);
    await kupua.page.goto("/search?nonFree=true");
    await kupua.waitForResults();

    // Click the first grid cell
    const cells = kupua.page.locator(
      '[aria-label="Image results grid"] [data-grid-cell]',
    );
    await cells.first().click();

    // Should navigate to detail (image param in URL)
    await kupua.page.waitForFunction(
      () => new URL(window.location.href).searchParams.has("image"),
      { timeout: 5000 },
    );
    const url = new URL(await kupua.page.url());
    expect(url.searchParams.get("image")).toBeTruthy();
  });

  test("single-click opens image detail in table", async ({ kupua }) => {
    await setPhantomMode(kupua.page);
    await kupua.page.goto("/search?nonFree=true&density=table");
    await kupua.waitForResults();

    // Click the first data row
    const rows = kupua.page.locator(
      '[aria-label="Image results table"] [role="row"][class*="cursor-pointer"]',
    );
    await rows.first().click();

    await kupua.page.waitForFunction(
      () => new URL(window.location.href).searchParams.has("image"),
      { timeout: 5000 },
    );
    const url = new URL(await kupua.page.url());
    expect(url.searchParams.get("image")).toBeTruthy();
  });

  test("no focus ring appears in phantom mode", async ({ kupua }) => {
    await setPhantomMode(kupua.page);
    await kupua.page.goto("/search?nonFree=true");
    await kupua.waitForResults();

    // Verify no focus ring on any grid cell
    const rings = kupua.page.locator('[data-grid-cell][class*="ring-2"]');
    await expect(rings).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// Phantom mode: keyboard behaviour
// ---------------------------------------------------------------------------

test.describe("Phantom focus mode — keyboard behaviour", () => {
  test("arrow keys scroll rows, no focus ring", async ({ kupua }) => {
    await setPhantomMode(kupua.page);
    await kupua.page.goto("/search?nonFree=true");
    await kupua.waitForResults();

    const scrollBefore = await kupua.getScrollTop();

    // Press ArrowDown — should scroll, not set focus
    await kupua.page.keyboard.press("ArrowDown");
    await kupua.page.waitForTimeout(200);

    const scrollAfter = await kupua.getScrollTop();
    expect(scrollAfter).toBeGreaterThan(scrollBefore);

    // No focus should be set
    const focusedId = await kupua.getFocusedImageId();
    expect(focusedId).toBeNull();

    // No focus ring visible on any grid cell
    const rings = kupua.page.locator('[data-grid-cell][class*="ring-2"]');
    await expect(rings).toHaveCount(0);
  });

  test("Enter does nothing in phantom mode", async ({ kupua }) => {
    await setPhantomMode(kupua.page);
    await kupua.page.goto("/search?nonFree=true");
    await kupua.waitForResults();

    // Press Enter — should not navigate
    await kupua.page.keyboard.press("Enter");
    await kupua.page.waitForTimeout(300);

    const url = new URL(await kupua.page.url());
    expect(url.searchParams.has("image")).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
// Return from detail in phantom mode
// ---------------------------------------------------------------------------

test.describe("Phantom focus mode — return from detail", () => {
  test("return from detail preserves scroll position", async ({ kupua }) => {
    await setPhantomMode(kupua.page);
    await kupua.page.goto("/search?nonFree=true");
    await kupua.waitForResults();

    // Scroll down a bit
    await kupua.page.keyboard.press("ArrowDown");
    await kupua.page.keyboard.press("ArrowDown");
    await kupua.page.waitForTimeout(200);

    // Find a cell that's visible and click it to enter detail
    const cells = kupua.page.locator(
      '[aria-label="Image results grid"] [data-grid-cell]',
    );
    // Use nth(4) to pick a cell well within the viewport after scrolling
    const target = cells.nth(4);
    await target.scrollIntoViewIfNeeded();
    const scrollBefore = await kupua.getScrollTop();
    await target.click();
    await kupua.page.waitForFunction(
      () => new URL(window.location.href).searchParams.has("image"),
      { timeout: 5000 },
    );

    // Press Backspace to return
    await kupua.page.keyboard.press("Backspace");
    await kupua.page.waitForFunction(
      () => !new URL(window.location.href).searchParams.has("image"),
      { timeout: 5000 },
    );
    await kupua.page.waitForTimeout(500);

    // No focus ring should be visible after return
    const rings = kupua.page.locator('[data-grid-cell][class*="ring-2"]');
    await expect(rings).toHaveCount(0);

    // Scroll position should be near where we were (within one viewport)
    const scrollAfter = await kupua.getScrollTop();
    expect(Math.abs(scrollAfter - scrollBefore)).toBeLessThan(800);
  });
});

// ---------------------------------------------------------------------------
// Explicit mode: existing behaviour unchanged
// ---------------------------------------------------------------------------

test.describe("Explicit focus mode (default) — unchanged", () => {
  test("single-click sets focus ring, does not open detail", async ({ kupua }) => {
    // Default mode = explicit (fresh localStorage)
    await kupua.page.goto("/search?nonFree=true");
    await kupua.waitForResults();

    const cells = kupua.page.locator(
      '[aria-label="Image results grid"] [data-grid-cell]',
    );
    await cells.first().click();
    await kupua.page.waitForTimeout(200);

    // Should NOT navigate to detail
    const url = new URL(await kupua.page.url());
    expect(url.searchParams.has("image")).toBeFalsy();

    // Focus ring should appear on exactly one grid cell
    const rings = kupua.page.locator('[data-grid-cell][class*="ring-2"]');
    await expect(rings).toHaveCount(1);

    // focusedImageId should be set
    const focusedId = await kupua.getFocusedImageId();
    expect(focusedId).toBeTruthy();
  });

  test("double-click opens detail in explicit mode", async ({ kupua }) => {
    await kupua.page.goto("/search?nonFree=true");
    await kupua.waitForResults();

    const cells = kupua.page.locator(
      '[aria-label="Image results grid"] [data-grid-cell]',
    );
    await cells.first().dblclick();
    await kupua.page.waitForFunction(
      () => new URL(window.location.href).searchParams.has("image"),
      { timeout: 5000 },
    );
    const url = new URL(await kupua.page.url());
    expect(url.searchParams.get("image")).toBeTruthy();
  });
});
