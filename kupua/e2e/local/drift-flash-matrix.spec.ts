/**
 * Drift & Flash detection matrix — cross-tier.
 *
 * Measures position drift AND intermediate-content flash during
 * sort changes, direction toggles, and other state transitions.
 * Runs on all three scrolling tiers (buffer / two-tier / seek)
 * via playwright.tiers.config.ts.
 *
 * Unlike tier-matrix.spec.ts (which asserts final state correctness),
 * these tests instrument the TRANSITION to detect flicker, scroll jumps,
 * and position drift that happen between two settled states.
 *
 * Run:
 *   npm --prefix kupua run test:e2e:tiers
 */

import { test, expect } from "../shared/helpers";
import {
  captureProbe,
  captureVisibleCells,
  waitForSettle,
  startTransitionSampling,
  stopTransitionSampling,
  measureDrift,
  analyzeFlash,
  logProbe,
  logFlash,
  logDrift,
} from "../shared/drift-flash-probes";

// ---------------------------------------------------------------------------
// Tier detection (same as tier-matrix.spec.ts)
// ---------------------------------------------------------------------------

type Tier = "buffer" | "two-tier" | "seek";

function getTier(testInfo: { project: { name: string } }): Tier {
  const name = testInfo.project.name;
  if (name.includes("buffer")) return "buffer";
  if (name.includes("two-tier")) return "two-tier";
  if (name.includes("seek")) return "seek";
  return "two-tier";
}

// ---------------------------------------------------------------------------
// Safety gate — refuse to run against real ES
// ---------------------------------------------------------------------------

const LOCAL_MAX_DOCS = 50_000;
let _realEsChecked = false;

async function assertNotRealEs(page: import("@playwright/test").Page) {
  if (_realEsChecked) return;
  const total = await page.evaluate(() => {
    const store = (window as any).__kupua_store__;
    return store?.getState().total ?? 0;
  });
  if (total > LOCAL_MAX_DOCS) {
    throw new Error(
      `Real ES detected (${total.toLocaleString()} docs). ` +
        `Stop --use-TEST before running tier tests.`,
    );
  }
  _realEsChecked = true;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function waitForBufferFilled(page: import("@playwright/test").Page, timeout = 30_000) {
  await page.waitForFunction(
    () => {
      const store = (window as any).__kupua_store__;
      if (!store) return false;
      const s = store.getState();
      return s.total > 0 && s.results.length >= s.total;
    },
    { timeout },
  );
}

// ===========================================================================
// Tests
// ===========================================================================

test.describe("Drift & Flash matrix", () => {
  test.describe.configure({ timeout: 60_000 });

  test.beforeEach(async ({ kupua }) => {
    await kupua.ensureExplicitMode();
  });

  // -------------------------------------------------------------------------
  // 1. THE CITED SCENARIO: seek deep → focus → sort field change
  //    Expected: focused image stays at same viewport position (no drift),
  //    no scroll-to-0 flash during transition.
  // -------------------------------------------------------------------------

  test("sort field change with focus: no drift, no flash", async ({
    page,
    kupua,
  }, testInfo) => {
    const tier = getTier(testInfo);
    const testStart = Date.now();

    await kupua.goto();
    if (tier === "buffer") await waitForBufferFilled(page);
    await assertNotRealEs(page);

    // Seek to 50%
    await kupua.seekTo(0.5);
    await page.waitForTimeout(2000);

    // Focus an image
    await kupua.focusNthItem(3);
    const focusedId = await kupua.getFocusedImageId();
    expect(focusedId).not.toBeNull();
    console.log(`\n  [${tier}] Focused: ${focusedId}`);

    // Capture pre-action state
    const pre = await captureProbe(page, "pre-sort-field", testStart, focusedId);
    logProbe(pre);
    const preCells = await captureVisibleCells(page);

    // Start rAF transition sampling
    await startTransitionSampling(page, focusedId);

    // Change sort field
    await kupua.selectSort("Credit");

    // Wait for sort-around-focus to complete
    await waitForSettle(page);

    // Stop sampling and collect
    const samples = await stopTransitionSampling(page);

    // Capture post-action state
    const post = await captureProbe(page, "post-sort-field", testStart, focusedId);
    logProbe(post);
    const postCells = await captureVisibleCells(page);

    // --- Analysis ---

    // Focus should be preserved
    expect(post.focusedImageId).toBe(focusedId);

    // Drift measurement
    const drift = measureDrift(pre, post);
    logDrift(drift);

    // Flash analysis
    const flash = analyzeFlash(
      samples,
      pre.scrollTop,
      preCells[0]?.globalIdx ?? 0,
      postCells[0]?.globalIdx ?? 0,
      pre.total,
    );
    logFlash(flash);

    // --- Assertions ---

    // The tracked image should be in the buffer after the sort
    expect(drift.postInBuffer).toBe(true);

    // Drift: viewport ratio should not shift by more than 0.15 (15% of viewport)
    // This is generous — perfect preservation would be ~0.
    console.log(
      `\n  [${tier}] DRIFT: ${drift.driftRatio.toFixed(4)} ` +
        `(${drift.driftPx.toFixed(1)}px)`,
    );
    expect(drift.driftRatio).toBeLessThan(0.15);

    // Flash: scrollTop should never drop to near-zero from a deep position
    if (pre.scrollTop > 1000) {
      console.log(
        `  [${tier}] SCROLL FLASH: ${flash.scrollFlashDetected ? "YES" : "no"} ` +
          `(${flash.scrollFlashFrames}/${flash.totalFrames} frames, ` +
          `scrollTop min=${flash.scrollTopMin.toFixed(0)})`,
      );
      expect(
        flash.scrollFlashDetected,
        `Scroll flash detected: scrollTop dropped to ${flash.scrollTopMin.toFixed(0)} ` +
          `from ${pre.scrollTop.toFixed(0)} during sort change`,
      ).toBe(false);
    }

    // Content flash: visible region should not jump to a wildly different part
    console.log(
      `  [${tier}] CONTENT FLASH: ${flash.contentFlashDetected ? "YES" : "no"} ` +
        `(${flash.contentFlashFrames}/${flash.totalFrames} frames)`,
    );
    expect(
      flash.contentFlashDetected,
      `Content flash detected: ${flash.contentFlashFrames} frames showed ` +
        `content from a different region of the dataset`,
    ).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 2. Sort direction toggle with focus (also from cited scenario)
  // -------------------------------------------------------------------------

  test("sort direction toggle with focus: no drift, no flash", async ({
    page,
    kupua,
  }, testInfo) => {
    const tier = getTier(testInfo);
    const testStart = Date.now();

    await kupua.goto();
    if (tier === "buffer") await waitForBufferFilled(page);
    await assertNotRealEs(page);

    // Seek to 50%
    await kupua.seekTo(0.5);
    await page.waitForTimeout(2000);

    // Focus an image
    await kupua.focusNthItem(3);
    const focusedId = await kupua.getFocusedImageId();
    expect(focusedId).not.toBeNull();
    console.log(`\n  [${tier}] Focused: ${focusedId}`);

    const pre = await captureProbe(page, "pre-sort-dir", testStart, focusedId);
    logProbe(pre);
    const preCells = await captureVisibleCells(page);

    await startTransitionSampling(page, focusedId);

    // Toggle sort direction (asc/desc)
    await kupua.toggleSortDirection();
    await waitForSettle(page);

    const samples = await stopTransitionSampling(page);

    const post = await captureProbe(page, "post-sort-dir", testStart, focusedId);
    logProbe(post);
    const postCells = await captureVisibleCells(page);

    expect(post.focusedImageId).toBe(focusedId);

    const drift = measureDrift(pre, post);
    logDrift(drift);

    const flash = analyzeFlash(
      samples,
      pre.scrollTop,
      preCells[0]?.globalIdx ?? 0,
      postCells[0]?.globalIdx ?? 0,
      pre.total,
    );
    logFlash(flash);

    expect(drift.postInBuffer).toBe(true);
    console.log(
      `\n  [${tier}] DRIFT: ${drift.driftRatio.toFixed(4)} (${drift.driftPx.toFixed(1)}px)`,
    );
    expect(drift.driftRatio).toBeLessThan(0.15);

    if (pre.scrollTop > 1000) {
      console.log(
        `  [${tier}] SCROLL FLASH: ${flash.scrollFlashDetected ? "YES" : "no"}`,
      );
      expect(flash.scrollFlashDetected).toBe(false);
    }
    expect(flash.contentFlashDetected).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 3. Sort change WITHOUT focus (phantom mode) — expects scroll reset but
  //    should NOT flash old content at position 0.
  //    This is the Bug-2 F1 pattern: Effect #7 eagerly scrollTop=0 while
  //    old buffer is still visible.
  // -------------------------------------------------------------------------

  test("sort change without focus: detect F1 flash pattern", async ({
    page,
    kupua,
  }, testInfo) => {
    const tier = getTier(testInfo);
    const testStart = Date.now();

    // Phantom mode — no focus ring
    await kupua.ensurePhantomMode();
    await kupua.goto();
    if (tier === "buffer") await waitForBufferFilled(page);
    await assertNotRealEs(page);

    // Seek to 50%
    await kupua.seekTo(0.5);
    await page.waitForTimeout(2000);

    // Capture pre-state (no tracked image — phantom mode)
    const pre = await captureProbe(page, "pre-sort-nofocus", testStart, null);
    logProbe(pre);
    const preCells = await captureVisibleCells(page);

    await startTransitionSampling(page, null);

    // Change sort
    await kupua.selectSort("Credit");
    await waitForSettle(page);

    const samples = await stopTransitionSampling(page);

    const post = await captureProbe(page, "post-sort-nofocus", testStart, null);
    logProbe(post);
    const postCells = await captureVisibleCells(page);

    const flash = analyzeFlash(
      samples,
      pre.scrollTop,
      preCells[0]?.globalIdx ?? 0,
      postCells[0]?.globalIdx ?? 0,
      pre.total,
    );
    logFlash(flash);

    // In phantom mode without focus, scroll SHOULD reset to top after sort.
    // But the F1 flash pattern is: scrollTop resets to 0 WHILE OLD BUFFER
    // is still visible, showing deep-position content at top of viewport.
    //
    // We detect this by checking: did visible content jump to a region
    // far from both pre (deep) and post (top)?
    //
    // Note: this test may PASS today (documenting the known flash) or FAIL.
    // Either outcome is informative.
    console.log(
      `\n  [${tier}] F1 FLASH PATTERN:`,
    );
    console.log(
      `    Scroll flash: ${flash.scrollFlashDetected ? "YES" : "no"} ` +
        `(scrollTop min=${flash.scrollTopMin.toFixed(0)}, pre=${pre.scrollTop.toFixed(0)})`,
    );
    console.log(
      `    Content flash: ${flash.contentFlashDetected ? "YES" : "no"} ` +
        `(${flash.contentFlashFrames} frames)`,
    );
    console.log(`    Total frames sampled: ${flash.totalFrames}`);

    // We don't assert pass/fail on flash here — this is a diagnostic.
    // The point is to MEASURE the F1 pattern across tiers.
    // If Bug-2 Option B is implemented, re-run to verify the flash is gone.

    // But we DO assert basic sanity: search completed, results loaded
    expect(post.resultsLength).toBeGreaterThan(0);
    expect(post.loading).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 4. Sort field change from deep seek — focus + measure transition
  //    Variant of #1 that seeks deeper and uses a different sort field,
  //    exercising more of the position-map and sort-distribution paths.
  // -------------------------------------------------------------------------

  test("sort to Taken-on from deep seek: no drift, no flash", async ({
    page,
    kupua,
  }, testInfo) => {
    const tier = getTier(testInfo);
    const testStart = Date.now();

    await kupua.goto();
    if (tier === "buffer") await waitForBufferFilled(page);
    await assertNotRealEs(page);

    // Seek to 70%
    await kupua.seekTo(0.7);
    await page.waitForTimeout(2000);

    // Focus
    await kupua.focusNthItem(5);
    const focusedId = await kupua.getFocusedImageId();
    expect(focusedId).not.toBeNull();

    const pre = await captureProbe(page, "pre-taken-on", testStart, focusedId);
    logProbe(pre);
    const preCells = await captureVisibleCells(page);

    await startTransitionSampling(page, focusedId);

    await kupua.selectSort("Taken on");
    await waitForSettle(page);

    const samples = await stopTransitionSampling(page);

    const post = await captureProbe(page, "post-taken-on", testStart, focusedId);
    logProbe(post);
    const postCells = await captureVisibleCells(page);

    expect(post.focusedImageId).toBe(focusedId);

    const drift = measureDrift(pre, post);
    logDrift(drift);

    const flash = analyzeFlash(
      samples,
      pre.scrollTop,
      preCells[0]?.globalIdx ?? 0,
      postCells[0]?.globalIdx ?? 0,
      pre.total,
    );
    logFlash(flash);

    expect(drift.postInBuffer).toBe(true);
    console.log(
      `\n  [${tier}] DRIFT: ${drift.driftRatio.toFixed(4)} (${drift.driftPx.toFixed(1)}px)`,
    );
    expect(drift.driftRatio).toBeLessThan(0.15);

    if (pre.scrollTop > 1000) {
      expect(flash.scrollFlashDetected).toBe(false);
    }
    expect(flash.contentFlashDetected).toBe(false);
  });
});
