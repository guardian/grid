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

// Block Grid API calls — same rationale as the kupua fixture in helpers.ts.
test.beforeEach(async ({ page }) => {
  await page.route("/api/**", (route) => route.fulfill({ status: 503, body: "" }));
});

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

async function getSelectionIds(page: Parameters<typeof test>[1]["page"]): Promise<string[]> {
  return page.evaluate(() => {
    const store = (window as any).__kupua_selection_store__;
    if (!store) return [];
    return Array.from(store.getState().selectedIds as Set<string>);
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

async function getFirstTouchableCellRect(
  page: Parameters<typeof test>[1]["page"],
): Promise<{ x: number; y: number; width: number; height: number }> {
  const rect = await page.locator("[data-grid-cell]").evaluateAll((cells) => {
    for (const cell of cells) {
      const bounds = cell.getBoundingClientRect();
      const x = bounds.x + bounds.width / 2;
      const y = bounds.y + bounds.height / 2;
      if (document.elementFromPoint(x, y)?.closest("[data-grid-cell]") === cell) {
        return { x, y, width: bounds.width, height: bounds.height };
      }
    }
    return null;
  });
  if (!rect) throw new Error("No touchable grid cell found");
  return rect;
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
  const rect = await getFirstTouchableCellRect(page);

  await beginLongPress(page, rect.x, rect.y);

  // Selection should have entered mode
  const count = await getSelectionCount(page);
  expect(count).toBe(1);

  await endPress(page, rect.x, rect.y);
});

test("StatusBar remains at top (not repositioned) when in selection mode on coarse pointer", async ({ page }) => {
  const rect = await getFirstTouchableCellRect(page);

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
  expect(barBox).not.toBeNull();
  expect(barBox!.y).toBeGreaterThanOrEqual(0);
  expect(barBox!.y + barBox!.height).toBeLessThan(100);
});

// ===========================================================================
// Long-press-tap (quick release = no drag)
// ===========================================================================

test("long-press-tap selects the exact visible range", async ({ page }) => {
  await page.locator('[aria-label="Image results grid"]').evaluate((grid) => {
    grid.scrollBy({ top: 150 });
  });
  await page.waitForTimeout(100);

  const range = await page.locator("[data-grid-cell]").evaluateAll((cells) => {
    const touchable = cells.flatMap((cell, index) => {
      const rect = cell.getBoundingClientRect();
      const x = rect.x + rect.width / 2;
      const y = rect.y + rect.height / 2;
      const hitCell = document.elementFromPoint(x, y)?.closest("[data-grid-cell]");
      const id = cell.getAttribute("data-image-id");
      return id && hitCell === cell ? [{ index, id }] : [];
    });
    if (touchable.length < 3) return null;
    const start = touchable[0];
    const end = touchable[2];
    return {
      startIndex: start.index,
      endIndex: end.index,
      endId: end.id,
      expectedIds: cells
        .slice(start.index, end.index + 1)
        .map((cell) => cell.getAttribute("data-image-id"))
        .filter((id): id is string => id !== null),
    };
  });
  if (!range) {
    throw new Error("Not enough touchable cells for a multi-cell range");
  }

  const rect0 = await getCellRect(page, range.startIndex);
  if (!rect0) throw new Error("Range anchor is not rendered");

  // First long-press-tap enters mode and sets the anchor.
  await beginLongPress(page, rect0.x, rect0.y);
  await endPress(page, rect0.x, rect0.y);

  // Should have 1 selected
  const count1 = await getSelectionCount(page);
  expect(count1).toBe(1);

  // Reacquire the endpoint by identity after selection mode updates the layout.
  const endpoint = page.locator(`[data-grid-cell][data-image-id="${range.endId}"]`);
  const rect1 = await endpoint.boundingBox();
  if (!rect1) throw new Error("Range endpoint is not touchable after mode entry");
  const endpointX = rect1.x + rect1.width / 2;
  const endpointY = rect1.y + rect1.height / 2;
  await beginLongPress(page, endpointX, endpointY);
  await endPress(page, endpointX, endpointY);

  await expect.poll(async () => (await getSelectionIds(page)).sort()).toEqual(
    range.expectedIds.sort(),
  );
});

// ===========================================================================
// Tickbox tap still works in selection mode (coarse pointer)
// ===========================================================================

test("tickbox tap toggles selection without triggering long-press", async ({ page }) => {
  // First enter selection mode via long-press
  const rect0 = await getFirstTouchableCellRect(page);
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

test("SelectionFab appears at bottom-right and clears selection on tap", async ({ page }) => {
  const rect = await getFirstTouchableCellRect(page);

  await beginLongPress(page, rect.x, rect.y);
  await endPress(page, rect.x, rect.y);

  expect(await getSelectionCount(page)).toBe(1);

  const fab = page.getByRole("button", { name: "Clear selection (1 selected)" });
  await expect(fab).toBeVisible({ timeout: 3000 });
  const fabBox = await fab.boundingBox();
  const viewport = page.viewportSize();
  expect(fabBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(fabBox!.x + fabBox!.width).toBeGreaterThan(viewport!.width * 0.75);
  expect(fabBox!.y + fabBox!.height).toBeGreaterThan(viewport!.height * 0.75);
  await fab.click();

  await expect.poll(() => getSelectionCount(page)).toBe(0);
  await expect(fab).not.toBeVisible();
});
