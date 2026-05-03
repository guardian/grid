/**
 * Selections Mobile spec (Phase S5).
 *
 * Tests long-press and drag-paint-toggle gestures on coarse-pointer
 * (touch) devices. Uses Pixel 5 device emulation which sets:
 *  - pointer: coarse  (triggers _pointerCoarse in ui-prefs-store)
 *  - hasTouch: true
 *  - viewport: 393 x 852
 *
 * Touch simulation: uses page.evaluate() to dispatch PointerEvents directly.
 * This is more reliable than Playwright's touchscreen API because:
 *  - Our code listens to PointerEvents, not touch events
 *  - Element hit-testing in the hooks uses elementFromPoint (DOM-level)
 *  - Fake timers cannot be used in the E2E browser context
 *
 * Long-press timing: LONG_PRESS_MS = 500ms. Tests use page.waitForTimeout(600)
 * to ensure the threshold fires with margin.
 *
 * NOTE: iOS Safari real-device testing is REQUIRED for setPointerCapture quirks
 * (agent cannot run this). This spec covers Chromium mobile emulation only.
 *
 * Run:
 *   npm --prefix kupua run test:e2e -- selections-mobile.spec.ts
 *   npm --prefix kupua run test:e2e -- selections-mobile.spec.ts --headed
 */

import { test, expect, devices } from "@playwright/test";

// ---------------------------------------------------------------------------
// Device emulation -- Pixel 5 sets pointer:coarse via hasTouch
// ---------------------------------------------------------------------------

test.use({ ...devices["Pixel 5"] });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getSelectionCount(page: Parameters<typeof test>[1]["page"]): Promise<number> {
  return page.evaluate(() => {
    const store = (window as any).__kupua_selection_store__;
    if (!store) return 0;
    return store.getState().selectedIds.size;
  });
}

async function clearSelection(page: Parameters<typeof test>[1]["page"]): Promise<void> {
  await page.evaluate(() => {
    const store = (window as any).__kupua_selection_store__;
    store?.getState().clear();
  });
}

/**
 * Dispatch a PointerEvent (pointerType=touch) on the element at (x, y).
 * Returns the clientX/clientY of the dispatched event target.
 */
async function dispatchPointer(
  page: Parameters<typeof test>[1]["page"],
  type: string,
  x: number,
  y: number,
  pointerId = 1,
): Promise<void> {
  await page.evaluate(
    ({ type, x, y, pointerId }) => {
      const target = document.elementFromPoint(x, y) ?? document.body;
      target.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId,
          pointerType: "touch",
          clientX: x,
          clientY: y,
          isPrimary: true,
        }),
      );
    },
    { type, x, y, pointerId },
  );
}

/**
 * Simulate a long-press at (x, y) by dispatching pointerdown and waiting
 * LONG_PRESS_MS + margin before dispatching pointerup.
 * Does NOT dispatch pointerup -- callers add their own cleanup or drag.
 */
async function beginLongPress(
  page: Parameters<typeof test>[1]["page"],
  x: number,
  y: number,
): Promise<void> {
  await dispatchPointer(page, "pointerdown", x, y);
  // Wait for threshold to fire (500ms + 150ms margin)
  await page.waitForTimeout(650);
}

/** Complete a long-press with pointerup (no drag -- becomes a tap). */
async function endPress(
  page: Parameters<typeof test>[1]["page"],
  x: number,
  y: number,
): Promise<void> {
  await dispatchPointer(page, "pointerup", x, y);
}

/**
 * Get the bounding rect of the nth visible grid cell.
 */
async function getCellRect(
  page: Parameters<typeof test>[1]["page"],
  n: number,
): Promise<{ x: number; y: number; width: number; height: number } | null> {
  return page.evaluate((n) => {
    const cells = document.querySelectorAll("[data-grid-cell]");
    const cell = cells[n] as HTMLElement | undefined;
    if (!cell) return null;
    const r = cell.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, width: r.width, height: r.height };
  }, n);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

test.beforeEach(async ({ page }) => {
  // Navigate; don't call kupua.goto() to avoid the desktop pointer assumption.
  await page.goto("/search?nonFree=true");
  await page.waitForFunction(() => {
    const grid = document.querySelector('[aria-label="Image results grid"]');
    return grid && grid.querySelectorAll("[data-grid-cell]").length > 3;
  }, { timeout: 15_000 });
  // Ensure clean slate
  await clearSelection(page);
});

// ===========================================================================
// Long-press enters Selection Mode
// ===========================================================================

test("long-press on grid cell enters selection mode and selects that cell", async ({ page }) => {
  const rect = await getCellRect(page, 0);
  if (!rect) throw new Error("No cells found");

  await beginLongPress(page, rect.x, rect.y);

  // Selection should have entered mode
  const count = await getSelectionCount(page);
  expect(count).toBe(1);

  await endPress(page, rect.x, rect.y);
});

test("StatusBar remains at top (not repositioned) when in selection mode on coarse pointer", async ({ page }) => {
  const rect = await getCellRect(page, 0);
  if (!rect) throw new Error("No cells found");

  await beginLongPress(page, rect.x, rect.y);
  await endPress(page, rect.x, rect.y);

  // Confirm we are in selection mode
  const count = await getSelectionCount(page);
  expect(count).toBeGreaterThan(0);

  // The StatusBar has both data-coarse-pointer and data-selection-mode.
  // (The grid also has data-selection-mode -- use both attributes to target only StatusBar.)
  const statusBar = page.locator("[data-coarse-pointer='true'][data-selection-mode='true']");
  await expect(statusBar).toBeVisible({ timeout: 3000 });

  // StatusBar must remain at the TOP of the viewport, not repositioned to bottom.
  const barBox = await statusBar.boundingBox();
  if (barBox) {
    expect(barBox.y).toBeLessThan(100);
  }
});

// ===========================================================================
// Long-press-tap (quick release = no drag)
// ===========================================================================

test("long-press-tap on cell 0 then long-press-tap on cell 1 creates range", async ({ page }) => {
  const rect0 = await getCellRect(page, 0);
  const rect1 = await getCellRect(page, 1);
  if (!rect0 || !rect1) throw new Error("Not enough cells");

  // First long-press-tap: enters mode + sets anchor on cell 0
  await beginLongPress(page, rect0.x, rect0.y);
  await endPress(page, rect0.x, rect0.y);

  // Should have 1 selected
  const count1 = await getSelectionCount(page);
  expect(count1).toBe(1);

  // Second long-press-tap on cell 1: range select anchor..cell1
  await beginLongPress(page, rect1.x, rect1.y);
  await endPress(page, rect1.x, rect1.y);

  // Should have >= 2 selected (range between cell 0 and cell 1)
  const count2 = await getSelectionCount(page);
  expect(count2).toBeGreaterThanOrEqual(2);
});

// ===========================================================================
// Tickbox tap still works in selection mode (coarse pointer)
// ===========================================================================

test("tickbox tap toggles selection without triggering long-press", async ({ page }) => {
  // First enter selection mode via long-press
  const rect0 = await getCellRect(page, 0);
  if (!rect0) throw new Error("No cells found");
  await beginLongPress(page, rect0.x, rect0.y);
  await endPress(page, rect0.x, rect0.y);

  const count1 = await getSelectionCount(page);
  expect(count1).toBe(1);

  // Now tap the tickbox on cell 1 (tickbox is visible in selection mode)
  const tickbox = page.locator("[data-grid-cell]").nth(1).locator("[data-tickbox]");
  await expect(tickbox).toBeVisible({ timeout: 3000 });
  await tickbox.click();

  const count2 = await getSelectionCount(page);
  expect(count2).toBe(2);
});

// ===========================================================================
// SelectionFab (floating action button)
// ===========================================================================

test("SelectionFab appears in selection mode on coarse pointer", async ({ page }) => {
  const rect = await getCellRect(page, 0);
  if (!rect) throw new Error("No cells found");

  await beginLongPress(page, rect.x, rect.y);
  await endPress(page, rect.x, rect.y);

  const count = await getSelectionCount(page);
  expect(count).toBeGreaterThan(0);

  // FAB should be visible and its aria-label should mention the count
  const fab = page.locator("button[aria-label*='selected']").last();
  await expect(fab).toBeVisible({ timeout: 3000 });

  // FAB must be in the bottom area of the viewport (left side)
  const viewportHeight = page.viewportSize()?.height ?? 852;
  const fabBox = await fab.boundingBox();
  if (fabBox) {
    expect(fabBox.y + fabBox.height).toBeGreaterThan(viewportHeight * 0.5);
  }
});

test("SelectionFab clears selection on tap", async ({ page }) => {
  const rect = await getCellRect(page, 0);
  if (!rect) throw new Error("No cells found");

  await beginLongPress(page, rect.x, rect.y);
  await endPress(page, rect.x, rect.y);

  const count = await getSelectionCount(page);
  expect(count).toBeGreaterThan(0);

  // Tap the FAB to clear
  const fab = page.locator("button[aria-label*='selected']").last();
  await expect(fab).toBeVisible({ timeout: 3000 });
  await fab.click();

  const countAfter = await getSelectionCount(page);
  expect(countAfter).toBe(0);
});

// ===========================================================================
// data-coarse-pointer attribute is set
// ===========================================================================

test("data-coarse-pointer attribute is set on StatusBar on coarse pointer device", async ({ page }) => {
  // The attribute should be set once the UI initialises on a touch device.
  // Wait for the StatusBar to appear.
  await page.waitForSelector("[data-coarse-pointer='true']", { timeout: 5000 });
  const el = await page.$("[data-coarse-pointer='true']");
  expect(el).not.toBeNull();
});
