/**
 * Feature specification tests — "this UI feature does X."
 *
 * Unlike the bug-regression tests in scrubber.spec.ts and
 * buffer-corruption.spec.ts, these tests specify what features SHOULD DO,
 * not what bugs they fixed. They protect against regressions in core user
 * interactions that aren't covered by the scroll/seek/buffer test suite.
 *
 * Run:
 *   npx playwright test e2e/local/ui-features.spec.ts
 *   npx playwright test e2e/local/ui-features.spec.ts --headed
 */

import { test, expect } from "../shared/helpers";

// ===========================================================================
// Image detail — opening
// ===========================================================================

test.describe("Image detail — opening", () => {
  test("double-click on grid cell opens image detail with correct image", async ({ kupua }) => {
    await kupua.goto();

    // Note the ID of the image at position 2 (third cell)
    const targetImage = await kupua.page.evaluate(() => {
      const store = (window as any).__kupua_store__;
      return store?.getState().results[2]?.id ?? null;
    });
    expect(targetImage).not.toBeNull();

    // Double-click to open detail
    const imageId = await kupua.openDetailForNthItem(2);

    // The URL should contain ?image=<id>
    const urlImageParam = await kupua.getDetailImageId();
    expect(urlImageParam).toBe(targetImage);
    expect(imageId).toBe(targetImage);

    // The "Back to search" button should be visible
    const backButton = kupua.page.locator("button", { hasText: "Back to search" });
    await expect(backButton).toBeVisible();
  });

  test("double-click on table row opens image detail with correct image", async ({ kupua }) => {
    await kupua.goto();
    await kupua.switchToTable();

    // Note the ID of the image at position 2
    const targetImage = await kupua.page.evaluate(() => {
      const store = (window as any).__kupua_store__;
      return store?.getState().results[2]?.id ?? null;
    });
    expect(targetImage).not.toBeNull();

    // Double-click to open detail
    const imageId = await kupua.openDetailForNthItem(2);

    // The URL should contain ?image=<id>
    const urlImageParam = await kupua.getDetailImageId();
    expect(urlImageParam).toBe(targetImage);
    expect(imageId).toBe(targetImage);

    // The "Back to search" button should be visible
    const backButton = kupua.page.locator("button", { hasText: "Back to search" });
    await expect(backButton).toBeVisible();
  });
});

// ===========================================================================
// Image detail — closing and focus preservation
// ===========================================================================

test.describe("Image detail — closing", () => {
  test("Back to search button returns to grid with opened image focused and in view", async ({ kupua }) => {
    await kupua.goto();

    // Scroll down a bit so the focused image isn't at scrollTop=0
    await kupua.scrollBy(600);
    await kupua.page.waitForTimeout(200);

    // Open image detail for the 5th item
    await kupua.focusNthItem(4);
    const focusedId = await kupua.getFocusedImageId();
    expect(focusedId).not.toBeNull();
    await kupua.openDetailForNthItem(4);

    // Click "Back to search"
    await kupua.closeDetailViaButton();

    // URL should no longer have ?image=
    const imageParam = await kupua.getDetailImageId();
    expect(imageParam).toBeNull();

    // The same image should still be focused
    expect(await kupua.getFocusedImageId()).toBe(focusedId);

    // The focused image should be visible in the viewport (not scrolled out of view)
    const isVisible = await kupua.page.evaluate((fid) => {
      const store = (window as any).__kupua_store__;
      if (!store) return false;
      const s = store.getState();
      const globalPos = s.imagePositions.get(fid);
      if (globalPos == null) return false;
      const localIdx = globalPos - s.bufferOffset;

      const grid = document.querySelector('[aria-label="Image results grid"]') as HTMLElement;
      if (!grid) return false;

      const cols = Math.max(1, Math.floor(grid.clientWidth / 280));
      const rowTop = Math.floor(localIdx / cols) * 303;
      const viewportTop = grid.scrollTop - 303;
      const viewportBottom = grid.scrollTop + grid.clientHeight + 303;
      return rowTop >= viewportTop && rowTop <= viewportBottom;
    }, focusedId);

    expect(isVisible, "focused image should be visible in viewport after returning from detail").toBe(true);
  });

  test("Backspace key returns to search with image focused", async ({ kupua }) => {
    await kupua.goto();

    await kupua.openDetailForNthItem(3);
    const focusedId = await kupua.getFocusedImageId();
    expect(focusedId).not.toBeNull();

    // Press Backspace to close detail
    await kupua.closeDetailViaBackspace();

    // Back on the search page, same image focused
    const imageParam = await kupua.getDetailImageId();
    expect(imageParam).toBeNull();
    expect(await kupua.getFocusedImageId()).toBe(focusedId);
  });
});

// ===========================================================================
// Image detail — arrow key navigation
// ===========================================================================

test.describe("Image detail — navigation", () => {
  test("arrow keys navigate between images in detail view", async ({ kupua }) => {
    await kupua.goto();
    await kupua.openDetailForNthItem(2);

    // Note the starting image
    const firstImageId = await kupua.getDetailImageId();
    expect(firstImageId).not.toBeNull();

    // ArrowRight → next image
    await kupua.detailNextAndWait();
    const secondImageId = await kupua.getDetailImageId();
    expect(secondImageId).not.toBe(firstImageId);

    // ArrowRight again → third image
    await kupua.detailNextAndWait();
    const thirdImageId = await kupua.getDetailImageId();
    expect(thirdImageId).not.toBe(secondImageId);

    // ArrowLeft → back to second image
    await kupua.detailPrevAndWait();
    const backToSecond = await kupua.getDetailImageId();
    expect(backToSecond).toBe(secondImageId);
  });
});

// ===========================================================================
// Keyboard — Enter opens detail from search
// ===========================================================================

test.describe("Keyboard — Enter", () => {
  test("Enter key on focused image opens detail view", async ({ kupua }) => {
    await kupua.goto();

    // Click an image to focus it (moves focus out of the search input)
    await kupua.focusNthItem(3);
    const focusedId = await kupua.getFocusedImageId();
    expect(focusedId).not.toBeNull();

    // Press Enter to open detail
    await kupua.page.keyboard.press("Enter");
    await kupua.page.waitForFunction(
      () => new URL(window.location.href).searchParams.has("image"),
      { timeout: 5000 },
    );

    // The detail view should show the focused image
    const detailImageId = await kupua.getDetailImageId();
    expect(detailImageId).toBe(focusedId);

    // "Back to search" should be visible
    const backButton = kupua.page.locator("button", { hasText: "Back to search" });
    await expect(backButton).toBeVisible();
  });
});


// ===========================================================================
// Status bar — result count
// ===========================================================================

test.describe("Status bar", () => {
  test("result count updates when search query changes", async ({ kupua }) => {
    await kupua.goto();

    // Read the initial count from the status bar
    const statusBar = kupua.page.locator('[role="status"]');
    const initialText = await statusBar.textContent();
    expect(initialText).toContain("matches");

    // Extract the number — "10,000 matches" → 10000
    const initialCount = parseInt(initialText!.replace(/[^0-9]/g, ""), 10);
    expect(initialCount).toBeGreaterThan(0);

    // Navigate with a query filter
    await kupua.gotoWithQuery("test");

    // Read the updated count
    const filteredText = await statusBar.textContent();
    const filteredCount = parseInt(filteredText!.replace(/[^0-9]/g, ""), 10);

    // The filtered count should be smaller than the unfiltered count
    expect(filteredCount).toBeGreaterThan(0);
    expect(filteredCount).toBeLessThan(initialCount);
  });
});

// ===========================================================================
// Image detail — position counter
// ===========================================================================

test.describe("Image detail — position counter", () => {
  test("detail header shows correct position (N of total)", async ({ kupua }) => {
    await kupua.goto();

    const store = await kupua.getStoreState();
    const total = store.total;

    // Open the 3rd image (index 2, so position = 3)
    await kupua.openDetailForNthItem(2);

    // The header should show "3 of 10,000" (or whatever the total is)
    const positionText = kupua.page.locator("header").locator("span", {
      hasText: new RegExp(`3 of ${total.toLocaleString()}`),
    });
    await expect(positionText).toBeVisible();

    // Navigate to the next image
    await kupua.detailNextAndWait();

    // Position should update to "4 of ..."
    const updatedText = kupua.page.locator("header").locator("span", {
      hasText: new RegExp(`4 of ${total.toLocaleString()}`),
    });
    await expect(updatedText).toBeVisible();
  });
});

// ===========================================================================
// Panels — toggle visibility
// ===========================================================================

test.describe("Panel toggles", () => {
  test("Browse button toggles the left panel", async ({ kupua }) => {
    await kupua.goto();

    // Left panel should be hidden initially
    const leftSeparator = kupua.page.locator('[aria-label*="Resize left panel"]');
    await expect(leftSeparator).not.toBeVisible();

    // Click "Browse" to open
    const browseButton = kupua.page.locator('button[aria-label*="Browse panel"]');
    await browseButton.click();
    await kupua.page.waitForTimeout(300);

    // Left panel should now be visible (resize handle appears)
    await expect(leftSeparator).toBeVisible();

    // Click "Browse" again to close
    await browseButton.click();
    await kupua.page.waitForTimeout(300);

    // Left panel should be hidden again
    await expect(leftSeparator).not.toBeVisible();
  });

  test("Details button toggles the right panel", async ({ kupua }) => {
    await kupua.goto();

    // Right panel should be hidden initially
    const rightSeparator = kupua.page.locator('[aria-label*="Resize right panel"]');
    await expect(rightSeparator).not.toBeVisible();

    // Click "Details" to open
    const detailsButton = kupua.page.locator('button[aria-label*="Details panel"]');
    await detailsButton.click();
    await kupua.page.waitForTimeout(300);

    // Right panel should now be visible
    await expect(rightSeparator).toBeVisible();

    // Click "Details" again to close
    await detailsButton.click();
    await kupua.page.waitForTimeout(300);

    // Right panel should be hidden again
    await expect(rightSeparator).not.toBeVisible();
  });

  test("[ and ] keyboard shortcuts toggle panels", async ({ kupua }) => {
    await kupua.goto();

    const leftSeparator = kupua.page.locator('[aria-label*="Resize left panel"]');
    const rightSeparator = kupua.page.locator('[aria-label*="Resize right panel"]');

    // Click the grid to move focus out of the search input
    await kupua.focusNthItem(0);

    // Press [ to open left panel
    await kupua.page.keyboard.press("[");
    await kupua.page.waitForTimeout(300);
    await expect(leftSeparator).toBeVisible();

    // Press [ again to close
    await kupua.page.keyboard.press("[");
    await kupua.page.waitForTimeout(300);
    await expect(leftSeparator).not.toBeVisible();

    // Press ] to open right panel
    await kupua.page.keyboard.press("]");
    await kupua.page.waitForTimeout(300);
    await expect(rightSeparator).toBeVisible();

    // Press ] again to close
    await kupua.page.keyboard.press("]");
    await kupua.page.waitForTimeout(300);
    await expect(rightSeparator).not.toBeVisible();
  });
});

// ===========================================================================
// Sort — toolbar dropdown
// ===========================================================================

test.describe("Sort dropdown", () => {
  test("sort dropdown opens, shows options, and selecting one changes results", async ({ kupua }) => {
    await kupua.goto();

    // Note the first image under the default sort (Upload time)
    const store1 = await kupua.getStoreState();
    const firstImageBefore = store1.firstImageId;

    // Click the sort button to open dropdown
    const sortButton = kupua.page.locator('button[aria-haspopup="listbox"]');
    await sortButton.click();

    // Dropdown should appear with sort options
    const dropdown = kupua.page.locator('[role="listbox"][aria-label="Sort field"]');
    await expect(dropdown).toBeVisible();

    // It should contain multiple options
    const options = dropdown.locator('[role="option"]');
    const count = await options.count();
    expect(count).toBeGreaterThan(3);

    // Select "Credit" (a different sort field)
    await options.filter({ hasText: "Credit" }).click();

    // Dropdown should close
    await expect(dropdown).not.toBeVisible();

    // Wait for results to update
    await kupua.page.waitForTimeout(500);
    await kupua.waitForResults();

    // The first image should be different (different sort order)
    const store2 = await kupua.getStoreState();
    expect(store2.firstImageId).not.toBe(firstImageBefore);
    expect(store2.error).toBeNull();
  });
});

// ===========================================================================
// Sort — table column header click (primary + secondary)
// ===========================================================================

test.describe("Table column header sort", () => {
  test("clicking a sortable column header changes the primary sort", async ({ kupua }) => {
    await kupua.goto();
    await kupua.switchToTable();

    // The default sort is "Upload time" descending.
    // Find the "Credit" column header and click it.
    const creditHeader = kupua.page.locator('[role="columnheader"]', { hasText: "Credit" });
    await expect(creditHeader).toBeVisible();

    const store1 = await kupua.getStoreState();
    const firstImageBefore = store1.firstImageId;

    // Click to sort by Credit — has a 250ms delay (distinguishes from double-click)
    await creditHeader.click();
    await kupua.page.waitForTimeout(800);
    await kupua.waitForResults();

    // The Credit header should now show a sort indicator (SVG arrow icon)
    const sortIndicator = creditHeader.locator('span[aria-hidden="true"] svg');
    await expect(sortIndicator).toBeVisible();

    // aria-sort should be ascending or descending (not "none")
    const ariaSort = await creditHeader.getAttribute("aria-sort");
    expect(ariaSort === "ascending" || ariaSort === "descending").toBe(true);

    // Results should have changed
    const store2 = await kupua.getStoreState();
    expect(store2.firstImageId).not.toBe(firstImageBefore);
    expect(store2.error).toBeNull();
  });

  test("shift-clicking a column header adds a secondary sort", async ({ kupua }) => {
    await kupua.goto();
    await kupua.switchToTable();

    // First, sort by Credit (primary)
    const creditHeader = kupua.page.locator('[role="columnheader"]', { hasText: "Credit" });
    await creditHeader.click();
    await kupua.page.waitForTimeout(800);
    await kupua.waitForResults();

    // Now Shift+click "Source" to add as secondary sort
    const sourceHeader = kupua.page.locator('[role="columnheader"]', { hasText: "Source" });
    await sourceHeader.click({ modifiers: ["Shift"] });
    await kupua.page.waitForTimeout(800);
    await kupua.waitForResults();

    // Source header should show a double-arrow secondary sort indicator (two SVG arrows)
    const secondaryIndicator = sourceHeader.locator('span[aria-hidden="true"] svg');
    expect(await secondaryIndicator.count()).toBe(2);

    // Credit should still be the primary sort (single SVG arrow)
    const creditIndicator = creditHeader.locator('span[aria-hidden="true"] svg');
    await expect(creditIndicator.first()).toBeVisible();

    // No errors
    const store = await kupua.getStoreState();
    expect(store.error).toBeNull();
  });
});

// ===========================================================================
// URL state — pasting a URL with filters loads correct results
// ===========================================================================

test.describe("URL state", () => {
  test("navigating to a URL with query and sort loads the correct results", async ({ kupua }) => {
    // Navigate directly to a URL with query + custom sort
    await kupua.gotoWithParams("query=london&orderBy=credit");

    const store = await kupua.getStoreState();

    // Should have loaded results (query "london" should match something in sample data)
    expect(store.resultsLength).toBeGreaterThan(0);
    expect(store.error).toBeNull();

    // The result count should be less than the full 10k (filtered by query)
    expect(store.total).toBeLessThan(10000);
    expect(store.total).toBeGreaterThan(0);

    // The sort should be "credit" (ascending — no minus prefix)
    expect(store.orderBy).toBe("credit");

    // The status bar should reflect the filtered count
    const statusBar = kupua.page.locator('[role="status"]');
    const text = await statusBar.textContent();
    expect(text).toContain("matches");
    const displayedCount = parseInt(text!.replace(/[^0-9]/g, ""), 10);
    expect(displayedCount).toBe(store.total);
  });
});

// ===========================================================================
// Fullscreen preview — arrow navigation (Bug: skip-one-image)
// ===========================================================================

test.describe("Fullscreen preview — navigation", () => {
  test("ArrowLeft in fullscreen preview moves focus by exactly one image (no skip)", async ({ kupua }) => {
    await kupua.goto();

    // Focus an image in the middle of the grid (not the edge — avoids boundary issues)
    await kupua.focusNthItem(5);
    const beforeId = await kupua.getFocusedImageId();
    expect(beforeId).not.toBeNull();

    // Get the global position and the expected prev image
    const beforeState = await kupua.page.evaluate(() => {
      const store = (window as any).__kupua_store__;
      const s = store.getState();
      const gIdx = s.imagePositions.get(s.focusedImageId);
      const prevLocalIdx = (gIdx - 1) - s.bufferOffset;
      return {
        globalIdx: gIdx,
        expectedPrevId: s.results[prevLocalIdx]?.id ?? null,
      };
    });
    expect(beforeState.expectedPrevId).not.toBeNull();

    // Press 'f' to enter fullscreen preview
    await kupua.page.keyboard.press("f");
    // Wait for the fullscreen element to appear (FullscreenPreview uses
    // the browser Fullscreen API — headless Chromium supports it)
    await kupua.page.waitForFunction(
      () => document.fullscreenElement !== null,
      { timeout: 3000 },
    ).catch(() => {
      // If fullscreen doesn't work in this environment, skip the test
      // rather than fail with a misleading error.
      test.skip(true, "Fullscreen API not available in this environment");
    });

    // Press ArrowLeft — should move focus to exactly the previous image
    await kupua.page.keyboard.press("ArrowLeft");
    await kupua.page.waitForTimeout(200);

    // The focused image should be exactly one position back — not two
    const afterId = await kupua.getFocusedImageId();
    expect(afterId).toBe(beforeState.expectedPrevId);
    expect(afterId).not.toBe(beforeId); // sanity: it did move

    // Press ArrowRight — should return to the original image
    await kupua.page.keyboard.press("ArrowRight");
    await kupua.page.waitForTimeout(200);
    const returnedId = await kupua.getFocusedImageId();
    expect(returnedId).toBe(beforeId);

    // Exit fullscreen
    await kupua.page.keyboard.press("Escape");
  });

  test("ArrowRight in fullscreen preview moves focus by exactly one image (no skip)", async ({ kupua }) => {
    await kupua.goto();

    // Focus an image in the middle of the grid
    await kupua.focusNthItem(5);
    const beforeId = await kupua.getFocusedImageId();
    expect(beforeId).not.toBeNull();

    // Get the expected next image
    const beforeState = await kupua.page.evaluate(() => {
      const store = (window as any).__kupua_store__;
      const s = store.getState();
      const gIdx = s.imagePositions.get(s.focusedImageId);
      const nextLocalIdx = (gIdx + 1) - s.bufferOffset;
      return {
        globalIdx: gIdx,
        expectedNextId: s.results[nextLocalIdx]?.id ?? null,
      };
    });
    expect(beforeState.expectedNextId).not.toBeNull();

    // Enter fullscreen preview
    await kupua.page.keyboard.press("f");
    await kupua.page.waitForFunction(
      () => document.fullscreenElement !== null,
      { timeout: 3000 },
    ).catch(() => {
      test.skip(true, "Fullscreen API not available in this environment");
    });

    // Press ArrowRight — should move focus to exactly the next image
    await kupua.page.keyboard.press("ArrowRight");
    await kupua.page.waitForTimeout(200);

    const afterId = await kupua.getFocusedImageId();
    expect(afterId).toBe(beforeState.expectedNextId);
    expect(afterId).not.toBe(beforeId);

    // Exit fullscreen
    await kupua.page.keyboard.press("Escape");
  });
});

// ===========================================================================
// Image detail — traversal past buffer boundary
// ===========================================================================

test.describe("Image detail — buffer boundary traversal", () => {
  /**
   * Proves that arrow-key traversal in image detail works across buffer
   * boundaries — the bug that `hasNavigatedRef` was added to fix.
   *
   * Mechanism: after a seek, the buffer starts at a non-zero offset.
   * Navigating backward via ArrowLeft should trigger `extendBackward`
   * when we approach the buffer start, and pending navigation should
   * resolve when the extend completes.
   *
   * The forward direction uses the same code path (extendForward) and
   * is covered by 21 useImageTraversal unit tests. E2E only tests the
   * backward direction because it's easy to position near the backward
   * edge after a seek (seekTargetLocalIndex ≈ 100, so local index 5
   * is only 5 items from the backward edge). The forward edge is at
   * local index ~200 which requires 200 keyboard steps to reach — not
   * practical in an E2E test.
   */
  test("arrow-left past backward buffer edge triggers extend and continues navigation", async ({ kupua }) => {
    await kupua.goto();

    // Seek to ~50% so bufferOffset > 0
    await kupua.seekTo(0.5);

    const state0 = await kupua.getStoreState();
    expect(state0.bufferOffset).toBeGreaterThan(100);
    const startOffset = state0.bufferOffset;

    // Programmatically focus an image near the backward edge of the buffer
    // (local index ~5, i.e. 5 items from bufferOffset).
    const nearBackEdge = await kupua.page.evaluate(() => {
      const store = (window as any).__kupua_store__;
      const s = store.getState();
      const localIdx = 5;
      const img = s.results[localIdx];
      if (!img) return null;
      store.getState().setFocusedImageId(img.id);
      return {
        id: img.id,
        globalPos: s.imagePositions.get(img.id) ?? -1,
      };
    });
    expect(nearBackEdge).not.toBeNull();

    // Open image detail via URL navigation
    await kupua.page.goto(
      `/search?nonFree=true&image=${nearBackEdge!.id}`,
    );
    await kupua.page.waitForFunction(
      () => new URL(window.location.href).searchParams.has("image"),
      { timeout: 5000 },
    );
    await kupua.page.waitForFunction(
      () => {
        const store = (window as any).__kupua_store__;
        return store && store.getState().results.length > 0;
      },
      { timeout: 10_000 },
    );
    await kupua.page.waitForTimeout(500);

    // Navigate backward with waited steps to cross bufferOffset
    for (let i = 0; i < 15; i++) {
      try {
        await kupua.detailPrevAndWait(5000);
      } catch {
        break; // Hit dataset start or navigation stalled
      }
    }

    await kupua.page.waitForTimeout(1000);

    // Read final state
    const state1 = await kupua.page.evaluate(() => {
      const store = (window as any).__kupua_store__;
      const s = store.getState();
      return {
        bufferOffset: s.bufferOffset,
        resultsLength: s.results.length,
        focusedGlobalPos: s.focusedImageId
          ? s.imagePositions.get(s.focusedImageId) ?? -1
          : -1,
        error: s.error,
      };
    });

    // The focused image should have moved backward past the original offset
    expect(state1.focusedGlobalPos).toBeLessThan(startOffset);
    // The buffer should have extended backward
    expect(state1.bufferOffset).toBeLessThan(startOffset);
    expect(state1.error).toBeNull();
    await kupua.assertPositionsConsistent();
  });
});

// ===========================================================================
// Stability — no infinite restoreAroundCursor loop on reload
// ===========================================================================

test.describe("Stability — image detail reload", () => {
  test("reload in image detail does not cause restoreAroundCursor flood", async ({ kupua }) => {
    await kupua.goto();

    // Seek to ~50% to get a deep bufferOffset
    await kupua.seekTo(0.5);
    const preSeek = await kupua.getStoreState();
    expect(preSeek.bufferOffset).toBeGreaterThan(100);

    // Open image detail for an item at this deep position
    await kupua.openDetailForNthItem(3);
    const detailImageId = await kupua.getDetailImageId();
    expect(detailImageId).toBeTruthy();

    // Wait for things to settle before reload
    await kupua.page.waitForTimeout(1000);

    // Start console capture BEFORE reload so we catch all post-reload logs
    kupua.startConsoleCapture();

    // Reload the page — this is the scenario that triggered the infinite loop
    await kupua.page.reload({ waitUntil: "load" });

    // Wait for the page to recover: image detail should appear (URL has ?image=)
    await kupua.page.waitForFunction(
      () => new URL(window.location.href).searchParams.has("image"),
      { timeout: 10_000 },
    );

    // Wait for data to load and stabilise
    await kupua.page.waitForFunction(
      () => {
        const store = (window as any).__kupua_store__;
        if (!store) return false;
        const s = store.getState();
        return s.results.length > 0 && !s.loading;
      },
      { timeout: 15_000 },
    );

    // Give the system time to either stabilise or start looping
    await kupua.page.waitForTimeout(3000);

    // Count restoreAroundCursor log entries — should be small, not flooding.
    // A healthy reload has 1-3 restoreAroundCursor calls (initial restore +
    // possible position map reload). The infinite loop bug produced 50+ in 3s.
    const restoreLogs = kupua.getConsoleLogs(/\[restoreAroundCursor]/);
    const seekAdjustLogs = kupua.getConsoleLogs(/\[effect6-seek] ADJUSTING/);

    // Threshold: ≤10 is healthy. >15 indicates a loop.
    expect(restoreLogs.length).toBeLessThanOrEqual(10);
    expect(seekAdjustLogs.length).toBeLessThanOrEqual(10);

    // The page should still be functional — image detail should show the image
    const postReloadImageId = await kupua.getDetailImageId();
    expect(postReloadImageId).toBe(detailImageId);

    // Verify no error in the store
    const finalState = await kupua.getStoreState();
    expect(finalState.error).toBeNull();
    expect(finalState.resultsLength).toBeGreaterThan(0);
  });
});

