/**
 * Flash measurement — 3 reproducible flash sites × 3 scroll modes.
 *
 * Measures drift (vertical AND horizontal), content flash, scroll flash,
 * and position flash at the three highest-severity sites from the audit
 * (position-preservation-audit-findings.md § Section 7):
 *
 *   Site #1 — Sort change, no focus, deep scroll (sev 3, family F1)
 *   Site #8 — Density toggle at deep scroll (sev 2, family F3)
 *   Site #9 — Popstate without snapshot (sev 2, family F1)
 *
 * Each site is tested across all three scroll modes:
 *   Buffer (<1k)   — keyword:"mid length half celebration" (958 results)
 *   Two-tier (14k) — city:Dublin
 *   Seek (1.3M)    — unfiltered
 *
 * Run with server on :3000 (start.sh --use-TEST):
 *   npm --prefix kupua run test:smoke -- flash-measurement
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

// ---------------------------------------------------------------------------
// Corpus definitions — one per scroll mode
// ---------------------------------------------------------------------------

interface Corpus {
  label: string;
  mode: "buffer" | "two-tier" | "seek";
  nav: (kupua: KupuaHelpers) => Promise<void>;
  /** Minimum expected total to validate we're in the right mode */
  minTotal: number;
  maxTotal: number;
  /** Seek ratio to get deep — buffer mode uses scroll instead */
  seekRatio: number;
}

const CORPORA: Corpus[] = [
  {
    label: "Buffer (958)",
    mode: "buffer",
    nav: async (k) => k.gotoWithParams(`query=${encodeURIComponent('keyword:"mid length half celebration"')}&until=${STABLE_UNTIL}`),
    minTotal: 100,
    maxTotal: 1000,
    seekRatio: 0.5,
  },
  {
    label: "Two-tier (14k Dublin)",
    mode: "two-tier",
    nav: async (k) => k.gotoWithParams(`query=${encodeURIComponent("city:Dublin")}&until=${STABLE_UNTIL}`),
    minTotal: 1001,
    maxTotal: 65_000,
    seekRatio: 0.5,
  },
  {
    label: "Seek (1.3M)",
    mode: "seek",
    nav: async (k) => k.gotoWithParams(`until=${STABLE_UNTIL}`),
    minTotal: 100_000,
    maxTotal: Infinity,
    seekRatio: 0.5,
  },
];

// ---------------------------------------------------------------------------
// Shared: find a visible image near viewport centre and return its ID
// ---------------------------------------------------------------------------

async function findCentreVisibleImage(page: import("@playwright/test").Page): Promise<string> {
  const id = await page.evaluate(() => {
    const grid = document.querySelector('[aria-label="Image results grid"]') as HTMLElement;
    const table = document.querySelector('[aria-label="Image results table"]') as HTMLElement;
    const container = (grid ?? table);
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    const cells = container.querySelectorAll("[data-image-id]");
    const visible: string[] = [];
    for (let i = 0; i < cells.length; i++) {
      const r = cells[i].getBoundingClientRect();
      const centerY = r.top + r.height / 2;
      if (centerY > rect.top + 100 && centerY < rect.bottom - 100) {
        const imgId = cells[i].getAttribute("data-image-id");
        if (imgId) visible.push(imgId);
      }
    }
    if (visible.length === 0) return null;
    return visible[Math.floor(visible.length / 2)];
  });
  if (!id) throw new Error("No visible image found near viewport centre");
  return id;
}

/** Scroll to ~50% in buffer mode (no scrubber seek needed). */
async function scrollToMiddle(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    const grid = document.querySelector('[aria-label="Image results grid"]') as HTMLElement;
    const table = document.querySelector('[aria-label="Image results table"]') as HTMLElement;
    const el = (grid ?? table);
    if (el) el.scrollTop = (el.scrollHeight - el.clientHeight) / 2;
  });
  await page.waitForTimeout(500);
}

// ---------------------------------------------------------------------------
// Shared: print summary
// ---------------------------------------------------------------------------

function printResults(
  site: string,
  corpus: Corpus,
  drift: ReturnType<typeof measureDrift>,
  flash: ReturnType<typeof analyzeFlash>,
  posFlash: ReturnType<typeof analyzePositionFlash>,
  pre: { trackingColIdx: number; trackingRowIdx: number },
  post: { trackingColIdx: number; trackingRowIdx: number },
) {
  console.log(`\n  ════════════════════════════════════════════`);
  console.log(`  ${site} — ${corpus.label}`);
  console.log(`  ════════════════════════════════════════════`);
  console.log(`  Vertical drift:  ${drift.driftRatio.toFixed(4)} (${drift.driftPx.toFixed(1)}px)`);
  console.log(`  Column shift:    ${pre.trackingColIdx} → ${post.trackingColIdx} (${post.trackingColIdx - pre.trackingColIdx})`);
  console.log(`  Row shift:       ${pre.trackingRowIdx} → ${post.trackingRowIdx} (${post.trackingRowIdx - pre.trackingRowIdx})`);
  console.log(`  Position flash:  ${posFlash.flashDetected ? "YES ⚠" : "no"} (${posFlash.distinctPositions} positions)`);
  console.log(`  Content flash:   ${flash.contentFlashDetected ? "YES ⚠" : "no"} (${flash.contentFlashFrames} frames)`);
  console.log(`  Scroll flash:    ${flash.scrollFlashDetected ? "YES ⚠" : "no"} (${flash.scrollFlashFrames} frames)`);
  console.log(`  Tracked lost:    ${flash.trackedImageLostFrames} frames`);
  console.log(`  Total frames:    ${flash.totalFrames} (${flash.durationMs.toFixed(0)}ms)`);
  console.log(`  ════════════════════════════════════════════`);
}

// ===========================================================================
// Site #1 — Sort change, NO focus, deep scroll
//
// Effect #7 falls through to `el.scrollTop = 0` because preserveId is null.
// Old buffer content flashes at position 0 before new results arrive.
// ===========================================================================

test.describe("Site #1 — Sort change, no focus, deep scroll", () => {
  test.describe.configure({ timeout: 180_000 });
  test.use({ viewport: { width: 1512, height: 982 } });

  for (const corpus of CORPORA) {
    test(`${corpus.label}`, async ({ page, kupua }) => {
      // Phantom mode — no focus ring, no focusedImageId
      await kupua.ensurePhantomMode();
      await corpus.nav(kupua);

      const store = await kupua.getStoreState();
      const total = store.total;
      console.log(`\n  Total: ${total.toLocaleString()} (${corpus.mode})`);

      if (total < corpus.minTotal || total > corpus.maxTotal) {
        test.skip(true, `Unexpected total ${total} for ${corpus.mode} mode`);
      }

      // Switch to Last Modified to create null zone
      await kupua.selectSort("Last modified");
      await kupua.waitForSeekComplete(30_000);
      await page.waitForTimeout(2000);

      // Get deep — different method per mode
      if (corpus.mode === "buffer") {
        await scrollToMiddle(page);
      } else {
        await kupua.seekTo(corpus.seekRatio);
        await page.waitForTimeout(3000);
      }

      // Track the centre-visible image (phantom — no focus set)
      const trackId = await findCentreVisibleImage(page);
      console.log(`  Tracking: ${trackId}`);

      const testStart = Date.now();
      const pre = await captureProbe(page, "pre-sort-nofocus", testStart, trackId);
      logProbe(pre);
      const preCells = await captureVisibleCells(page);

      // Action: change sort field
      console.log(`\n  ═══ NO FOCUS — CHANGING SORT TO "Uploaded" ═══`);
      await startTransitionSampling(page, trackId);
      await kupua.selectSort("Uploaded");
      await waitForSettle(page);
      const samples = await stopTransitionSampling(page);

      const post = await captureProbe(page, "post-sort-nofocus", testStart, trackId);
      logProbe(post);
      const postCells = await captureVisibleCells(page);

      const drift = measureDrift(pre, post);
      logDrift(drift);

      const flash = analyzeFlash(
        samples, pre.scrollTop,
        preCells[0]?.globalIdx ?? 0,
        postCells[0]?.globalIdx ?? 0,
        total,
      );
      logFlash(flash);

      const posFlash = analyzePositionFlash(samples);
      logPositionFlash(posFlash);

      printResults("Site #1: Sort (no focus)", corpus, drift, flash, posFlash, pre, post);

      recordResult(`flash-site1-sort-nofocus-${corpus.mode}`, {
        total, mode: corpus.mode, drift, flash, positionFlash: posFlash,
        pre: { scrollTop: pre.scrollTop, bufferOffset: pre.bufferOffset, col: pre.trackingColIdx, row: pre.trackingRowIdx },
        post: { scrollTop: post.scrollTop, bufferOffset: post.bufferOffset, col: post.trackingColIdx, row: post.trackingRowIdx },
      });
    });
  }
});

// ===========================================================================
// Site #8 — Density toggle (grid→table) at deep scroll
//
// Effect #10's two-rAF deferred restore creates 1-2 frames of wrong scroll
// position. Independent of dual-path architecture (family F3).
// ===========================================================================

test.describe("Site #8 — Density toggle, deep scroll", () => {
  test.describe.configure({ timeout: 180_000 });
  test.use({ viewport: { width: 1512, height: 982 } });

  for (const corpus of CORPORA) {
    test(`${corpus.label}`, async ({ page, kupua }) => {
      await kupua.ensureExplicitMode();
      await corpus.nav(kupua);

      const store = await kupua.getStoreState();
      const total = store.total;
      console.log(`\n  Total: ${total.toLocaleString()} (${corpus.mode})`);

      if (total < corpus.minTotal || total > corpus.maxTotal) {
        test.skip(true, `Unexpected total ${total} for ${corpus.mode} mode`);
      }

      // Get deep
      if (corpus.mode === "buffer") {
        await scrollToMiddle(page);
      } else {
        await kupua.seekTo(corpus.seekRatio);
        await page.waitForTimeout(3000);
      }

      // Focus a visible image via store
      const focusId = await findCentreVisibleImage(page);
      await page.evaluate((id) => {
        const s = (window as any).__kupua_store__;
        s?.getState().setFocusedImageId(id);
      }, focusId);
      await page.waitForTimeout(500);
      console.log(`  Focused: ${focusId}`);

      const testStart = Date.now();
      const pre = await captureProbe(page, "pre-density", testStart, focusId);
      logProbe(pre);
      const preCells = await captureVisibleCells(page);

      // Action: switch to table
      console.log(`\n  ═══ SWITCHING TO TABLE VIEW ═══`);
      await startTransitionSampling(page, focusId);
      await kupua.switchToTable();
      // Extra settle for the rAF chain
      await page.waitForTimeout(2000);
      const samples = await stopTransitionSampling(page);

      const post = await captureProbe(page, "post-density", testStart, focusId);
      logProbe(post);
      const postCells = await captureVisibleCells(page);

      const drift = measureDrift(pre, post);
      logDrift(drift);

      const flash = analyzeFlash(
        samples, pre.scrollTop,
        preCells[0]?.globalIdx ?? 0,
        postCells[0]?.globalIdx ?? 0,
        total,
      );
      logFlash(flash);

      const posFlash = analyzePositionFlash(samples);
      logPositionFlash(posFlash);

      printResults("Site #8: Density toggle", corpus, drift, flash, posFlash, pre, post);

      recordResult(`flash-site8-density-${corpus.mode}`, {
        total, mode: corpus.mode, drift, flash, positionFlash: posFlash,
        pre: { scrollTop: pre.scrollTop, bufferOffset: pre.bufferOffset, col: pre.trackingColIdx, row: pre.trackingRowIdx, isGrid: pre.isGrid },
        post: { scrollTop: post.scrollTop, bufferOffset: post.bufferOffset, col: post.trackingColIdx, row: post.trackingRowIdx, isGrid: post.isGrid },
      });
    });
  }
});

// ===========================================================================
// Site #9 — Popstate without snapshot (logo-click creates history entry,
// then browser back lands on an entry with no snapshot → same F1 pattern
// as Site #1)
//
// Sequence: navigate deep → logo click (resets to top, pushes history) →
// browser back → the old deep entry has no snapshot → scrollTop=0 flash.
// ===========================================================================

test.describe("Site #9 — Popstate without snapshot", () => {
  test.describe.configure({ timeout: 180_000 });
  test.use({ viewport: { width: 1512, height: 982 } });

  for (const corpus of CORPORA) {
    test(`${corpus.label}`, async ({ page, kupua }) => {
      await kupua.ensurePhantomMode();
      await corpus.nav(kupua);

      const store = await kupua.getStoreState();
      const total = store.total;
      console.log(`\n  Total: ${total.toLocaleString()} (${corpus.mode})`);

      if (total < corpus.minTotal || total > corpus.maxTotal) {
        test.skip(true, `Unexpected total ${total} for ${corpus.mode} mode`);
      }

      // Get deep
      if (corpus.mode === "buffer") {
        await scrollToMiddle(page);
      } else {
        await kupua.seekTo(corpus.seekRatio);
        await page.waitForTimeout(3000);
      }

      // Track the current centre image
      const trackId = await findCentreVisibleImage(page);
      console.log(`  Tracking: ${trackId}`);

      const testStart = Date.now();

      // Capture the deep state BEFORE logo click
      const preDeep = await captureProbe(page, "pre-deep", testStart, trackId);
      logProbe(preDeep);
      const preDeepCells = await captureVisibleCells(page);

      // Logo click → pushes history, resets to top
      console.log(`\n  ═══ CLICKING LOGO (RESET TO HOME) ═══`);
      const logo = page.locator('a[href="/search?nonFree=true"]').first();
      if (await logo.count() === 0) {
        // Fallback: try the header logo/brand
        await page.locator('header a').first().click();
      } else {
        await logo.click();
      }
      await kupua.waitForResults();
      await page.waitForTimeout(2000);

      const atHome = await captureProbe(page, "at-home", testStart, trackId);
      console.log(`\n  At home: scrollTop=${atHome.scrollTop.toFixed(0)}, offset=${atHome.bufferOffset}`);

      // Browser back → should restore deep position but may flash
      console.log(`\n  ═══ BROWSER BACK — WATCH FOR FLASH ═══`);
      await startTransitionSampling(page, trackId);
      await page.goBack();
      await waitForSettle(page);
      const samples = await stopTransitionSampling(page);

      const post = await captureProbe(page, "post-popstate", testStart, trackId);
      logProbe(post);
      const postCells = await captureVisibleCells(page);

      const drift = measureDrift(preDeep, post);
      logDrift(drift);

      const flash = analyzeFlash(
        samples, preDeep.scrollTop,
        preDeepCells[0]?.globalIdx ?? 0,
        postCells[0]?.globalIdx ?? 0,
        total,
      );
      logFlash(flash);

      const posFlash = analyzePositionFlash(samples);
      logPositionFlash(posFlash);

      printResults("Site #9: Popstate (no snapshot)", corpus, drift, flash, posFlash, preDeep, post);

      recordResult(`flash-site9-popstate-${corpus.mode}`, {
        total, mode: corpus.mode, drift, flash, positionFlash: posFlash,
        pre: { scrollTop: preDeep.scrollTop, bufferOffset: preDeep.bufferOffset, col: preDeep.trackingColIdx, row: preDeep.trackingRowIdx },
        post: { scrollTop: post.scrollTop, bufferOffset: post.bufferOffset, col: post.trackingColIdx, row: post.trackingRowIdx },
      });
    });
  }
});
