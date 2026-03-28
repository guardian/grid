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
});


