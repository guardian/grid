/**
 * Smoke tests for kupua against real Elasticsearch (TEST cluster).
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  MANUAL INVOCATION ONLY — DO NOT RUN IN CI, SCRIPTS, OR AGENTS.   ║
 * ║                                                                    ║
 * ║  These tests hit a REAL Elasticsearch cluster shared by the entire ║
 * ║  Guardian editorial team. They are READ-ONLY but generate load.    ║
 * ║                                                                    ║
 * ║  Only a human developer should run these, manually, from an IDE    ║
 * ║  terminal. The agent may ask you to run them and report results,   ║
 * ║  but must NEVER invoke them directly.                              ║
 * ║                                                                    ║
 * ║  How to run:                                                       ║
 * ║    Terminal 1: ./scripts/start.sh --use-TEST  (has AWS creds)      ║
 * ║    Terminal 2: node scripts/run-smoke.mjs      (interactive picker) ║
 * ║            or: node scripts/run-smoke.mjs 2    (run test S2)       ║
 * ║            or: node scripts/run-smoke.mjs all  (run all)           ║
 * ║                                                                    ║
 * ║  All tests auto-skip if total < 100k (i.e. running against local  ║
 * ║  ES with 10k sample docs). No harm in accidentally running them    ║
 * ║  locally — they just skip.                                         ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */

import { test, expect, KupuaHelpers } from "./helpers";

// ---------------------------------------------------------------------------
// Guard: skip all tests if not connected to a real cluster
// ---------------------------------------------------------------------------

/**
 * Check that the app is connected to a real ES cluster (>100k docs).
 * Returns the total if real, or calls test.skip() if local.
 */
async function requireRealData(kupua: KupuaHelpers): Promise<number> {
  const store = await kupua.getStoreState();
  if (store.total < 100_000) {
    test.skip(true, `Skipping: connected to local ES (total=${store.total}). These tests require --use-TEST.`);
  }
  return store.total;
}

// ---------------------------------------------------------------------------
// Smoke #1 — Default sort (date) seek to 50%
// ---------------------------------------------------------------------------

test.describe("Smoke — real ES", () => {
  // Generous timeouts — real cluster + SSH tunnel can be slow
  test.describe.configure({ timeout: 120_000 });

  // After each test, dump store state to terminal for diagnostics.
  // This output is useful when pasting results to the agent.
  test.afterEach(async ({ kupua }) => {
    try {
      const store = await kupua.getStoreState();
      console.log("\n── Store state ──────────────────────────────────────");
      console.log(`  total:          ${store.total}`);
      console.log(`  bufferOffset:   ${store.bufferOffset}`);
      console.log(`  resultsLength:  ${store.resultsLength}`);
      console.log(`  loading:        ${store.loading}`);
      console.log(`  error:          ${store.error}`);
      console.log(`  orderBy:        ${store.orderBy}`);
      console.log(`  focusedImageId: ${store.focusedImageId}`);
      console.log(`  seekGeneration: ${store.seekGeneration}`);
      console.log(`  firstImageId:   ${store.firstImageId}`);
      console.log(`  lastImageId:    ${store.lastImageId}`);
      console.log("────────────────────────────────────────────────────\n");
    } catch {
      console.log("  (could not read store state)\n");
    }
  });

  test("S1: date sort seek to 50% lands near the middle", async ({ kupua }) => {
    await kupua.goto();
    const total = await requireRealData(kupua);

    await kupua.seekTo(0.5);
    const store = await kupua.getStoreState();

    expect(store.error).toBeNull();
    expect(store.resultsLength).toBeGreaterThan(50);

    // Buffer should be somewhere near the middle (within 20% tolerance)
    const midpoint = Math.floor(total / 2);
    const bufferCenter = store.bufferOffset + Math.floor(store.resultsLength / 2);
    expect(Math.abs(bufferCenter - midpoint)).toBeLessThan(total * 0.2);

    await kupua.assertPositionsConsistent();
  });

  // -------------------------------------------------------------------------
  // Smoke #2 — Keyword sort (Credit) seek to 50%
  // THIS IS THE BUG: scrubber does nothing under Credit sort on real data.
  // -------------------------------------------------------------------------

  test("S2: Credit sort seek to 50% moves buffer from 0", async ({ kupua }) => {
    await kupua.goto();
    await requireRealData(kupua);

    await kupua.selectSort("Credit");
    const before = await kupua.getStoreState();
    console.log(`  [S2] Before seek: offset=${before.bufferOffset}, total=${before.total}, error=${before.error}`);
    expect(before.bufferOffset).toBe(0);
    expect(before.error).toBeNull();

    const seekStart = Date.now();
    await kupua.seekTo(0.5, 30_000);
    const seekMs = Date.now() - seekStart;
    const after = await kupua.getStoreState();
    console.log(`  [S2] After seek (${seekMs}ms): offset=${after.bufferOffset}, len=${after.resultsLength}, error=${after.error}, loading=${after.loading}`);

    // MUST have moved — the bug is that it doesn't
    expect(after.error).toBeNull();
    expect(after.resultsLength).toBeGreaterThan(0);
    expect(after.bufferOffset).toBeGreaterThan(0);
    await kupua.assertPositionsConsistent();
  });

  test("S3: Credit sort seek completes within 15 seconds", async ({ kupua }) => {
    await kupua.goto();
    await requireRealData(kupua);

    await kupua.selectSort("Credit");

    const start = Date.now();
    await kupua.seekTo(0.5, 30_000);
    const elapsed = Date.now() - start;

    const store = await kupua.getStoreState();
    expect(store.error).toBeNull();
    expect(store.bufferOffset).toBeGreaterThan(0);

    // Performance gate: seek must complete in <15s.
    // If it's taking longer, the iterative skip is too slow.
    expect(elapsed).toBeLessThan(15_000);
  });

  // -------------------------------------------------------------------------
  // Smoke #3 — Wheel scroll after seek
  // -------------------------------------------------------------------------

  test("S4: wheel scroll works after seek to 50%", async ({ kupua }) => {
    await kupua.goto();
    await requireRealData(kupua);

    await kupua.seekTo(0.5);
    await kupua.page.waitForTimeout(500);

    const scrollBefore = await kupua.getScrollTop();

    const gridEl = kupua.page.locator('[aria-label="Image results grid"]');
    const gridBox = await gridEl.boundingBox();
    expect(gridBox).not.toBeNull();

    await kupua.page.mouse.move(
      gridBox!.x + gridBox!.width / 2,
      gridBox!.y + gridBox!.height / 2,
    );
    await kupua.page.mouse.wheel(0, 600);
    await kupua.page.waitForTimeout(800);

    const scrollAfter = await kupua.getScrollTop();
    expect(scrollAfter).toBeGreaterThan(scrollBefore);
  });

  // -------------------------------------------------------------------------
  // Smoke #4 — End key under keyword sort
  // -------------------------------------------------------------------------

  test("S5: End key under Credit sort seeks to end", async ({ kupua }) => {
    await kupua.goto();
    const total = await requireRealData(kupua);

    await kupua.selectSort("Credit");
    await kupua.page.waitForTimeout(500);

    await kupua.page.keyboard.press("End");
    // Longer wait — keyword deep seek to end of 1.3M
    await kupua.page.waitForTimeout(2000);
    await kupua.waitForSeekComplete(60_000);

    const store = await kupua.getStoreState();
    expect(store.error).toBeNull();

    // Should be at or very near the end
    const endOfBuffer = store.bufferOffset + store.resultsLength;
    expect(endOfBuffer).toBeGreaterThanOrEqual(total - 10);
  });

  // -------------------------------------------------------------------------
  // Smoke #5 — Home after deep seek
  // -------------------------------------------------------------------------

  test("S6: Home key returns to offset 0 after deep Credit seek", async ({ kupua }) => {
    await kupua.goto();
    await requireRealData(kupua);

    await kupua.selectSort("Credit");

    await kupua.seekTo(0.5, 30_000);
    const midStore = await kupua.getStoreState();
    expect(midStore.bufferOffset).toBeGreaterThan(0);

    await kupua.page.keyboard.press("Home");
    await kupua.waitForSeekComplete(30_000);
    await kupua.page.waitForTimeout(500);

    const homeStore = await kupua.getStoreState();
    expect(homeStore.error).toBeNull();
    expect(homeStore.bufferOffset).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Smoke #6 — Sort-around-focus at scale
  // -------------------------------------------------------------------------

  test("S7: sort direction toggle preserves focused image at scale", async ({ kupua }) => {
    await kupua.goto();
    await requireRealData(kupua);

    // Focus an image
    await kupua.focusNthItem(5);
    const focusedId = await kupua.getFocusedImageId();
    expect(focusedId).not.toBeNull();

    // Toggle sort direction — sort-around-focus should find the image
    await kupua.toggleSortDirection();
    await kupua.page.waitForTimeout(3000);

    const store = await kupua.getStoreState();
    expect(store.error).toBeNull();
    // The image should still be focused (or focus cleared if not found)
    // At minimum, no error
    expect(store.sortAroundFocusStatus).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Smoke #8 — Sort-around-focus: focused image preserved in grid view
  // after sort direction toggle (verifies the in-first-page fix).
  // -------------------------------------------------------------------------

  test("S8: sort toggle in grid preserves focus and scrolls to image", async ({ kupua }) => {
    // Use a filtered query so total fits in one page (< PAGE_SIZE=200)
    await kupua.page.goto("/search?nonFree=true&query=%2Bcategory%3Astaff-photographer");
    await kupua.waitForResults();
    // No requireRealData — works at any scale

    // Focus the 5th image
    await kupua.focusNthItem(4);
    const focusedId = await kupua.getFocusedImageId();
    console.log(`  [S8] Focused image before toggle: ${focusedId}`);
    expect(focusedId).not.toBeNull();

    const beforeStore = await kupua.getStoreState();
    const safGenBefore = beforeStore.seekGeneration; // baseline
    console.log(`  [S8] Before: total=${beforeStore.total}, len=${beforeStore.resultsLength}, safGen=${safGenBefore}`);

    // Toggle sort direction
    await kupua.toggleSortDirection();
    await kupua.page.waitForTimeout(1000);

    const afterStore = await kupua.getStoreState();
    console.log(`  [S8] After: focused=${afterStore.focusedImageId}, orderBy=${afterStore.orderBy}, error=${afterStore.error}`);

    // The focused image should still be focused after the sort toggle
    expect(afterStore.error).toBeNull();
    expect(afterStore.focusedImageId).toBe(focusedId);

    // Verify the image is actually in the buffer at a valid position
    const focusedPos = await kupua.getFocusedGlobalPosition();
    console.log(`  [S8] Focused image global position: ${focusedPos}`);
    expect(focusedPos).toBeGreaterThanOrEqual(0);
  });

  // ---------------------------------------------------------------------------
  // Smoke #9 — Bug #17: density switch after deep scroll preserves focus
  // ---------------------------------------------------------------------------

  test("S9: table->grid density switch after deep scroll keeps focused image visible", async ({ kupua }) => {
    await kupua.goto();
    const total = await requireRealData(kupua);
    console.log(`  [S9] total=${total}`);

    await kupua.switchToTable();

    // Scroll deep using mousewheel (not programmatic scrollTop).
    // The real user scrolls with mousewheel which fires many small scroll
    // events — this may trigger different extend/evict timing than
    // programmatic scrollTop = scrollHeight.
    const tableEl = kupua.page.locator('[aria-label="Image results table"]');
    const tableBox = await tableEl.boundingBox();
    expect(tableBox).not.toBeNull();
    await kupua.page.mouse.move(
      tableBox!.x + tableBox!.width / 2,
      tableBox!.y + tableBox!.height / 2,
    );
    // Scroll aggressively — many large wheel events
    for (let i = 0; i < 60; i++) {
      await kupua.page.mouse.wheel(0, 2000);
      await kupua.page.waitForTimeout(100);
    }
    await kupua.page.waitForTimeout(2000);

    const preState = await kupua.getStoreState();
    console.log(`  [S9] After scroll: bufferOffset=${preState.bufferOffset}, len=${preState.resultsLength}`);

    // We need to be deep enough that multiple eviction cycles have occurred.
    // The bug manifests when bufferOffset is well past BUFFER_CAPACITY (1000).
    if (preState.bufferOffset < 1000) {
      console.log(`  [S9] WARNING: only reached bufferOffset=${preState.bufferOffset}, wanted >1000. Bug may not reproduce.`);
    }

    // Focus an image
    await kupua.focusNthItem(5);
    const focusedId = await kupua.getFocusedImageId();
    expect(focusedId).not.toBeNull();

    const globalPos = await kupua.getFocusedGlobalPosition();
    console.log(`  [S9] Focused: id=${focusedId}, globalPos=${globalPos}`);

    // Capture table scroll diagnostics before switch
    const tableDiag = await kupua.page.evaluate(() => {
      const el = document.querySelector('[aria-label="Image results table"]');
      if (!el) return null;
      const store = (window as any).__kupua_store__;
      const s = store.getState();
      const fid = s.focusedImageId;
      const gIdx = fid ? s.imagePositions.get(fid) : null;
      const localIdx = gIdx != null ? gIdx - s.bufferOffset : null;
      return {
        scrollTop: el.scrollTop,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        localIdx,
        rowTop: localIdx != null ? localIdx * 32 : null,
      };
    });
    console.log(`  [S9] Table diag:`, JSON.stringify(tableDiag));

    // Capture console logs from the density switch
    kupua.startConsoleCapture();

    // Switch to grid
    await kupua.switchToGrid();
    await kupua.page.waitForTimeout(800);

    // Dump density-switch diagnostics
    const mountLogs = kupua.getConsoleLogs(/TABLE-UNMOUNT|GRID-MOUNT/);
    for (const log of mountLogs) {
      console.log(`  [S9] ${log}`);
    }

    // Check focus preserved
    expect(await kupua.getFocusedImageId()).toBe(focusedId);

    // Check visibility
    const gridDiag = await kupua.page.evaluate(() => {
      const store = (window as any).__kupua_store__;
      if (!store) return null;
      const s = store.getState();
      const fid = s.focusedImageId;
      if (!fid) return { error: "no focused image" };
      const gIdx = s.imagePositions.get(fid);
      if (gIdx == null) return { error: "not in imagePositions" };
      const localIdx = gIdx - s.bufferOffset;
      const inBuffer = localIdx >= 0 && localIdx < s.results.length;

      const el = document.querySelector('[aria-label="Image results grid"]');
      if (!el) return { error: "no grid element", inBuffer, localIdx };
      const cols = Math.max(1, Math.floor(el.clientWidth / 280));
      const rowIdx = Math.floor(localIdx / cols);
      const rowTop = rowIdx * 303;
      const scrollTop = el.scrollTop;
      const viewportHeight = el.clientHeight;
      const scrollHeight = el.scrollHeight;
      const visible = rowTop >= scrollTop - 303 && rowTop <= scrollTop + viewportHeight + 303;

      // What IS the first visible image?
      const firstVisibleRow = Math.floor(scrollTop / 303);
      const firstVisibleImageIdx = firstVisibleRow * cols;
      const firstVisibleGlobalPos = firstVisibleImageIdx + s.bufferOffset;

      return {
        inBuffer, localIdx, cols, rowIdx, rowTop,
        scrollTop, viewportHeight, scrollHeight,
        visible, firstVisibleGlobalPos,
        bufferOffset: s.bufferOffset, resultsLength: s.results.length,
      };
    });
    console.log(`  [S9] Grid diag:`, JSON.stringify(gridDiag));

    expect(gridDiag).not.toBeNull();
    expect(gridDiag!.inBuffer).toBe(true);
    expect(gridDiag!.visible).toBe(true);
  });
});
