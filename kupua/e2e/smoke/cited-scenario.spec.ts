/**
 * Cited-scenario smoke test — real TEST cluster, headed.
 *
 * Scenario: two-tier mode → Last Modified (null zone) → seek 50% →
 * focus image → change sort → measure drift + flash.
 *
 * Run with server already on :3000 (start.sh --use-TEST):
 *   npm --prefix kupua run test:smoke -- cited-scenario
 */

import { test, expect, KupuaHelpers } from "../shared/helpers";
import {
  captureProbe,
  captureVisibleCells,
  waitForSettle,
  startTransitionSampling,
  stopTransitionSampling,
  measureDrift,
  analyzeFlash,
  analyzePositionFlash,
  logProbe,
  logFlash,
  logDrift,
  logPositionFlash,
} from "../shared/drift-flash-probes";
import { recordResult } from "./smoke-report";

const STABLE_UNTIL = "2026-03-04T00:00:00";

async function requireRealData(kupua: KupuaHelpers): Promise<number> {
  const store = await kupua.getStoreState();
  if (store.total < 100_000) {
    test.skip(true, `Local ES (total=${store.total}). Requires --use-TEST.`);
  }
  return store.total;
}

test.describe("Cited scenario — Last Modified null zone drift+flash", () => {
  test.describe.configure({ timeout: 180_000 });

  // MacBook Pro 14" Retina — fill the screen.
  // Do NOT set deviceScaleFactor — it causes zoom artifacts in headed Playwright.
  test.use({ viewport: { width: 1512, height: 982 } });

  test.beforeEach(async ({ kupua }) => {
    await kupua.ensureExplicitMode();
  });

  // =========================================================================
  // The exact scenario: Last Modified → seek 50% → focus → sort field change
  // =========================================================================

  test("Last Modified null-zone: seek 50% → focus → sort field change", async ({
    page,
    kupua,
  }) => {
    const testStart = Date.now();

    // 1. Navigate with corpus pin
    await kupua.gotoWithParams(`until=${STABLE_UNTIL}`);
    const total = await requireRealData(kupua);
    console.log(`\n  Total images: ${total.toLocaleString()}`);

    // 2. Switch to Last Modified — creates a large null zone
    console.log(`\n  ═══ Switching to Last Modified sort ═══`);
    await kupua.selectSort("Last modified");
    await kupua.waitForSeekComplete(30_000);
    await page.waitForTimeout(2000);

    const afterSort = await kupua.getStoreState();
    console.log(`  After sort switch: offset=${afterSort.bufferOffset}, results=${afterSort.resultsLength}`);

    // 3. Seek to 50% — should land in null zone
    console.log(`\n  ═══ Seeking to 50% ═══`);

    // Start sampling BEFORE seek to catch everything
    await startTransitionSampling(page, null);
    await kupua.seekTo(0.5);
    await page.waitForTimeout(3000);
    const seekSamples = await stopTransitionSampling(page);

    const afterSeek = await kupua.getStoreState();
    console.log(`  After seek: offset=${afterSeek.bufferOffset}, results=${afterSeek.resultsLength}`);
    console.log(`  Buffer ratio: ${(afterSeek.bufferOffset / total).toFixed(4)}`);

    // Analyze the seek+settle window for unexpected content changes
    if (seekSamples.length > 0) {
      // Check if buffer contents changed during the 3s settle window
      const uniqueFirstIds = new Set(seekSamples.filter(s => s.firstVisibleId).map(s => s.firstVisibleId));
      const uniqueOffsets = new Set(seekSamples.map(s => s.bufferOffset));
      console.log(`\n  ── Seek+settle window: ${seekSamples.length} frames, ${(seekSamples[seekSamples.length-1].timestamp - seekSamples[0].timestamp).toFixed(0)}ms ──`);
      console.log(`  Unique first-visible IDs: ${uniqueFirstIds.size}`);
      console.log(`  Unique buffer offsets: ${uniqueOffsets.size} → [${[...uniqueOffsets].join(", ")}]`);
      if (uniqueOffsets.size > 1) {
        console.log(`  ⚠ BUFFER CHANGED during settle window!`);
        // Find the transition frames
        let prevOffset = seekSamples[0].bufferOffset;
        for (const s of seekSamples) {
          if (s.bufferOffset !== prevOffset) {
            console.log(`    Frame ${s.frameIdx} (${(s.timestamp - seekSamples[0].timestamp).toFixed(0)}ms): offset ${prevOffset} → ${s.bufferOffset}, loading=${s.loading}, first=${s.firstVisibleId?.slice(0, 12)}`);
            prevOffset = s.bufferOffset;
          }
        }
      }
    }

    // 4. Focus an image WITHOUT any Playwright click/screenshot.
    // Get a visible cell's image ID from the DOM, then set focus via the
    // store directly. This avoids all Playwright viewport interaction that
    // causes zoom artifacts in headed mode.
    console.log(`\n  ═══ Focusing image ═══`);

    const visibleImageId = await page.evaluate(() => {
      const grid = document.querySelector('[aria-label="Image results grid"]') as HTMLElement;
      if (!grid) return null;
      const gridRect = grid.getBoundingClientRect();
      const cells = grid.querySelectorAll('[data-image-id]');
      const visible: string[] = [];
      for (let i = 0; i < cells.length; i++) {
        const r = cells[i].getBoundingClientRect();
        const centerY = r.top + r.height / 2;
        if (centerY > gridRect.top + 100 && centerY < gridRect.bottom - 100) {
          const id = cells[i].getAttribute('data-image-id');
          if (id) visible.push(id);
        }
      }
      if (visible.length === 0) return null;
      // Pick one from the middle of the visible set
      return visible[Math.floor(visible.length / 2)];
    });
    expect(visibleImageId).not.toBeNull();
    console.log(`  Visible image: ${visibleImageId}`);

    // Set focus via store — equivalent to clicking but no viewport side-effects
    await page.evaluate((id) => {
      const store = (window as any).__kupua_store__;
      store?.getState().setFocusedImageId(id);
    }, visibleImageId);
    await page.waitForTimeout(100);

    await startTransitionSampling(page, null);
    const focusedId = await kupua.getFocusedImageId();
    expect(focusedId).toBe(visibleImageId);
    console.log(`  Focused: ${focusedId}`);

    // Pause so the human watching headed mode can see the focus border
    await page.waitForTimeout(1500);

    // Let everything settle
    await page.waitForTimeout(1000);
    const focusSamples = await stopTransitionSampling(page);

    if (focusSamples.length > 0) {
      const uniqueOffsets = new Set(focusSamples.map(s => s.bufferOffset));
      const uniqueFirstIds = new Set(focusSamples.filter(s => s.firstVisibleId).map(s => s.firstVisibleId));
      console.log(`\n  ── Focus+settle window: ${focusSamples.length} frames, ${(focusSamples[focusSamples.length-1].timestamp - focusSamples[0].timestamp).toFixed(0)}ms ──`);
      console.log(`  Unique first-visible IDs: ${uniqueFirstIds.size}`);
      console.log(`  Unique buffer offsets: ${uniqueOffsets.size} → [${[...uniqueOffsets].join(", ")}]`);

      // Dump ALL state changes in the focus window
      let prevState = '';
      console.log(`  ── Focus window state changes ──`);
      for (const s of focusSamples) {
        const state = `offset=${s.bufferOffset} len=${s.resultsLength} scroll=${s.scrollTop.toFixed(0)} loading=${s.loading} saf=${s.safStatus} firstIdx=${s.firstVisibleGlobalIdx} lastIdx=${s.lastVisibleGlobalIdx} focus=${s.focusedImageId?.slice(0, 8) ?? 'null'} phantom=${s.phantomFocusImageId?.slice(0, 8) ?? 'null'}`;
        if (state !== prevState) {
          console.log(`    frame=${s.frameIdx} t=${(s.timestamp - focusSamples[0].timestamp).toFixed(0)}ms ${state} first=${s.firstVisibleId?.slice(0, 12)}`);
          prevState = state;
        }
      }
    }

    // 5. Capture pre-action state
    const pre = await captureProbe(page, "pre-sort-change", testStart, focusedId);
    logProbe(pre);
    const preCells = await captureVisibleCells(page);
    console.log(`  Pre cells: ${preCells.length} visible, first globalIdx=${preCells[0]?.globalIdx}`);

    // 6. Start rAF sampling, then change sort
    console.log(`\n  ═══ CHANGING SORT TO "Uploaded" — WATCH THE SCREEN ═══`);
    await startTransitionSampling(page, focusedId);

    await kupua.selectSort("Uploaded");
    await waitForSettle(page);

    const samples = await stopTransitionSampling(page);

    // 7. Capture post-action state
    const post = await captureProbe(page, "post-sort-change", testStart, focusedId);
    logProbe(post);
    const postCells = await captureVisibleCells(page);
    console.log(`  Post cells: ${postCells.length} visible, first globalIdx=${postCells[0]?.globalIdx}`);

    // 8. Analysis
    const drift = measureDrift(pre, post);
    logDrift(drift);

    const flash = analyzeFlash(
      samples,
      pre.scrollTop,
      preCells[0]?.globalIdx ?? 0,
      postCells[0]?.globalIdx ?? 0,
      total,
    );
    logFlash(flash);

    const posFlash1 = analyzePositionFlash(samples);
    logPositionFlash(posFlash1);

    // Dump the raw flash frames so we can see exactly what's happening
    const preFirst = preCells[0]?.globalIdx ?? 0;
    const postFirst = postCells[0]?.globalIdx ?? 0;
    const contentThreshold = total * 0.3;
    const flashFrames = samples.filter(s => {
      if (s.firstVisibleGlobalIdx < 0) return false;
      const distPre = Math.abs(s.firstVisibleGlobalIdx - preFirst);
      const distPost = Math.abs(s.firstVisibleGlobalIdx - postFirst);
      return distPre > contentThreshold && distPost > contentThreshold;
    });
    if (flashFrames.length > 0) {
      console.log(`\n  ── CONTENT FLASH FRAMES (${flashFrames.length}) ──`);
      console.log(`  Pre firstIdx: ${preFirst}, Post firstIdx: ${postFirst}, threshold: ${contentThreshold.toFixed(0)}`);
      for (const f of flashFrames) {
        console.log(`    frame=${f.frameIdx} t=${(f.timestamp - samples[0].timestamp).toFixed(0)}ms ` +
          `scrollTop=${f.scrollTop.toFixed(0)} offset=${f.bufferOffset} len=${f.resultsLength} ` +
          `loading=${f.loading} saf=${f.safStatus} ` +
          `first=${f.firstVisibleId?.slice(0, 12) ?? 'null'} firstIdx=${f.firstVisibleGlobalIdx} ` +
          `last=${f.lastVisibleId?.slice(0, 12) ?? 'null'} lastIdx=${f.lastVisibleGlobalIdx} ` +
          `tracked=${f.trackedInDom} trackRatio=${f.trackedViewportRatio?.toFixed(3) ?? 'N/A'}`);
      }
    }

    // Also dump ALL unique states during transition
    console.log(`\n  ── TRANSITION STATE CHANGES ──`);
    let prevState = '';
    for (const s of samples) {
      const state = `offset=${s.bufferOffset} len=${s.resultsLength} loading=${s.loading} saf=${s.safStatus} firstIdx=${s.firstVisibleGlobalIdx} focus=${s.focusedImageId?.slice(0, 8) ?? 'null'} phantom=${s.phantomFocusImageId?.slice(0, 8) ?? 'null'}`;
      if (state !== prevState) {
        console.log(`    frame=${s.frameIdx} t=${(s.timestamp - samples[0].timestamp).toFixed(0)}ms ${state}`);
        prevState = state;
      }
    }

    // 9. Report
    console.log(`\n  ════════════════════════════════════════════`);
    console.log(`  RESULTS — Last Modified → Uploaded`);
    console.log(`  ════════════════════════════════════════════`);
    console.log(`  Drift: ${drift.driftRatio.toFixed(4)} (${drift.driftPx.toFixed(1)}px)`);
    console.log(`  Column shift: ${pre.trackingColIdx} → ${post.trackingColIdx} (${post.trackingColIdx - pre.trackingColIdx})`);
    console.log(`  Row shift: ${pre.trackingRowIdx} → ${post.trackingRowIdx} (${post.trackingRowIdx - pre.trackingRowIdx})`);
    console.log(`  Position flash: ${posFlash1.flashDetected ? "YES ⚠" : "no"} (${posFlash1.distinctPositions} positions)`);
    console.log(`  Focus preserved: ${post.focusedImageId === focusedId}`);
    console.log(`  Content flash: ${flash.contentFlashDetected} (${flash.contentFlashFrames} frames)`);
    console.log(`  Total frames sampled: ${flash.totalFrames} (${flash.durationMs.toFixed(0)}ms)`);
    console.log(`  ════════════════════════════════════════════`);

    recordResult("cited-scenario-lastmod-to-uploaded", {
      total,
      focusedId,
      drift,
      flash,
      positionFlash: posFlash1,
      pre: { scrollTop: pre.scrollTop, bufferOffset: pre.bufferOffset, orderBy: pre.orderBy },
      post: { scrollTop: post.scrollTop, bufferOffset: post.bufferOffset, orderBy: post.orderBy },
      samplesCount: samples.length,
    });
  });

  // =========================================================================
  // Variant: same setup but toggle sort DIRECTION instead of field
  // =========================================================================

  test("Last Modified null-zone: seek 50% → focus → sort direction toggle", async ({
    page,
    kupua,
  }) => {
    const testStart = Date.now();

    await kupua.gotoWithParams(`until=${STABLE_UNTIL}`);
    const total = await requireRealData(kupua);

    // Switch to Last Modified
    await kupua.selectSort("Last modified");
    await kupua.waitForSeekComplete(30_000);
    await page.waitForTimeout(2000);

    // Seek to 50%
    await startTransitionSampling(page, null);
    await kupua.seekTo(0.5);
    await page.waitForTimeout(3000);
    const seekSamples = await stopTransitionSampling(page);

    const afterSeekDir = await kupua.getStoreState();
    console.log(`\n  After seek: offset=${afterSeekDir.bufferOffset}, results=${afterSeekDir.resultsLength}`);

    if (seekSamples.length > 0) {
      const uniqueOffsets = new Set(seekSamples.map(s => s.bufferOffset));
      console.log(`  Seek buffer offsets: ${uniqueOffsets.size} → [${[...uniqueOffsets].join(", ")}]`);
    }

    // Focus via store — find middle visible cell
    const visibleIdDir = await page.evaluate(() => {
      const grid = document.querySelector('[aria-label="Image results grid"]') as HTMLElement;
      if (!grid) return null;
      const gridRect = grid.getBoundingClientRect();
      const cells = grid.querySelectorAll('[data-image-id]');
      const visible: string[] = [];
      for (let i = 0; i < cells.length; i++) {
        const r = cells[i].getBoundingClientRect();
        const centerY = r.top + r.height / 2;
        if (centerY > gridRect.top + 100 && centerY < gridRect.bottom - 100) {
          const id = cells[i].getAttribute('data-image-id');
          if (id) visible.push(id);
        }
      }
      if (visible.length === 0) return null;
      return visible[Math.floor(visible.length / 2)];
    });
    expect(visibleIdDir).not.toBeNull();

    await page.evaluate((id) => {
      const store = (window as any).__kupua_store__;
      store?.getState().setFocusedImageId(id);
    }, visibleIdDir);
    await page.waitForTimeout(100);

    const focusedId = await kupua.getFocusedImageId();
    expect(focusedId).toBe(visibleIdDir);
    console.log(`\n  Focused: ${focusedId}`);
    await page.waitForTimeout(1500);

    const pre = await captureProbe(page, "pre-dir-toggle", testStart, focusedId);
    logProbe(pre);
    const preCells = await captureVisibleCells(page);

    console.log(`\n  ═══ TOGGLING SORT DIRECTION — WATCH THE SCREEN ═══`);
    await startTransitionSampling(page, focusedId);

    await kupua.toggleSortDirection();
    await waitForSettle(page);

    const samples = await stopTransitionSampling(page);

    const post = await captureProbe(page, "post-dir-toggle", testStart, focusedId);
    logProbe(post);
    const postCells = await captureVisibleCells(page);

    const drift = measureDrift(pre, post);
    logDrift(drift);

    const flash = analyzeFlash(
      samples,
      pre.scrollTop,
      preCells[0]?.globalIdx ?? 0,
      postCells[0]?.globalIdx ?? 0,
      total,
    );
    logFlash(flash);

    const posFlash2 = analyzePositionFlash(samples);
    logPositionFlash(posFlash2);

    console.log(`\n  ════════════════════════════════════════════`);
    console.log(`  RESULTS — Last Modified direction toggle`);
    console.log(`  ════════════════════════════════════════════`);
    console.log(`  Drift: ${drift.driftRatio.toFixed(4)} (${drift.driftPx.toFixed(1)}px)`);
    console.log(`  Position flash: ${posFlash2.flashDetected ? "YES ⚠" : "no"} (${posFlash2.distinctPositions} positions)`);
    console.log(`  Focus preserved: ${post.focusedImageId === focusedId}`);
    console.log(`  Content flash: ${flash.contentFlashDetected} (${flash.contentFlashFrames} frames)`);
    console.log(`  Total frames: ${flash.totalFrames}`);
    console.log(`  ════════════════════════════════════════════`);

    recordResult("cited-scenario-lastmod-dir-toggle", {
      total,
      focusedId,
      drift,
      flash,
      positionFlash: posFlash2,
      pre: { scrollTop: pre.scrollTop, bufferOffset: pre.bufferOffset },
      post: { scrollTop: post.scrollTop, bufferOffset: post.bufferOffset },
    });
  });

  // =========================================================================
  // Variant: no focus (phantom) — should we see worse behaviour?
  // =========================================================================

  test("Last Modified null-zone: seek 50% → NO focus → sort field change", async ({
    page,
    kupua,
  }) => {
    const testStart = Date.now();

    // Phantom mode — no focus ring
    await kupua.ensurePhantomMode();
    await kupua.gotoWithParams(`until=${STABLE_UNTIL}`);
    const total = await requireRealData(kupua);

    await kupua.selectSort("Last modified");
    await kupua.waitForSeekComplete(30_000);
    await page.waitForTimeout(2000);

    await kupua.seekTo(0.5);
    await page.waitForTimeout(3000);

    // In phantom mode, track the phantom focus image (centre of viewport)
    const phantomId = await page.evaluate(() => {
      const store = (window as any).__kupua_store__;
      return store?.getState()._phantomFocusImageId ?? null;
    });
    // If no phantom, pick centre visible cell as tracking reference
    const trackIdNoFocus = phantomId ?? await page.evaluate(() => {
      const grid = document.querySelector('[aria-label="Image results grid"]') as HTMLElement;
      if (!grid) return null;
      const gridRect = grid.getBoundingClientRect();
      const cells = grid.querySelectorAll('[data-image-id]');
      const visible: string[] = [];
      for (let i = 0; i < cells.length; i++) {
        const r = cells[i].getBoundingClientRect();
        const centerY = r.top + r.height / 2;
        if (centerY > gridRect.top + 100 && centerY < gridRect.bottom - 100) {
          const id = cells[i].getAttribute('data-image-id');
          if (id) visible.push(id);
        }
      }
      if (visible.length === 0) return null;
      return visible[Math.floor(visible.length / 2)];
    });
    console.log(`\n  Tracking (phantom/visible): ${trackIdNoFocus}`);

    const pre = await captureProbe(page, "pre-nofocus", testStart, trackIdNoFocus);
    logProbe(pre);
    const preCells = await captureVisibleCells(page);

    console.log(`\n  ═══ NO FOCUS — CHANGING SORT TO "Uploaded" — WATCH ═══`);
    await startTransitionSampling(page, trackIdNoFocus);

    await kupua.selectSort("Uploaded");
    await waitForSettle(page);

    const samples = await stopTransitionSampling(page);

    const post = await captureProbe(page, "post-nofocus", testStart, trackIdNoFocus);
    logProbe(post);
    const postCells = await captureVisibleCells(page);

    const flash = analyzeFlash(
      samples,
      pre.scrollTop,
      preCells[0]?.globalIdx ?? 0,
      postCells[0]?.globalIdx ?? 0,
      total,
    );
    logFlash(flash);

    // Transition state changes
    console.log(`\n  ── TRANSITION STATE CHANGES ──`);
    let prevState = "";
    for (const s of samples) {
      const state = `offset=${s.bufferOffset} len=${s.resultsLength} loading=${s.loading} saf=${s.safStatus} firstIdx=${s.firstVisibleGlobalIdx} focus=${s.focusedImageId?.slice(0, 8) ?? 'null'} phantom=${s.phantomFocusImageId?.slice(0, 8) ?? 'null'}`;
      if (state !== prevState) {
        console.log(`    frame=${s.frameIdx} t=${Math.round(s.timestamp - samples[0].timestamp)}ms ${state}`);
        prevState = state;
      }
    }

    const posFlash3 = analyzePositionFlash(samples);
    logPositionFlash(posFlash3);

    console.log(`\n  ════════════════════════════════════════════`);
    console.log(`  RESULTS — Last Modified → Uploaded (NO FOCUS)`);
    console.log(`  ════════════════════════════════════════════`);
    console.log(`  Position flash: ${posFlash3.flashDetected ? "YES ⚠" : "no"} (${posFlash3.distinctPositions} positions)`);
    console.log(`  Content flash: ${flash.contentFlashDetected} (${flash.contentFlashFrames} frames)`);
    console.log(`  Scroll flash: ${flash.scrollFlashDetected} (${flash.scrollFlashFrames} frames)`);
    console.log(`  Total frames: ${flash.totalFrames}`);
    console.log(`  ════════════════════════════════════════════`);

    recordResult("cited-scenario-lastmod-nofocus", {
      total,
      trackIdNoFocus,
      flash,
      positionFlash: posFlash3,
      pre: { scrollTop: pre.scrollTop, bufferOffset: pre.bufferOffset },
      post: { scrollTop: post.scrollTop, bufferOffset: post.bufferOffset },
    });
  });
});

// ===========================================================================
// city:Dublin — forces two-tier mode (1k < total ≤ 65k on TEST)
// ===========================================================================

test.describe("Cited scenario — city:Dublin two-tier drift+flash", () => {
  test.describe.configure({ timeout: 180_000 });

  test.use({ viewport: { width: 1512, height: 982 } });

  test.beforeEach(async ({ kupua }) => {
    await kupua.ensureExplicitMode();
  });

  test("city:Dublin two-tier: seek 50% → focus → sort field change", async ({
    page,
    kupua,
  }) => {
    const testStart = Date.now();

    // Navigate with city:Dublin query to force two-tier mode
    await kupua.gotoWithQuery("city:Dublin");
    const store = await kupua.getStoreState();
    const total = store.total;
    console.log(`\n  Total images (city:Dublin): ${total.toLocaleString()}`);

    if (total < 100) {
      test.skip(true, `Too few results (total=${total}). Requires --use-TEST.`);
    }
    if (total <= 1000) {
      console.log(`  ⚠ Buffer mode (total ≤ 1000) — not two-tier`);
    } else if (total <= 65000) {
      console.log(`  ✓ Two-tier mode (1k < total ≤ 65k)`);
    } else {
      console.log(`  ⚠ Seek mode (total > 65k) — not two-tier`);
    }

    // Switch to Last Modified
    console.log(`\n  ═══ Switching to Last Modified sort ═══`);
    await kupua.selectSort("Last modified");
    await kupua.waitForSeekComplete(30_000);
    await page.waitForTimeout(2000);

    const afterSort = await kupua.getStoreState();
    console.log(`  After sort switch: offset=${afterSort.bufferOffset}, results=${afterSort.resultsLength}`);

    // Seek to 50%
    console.log(`\n  ═══ Seeking to 50% ═══`);
    await startTransitionSampling(page, null);
    await kupua.seekTo(0.5);
    await page.waitForTimeout(3000);
    const seekSamples = await stopTransitionSampling(page);

    const afterSeek = await kupua.getStoreState();
    console.log(`  After seek: offset=${afterSeek.bufferOffset}, results=${afterSeek.resultsLength}`);
    console.log(`  Buffer ratio: ${(afterSeek.bufferOffset / total).toFixed(4)}`);

    if (seekSamples.length > 0) {
      const uniqueOffsets = new Set(seekSamples.map(s => s.bufferOffset));
      console.log(`  Seek buffer offsets: ${uniqueOffsets.size} → [${[...uniqueOffsets].join(", ")}]`);
    }

    // Focus via store — find middle visible cell
    const visibleImageId = await page.evaluate(() => {
      const grid = document.querySelector('[aria-label="Image results grid"]') as HTMLElement;
      if (!grid) return null;
      const gridRect = grid.getBoundingClientRect();
      const cells = grid.querySelectorAll('[data-image-id]');
      const visible: string[] = [];
      for (let i = 0; i < cells.length; i++) {
        const r = cells[i].getBoundingClientRect();
        const centerY = r.top + r.height / 2;
        if (centerY > gridRect.top + 100 && centerY < gridRect.bottom - 100) {
          const id = cells[i].getAttribute('data-image-id');
          if (id) visible.push(id);
        }
      }
      if (visible.length === 0) return null;
      // Pick 3rd cell of the middle row (col 2) — not leftmost
      return visible[Math.floor(visible.length / 2) + 2];
    });
    expect(visibleImageId).not.toBeNull();

    await page.evaluate((id) => {
      const store = (window as any).__kupua_store__;
      store?.getState().setFocusedImageId(id);
    }, visibleImageId);
    await page.waitForTimeout(100);

    const focusedId = await kupua.getFocusedImageId();
    expect(focusedId).toBe(visibleImageId);
    console.log(`\n  Focused: ${focusedId}`);
    await page.waitForTimeout(1500);

    // Capture pre state
    const pre = await captureProbe(page, "pre-dublin-sort", testStart, focusedId);
    logProbe(pre);
    const preCells = await captureVisibleCells(page);
    console.log(`  Pre cells: ${preCells.length} visible, first globalIdx=${preCells[0]?.globalIdx}`);

    // Change sort
    console.log(`\n  ═══ CHANGING SORT TO "Uploaded" — WATCH THE SCREEN ═══`);
    await startTransitionSampling(page, focusedId);

    await kupua.selectSort("Uploaded");
    await waitForSettle(page);

    const samples = await stopTransitionSampling(page);

    // Capture post state
    const post = await captureProbe(page, "post-dublin-sort", testStart, focusedId);
    logProbe(post);
    const postCells = await captureVisibleCells(page);
    console.log(`  Post cells: ${postCells.length} visible, first globalIdx=${postCells[0]?.globalIdx}`);

    // Analysis
    const drift = measureDrift(pre, post);
    logDrift(drift);

    const flash = analyzeFlash(
      samples,
      pre.scrollTop,
      preCells[0]?.globalIdx ?? 0,
      postCells[0]?.globalIdx ?? 0,
      total,
    );
    logFlash(flash);

    const posFlash = analyzePositionFlash(samples);
    logPositionFlash(posFlash);

    // Transition state changes
    console.log(`\n  ── TRANSITION STATE CHANGES ──`);
    let prevState = '';
    for (const s of samples) {
      const state = `offset=${s.bufferOffset} len=${s.resultsLength} loading=${s.loading} saf=${s.safStatus} firstIdx=${s.firstVisibleGlobalIdx} focus=${s.focusedImageId?.slice(0, 8) ?? 'null'} phantom=${s.phantomFocusImageId?.slice(0, 8) ?? 'null'}`;
      if (state !== prevState) {
        console.log(`    frame=${s.frameIdx} t=${(s.timestamp - samples[0].timestamp).toFixed(0)}ms ${state}`);
        prevState = state;
      }
    }

    console.log(`\n  ════════════════════════════════════════════`);
    console.log(`  RESULTS — city:Dublin Last Modified → Uploaded`);
    console.log(`  ════════════════════════════════════════════`);
    console.log(`  Total: ${total} (${total <= 1000 ? 'buffer' : total <= 65000 ? 'TWO-TIER' : 'seek'})`);
    console.log(`  Drift: ${drift.driftRatio.toFixed(4)} (${drift.driftPx.toFixed(1)}px)`);
    console.log(`  Column shift: ${pre.trackingColIdx} → ${post.trackingColIdx} (${post.trackingColIdx - pre.trackingColIdx})`);
    console.log(`  Row shift: ${pre.trackingRowIdx} → ${post.trackingRowIdx} (${post.trackingRowIdx - pre.trackingRowIdx})`);
    console.log(`  Position flash: ${posFlash.flashDetected ? "YES ⚠" : "no"} (${posFlash.distinctPositions} positions)`);
    console.log(`  Focus preserved: ${post.focusedImageId === focusedId}`);
    console.log(`  Focus in buffer: ${drift.postInBuffer}`);
    console.log(`  Content flash: ${flash.contentFlashDetected} (${flash.contentFlashFrames} frames)`);
    console.log(`  Total frames: ${flash.totalFrames} (${flash.durationMs.toFixed(0)}ms)`);
    console.log(`  ════════════════════════════════════════════`);

    recordResult("cited-scenario-dublin-sort", {
      total,
      scrollMode: total <= 1000 ? 'buffer' : total <= 65000 ? 'two-tier' : 'seek',
      focusedId,
      drift,
      flash,
      positionFlash: posFlash,
      pre: { scrollTop: pre.scrollTop, bufferOffset: pre.bufferOffset, orderBy: pre.orderBy },
      post: { scrollTop: post.scrollTop, bufferOffset: post.bufferOffset, orderBy: post.orderBy },
      samplesCount: samples.length,
    });
  });
});
