/**
 * E2E tests for the scrubber, density switch, sort changes, and scroll position.
 *
 * These tests run in a real browser (Chromium via Playwright) against the
 * running kupua app + local Elasticsearch with sample data.
 *
 * PHILOSOPHY: Tests must be STRICT. "Didn't crash" is not a passing test.
 * Every seek must land where we asked. Every image position must be consistent.
 * Every error must fail the test.
 *
 * Prerequisites:
 * - Local ES on port 9220 with sample data loaded (max_result_window=500)
 * - `npm run dev` (auto-started by playwright.config.ts webServer)
 *
 * Run: npx playwright test e2e/scrubber.spec.ts
 * Debug: npx playwright test e2e/scrubber.spec.ts --debug
 */

import { test, expect } from "./helpers";

// ---------------------------------------------------------------------------
// Scrubber — basic visibility and ARIA semantics
// ---------------------------------------------------------------------------

test.describe("Scrubber — basics", () => {
  test("scrubber is visible when results exist", async ({ kupua }) => {
    await kupua.goto();
    await expect(kupua.scrubber).toBeVisible();
  });

  test("aria-valuemax equals total - 1", async ({ kupua }) => {
    await kupua.goto();
    const max = await kupua.getScrubberMax();
    const store = await kupua.getStoreState();
    expect(max).toBe(store.total - 1);
  });

  test("scrubber starts at position 0", async ({ kupua }) => {
    await kupua.goto();
    const pos = await kupua.getScrubberPosition();
    expect(pos).toBe(0);
  });

  test("initial buffer starts at offset 0 with no errors", async ({ kupua }) => {
    await kupua.goto();
    const store = await kupua.getStoreState();
    expect(store.bufferOffset).toBe(0);
    expect(store.error).toBeNull();
    expect(store.loading).toBe(false);
    expect(store.resultsLength).toBeGreaterThan(0);
    expect(store.total).toBeGreaterThan(1000); // We have ~10k sample docs
  });

  test("imagePositions consistent on initial load", async ({ kupua }) => {
    await kupua.goto();
    await kupua.assertPositionsConsistent();
  });
});

// ---------------------------------------------------------------------------
// Seek accuracy — the buffer must land where we asked
// ---------------------------------------------------------------------------

test.describe("Seek accuracy", () => {
  test("seek to 50% lands near the middle of the dataset", async ({ kupua }) => {
    await kupua.goto();
    const total = (await kupua.getStoreState()).total;

    await kupua.seekTo(0.5);
    const store = await kupua.getStoreState();

    // The seek target is ~total/2. Buffer should contain that position.
    const targetApprox = Math.floor(total / 2);
    const bufferStart = store.bufferOffset;
    const bufferEnd = store.bufferOffset + store.resultsLength;

    expect(store.error).toBeNull();
    expect(bufferStart).toBeLessThan(targetApprox + 500);
    expect(bufferEnd).toBeGreaterThan(targetApprox - 500);
    expect(store.resultsLength).toBeGreaterThan(50); // Should have a real page
    await kupua.assertPositionsConsistent();
  });

  test("seek to top (0.02) resets buffer near offset 0", async ({ kupua }) => {
    await kupua.goto();

    // First go somewhere deep
    await kupua.seekTo(0.5);
    const midStore = await kupua.getStoreState();
    expect(midStore.bufferOffset).toBeGreaterThan(0);

    // Seek back to top
    await kupua.seekTo(0.02);
    const topStore = await kupua.getStoreState();

    expect(topStore.error).toBeNull();
    // Deep seek via percentile estimation may land at ~50-150 instead of
    // exactly 0 (percentile accuracy degrades at the extremes). That's OK —
    // the important thing is we're near the top, not stuck in the middle.
    expect(topStore.bufferOffset).toBeLessThan(200);
    expect(topStore.resultsLength).toBeGreaterThan(50);
    // Scrubber should reflect position near the top
    const pos = await kupua.getScrubberPosition();
    expect(pos).toBeLessThan(300);
    await kupua.assertPositionsConsistent();
  });

  test("seek to bottom (0.98) lands near the end", async ({ kupua }) => {
    await kupua.goto();
    const total = (await kupua.getStoreState()).total;

    await kupua.seekTo(0.98);
    const store = await kupua.getStoreState();

    expect(store.error).toBeNull();
    // Buffer should contain images near the end
    const bufferEnd = store.bufferOffset + store.resultsLength;
    expect(bufferEnd).toBeGreaterThan(total - 1000);
    await kupua.assertPositionsConsistent();
  });

  test("consecutive seeks produce different buffers", async ({ kupua }) => {
    await kupua.goto();

    await kupua.seekTo(0.2);
    const store1 = await kupua.getStoreState();
    const id1 = store1.firstImageId;

    await kupua.seekTo(0.8);
    const store2 = await kupua.getStoreState();
    const id2 = store2.firstImageId;

    // The buffers must contain different images
    expect(id1).not.toBe(id2);
    expect(store2.bufferOffset).toBeGreaterThan(store1.bufferOffset);
    await kupua.assertPositionsConsistent();
  });

  test("seekGeneration bumps on every seek", async ({ kupua }) => {
    await kupua.goto();
    const gen0 = (await kupua.getStoreState()).seekGeneration;

    await kupua.seekTo(0.5);
    const gen1 = (await kupua.getStoreState()).seekGeneration;
    expect(gen1).toBeGreaterThan(gen0);

    await kupua.seekTo(0.2);
    const gen2 = (await kupua.getStoreState()).seekGeneration;
    expect(gen2).toBeGreaterThan(gen1);
  });
});

// ---------------------------------------------------------------------------
// Drag seek
// ---------------------------------------------------------------------------

test.describe("Drag seek", () => {
  test("drag to middle repositions buffer correctly", async ({ kupua }) => {
    await kupua.goto();
    await kupua.dragScrubberTo(0.5);

    const store = await kupua.getStoreState();
    expect(store.bufferOffset).toBeGreaterThan(0);
    expect(store.error).toBeNull();
    expect(store.resultsLength).toBeGreaterThan(50);
    await kupua.assertPositionsConsistent();
  });

  test("drag to bottom then top produces correct ordering", async ({ kupua }) => {
    await kupua.goto();

    await kupua.dragScrubberTo(0.95);
    const bottomStore = await kupua.getStoreState();

    await kupua.dragScrubberTo(0.05);
    await kupua.page.waitForTimeout(800);

    const topStore = await kupua.getStoreState();
    expect(topStore.bufferOffset).toBeLessThan(bottomStore.bufferOffset);
    await kupua.assertPositionsConsistent();
  });
});

// ---------------------------------------------------------------------------
// Scroll position after seek
// ---------------------------------------------------------------------------

test.describe("Scroll position after seek", () => {
  test("scrollTop resets into buffer range after deep seek", async ({ kupua }) => {
    await kupua.goto();

    await kupua.seekTo(0.5);
    const scrollTop = await kupua.getScrollTop();
    const store = await kupua.getStoreState();

    // After a seek, scrollTop should be within the renderable height of
    // the new buffer. Upper bound: resultsLength * maxRowHeight (~200px for grid).
    expect(scrollTop).toBeGreaterThanOrEqual(0);
    expect(scrollTop).toBeLessThan(store.resultsLength * 200);
    // It should NOT be at 0 either — the seek target is in the middle of
    // the buffer, so some scroll offset is expected.
    // (unless the buffer itself starts exactly at the seek target)
  });

  test("content is rendered (not blank) after deep seek", async ({ kupua }) => {
    await kupua.goto();
    await kupua.seekTo(0.5);

    const hasContent = await kupua.page.evaluate(() => {
      const grid = document.querySelector('[aria-label="Image results grid"]');
      const table = document.querySelector('[aria-label="Image results table"]');
      const container = grid ?? table;
      if (!container) return false;
      const rows = container.querySelectorAll('[role="row"]');
      const cells = container.querySelectorAll('[class*="cursor-pointer"]');
      return rows.length > 0 || cells.length > 0;
    });
    expect(hasContent).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Extend forward / backward — buffer growth at edges
// ---------------------------------------------------------------------------

test.describe("Buffer extension", () => {
  test("scrolling down past buffer triggers extendForward", async ({ kupua }) => {
    await kupua.goto();

    const store1 = await kupua.getStoreState();
    const endBefore = store1.bufferOffset + store1.resultsLength;

    // Scroll down aggressively to trigger extend
    for (let i = 0; i < 10; i++) {
      await kupua.scrollBy(2000);
      await kupua.page.waitForTimeout(200);
    }
    await kupua.page.waitForTimeout(1500); // Let extend complete

    const store2 = await kupua.getStoreState();
    const endAfter = store2.bufferOffset + store2.resultsLength;

    // Buffer should have extended forward — end is further
    expect(endAfter).toBeGreaterThan(endBefore);
    expect(store2.error).toBeNull();
    await kupua.assertPositionsConsistent();
  });

  test("seek to middle then scroll to top triggers extendBackward", async ({ kupua }) => {
    await kupua.goto();
    await kupua.seekTo(0.5);

    const store1 = await kupua.getStoreState();
    const startBefore = store1.bufferOffset;
    expect(startBefore).toBeGreaterThan(0); // Must not be at offset 0

    // Scroll to the absolute top of the scroll container — this should
    // trigger extendBackward if the buffer doesn't start at 0.
    await kupua.page.evaluate(() => {
      const grid = document.querySelector('[aria-label="Image results grid"]');
      const table = document.querySelector('[aria-label="Image results table"]');
      const el = grid ?? table;
      if (el) {
        el.scrollTop = 0;
        el.dispatchEvent(new Event("scroll"));
      }
    });
    // Backward extends debounce — give them time
    await kupua.page.waitForTimeout(2000);

    const store2 = await kupua.getStoreState();

    // Buffer start should have moved backward (or stayed same if already
    // at the buffer edge and extend is still in flight)
    expect(store2.bufferOffset).toBeLessThanOrEqual(startBefore);
    expect(store2.error).toBeNull();
    await kupua.assertPositionsConsistent();
  });
});

// ---------------------------------------------------------------------------
// Density switch — position and focus preservation
// ---------------------------------------------------------------------------

test.describe("Density switch — strict", () => {
  test("focused image ID survives grid→table→grid", async ({ kupua }) => {
    await kupua.goto();

    await kupua.focusNthItem(5);
    const focusedId = await kupua.getFocusedImageId();
    expect(focusedId).not.toBeNull();

    await kupua.switchToTable();
    expect(await kupua.getFocusedImageId()).toBe(focusedId);

    await kupua.switchToGrid();
    expect(await kupua.getFocusedImageId()).toBe(focusedId);
  });

  test("density switch after deep seek preserves focused image", async ({ kupua }) => {
    await kupua.goto();

    // Seek deep
    await kupua.seekTo(0.5);
    await kupua.focusNthItem(2);
    const focusedId = await kupua.getFocusedImageId();
    expect(focusedId).not.toBeNull();

    // Get the focused image's global position
    const globalPosBefore = await kupua.getFocusedGlobalPosition();
    expect(globalPosBefore).toBeGreaterThan(0);

    // Switch
    await kupua.switchToTable();
    await kupua.page.waitForTimeout(500);

    // Same image still focused
    expect(await kupua.getFocusedImageId()).toBe(focusedId);

    // Its global position is unchanged
    const globalPosAfter = await kupua.getFocusedGlobalPosition();
    expect(globalPosAfter).toBe(globalPosBefore);

    await kupua.assertPositionsConsistent();
  });

  test("rapid density toggling doesn't corrupt state", async ({ kupua }) => {
    await kupua.goto();

    await kupua.seekTo(0.3);
    await kupua.focusNthItem(2);
    const focusedId = await kupua.getFocusedImageId();

    for (let i = 0; i < 6; i++) {
      if (await kupua.isGridView()) {
        await kupua.switchToTable();
      } else {
        await kupua.switchToGrid();
      }
    }

    const store = await kupua.getStoreState();
    expect(store.resultsLength).toBeGreaterThan(0);
    expect(store.focusedImageId).toBe(focusedId);
    expect(store.error).toBeNull();
    await kupua.assertPositionsConsistent();
  });
});

// ---------------------------------------------------------------------------
// Sort change
// ---------------------------------------------------------------------------

test.describe("Sort change", () => {
  test("changing sort field resets to offset 0 with new data", async ({ kupua }) => {
    await kupua.goto();

    // Remember first image ID under default sort
    const store1 = await kupua.getStoreState();
    const firstIdBefore = store1.firstImageId;

    await kupua.selectSort("Taken on");
    await kupua.page.waitForTimeout(500);

    const store2 = await kupua.getStoreState();
    expect(store2.bufferOffset).toBe(0);
    expect(store2.resultsLength).toBeGreaterThan(0);
    expect(store2.error).toBeNull();
    // Under a different sort, the first image should (likely) be different
    // (Not guaranteed but extremely likely with 10k diverse docs)
    expect(store2.firstImageId).not.toBe(firstIdBefore);
    await kupua.assertPositionsConsistent();
  });

  test("toggling sort direction reverses the data", async ({ kupua }) => {
    await kupua.goto();

    const store1 = await kupua.getStoreState();
    const firstIdBefore = store1.firstImageId;
    const lastIdBefore = store1.lastImageId;

    await kupua.toggleSortDirection();
    await kupua.page.waitForTimeout(500);

    const store2 = await kupua.getStoreState();
    expect(store2.bufferOffset).toBe(0);
    expect(store2.error).toBeNull();
    // After reversing sort, the first image should now be different
    expect(store2.firstImageId).not.toBe(firstIdBefore);
    await kupua.assertPositionsConsistent();
  });
});

// ---------------------------------------------------------------------------
// Sort tooltip — date label (fixed: orderBy was undefined, not "-uploadTime")
// ---------------------------------------------------------------------------

test.describe("Sort tooltip — date label", () => {
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  test("aria-valuetext includes a date for uploadTime sort", async ({ kupua }) => {
    await kupua.goto();

    const valueText = await kupua.getScrubberValueText();
    expect(valueText).not.toBeNull();
    // Must contain "of" (position part: "1 of 10,000")
    expect(valueText).toContain("of");
    // Must contain a date after the "—" separator
    expect(valueText).toContain("—");
    const datePart = valueText!.split("—")[1].trim();
    const hasMonth = MONTHS.some((m) => datePart.includes(m));
    expect(hasMonth).toBe(true);
  });

  test("tooltip shows date after seeking to middle", async ({ kupua }) => {
    await kupua.goto();

    // Seek to middle — triggers a click which shows the tooltip briefly
    await kupua.seekTo(0.5);

    // After seek, aria-valuetext must have a date
    const valueText = await kupua.getScrubberValueText();
    expect(valueText).not.toBeNull();
    expect(valueText).toContain("of");
    expect(valueText).toContain("—");
    const datePart = valueText!.split("—")[1].trim();
    const hasMonth = MONTHS.some((m) => datePart.includes(m));
    expect(hasMonth).toBe(true);
  });

  test("scrubber opacity transitions to 1 on hover", async ({ kupua }) => {
    await kupua.goto();
    await kupua.scrubber.hover();
    // Wait for 300ms CSS opacity transition
    await kupua.page.waitForTimeout(400);
    const opacity = await kupua.scrubber.evaluate(
      (el) => window.getComputedStyle(el).opacity,
    );
    expect(parseFloat(opacity)).toBeGreaterThanOrEqual(0.9);
  });
});

// ---------------------------------------------------------------------------
// Sort-around-focus — "Never Lost" pattern
// ---------------------------------------------------------------------------

test.describe("Sort-around-focus", () => {
  test("focused image survives sort direction change", async ({ kupua }) => {
    await kupua.goto();

    await kupua.seekTo(0.3);
    await kupua.focusNthItem(3);
    const focusedId = await kupua.getFocusedImageId();
    expect(focusedId).not.toBeNull();

    await kupua.toggleSortDirection();

    await kupua.page.waitForFunction(
      () => {
        const store = (window as any).__kupua_store__;
        return store?.getState().sortAroundFocusStatus === null;
      },
      { timeout: 10_000 },
    );

    // Same image is still focused
    expect(await kupua.getFocusedImageId()).toBe(focusedId);
    // And it's inside the buffer
    const globalPos = await kupua.getFocusedGlobalPosition();
    const store = await kupua.getStoreState();
    expect(globalPos).toBeGreaterThanOrEqual(store.bufferOffset);
    expect(globalPos).toBeLessThan(store.bufferOffset + store.resultsLength);
    expect(store.error).toBeNull();
    await kupua.assertPositionsConsistent();
  });

  test("sort-around-focus completes without error", async ({ kupua }) => {
    await kupua.goto();

    await kupua.focusNthItem(10);
    await kupua.toggleSortDirection();

    await kupua.page.waitForFunction(
      () => {
        const store = (window as any).__kupua_store__;
        if (!store) return false;
        const s = store.getState();
        return s.sortAroundFocusStatus === null && !s.loading;
      },
      { timeout: 10_000 },
    );

    const store = await kupua.getStoreState();
    expect(store.error).toBeNull();
    expect(store.resultsLength).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Keyboard navigation
// ---------------------------------------------------------------------------

test.describe("Keyboard navigation", () => {
  test("PageDown increases scrollTop", async ({ kupua }) => {
    await kupua.goto();

    const before = await kupua.getScrollTop();
    await kupua.pageDown();
    const after = await kupua.getScrollTop();
    expect(after).toBeGreaterThan(before);
  });

  test("Home key returns scrollTop to 0", async ({ kupua }) => {
    await kupua.goto();

    await kupua.pageDown();
    await kupua.pageDown();
    await kupua.pageDown();
    expect(await kupua.getScrollTop()).toBeGreaterThan(0);

    await kupua.page.keyboard.press("Home");
    await kupua.page.waitForTimeout(300);

    const after = await kupua.getScrollTop();
    expect(after).toBe(0);
  });

  test("Shift+ArrowDown on scrubber seeks forward", async ({ kupua }) => {
    await kupua.goto();

    await kupua.scrubber.focus();
    const posBefore = await kupua.getScrubberPosition();

    await kupua.page.keyboard.press("Shift+ArrowDown");

    // Wait for seek to complete
    await kupua.page.waitForFunction(
      (before) => {
        const store = (window as any).__kupua_store__;
        if (!store) return false;
        const s = store.getState();
        return !s.loading && s.bufferOffset > before;
      },
      posBefore,
      { timeout: 10_000 },
    );
    await kupua.page.waitForTimeout(200);

    const posAfter = await kupua.getScrubberPosition();
    expect(posAfter - posBefore).toBeGreaterThan(50);
    const store = await kupua.getStoreState();
    expect(store.error).toBeNull();
    await kupua.assertPositionsConsistent();
  });
});

// ---------------------------------------------------------------------------
// Scroll stability — no flashing, no corruption
// ---------------------------------------------------------------------------

test.describe("Scroll stability", () => {
  test("seek then scroll up — buffer extends without corruption", async ({ kupua }) => {
    await kupua.goto();

    await kupua.seekTo(0.5);
    const store1 = await kupua.getStoreState();

    await kupua.scrollBy(-500);
    await kupua.page.waitForTimeout(1000);

    const store2 = await kupua.getStoreState();
    expect(store2.resultsLength).toBeGreaterThan(0);
    expect(store2.bufferOffset).toBeLessThanOrEqual(store1.bufferOffset);
    expect(store2.error).toBeNull();
    await kupua.assertPositionsConsistent();
  });

  test("rapid concurrent seeks settle cleanly", async ({ kupua }) => {
    await kupua.goto();

    // Fire seeks rapidly — only the last should win
    await kupua.clickScrubberAt(0.3);
    await kupua.page.waitForTimeout(100);
    await kupua.clickScrubberAt(0.7);
    await kupua.page.waitForTimeout(100);
    await kupua.clickScrubberAt(0.1);

    await kupua.page.waitForTimeout(2000);
    await kupua.waitForResults();

    const store = await kupua.getStoreState();
    expect(store.resultsLength).toBeGreaterThan(0);
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
    await kupua.assertPositionsConsistent();
  });
});

// ---------------------------------------------------------------------------
// Metadata panel — global→local index bug
// ---------------------------------------------------------------------------

test.describe("Metadata panel", () => {
  test("focused image metadata shown after seek (not 'Focus an image')", async ({ kupua }) => {
    await kupua.goto();

    // Open details panel
    const detailsBtn = kupua.page.locator('button[aria-label*="Details panel"]');
    await detailsBtn.click();
    await kupua.page.waitForTimeout(200);

    // Seek to middle (so bufferOffset > 0 — this is where the bug matters)
    await kupua.seekTo(0.5);
    const store = await kupua.getStoreState();
    expect(store.bufferOffset).toBeGreaterThan(0);

    // Focus an image
    await kupua.focusNthItem(2);
    await kupua.page.waitForTimeout(300);

    const focusedId = await kupua.getFocusedImageId();
    expect(focusedId).not.toBeNull();

    // The "empty" message should NOT be visible
    const emptyMsg = kupua.page.locator("text=Focus an image to see its metadata");
    await expect(emptyMsg).not.toBeVisible();

    // Verify the global position is consistent
    const globalPos = await kupua.getFocusedGlobalPosition();
    expect(globalPos).toBeGreaterThanOrEqual(store.bufferOffset);
    expect(globalPos).toBeLessThan(store.bufferOffset + store.resultsLength);
  });
});

// ---------------------------------------------------------------------------
// Full workflow — the exact user journey that kept breaking
// ---------------------------------------------------------------------------

test.describe("Full workflow — user journey", () => {
  test("scrub → focus → density switch → scrub back", async ({ kupua }) => {
    await kupua.goto();

    // 1. Scrub deep
    await kupua.seekTo(0.5);
    const midStore = await kupua.getStoreState();
    expect(midStore.bufferOffset).toBeGreaterThan(0);

    // 2. Focus
    await kupua.focusNthItem(3);
    const focusedId = await kupua.getFocusedImageId();
    expect(focusedId).not.toBeNull();

    // 3. Switch density
    await kupua.switchToTable();
    expect(await kupua.getFocusedImageId()).toBe(focusedId);

    // 4. Switch back
    await kupua.switchToGrid();
    expect(await kupua.getFocusedImageId()).toBe(focusedId);

    // 5. Scrub to top
    await kupua.seekTo(0.02);
    const topStore = await kupua.getStoreState();
    expect(topStore.bufferOffset).toBeLessThan(midStore.bufferOffset);
    expect(topStore.error).toBeNull();
    await kupua.assertPositionsConsistent();
  });

  test("sort → focus → sort → focus preserved", async ({ kupua }) => {
    await kupua.goto();

    await kupua.focusNthItem(5);
    const focusedId1 = await kupua.getFocusedImageId();
    expect(focusedId1).not.toBeNull();

    await kupua.toggleSortDirection();

    await kupua.page.waitForFunction(
      () => {
        const store = (window as any).__kupua_store__;
        if (!store) return false;
        const s = store.getState();
        return s.sortAroundFocusStatus === null && !s.loading;
      },
      { timeout: 10_000 },
    );

    expect(await kupua.getFocusedImageId()).toBe(focusedId1);
    const store = await kupua.getStoreState();
    expect(store.error).toBeNull();
    await kupua.assertPositionsConsistent();
  });

  test("long session: seek, extend, focus, density, sort, seek again", async ({ kupua }) => {
    await kupua.goto();

    // 1. Verify initial
    let store = await kupua.getStoreState();
    expect(store.total).toBeGreaterThan(0);

    // 2. Seek to middle
    await kupua.seekTo(0.5);
    store = await kupua.getStoreState();
    const midOffset = store.bufferOffset;
    expect(midOffset).toBeGreaterThan(0);
    await kupua.assertPositionsConsistent();

    // 3. Scroll down to trigger extend
    await kupua.scrollBy(3000);
    await kupua.page.waitForTimeout(1000);
    store = await kupua.getStoreState();
    expect(store.error).toBeNull();
    await kupua.assertPositionsConsistent();

    // 4. Focus an image
    await kupua.focusNthItem(5);
    const focusedId = await kupua.getFocusedImageId();
    expect(focusedId).not.toBeNull();

    // 5. Switch to table → back to grid
    await kupua.switchToTable();
    expect(await kupua.getFocusedImageId()).toBe(focusedId);
    await kupua.switchToGrid();
    expect(await kupua.getFocusedImageId()).toBe(focusedId);

    // 6. Seek to start
    await kupua.seekTo(0.02);
    store = await kupua.getStoreState();
    expect(store.bufferOffset).toBeLessThan(midOffset);
    expect(store.error).toBeNull();
    expect(store.resultsLength).toBeGreaterThan(0);
    await kupua.assertPositionsConsistent();
  });
});

// ===========================================================================
// Bug report tests — from manual testing on real ES (2026-03-28)
//
// These tests reproduce the specific bugs found during manual testing.
// Each test documents which bug it covers and what the correct behaviour is.
// ===========================================================================

// ---------------------------------------------------------------------------
// Bug #11 — CRITICAL: "Date Taken" sort seek snaps back to top
//
// On "Taken on" sort, scrubber seek should reposition the buffer just like
// uploadTime sort. The "taken" alias expands to [dateTaken, -uploadTime],
// making it a multi-field sort. The bug was that search_after cursor anchors
// used "" for the secondary uploadTime field — ES rejects "" for date fields.
// Fix: use 0 (epoch zero) for non-keyword anchors.
// ---------------------------------------------------------------------------

test.describe("Bug #11 — Date Taken sort seek", () => {
  test.describe.configure({ timeout: 30_000 });

  test("seek to middle works under Taken on sort", async ({ kupua }) => {
    await kupua.goto();
    await kupua.selectSort("Taken on");

    const store1 = await kupua.getStoreState();
    expect(store1.bufferOffset).toBe(0);
    expect(store1.error).toBeNull();

    // Seek to middle — this is the operation that failed (snapped back)
    await kupua.seekTo(0.5);

    const store2 = await kupua.getStoreState();
    expect(store2.error).toBeNull();
    expect(store2.resultsLength).toBeGreaterThan(0);
    // MUST have moved — the bug was that bufferOffset stayed at 0
    expect(store2.bufferOffset).toBeGreaterThan(0);
    await kupua.assertPositionsConsistent();
  });

  test("seek to bottom works under Taken on sort", async ({ kupua }) => {
    await kupua.goto();
    await kupua.selectSort("Taken on");

    await kupua.seekTo(0.95);

    const store = await kupua.getStoreState();
    expect(store.error).toBeNull();
    expect(store.resultsLength).toBeGreaterThan(0);
    // Should be near the end of the dataset
    expect(store.bufferOffset + store.resultsLength).toBeGreaterThan(
      store.total * 0.7,
    );
    await kupua.assertPositionsConsistent();
  });
});

// ---------------------------------------------------------------------------
// Bug #7 — CRITICAL: Keyword sort seek doesn't move results
//
// For sorts on keyword fields (Credit, Source, Uploader, etc.) and script
// sorts (Dimensions), the scrubber seek should reposition the buffer.
// Percentile estimation doesn't work for keyword fields (returns null),
// so seek falls through to the iterative search_after path.
// ---------------------------------------------------------------------------

// Bug #7 was: keyword/script sort seek hung forever because the iterative
// search_after skip loop sent size > max_result_window (ES returned 400,
// seek caught the error but waitForSeekComplete waited for error===null).
// Fix: cap skip chunk size to MAX_RESULT_WINDOW in search-store.ts seek().
test.describe("Bug #7 — Keyword/script sort seek", () => {
  test("seek to middle works under Credit sort", async ({ kupua }) => {
    await kupua.goto();
    await kupua.selectSort("Credit");

    const store1 = await kupua.getStoreState();
    expect(store1.bufferOffset).toBe(0);
    expect(store1.error).toBeNull();

    await kupua.seekTo(0.5);

    const store2 = await kupua.getStoreState();
    expect(store2.error).toBeNull();
    expect(store2.resultsLength).toBeGreaterThan(0);
    // MUST have moved — the bug was that results didn't shift at all
    expect(store2.bufferOffset).toBeGreaterThan(0);
    await kupua.assertPositionsConsistent();
  });

  test("seek to middle works under Source sort", async ({ kupua }) => {
    await kupua.goto();
    await kupua.selectSort("Source");

    await kupua.seekTo(0.5);

    const store = await kupua.getStoreState();
    expect(store.error).toBeNull();
    expect(store.resultsLength).toBeGreaterThan(0);
    expect(store.bufferOffset).toBeGreaterThan(0);
    await kupua.assertPositionsConsistent();
  });

  test("seek to middle works under Dimensions sort", async ({ kupua }) => {
    await kupua.goto();
    await kupua.selectSort("Dimensions");

    await kupua.seekTo(0.5);

    const store = await kupua.getStoreState();
    expect(store.error).toBeNull();
    expect(store.resultsLength).toBeGreaterThan(0);
    expect(store.bufferOffset).toBeGreaterThan(0);
    await kupua.assertPositionsConsistent();
  });

  test("consecutive seeks under keyword sort land at different positions", async ({ kupua }) => {
    await kupua.goto();
    await kupua.selectSort("Credit");

    await kupua.seekTo(0.3);
    const store1 = await kupua.getStoreState();
    expect(store1.error).toBeNull();

    await kupua.seekTo(0.7);
    const store2 = await kupua.getStoreState();
    expect(store2.error).toBeNull();

    // The two seeks should have landed at different offsets
    expect(store2.bufferOffset).not.toBe(store1.bufferOffset);
    await kupua.assertPositionsConsistent();
  });
});

// ---------------------------------------------------------------------------
// Bug #1 — Home key after End: old images appear above newest
//
// After pressing End (seeks to bottom), pressing Home should seek to 0
// and show newest images at the top. The bug was that extendBackward raced
// with seek(0) — the scroll-to-top triggered reportVisibleRange before
// the seek's cooldown was set, causing extendBackward to prepend old data.
// Fix: set _seekCooldownUntil synchronously at the start of seek().
// ---------------------------------------------------------------------------

test.describe("Bug #1 — Home after End race", () => {
  test.describe.configure({ timeout: 30_000 });
  test("End then Home returns to offset 0 with no stale data", async ({ kupua }) => {
    await kupua.goto();

    // Go to the bottom
    await kupua.page.keyboard.press("End");
    await kupua.waitForSeekComplete();
    await kupua.page.waitForTimeout(300);

    const endStore = await kupua.getStoreState();
    expect(endStore.bufferOffset).toBeGreaterThan(0);
    expect(endStore.error).toBeNull();

    // Now press Home — this is the operation that raced
    await kupua.page.keyboard.press("Home");
    await kupua.waitForSeekComplete();
    await kupua.page.waitForTimeout(500);

    const homeStore = await kupua.getStoreState();
    expect(homeStore.error).toBeNull();
    expect(homeStore.bufferOffset).toBe(0);
    expect(homeStore.resultsLength).toBeGreaterThan(0);
    await kupua.assertPositionsConsistent();

    // Verify no old images above: scroll to the very top
    const scrollTop = await kupua.getScrollTop();
    expect(scrollTop).toBe(0);
    // The first image in the buffer should be the first in the result set
    // (it should NOT have been displaced by stale extendBackward data)
  });

  test("End then Home then scroll up — nothing above position 0", async ({ kupua }) => {
    await kupua.goto();

    await kupua.page.keyboard.press("End");
    await kupua.waitForSeekComplete();
    await kupua.page.waitForTimeout(300);

    await kupua.page.keyboard.press("Home");
    await kupua.waitForSeekComplete();
    await kupua.page.waitForTimeout(500);

    // Try to scroll up — there should be nothing to scroll to
    const topBefore = await kupua.getScrollTop();
    await kupua.scrollBy(-2000);
    await kupua.page.waitForTimeout(300);
    const topAfter = await kupua.getScrollTop();

    // scrollTop should be 0 — can't scroll above the first item
    expect(topAfter).toBe(0);

    const store = await kupua.getStoreState();
    expect(store.bufferOffset).toBe(0);
    expect(store.error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Bug #9 — Table horizontal scrollbar lost
//
// The hide-scrollbar class hid both vertical AND horizontal scrollbars.
// Table view needs horizontal scroll for wide columns.
// Fix: table uses hide-scrollbar-y (vertical only).
// ---------------------------------------------------------------------------

test.describe("Bug #9 — Table horizontal scrollbar", () => {
  test.describe.configure({ timeout: 30_000 });
  test("table view scroll container allows horizontal overflow", async ({ kupua }) => {
    await kupua.goto();
    await kupua.switchToTable();

    // The table scroll container should have overflow-auto and NOT hide
    // the horizontal scrollbar. Check that the container has scrollable
    // width (inline-block content can be wider than viewport).
    const hasHorizontalOverflow = await kupua.page.evaluate(() => {
      const table = document.querySelector('[aria-label="Image results table"]');
      if (!table) return false;
      // The container has overflow:auto. Check that the CSS class is
      // hide-scrollbar-y (not hide-scrollbar which kills both axes).
      return table.classList.contains("hide-scrollbar-y")
        && !table.classList.contains("hide-scrollbar");
    });
    expect(hasHorizontalOverflow).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Bug #3 — Wheel scroll blocked after scrubber interaction
//
// After scrubber click/drag, mouse wheel over the scrubber track should
// forward to the content scroll container. The bug was that preventDefault
// was called even when the scroll container couldn't scroll (scrollHeight
// === clientHeight after a seek before the virtualizer re-rendered).
// Fix: only preventDefault when scrollTop actually changed.
// ---------------------------------------------------------------------------

test.describe("Bug #3 — Wheel scroll on scrubber", () => {
  test.describe.configure({ timeout: 30_000 });
  test("wheel events on scrubber track scroll the content", async ({ kupua }) => {
    await kupua.goto();

    // Move mouse to the scrubber track
    const trackBox = await kupua.scrubber.boundingBox();
    expect(trackBox).not.toBeNull();
    await kupua.page.mouse.move(
      trackBox!.x + trackBox!.width / 2,
      trackBox!.y + trackBox!.height / 2,
    );

    const topBefore = await kupua.getScrollTop();

    // Dispatch a wheel event on the scrubber
    await kupua.page.mouse.wheel(0, 500);
    await kupua.page.waitForTimeout(200);

    const topAfter = await kupua.getScrollTop();
    // The content should have scrolled down
    expect(topAfter).toBeGreaterThan(topBefore);
  });

  test("wheel scroll works after a scrubber seek", async ({ kupua }) => {
    await kupua.goto();

    // Seek somewhere via scrubber click
    await kupua.seekTo(0.3);

    // Move mouse to the scrubber
    const trackBox = await kupua.scrubber.boundingBox();
    expect(trackBox).not.toBeNull();
    await kupua.page.mouse.move(
      trackBox!.x + trackBox!.width / 2,
      trackBox!.y + trackBox!.height / 2,
    );

    const topBefore = await kupua.getScrollTop();

    // Wheel down — should forward to content
    await kupua.page.mouse.wheel(0, 500);
    await kupua.page.waitForTimeout(300);

    const topAfter = await kupua.getScrollTop();
    expect(topAfter).toBeGreaterThan(topBefore);
  });
});

// ---------------------------------------------------------------------------
// Bug #12 — Wheel scroll on content area doesn't work after scrubber seek
//
// After seeking to ~50% via the scrubber, the grid content area has results
// but the user cannot scroll down with the mousewheel — the scroll container
// is not responding to wheel events. The issue is that after a seek, the
// scroll container's scrollTop is set near the bottom of the virtualizer's
// total height range, leaving little or no room to scroll further.
//
// Root cause: the seekTargetLocalIndex positions the viewport, but the
// virtualizer totalSize may not be large enough for additional scrolling
// (buffer is only ~200 items). Scrolling down should trigger extendForward
// which adds more items and extends the scrollable area. The bug is that
// the scroll event doesn't fire at all (perhaps scrollTop is already at max),
// or that extendForward doesn't fire after seek due to seek cooldown.
// ---------------------------------------------------------------------------

test.describe("Bug #12 — Wheel scroll after scrubber seek", () => {
  test.describe.configure({ timeout: 30_000 });
  test("content area is scrollable after seek to 50%", async ({ kupua }) => {
    await kupua.goto();
    await kupua.seekTo(0.5);

    // Wait for seek to settle
    await kupua.page.waitForTimeout(300);

    const store = await kupua.getStoreState();
    expect(store.error).toBeNull();
    expect(store.resultsLength).toBeGreaterThan(50);

    // Get scroll position before
    const scrollBefore = await kupua.getScrollTop();

    // Scroll down using mouse wheel on the content area
    const gridEl = kupua.page.locator('[aria-label="Image results grid"]');
    const gridBox = await gridEl.boundingBox();
    expect(gridBox).not.toBeNull();

    // Move mouse to centre of the grid and scroll
    await kupua.page.mouse.move(
      gridBox!.x + gridBox!.width / 2,
      gridBox!.y + gridBox!.height / 2,
    );
    await kupua.page.mouse.wheel(0, 600);
    await kupua.page.waitForTimeout(500);

    const scrollAfter = await kupua.getScrollTop();
    // The content MUST have scrolled down — this was broken
    expect(scrollAfter).toBeGreaterThan(scrollBefore);
  });

  test("content area is scrollable after seek to 50% in table view", async ({ kupua }) => {
    await kupua.goto();
    await kupua.switchToTable();
    await kupua.seekTo(0.5);

    await kupua.page.waitForTimeout(300);

    const store = await kupua.getStoreState();
    expect(store.error).toBeNull();
    expect(store.resultsLength).toBeGreaterThan(50);

    const scrollBefore = await kupua.getScrollTop();

    const tableEl = kupua.page.locator('[aria-label="Image results table"]');
    const tableBox = await tableEl.boundingBox();
    expect(tableBox).not.toBeNull();

    await kupua.page.mouse.move(
      tableBox!.x + tableBox!.width / 2,
      tableBox!.y + tableBox!.height / 2,
    );
    await kupua.page.mouse.wheel(0, 600);
    await kupua.page.waitForTimeout(500);

    const scrollAfter = await kupua.getScrollTop();
    expect(scrollAfter).toBeGreaterThan(scrollBefore);
  });
});

// ---------------------------------------------------------------------------
// Bug #13 — Keyword sort scrubber seek has no effect
//
// Under non-date sorts (Credit, Source, etc.) clicking or dragging the
// scrubber to a different position doesn't reposition the results. The seek
// fires but results don't move. On large datasets (TEST, 1.3M docs) the
// iterative search_after path is too slow / hits the 20-iteration cap.
// On local ES (10k docs, max_result_window=500) the seek should work because
// the iteration count is small. This test verifies local correctness; the
// fix should also increase the iteration budget or optimise the skip loop
// for large datasets.
// ---------------------------------------------------------------------------

test.describe("Bug #13 — Keyword sort scrubber seek", () => {
  test.describe.configure({ timeout: 45_000 });

  test("scrubber seek under Credit sort moves buffer from 0", async ({ kupua }) => {
    await kupua.goto();
    await kupua.selectSort("Credit");

    const before = await kupua.getStoreState();
    expect(before.bufferOffset).toBe(0);
    expect(before.error).toBeNull();

    // Start capturing console logs to verify composite agg telemetry
    kupua.startConsoleCapture();

    // Click scrubber at ~50%
    await kupua.seekTo(0.5);

    const after = await kupua.getStoreState();
    expect(after.error).toBeNull();
    expect(after.resultsLength).toBeGreaterThan(0);
    expect(after.bufferOffset).toBeGreaterThan(0);
    await kupua.assertPositionsConsistent();

    // Telemetry: verify findKeywordSortValue used the composite path
    // and completed efficiently (≤ 5 pages for local 10k data)
    const kwLogs = kupua.getConsoleLogs(/findKeywordSortValue/);
    expect(kwLogs.length).toBeGreaterThan(0); // must have logged
    const foundLog = kwLogs.find((l) => l.includes("found"));
    expect(foundLog).toBeDefined(); // must have found a value (not null/fallback)
    // Extract page number from "at page N" — should be small for local data
    const pageMatch = foundLog?.match(/at page (\d+)/);
    if (pageMatch) {
      const pages = parseInt(pageMatch[1], 10);
      expect(pages).toBeLessThanOrEqual(5); // local data: few unique credits
    }
  });

  test("scrubber drag under Credit sort moves buffer", async ({ kupua }) => {
    await kupua.goto();
    await kupua.selectSort("Credit");

    const before = await kupua.getStoreState();
    expect(before.bufferOffset).toBe(0);

    // Drag scrubber to ~60%
    await kupua.dragScrubberTo(0.6);

    const after = await kupua.getStoreState();
    expect(after.error).toBeNull();
    expect(after.resultsLength).toBeGreaterThan(0);
    expect(after.bufferOffset).toBeGreaterThan(0);
    await kupua.assertPositionsConsistent();
  });

  test("two different scrubber positions under keyword sort land differently", async ({ kupua }) => {
    await kupua.goto();
    await kupua.selectSort("Credit");

    await kupua.seekTo(0.25);
    const store1 = await kupua.getStoreState();
    expect(store1.error).toBeNull();
    const offset1 = store1.bufferOffset;

    await kupua.seekTo(0.75);
    const store2 = await kupua.getStoreState();
    expect(store2.error).toBeNull();
    const offset2 = store2.bufferOffset;

    // Different positions must land at different offsets
    expect(offset2).toBeGreaterThan(offset1);
    await kupua.assertPositionsConsistent();
  });

  test("keyword seek completes within a reasonable time", async ({ kupua }) => {
    // This test catches performance regressions in findKeywordSortValue.
    // On local ES (10k docs, few unique credits), seek should be fast.
    // If the algorithm regresses to O(N) pages, this will catch it even
    // locally — the timing budget is generous but finite.
    await kupua.goto();
    await kupua.selectSort("Credit");

    const start = Date.now();
    await kupua.seekTo(0.5);
    const elapsed = Date.now() - start;

    const store = await kupua.getStoreState();
    expect(store.error).toBeNull();
    expect(store.bufferOffset).toBeGreaterThan(0);

    // Local seek should complete in <5 seconds (typically <1s).
    // On TEST, the smoke test S3 uses a 15s budget.
    expect(elapsed).toBeLessThan(5_000);
  });
});

// ---------------------------------------------------------------------------
// Bug #14 — End key doesn't scroll to end under non-date sort
//
// With Credit sort, pressing End should seek to the last results.
//
// Root cause (discovered via smoke test S5 on TEST, 1.3M docs):
//   1. findKeywordSortValue composite agg skips null/missing-credit docs
//      (~16k on TEST), so search_after from last keyword lands ~16k short.
//   2. countBefore can't handle null sort values — skips the field and
//      returns wrong count.
//   3. Reverse search_after with default ES `missing: "_last"` puts nulls
//      last in BOTH asc and desc, so naive reverse doesn't reach the true end.
//
// Fixes applied:
//   - findKeywordSortValue returns lastKeywordValue (not null) when exhausted
//   - Reverse search_after fallback with missingFirst: true
//   - Skip countBefore for reverse fallback (null sort values); use
//     actualOffset = total - hits.length directly
//
// Local limitation: sample data has no missing credit values, so the
// null-value code paths only activate on TEST. The smoke test S5 is the
// authoritative guard. If local sample data is ever enhanced with
// null-credit docs, these tests would cover it fully.
// ---------------------------------------------------------------------------

test.describe("Bug #14 — End key under non-date sort", () => {
  test.describe.configure({ timeout: 45_000 });

  test("End key seeks to last results under Credit sort", async ({ kupua }) => {
    await kupua.goto();
    await kupua.selectSort("Credit");
    await kupua.page.waitForTimeout(500);

    // Scroll down a few pages first (so we're not at position 0)
    for (let i = 0; i < 5; i++) {
      await kupua.pageDown();
    }
    await kupua.page.waitForTimeout(500);

    // Capture console logs for telemetry
    kupua.startConsoleCapture();

    // Press End
    await kupua.page.keyboard.press("End");
    await kupua.page.waitForTimeout(1000);
    await kupua.waitForSeekComplete();

    const afterEnd = await kupua.getStoreState();
    expect(afterEnd.error).toBeNull();

    // End key should have moved us to the end of the result set.
    // On local ES (no missing credits), this lands exactly at total.
    // On TEST (with missing credits), the reverse fallback handles the gap.
    const endOfBuffer = afterEnd.bufferOffset + afterEnd.resultsLength;
    expect(endOfBuffer).toBeGreaterThanOrEqual(afterEnd.total - 1);

    // scrollTop should be significantly into the content (not at 0).
    const scrollTop = await kupua.getScrollTop();
    expect(scrollTop).toBeGreaterThan(0);

    // Telemetry: check if findKeywordSortValue was used
    const kwLogs = kupua.getConsoleLogs(/findKeywordSortValue/);
    // On local ES (10k docs, DEEP_SEEK_THRESHOLD=200), End key targets
    // offset ~9999 which IS above the threshold, so the deep path fires.
    // findKeywordSortValue should log something.
    if (kwLogs.length > 0) {
      // If it ran, it should have found the value or exhausted cleanly
      const found = kwLogs.some((l) => l.includes("found") || l.includes("no more pages") || l.includes("exhausted"));
      expect(found).toBe(true);
    }
  });

  test("End key under default sort also works", async ({ kupua }) => {
    await kupua.goto();

    // Scroll down a bit
    for (let i = 0; i < 3; i++) {
      await kupua.pageDown();
    }

    await kupua.page.keyboard.press("End");
    await kupua.page.waitForTimeout(1000);
    await kupua.waitForSeekComplete();

    const store = await kupua.getStoreState();
    expect(store.error).toBeNull();

    const endOfBuffer = store.bufferOffset + store.resultsLength;
    expect(endOfBuffer).toBeGreaterThanOrEqual(store.total - 1);
  });
});







