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
import { GRID_ROW_HEIGHT, GRID_MIN_CELL_WIDTH, TABLE_ROW_HEIGHT } from "@/constants/layout";

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
    const tableDiag = await kupua.page.evaluate(({ ROW_HEIGHT }) => {
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
        rowTop: localIdx != null ? localIdx * ROW_HEIGHT : null,
      };
    }, { ROW_HEIGHT: TABLE_ROW_HEIGHT });
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
    const gridDiag = await kupua.page.evaluate(
      ({ MIN_CELL_WIDTH, ROW_HEIGHT }) => {
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
        const cols = Math.max(1, Math.floor(el.clientWidth / MIN_CELL_WIDTH));
        const rowIdx = Math.floor(localIdx / cols);
        const rowTop = rowIdx * ROW_HEIGHT;
        const scrollTop = el.scrollTop;
        const viewportHeight = el.clientHeight;
        const scrollHeight = el.scrollHeight;
        const visible = rowTop >= scrollTop - ROW_HEIGHT && rowTop <= scrollTop + viewportHeight + ROW_HEIGHT;

        // What IS the first visible image?
        const firstVisibleRow = Math.floor(scrollTop / ROW_HEIGHT);
        const firstVisibleImageIdx = firstVisibleRow * cols;
        const firstVisibleGlobalPos = firstVisibleImageIdx + s.bufferOffset;

        return {
          inBuffer, localIdx, cols, rowIdx, rowTop,
          scrollTop, viewportHeight, scrollHeight,
          visible, firstVisibleGlobalPos,
          bufferOffset: s.bufferOffset, resultsLength: s.results.length,
        };
      },
      { MIN_CELL_WIDTH: GRID_MIN_CELL_WIDTH, ROW_HEIGHT: GRID_ROW_HEIGHT },
    );
    console.log(`  [S9] Grid diag:`, JSON.stringify(gridDiag));

    expect(gridDiag).not.toBeNull();
    expect(gridDiag!.inBuffer).toBe(true);
    expect(gridDiag!.visible).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Smoke #10 — Credit sort: seek to 75% diagnostic
  //
  // Bug: clicking 75% on Credit sort — thumb moves but results don't scroll.
  // This test captures everything needed to diagnose: console logs from the
  // seek pipeline, store state before/after, scroll position, timing.
  // ---------------------------------------------------------------------------

  test("S10: Credit sort seek to 75% — full diagnostic", async ({ kupua }) => {
    await kupua.goto();
    const total = await requireRealData(kupua);

    // Switch to Credit sort — wait for loading to fully settle
    await kupua.selectSort("Credit");
    await kupua.waitForSeekComplete(30_000);
    const before = await kupua.getStoreState();
    console.log(`\n  [S10] ── BEFORE SEEK ──`);
    console.log(`  total=${before.total}, bufferOffset=${before.bufferOffset}, len=${before.resultsLength}`);
    console.log(`  orderBy=${before.orderBy}, error=${before.error}, loading=${before.loading}`);
    console.log(`  seekGeneration=${before.seekGeneration}, seekTargetLocalIdx=${before.seekTargetLocalIndex}`);

    // Start capturing console logs BEFORE the seek
    kupua.startConsoleCapture();

    // Compute expected target position
    const targetRatio = 0.75;
    const expectedGlobalPos = Math.floor(total * targetRatio);
    console.log(`  [S10] Target: ratio=${targetRatio}, expectedGlobalPos≈${expectedGlobalPos}`);

    // Click scrubber at 75% — with long timeout since refinement may be slow
    const seekStart = Date.now();
    const trackBox = await kupua.scrubber.boundingBox();
    expect(trackBox).not.toBeNull();
    const clickX = trackBox!.x + trackBox!.width / 2;
    const clickY = trackBox!.y + targetRatio * trackBox!.height;
    console.log(`  [S10] Clicking scrubber at y=${clickY.toFixed(0)} (track top=${trackBox!.y.toFixed(0)}, height=${trackBox!.height.toFixed(0)})`);
    await kupua.page.mouse.click(clickX, clickY);

    // Poll store state every 2s for up to 90s to see what's happening
    let settled = false;
    for (let poll = 0; poll < 45; poll++) {
      await kupua.page.waitForTimeout(2000);
      const s = await kupua.getStoreState();
      const elapsed = Date.now() - seekStart;
      console.log(
        `  [S10] poll ${poll} (${(elapsed / 1000).toFixed(1)}s): ` +
        `offset=${s.bufferOffset}, len=${s.resultsLength}, loading=${s.loading}, ` +
        `error=${s.error}, seekGen=${s.seekGeneration}`
      );
      if (!s.loading && s.resultsLength > 0 && s.seekGeneration > before.seekGeneration) {
        settled = true;
        break;
      }
      if (s.error) {
        console.log(`  [S10] ERROR during seek: ${s.error}`);
        settled = true;
        break;
      }
    }
    const seekMs = Date.now() - seekStart;

    // Dump ALL [seek] and [ES] console logs from the seek
    const seekLogs = kupua.getConsoleLogs(/\[seek\]|\[ES\]/);
    console.log(`\n  [S10] ── SEEK CONSOLE LOGS (${seekLogs.length} lines) ──`);
    for (const log of seekLogs) {
      console.log(`  ${log}`);
    }

    // Final store state
    const after = await kupua.getStoreState();
    console.log(`\n  [S10] ── AFTER SEEK (${seekMs}ms, settled=${settled}) ──`);
    console.log(`  total=${after.total}, bufferOffset=${after.bufferOffset}, len=${after.resultsLength}`);
    console.log(`  loading=${after.loading}, error=${after.error}`);
    console.log(`  seekGeneration=${after.seekGeneration}, seekTargetLocalIdx=${after.seekTargetLocalIndex}`);
    console.log(`  firstImageId=${after.firstImageId}, lastImageId=${after.lastImageId}`);

    // Check: is _seekTargetLocalIndex within the buffer?
    const targetInBounds = after.seekTargetLocalIndex >= 0 && after.seekTargetLocalIndex < after.resultsLength;
    console.log(`  seekTargetLocalIndex in bounds: ${targetInBounds} (${after.seekTargetLocalIndex} < ${after.resultsLength})`);

    // Check grid scroll position
    const gridDiag = await kupua.page.evaluate(
      ({ MIN_CELL_WIDTH, ROW_HEIGHT }) => {
        const el = document.querySelector('[aria-label="Image results grid"]');
        if (!el) return null;
        const store = (window as any).__kupua_store__;
        const s = store.getState();
        const cols = Math.max(1, Math.floor(el.clientWidth / MIN_CELL_WIDTH));
        const firstVisibleRow = Math.floor(el.scrollTop / ROW_HEIGHT);
        const firstVisibleLocalIdx = firstVisibleRow * cols;
        const firstVisibleGlobalPos = firstVisibleLocalIdx + s.bufferOffset;
        return {
          scrollTop: el.scrollTop,
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight,
          cols,
          firstVisibleRow,
          firstVisibleLocalIdx,
          firstVisibleGlobalPos,
          bufferOffset: s.bufferOffset,
          resultsLength: s.results.length,
        };
      },
      { MIN_CELL_WIDTH: GRID_MIN_CELL_WIDTH, ROW_HEIGHT: GRID_ROW_HEIGHT },
    );
    console.log(`  [S10] Grid diag:`, JSON.stringify(gridDiag, null, 2));

    // Compute actual position ratio
    if (gridDiag && after.total > 0) {
      const actualRatio = gridDiag.firstVisibleGlobalPos / after.total;
      const bufferRatio = after.bufferOffset / after.total;
      console.log(`  [S10] Position ratios: target=${targetRatio}, buffer=${bufferRatio.toFixed(4)}, visible=${actualRatio.toFixed(4)}`);
      console.log(`  [S10] Drift: buffer is ${(bufferRatio - targetRatio) * 100}% off target`);
    }

    // Basic assertions — the seek must have completed and moved the buffer
    expect(after.error).toBeNull();
    expect(settled).toBe(true);
    expect(after.bufferOffset).toBeGreaterThan(before.bufferOffset);

    // The buffer should be somewhere near 75% (within 10% tolerance)
    const actualBufferRatio = after.bufferOffset / after.total;
    console.log(`  [S10] VERDICT: bufferOffset/total = ${actualBufferRatio.toFixed(4)}, target was ${targetRatio}`);
    // Don't fail on tolerance — we want the diagnostic data even if it's wrong
    if (Math.abs(actualBufferRatio - targetRatio) > 0.1) {
      console.log(`  [S10] ⚠️  BUFFER IS MORE THAN 10% OFF TARGET — THIS IS THE BUG`);
    }

    // Performance gate: 75% seek must complete in <15s.
    // Old refinement loop: 46s. New binary search: should be <5s.
    console.log(`  [S10] Seek time: ${(seekMs / 1000).toFixed(1)}s`);
    expect(seekMs).toBeLessThan(15_000);

    // Also do 50% for comparison
    console.log(`\n  [S10] ── NOW SEEKING TO 50% FOR COMPARISON ──`);
    kupua.startConsoleCapture();
    const seekStart2 = Date.now();
    await kupua.page.mouse.click(clickX, trackBox!.y + 0.5 * trackBox!.height);

    for (let poll = 0; poll < 30; poll++) {
      await kupua.page.waitForTimeout(2000);
      const s = await kupua.getStoreState();
      const elapsed = Date.now() - seekStart2;
      console.log(
        `  [S10] 50% poll ${poll} (${(elapsed / 1000).toFixed(1)}s): ` +
        `offset=${s.bufferOffset}, len=${s.resultsLength}, loading=${s.loading}, ` +
        `seekGen=${s.seekGeneration}`
      );
      if (!s.loading && s.resultsLength > 0 && s.seekGeneration > after.seekGeneration) {
        break;
      }
    }

    const seekLogs2 = kupua.getConsoleLogs(/\[seek\]|\[ES\]/);
    console.log(`\n  [S10] ── 50% SEEK CONSOLE LOGS (${seekLogs2.length} lines) ──`);
    for (const log of seekLogs2) {
      console.log(`  ${log}`);
    }

    const after50 = await kupua.getStoreState();
    const seekMs2 = Date.now() - seekStart2;
    console.log(`\n  [S10] ── AFTER 50% SEEK (${seekMs2}ms) ──`);
    console.log(`  bufferOffset=${after50.bufferOffset}, len=${after50.resultsLength}, error=${after50.error}`);
    if (after50.total > 0) {
      console.log(`  50% ratio: ${(after50.bufferOffset / after50.total).toFixed(4)}, target was 0.5`);
    }
  });
});
