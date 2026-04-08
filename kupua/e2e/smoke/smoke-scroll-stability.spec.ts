/**
 * Smoke — scroll stability diagnostic.
 *
 * Comprehensive diagnostic for scrubber seek + post-seek scroll behaviour
 * on real data. Tests the bugs reported in points 3–6:
 *
 *   3. After seek, target row is aligned to top (not centered)
 *   4. Sort label on tooltip doesn't always match what's expected
 *   5. Seek position is completely off + scrolling causes content shift
 *   6. Content shifts ("swimming") when scrolling slowly after seek
 *
 * RUNS AGAINST REAL ES — see manual-smoke-test.spec.ts header.
 *
 * === AGENT-READABLE OUTPUT ===
 * After running, structured results are written to:
 *   kupua/test-results/scroll-stability-report.json
 *
 * The agent can read this file to get all diagnostic data in one shot,
 * without parsing console output.
 *
 * How to run:
 *   Terminal 1: ./scripts/start.sh --use-TEST
 *   Terminal 2: node scripts/run-smoke.mjs <N>   (pick the S-number)
 */

import { test, expect, KupuaHelpers } from "../shared/helpers";
import {
  GRID_ROW_HEIGHT,
  GRID_MIN_CELL_WIDTH,
} from "@/constants/layout";
import { recordResult } from "./smoke-report";

// ---------------------------------------------------------------------------
// Corpus pinning — static dates for result-set stability across runs.
// New images are ingested daily; without pinning, total and positions drift
// between runs making results non-reproducible. These dates are static
// (not relative) and at least one month old.
// ---------------------------------------------------------------------------

/** Pin the corpus so new ingestion doesn't shift results between runs. */
const STABLE_UNTIL = "2026-03-04T00:00:00";

// ---------------------------------------------------------------------------
// Guard
// ---------------------------------------------------------------------------

async function requireRealData(kupua: KupuaHelpers): Promise<number> {
  const store = await kupua.getStoreState();
  if (store.total < 100_000) {
    test.skip(
      true,
      `Skipping: connected to local ES (total=${store.total}). These tests require --use-TEST.`,
    );
  }
  return store.total;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface GridDiag {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  cols: number;
  bufferOffset: number;
  resultsLength: number;
  total: number;
  firstVisibleRow: number;
  firstVisibleLocalIdx: number;
  firstVisibleGlobalPos: number;
  seekTargetLocalIndex: number;
  seekTargetRow: number;
  seekTargetPixelTop: number;
  maxScroll: number;
  seekGeneration: number;
  loading: boolean;
  error: string | null;
}

async function getGridDiag(page: any): Promise<GridDiag | null> {
  return page.evaluate(
    ({
      MIN_CELL_WIDTH,
      ROW_HEIGHT,
    }: {
      MIN_CELL_WIDTH: number;
      ROW_HEIGHT: number;
    }) => {
      const el = document.querySelector('[aria-label="Image results grid"]');
      if (!el) return null;
      const store = (window as any).__kupua_store__;
      if (!store) return null;
      const s = store.getState();
      const cols = Math.max(
        1,
        Math.floor(el.clientWidth / MIN_CELL_WIDTH),
      );
      const firstVisibleRow = Math.floor(el.scrollTop / ROW_HEIGHT);
      const firstVisibleLocalIdx = firstVisibleRow * cols;
      const firstVisibleGlobalPos = firstVisibleLocalIdx + s.bufferOffset;
      const seekTargetRow = Math.floor(s._seekTargetLocalIndex / cols);
      return {
        scrollTop: el.scrollTop,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        cols,
        bufferOffset: s.bufferOffset,
        resultsLength: s.results.length,
        total: s.total,
        firstVisibleRow,
        firstVisibleLocalIdx,
        firstVisibleGlobalPos,
        seekTargetLocalIndex: s._seekTargetLocalIndex,
        seekTargetRow,
        seekTargetPixelTop: seekTargetRow * ROW_HEIGHT,
        maxScroll: el.scrollHeight - el.clientHeight,
        seekGeneration: s._seekGeneration,
        loading: s.loading,
        error: s.error,
      };
    },
    { MIN_CELL_WIDTH: GRID_MIN_CELL_WIDTH, ROW_HEIGHT: GRID_ROW_HEIGHT },
  );
}

/** Get detailed store internals for diagnostics. */
async function getStoreInternals(page: any): Promise<Record<string, any> | null> {
  return page.evaluate(() => {
    const store = (window as any).__kupua_store__;
    if (!store) return null;
    const s = store.getState();
    return {
      bufferOffset: s.bufferOffset,
      resultsLength: s.results.length,
      total: s.total,
      loading: s.loading,
      error: s.error,
      seekGeneration: s._seekGeneration,
      seekTargetLocalIndex: s._seekTargetLocalIndex,
      seekCooldownUntil: s._seekCooldownUntil,
      prependGeneration: s._prependGeneration,
      lastPrependCount: s._lastPrependCount,
      forwardEvictGeneration: s._forwardEvictGeneration,
      lastForwardEvictCount: s._lastForwardEvictCount,
      extendForwardInFlight: s._extendForwardInFlight,
      extendBackwardInFlight: s._extendBackwardInFlight,
      orderBy: s.params?.orderBy,
      firstImageId: s.results[0]?.id ?? null,
      lastImageId: s.results[s.results.length - 1]?.id ?? null,
    };
  });
}

interface SwimmingStep {
  step: number;
  beforeScrollTop: number;
  afterScrollTop: number;
  beforeOffset: number;
  afterOffset: number;
  beforeLen: number;
  afterLen: number;
  beforeFirstId: string;
  afterFirstId: string;
  beforeFirstGlobalPos: number;
  afterFirstGlobalPos: number;
}

/**
 * Slowly scroll and detect content shifts (swimming).
 * Returns full per-step diagnostics.
 */
async function detectSwimming(
  page: any,
  steps: number,
  deltaPerStep: number,
  delayMs: number,
): Promise<{
  shifts: SwimmingStep[];
  allSteps: Array<{
    step: number;
    scrollTop: number;
    offset: number;
    len: number;
    firstGlobalPos: number;
  }>;
  totalSteps: number;
  totalShifts: number;
}> {
  const shifts: SwimmingStep[] = [];
  const allSteps: Array<{
    step: number;
    scrollTop: number;
    offset: number;
    len: number;
    firstGlobalPos: number;
  }> = [];

  for (let step = 0; step < steps; step++) {
    const before = await page.evaluate(
      ({ MIN_CELL_WIDTH, ROW_HEIGHT }: any) => {
        const el = document.querySelector('[aria-label="Image results grid"]');
        if (!el) return null;
        const store = (window as any).__kupua_store__;
        if (!store) return null;
        const s = store.getState();
        const cols = Math.max(1, Math.floor(el.clientWidth / MIN_CELL_WIDTH));
        const firstRow = Math.floor(el.scrollTop / ROW_HEIGHT);
        const firstLocalIdx = firstRow * cols;
        const firstImg = s.results[firstLocalIdx];
        return {
          scrollTop: el.scrollTop,
          bufferOffset: s.bufferOffset,
          resultsLength: s.results.length,
          firstId: firstImg?.id ?? "<none>",
          firstGlobalPos: firstLocalIdx + s.bufferOffset,
          cols,
        };
      },
      { MIN_CELL_WIDTH: GRID_MIN_CELL_WIDTH, ROW_HEIGHT: GRID_ROW_HEIGHT },
    );
    if (!before) continue;

    const gridEl = page.locator('[aria-label="Image results grid"]');
    const gridBox = await gridEl.boundingBox();
    if (!gridBox) continue;
    await page.mouse.move(
      gridBox.x + gridBox.width / 2,
      gridBox.y + gridBox.height / 2,
    );
    await page.mouse.wheel(0, deltaPerStep);
    await page.waitForTimeout(delayMs);

    const after = await page.evaluate(
      ({ MIN_CELL_WIDTH, ROW_HEIGHT }: any) => {
        const el = document.querySelector('[aria-label="Image results grid"]');
        if (!el) return null;
        const store = (window as any).__kupua_store__;
        if (!store) return null;
        const s = store.getState();
        const cols = Math.max(1, Math.floor(el.clientWidth / MIN_CELL_WIDTH));
        const firstRow = Math.floor(el.scrollTop / ROW_HEIGHT);
        const firstLocalIdx = firstRow * cols;
        const firstImg = s.results[firstLocalIdx];
        return {
          scrollTop: el.scrollTop,
          bufferOffset: s.bufferOffset,
          resultsLength: s.results.length,
          firstId: firstImg?.id ?? "<none>",
          firstGlobalPos: firstLocalIdx + s.bufferOffset,
          cols,
        };
      },
      { MIN_CELL_WIDTH: GRID_MIN_CELL_WIDTH, ROW_HEIGHT: GRID_ROW_HEIGHT },
    );
    if (!after) continue;

    allSteps.push({
      step,
      scrollTop: after.scrollTop,
      offset: after.bufferOffset,
      len: after.resultsLength,
      firstGlobalPos: after.firstGlobalPos,
    });

    if (before.bufferOffset !== after.bufferOffset) {
      shifts.push({
        step,
        beforeScrollTop: before.scrollTop,
        afterScrollTop: after.scrollTop,
        beforeOffset: before.bufferOffset,
        afterOffset: after.bufferOffset,
        beforeLen: before.resultsLength,
        afterLen: after.resultsLength,
        beforeFirstId: before.firstId,
        afterFirstId: after.firstId,
        beforeFirstGlobalPos: before.firstGlobalPos,
        afterFirstGlobalPos: after.firstGlobalPos,
      });
    }
  }

  return { shifts, allSteps, totalSteps: steps, totalShifts: shifts.length };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Smoke — scroll stability (real ES)", () => {
  test.describe.configure({ timeout: 180_000 });

  test.afterEach(async ({ kupua }, testInfo) => {
    try {
      const store = await kupua.getStoreState();
      console.log("\n── Store state ──────────────────────────────────────");
      console.log(`  total:          ${store.total}`);
      console.log(`  bufferOffset:   ${store.bufferOffset}`);
      console.log(`  resultsLength:  ${store.resultsLength}`);
      console.log(`  loading:        ${store.loading}`);
      console.log(`  error:          ${store.error}`);
      console.log(`  orderBy:        ${store.orderBy}`);
      console.log(`  seekGeneration: ${store.seekGeneration}`);
      console.log("────────────────────────────────────────────────────\n");

      // If the test failed before its own recordResult, record the failure
      const match = testInfo.title.match(/^(S\d+)/);
      if (match && testInfo.status === "failed") {
        recordResult(match[1], {
          total: store.total,
          store,
          status: "failed",
          duration: testInfo.duration,
          error: testInfo.error?.message?.slice(0, 500),
        });
      }
    } catch {
      console.log("  (could not read store state)\n");
    }
  });

  // -------------------------------------------------------------------------
  // S12: Seek accuracy — seek to 25%, 50%, 75% on default sort
  // -------------------------------------------------------------------------

  test("S12: seek accuracy — date sort 25%/50%/75%", async ({ kupua }) => {
    await kupua.gotoWithParams(`until=${STABLE_UNTIL}`);
    const total = await requireRealData(kupua);

    kupua.startConsoleCapture();

    const seekResults: Array<Record<string, any>> = [];

    for (const targetRatio of [0.25, 0.5, 0.75]) {
      console.log(`\n  ── SEEK TO ${targetRatio * 100}% ──`);

      const seekStart = Date.now();
      await kupua.seekTo(targetRatio, 30_000);
      const seekMs = Date.now() - seekStart;

      const diag = await getGridDiag(kupua.page);
      const store = await getStoreInternals(kupua.page);
      if (!diag) { console.log("  ERROR: no grid diag"); continue; }

      const expectedGlobalPos = Math.floor(total * targetRatio);
      const drift = diag.firstVisibleGlobalPos - expectedGlobalPos;
      const driftPct = (drift / total) * 100;

      const result = {
        targetRatio,
        seekMs,
        expectedGlobalPos,
        actualFirstVisibleGlobalPos: diag.firstVisibleGlobalPos,
        drift,
        driftPct: +driftPct.toFixed(4),
        gridDiag: diag,
        storeInternals: store,
      };
      seekResults.push(result);

      console.log(`  seekTime: ${seekMs}ms`);
      console.log(`  bufferOffset: ${diag.bufferOffset}, resultsLength: ${diag.resultsLength}`);
      console.log(`  firstVisibleGlobalPos: ${diag.firstVisibleGlobalPos} (expected: ${expectedGlobalPos})`);
      console.log(`  drift: ${drift} (${driftPct.toFixed(2)}%)`);
      console.log(`  scrollTop: ${diag.scrollTop.toFixed(1)}, seekTargetLocalIndex: ${diag.seekTargetLocalIndex}`);

      expect(diag.error).toBeNull();
      expect(Math.abs(drift)).toBeLessThan(total * 0.1);
    }

    const seekLogs = kupua.getConsoleLogs(/\[seek\]|\[seek-diag\]/);
    recordResult("S12", { total, seekResults, seekLogs });
  });

  // -------------------------------------------------------------------------
  // S13: Scroll alignment after seek — flash prevention check
  // -------------------------------------------------------------------------

  test("S13: scroll alignment after seek — flash prevention", async ({ kupua }) => {
    await kupua.gotoWithParams(`until=${STABLE_UNTIL}`);
    const total = await requireRealData(kupua);

    const gridEl = kupua.page.locator('[aria-label="Image results grid"]');
    const gridBox = await gridEl.boundingBox();
    expect(gridBox).not.toBeNull();
    await kupua.page.mouse.move(
      gridBox!.x + gridBox!.width / 2,
      gridBox!.y + gridBox!.height / 2,
    );

    const scenarios: Array<Record<string, any>> = [];

    for (const preScrollRows of [0, 1, 3]) {
      await kupua.page.keyboard.press("Home");
      await kupua.waitForSeekComplete(30_000);
      await kupua.page.waitForTimeout(500);

      if (preScrollRows > 0) {
        await kupua.page.mouse.wheel(0, GRID_ROW_HEIGHT * preScrollRows);
        await kupua.page.waitForTimeout(500);
      }

      const preDiag = await getGridDiag(kupua.page);

      kupua.startConsoleCapture();
      await kupua.seekTo(0.5, 30_000);

      const postDiag = await getGridDiag(kupua.page);
      if (!preDiag || !postDiag) continue;

      const scrollDelta = Math.abs(postDiag.scrollTop - preDiag.scrollTop);
      const subRowBefore = preDiag.scrollTop % GRID_ROW_HEIGHT;
      const subRowAfter = postDiag.scrollTop % GRID_ROW_HEIGHT;
      const subRowDelta = Math.abs(subRowAfter - subRowBefore);
      const preserved = subRowDelta < 5;

      scenarios.push({
        preScrollRows,
        preScrollTop: preDiag.scrollTop,
        postScrollTop: postDiag.scrollTop,
        scrollDelta,
        subRowBefore,
        subRowAfter,
        subRowDelta,
        scrollPreserved: preserved,
        seekTargetLocalIndex: postDiag.seekTargetLocalIndex,
        seekTargetPixelTop: postDiag.seekTargetPixelTop,
        targetRowInViewport: postDiag.seekTargetPixelTop - postDiag.scrollTop,
        clientHeight: postDiag.clientHeight,
        bufferOffset: postDiag.bufferOffset,
        resultsLength: postDiag.resultsLength,
        maxScroll: postDiag.maxScroll,
        seekLogs: kupua.getConsoleLogs(/\[seek\]/),
      });

      console.log(`\n  ── preScrollRows=${preScrollRows} ──`);
      console.log(`  scrollTop: ${preDiag.scrollTop.toFixed(1)} → ${postDiag.scrollTop.toFixed(1)} (delta=${scrollDelta.toFixed(1)})`);
      console.log(`  subRow: ${subRowBefore.toFixed(1)} → ${subRowAfter.toFixed(1)} (delta=${subRowDelta.toFixed(1)})`);
      console.log(`  ${preserved ? "✅ PRESERVED" : "❌ NOT PRESERVED"}`);
    }

    recordResult("S13", { total, scenarios, GRID_ROW_HEIGHT });

    // Assert scroll preservation for non-zero preScrollRows.
    // preScrollRows=0 is the "seek from very top" case — the headroom
    // offset fires and scrollTop changes significantly (expected, by design).
    // preScrollRows=1,3 should preserve SUB-ROW OFFSET (not absolute scrollTop,
    // which changes due to headroom items being prepended).
    for (const s of scenarios) {
      if (s.preScrollRows > 0) {
        expect(
          s.subRowDelta,
          `preScrollRows=${s.preScrollRows}: sub-row offset changed by ${s.subRowDelta.toFixed(1)} ` +
          `(before=${s.subRowBefore.toFixed(1)}, after=${s.subRowAfter.toFixed(1)}). ` +
          `Vertical position was not preserved.`,
        ).toBeLessThan(5);
      }
    }
  });

  // -------------------------------------------------------------------------
  // S14: Post-seek swimming — slowly scroll after seek
  // -------------------------------------------------------------------------

  test("S14: post-seek swimming — scroll slowly after seek to 50%", async ({ kupua }) => {
    await kupua.gotoWithParams(`until=${STABLE_UNTIL}`);
    const total = await requireRealData(kupua);

    kupua.startConsoleCapture();
    await kupua.seekTo(0.5, 30_000);

    const postSeek = await getGridDiag(kupua.page);
    console.log(`\n  [post-seek] offset=${postSeek?.bufferOffset}, len=${postSeek?.resultsLength}, scrollTop=${postSeek?.scrollTop.toFixed(1)}`);

    await kupua.page.waitForTimeout(2000);

    console.log(`\n  ── SCROLLING DOWN (30 × 50px, 200ms) ──`);
    const downResult = await detectSwimming(kupua.page, 30, 50, 200);
    console.log(`  Shifts: ${downResult.totalShifts}`);
    for (const s of downResult.shifts.slice(0, 5)) {
      console.log(`    step ${s.step}: offset ${s.beforeOffset}→${s.afterOffset}`);
    }

    console.log(`\n  ── SCROLLING UP (30 × -50px, 200ms) ──`);
    const upResult = await detectSwimming(kupua.page, 30, -50, 200);
    console.log(`  Shifts: ${upResult.totalShifts}`);
    for (const s of upResult.shifts.slice(0, 5)) {
      console.log(`    step ${s.step}: offset ${s.beforeOffset}→${s.afterOffset}`);
    }

    const logs = kupua.getConsoleLogs(/\[prepend-comp\]|\[seek\]|\[extend/);
    const totalShifts = downResult.totalShifts + upResult.totalShifts;
    console.log(`\n  VERDICT: ${totalShifts === 0 ? "✅ NO SWIMMING" : `❌ ${totalShifts} SHIFTS`}`);

    recordResult("S14", {
      total,
      postSeekDiag: postSeek,
      scrollDown: downResult,
      scrollUp: upResult,
      consoleLogs: logs,
      verdict: totalShifts === 0 ? "STABLE" : `SWIMMING(${totalShifts})`,
    });
  });

  // -------------------------------------------------------------------------
  // S15: Extended wait + scroll — wait 10s after seek, then scroll
  // -------------------------------------------------------------------------

  test("S15: extended wait then scroll — 10s pause after seek", async ({ kupua }) => {
    await kupua.gotoWithParams(`until=${STABLE_UNTIL}`);
    const total = await requireRealData(kupua);

    await kupua.seekTo(0.5, 30_000);

    const postSeek = await getGridDiag(kupua.page);
    const storeBeforeWait = await getStoreInternals(kupua.page);
    console.log(`\n  [post-seek] offset=${postSeek?.bufferOffset}, len=${postSeek?.resultsLength}`);

    console.log(`  Waiting 10 seconds...`);
    await kupua.page.waitForTimeout(10_000);

    const afterWait = await getGridDiag(kupua.page);
    const storeAfterWait = await getStoreInternals(kupua.page);
    const bufferChangedDuringWait = postSeek?.bufferOffset !== afterWait?.bufferOffset ||
                                     postSeek?.resultsLength !== afterWait?.resultsLength;
    console.log(`  [after 10s] offset=${afterWait?.bufferOffset} (was ${postSeek?.bufferOffset}), len=${afterWait?.resultsLength} (was ${postSeek?.resultsLength})`);

    kupua.startConsoleCapture();

    console.log(`\n  ── SCROLLING DOWN AFTER 10s WAIT (40 × 50px, 200ms) ──`);
    const result = await detectSwimming(kupua.page, 40, 50, 200);
    console.log(`  Shifts: ${result.totalShifts}`);
    for (const s of result.shifts.slice(0, 10)) {
      console.log(`    step ${s.step}: offset ${s.beforeOffset}→${s.afterOffset} (Δ${s.afterOffset - s.beforeOffset}), len ${s.beforeLen}→${s.afterLen}`);
    }

    const logs = kupua.getConsoleLogs(/\[prepend-comp\]|\[seek\]|\[extend/);
    console.log(`\n  VERDICT: ${result.totalShifts === 0 ? "✅ STABLE" : `❌ ${result.totalShifts} SHIFTS AFTER 10s`}`);

    recordResult("S15", {
      total,
      postSeekDiag: postSeek,
      storeBeforeWait,
      storeAfterWait,
      bufferChangedDuringWait,
      swimming: result,
      consoleLogs: logs,
      verdict: result.totalShifts === 0 ? "STABLE" : `SWIMMING(${result.totalShifts})`,
    });
  });

  // -------------------------------------------------------------------------
  // S16: Credit sort — seek to 50% accuracy + swimming
  // -------------------------------------------------------------------------

  test("S16: Credit sort — seek to 50% accuracy + swimming", async ({ kupua }) => {
    await kupua.gotoWithParams(`until=${STABLE_UNTIL}`);
    const total = await requireRealData(kupua);

    await kupua.selectSort("Credit");
    await kupua.waitForSeekComplete(30_000);

    const before = await kupua.getStoreState();
    console.log(`\n  [before] offset=${before.bufferOffset}, total=${before.total}, orderBy=${before.orderBy}`);

    kupua.startConsoleCapture();

    const seekStart = Date.now();
    await kupua.seekTo(0.5, 60_000);
    const seekMs = Date.now() - seekStart;

    const diag = await getGridDiag(kupua.page);
    const storeAfter = await getStoreInternals(kupua.page);
    if (!diag) { console.log("  ERROR: no grid diag"); return; }

    const expectedGlobalPos = Math.floor(total * 0.5);
    const drift = diag.firstVisibleGlobalPos - expectedGlobalPos;
    const driftPct = (drift / total) * 100;

    console.log(`\n  [after seek] ${seekMs}ms`);
    console.log(`  offset=${diag.bufferOffset}, len=${diag.resultsLength}`);
    console.log(`  firstVisibleGlobal=${diag.firstVisibleGlobalPos}, expected=${expectedGlobalPos}, drift=${drift} (${driftPct.toFixed(2)}%)`);

    const seekLogs = kupua.getConsoleLogs(/\[seek\]|\[ES\]/);

    await kupua.page.waitForTimeout(2000);
    kupua.startConsoleCapture();

    console.log(`\n  ── SCROLLING DOWN AFTER CREDIT SEEK ──`);
    const swimResult = await detectSwimming(kupua.page, 30, 50, 200);
    console.log(`  Shifts: ${swimResult.totalShifts}`);

    const extLogs = kupua.getConsoleLogs(/\[prepend-comp\]|\[extend/);

    recordResult("S16", {
      total,
      seekMs,
      expectedGlobalPos,
      actualFirstVisibleGlobalPos: diag.firstVisibleGlobalPos,
      drift,
      driftPct: +driftPct.toFixed(4),
      gridDiag: diag,
      storeAfterSeek: storeAfter,
      seekLogs,
      swimming: swimResult,
      extendLogs: extLogs,
      verdict: {
        accuracyOk: Math.abs(driftPct) < 10,
        swimmingOk: swimResult.totalShifts === 0,
      },
    });
  });

  // -------------------------------------------------------------------------
  // S17: Full-range seek accuracy — 10%, 30%, 50%, 70%, 90%
  // -------------------------------------------------------------------------

  test("S17: full-range seek accuracy — 10%/30%/50%/70%/90%", async ({ kupua }) => {
    await kupua.gotoWithParams(`until=${STABLE_UNTIL}`);
    const total = await requireRealData(kupua);

    kupua.startConsoleCapture();

    const results: Array<Record<string, any>> = [];

    for (const ratio of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const seekStart = Date.now();
      await kupua.seekTo(ratio, 30_000);
      const seekMs = Date.now() - seekStart;

      const diag = await getGridDiag(kupua.page);
      const store = await getStoreInternals(kupua.page);
      if (!diag) continue;

      const expectedGlobalPos = Math.floor(total * ratio);
      const drift = diag.firstVisibleGlobalPos - expectedGlobalPos;

      results.push({
        ratio,
        seekMs,
        bufferOffset: diag.bufferOffset,
        firstVisibleGlobalPos: diag.firstVisibleGlobalPos,
        expectedGlobalPos,
        drift,
        driftPct: +((drift / total) * 100).toFixed(4),
        scrollTop: diag.scrollTop,
        seekTargetLocalIndex: diag.seekTargetLocalIndex,
        seekTargetPixelTop: diag.seekTargetPixelTop,
        storeInternals: store,
      });
    }

    // Print table
    console.log(`\n  ${"Ratio".padEnd(7)} ${"Ms".padStart(6)} ${"Offset".padStart(9)} ${"Visible".padStart(9)} ${"Expected".padStart(9)} ${"Drift".padStart(8)} ${"Drift%".padStart(8)}`);
    console.log(`  ${"-".repeat(65)}`);
    for (const r of results) {
      console.log(
        `  ${r.ratio.toFixed(1).padEnd(7)} ` +
        `${r.seekMs.toString().padStart(6)} ` +
        `${r.bufferOffset.toString().padStart(9)} ` +
        `${r.firstVisibleGlobalPos.toString().padStart(9)} ` +
        `${r.expectedGlobalPos.toString().padStart(9)} ` +
        `${r.drift.toString().padStart(8)} ` +
        `${r.driftPct.toFixed(2).padStart(8)}`,
      );
    }

    const seekLogs = kupua.getConsoleLogs(/\[seek\]|\[seek-diag\]/);
    recordResult("S17", { total, results, seekLogs: seekLogs.slice(-40) });

    for (const r of results) {
      expect(Math.abs(r.drift)).toBeLessThan(total * 0.15);
    }
  });

  // -------------------------------------------------------------------------
  // S18: Post-seek extend timing — high-frequency buffer monitoring
  // -------------------------------------------------------------------------

  test("S18: post-seek extend timing — buffer stability timeline", async ({ kupua }) => {
    await kupua.gotoWithParams(`until=${STABLE_UNTIL}`);
    await requireRealData(kupua);

    kupua.startConsoleCapture();

    await kupua.seekTo(0.5, 30_000);

    const snapshots: Array<{
      t: number;
      offset: number;
      len: number;
      scrollTop: number;
      loading: boolean;
    }> = [];

    const startT = Date.now();
    for (let i = 0; i < 30; i++) {
      await kupua.page.waitForTimeout(100);
      const snap = await kupua.page.evaluate(() => {
        const store = (window as any).__kupua_store__;
        if (!store) return null;
        const s = store.getState();
        const el = document.querySelector('[aria-label="Image results grid"]');
        return {
          offset: s.bufferOffset,
          len: s.results.length,
          scrollTop: el?.scrollTop ?? 0,
          loading: s.loading,
        };
      });
      if (snap) {
        snapshots.push({ t: Date.now() - startT, ...snap });
      }
    }

    // Print timeline
    console.log(`\n  ── POST-SEEK TIMELINE (100ms, 3s) ──`);
    let prevOffset = snapshots[0]?.offset;
    let prevLen = snapshots[0]?.len;
    for (const s of snapshots) {
      const flag = s.offset !== prevOffset ? " ← OFFSET" :
                   s.len !== prevLen ? " ← LEN" : "";
      console.log(
        `  ${s.t.toString().padStart(5)}ms: offset=${s.offset}, len=${s.len}, scrollTop=${s.scrollTop.toFixed(1)}, loading=${s.loading}${flag}`,
      );
      prevOffset = s.offset;
      prevLen = s.len;
    }

    const logs = kupua.getConsoleLogs(/\[seek\]|\[extend|\[prepend-comp\]/);
    const uniqueOffsets = new Set(snapshots.map(s => s.offset));
    const uniqueLens = new Set(snapshots.map(s => s.len));
    const stable = uniqueOffsets.size === 1 && uniqueLens.size <= 2;

    console.log(`\n  VERDICT: ${stable ? "✅ BUFFER STABLE" : `❌ BUFFER CHANGED (${uniqueOffsets.size} offsets, ${uniqueLens.size} lengths)`}`);

    recordResult("S18", {
      snapshots,
      uniqueOffsets: [...uniqueOffsets],
      uniqueLens: [...uniqueLens],
      consoleLogs: logs,
      verdict: stable ? "STABLE" : "UNSTABLE",
    });
  });

  // -------------------------------------------------------------------------
  // S19: End key accuracy — seek to end, measure how far from actual end
  // -------------------------------------------------------------------------

  test("S19: End key — accuracy and post-scroll stability", async ({ kupua }) => {
    await kupua.gotoWithParams(`until=${STABLE_UNTIL}`);
    const total = await requireRealData(kupua);

    kupua.startConsoleCapture();

    // Press End
    await kupua.page.keyboard.press("End");
    await kupua.page.waitForTimeout(2000);
    await kupua.waitForSeekComplete(60_000);

    const diag = await getGridDiag(kupua.page);
    const store = await getStoreInternals(kupua.page);
    if (!diag) { console.log("  ERROR: no grid diag"); return; }

    const endOfBuffer = diag.bufferOffset + diag.resultsLength;
    const distanceFromEnd = total - endOfBuffer;
    console.log(`\n  endOfBuffer=${endOfBuffer}, total=${total}, distanceFromEnd=${distanceFromEnd}`);
    console.log(`  scrollTop=${diag.scrollTop.toFixed(1)}, maxScroll=${diag.maxScroll.toFixed(1)}`);
    console.log(`  scrollAtBottom: ${Math.abs(diag.scrollTop - diag.maxScroll) < 10}`);

    // Now scroll down slowly — should NOT shift
    await kupua.page.waitForTimeout(1000);
    kupua.startConsoleCapture();
    const swimResult = await detectSwimming(kupua.page, 20, 50, 200);
    console.log(`  Post-End shifts: ${swimResult.totalShifts}`);

    const seekLogs = kupua.getConsoleLogs(/\[seek\]|\[extend/);

    recordResult("S19", {
      total,
      gridDiag: diag,
      storeInternals: store,
      endOfBuffer,
      distanceFromEnd,
      scrollAtBottom: Math.abs(diag.scrollTop - diag.maxScroll) < 10,
      postEndSwimming: swimResult,
      seekLogs,
      verdict: {
        accuracyOk: distanceFromEnd <= 10,
        scrollStable: swimResult.totalShifts === 0,
      },
    });
  });

  // -------------------------------------------------------------------------
  // S20: Seek from scrolled position — the "pt 3/4" bug
  //
  // User scrolls to a partial row position, then seeks. The seek should
  // preserve the scrollTop offset (within 1 row), not align target to top.
  // -------------------------------------------------------------------------

  test("S20: seek from scrolled position — scroll preservation (pts 3/4)", async ({ kupua }) => {
    await kupua.gotoWithParams(`until=${STABLE_UNTIL}`);
    const total = await requireRealData(kupua);

    const scenarios: Array<Record<string, any>> = [];

    // Scenario A: Scroll down so top row is partially cut off (half a row)
    {
      await kupua.page.keyboard.press("Home");
      await kupua.waitForSeekComplete(30_000);
      await kupua.page.waitForTimeout(500);

      const gridEl = kupua.page.locator('[aria-label="Image results grid"]');
      const gridBox = await gridEl.boundingBox();
      await kupua.page.mouse.move(gridBox!.x + gridBox!.width / 2, gridBox!.y + gridBox!.height / 2);
      await kupua.page.mouse.wheel(0, GRID_ROW_HEIGHT * 0.5);
      await kupua.page.waitForTimeout(500);

      const pre = await getGridDiag(kupua.page);
      kupua.startConsoleCapture();
      await kupua.seekTo(0.5, 30_000);
      const post = await getGridDiag(kupua.page);

      const delta = post ? Math.abs(post.scrollTop - pre!.scrollTop) : -1;
      const subRowBefore = pre ? pre.scrollTop % GRID_ROW_HEIGHT : 0;
      const subRowAfter = post ? post.scrollTop % GRID_ROW_HEIGHT : 0;
      const subRowDelta = Math.abs(subRowAfter - subRowBefore);
      scenarios.push({
        name: "A: half-row scroll from top",
        preScrollTop: pre?.scrollTop,
        postScrollTop: post?.scrollTop,
        delta,
        subRowBefore,
        subRowAfter,
        subRowDelta,
        preserved: subRowDelta < 5,
        seekTargetLocalIndex: post?.seekTargetLocalIndex,
        preDiag: pre,
        postDiag: post,
        seekLogs: kupua.getConsoleLogs(/\[seek\]/),
      });
      console.log(`  A: scrollTop ${pre?.scrollTop.toFixed(1)} → ${post?.scrollTop.toFixed(1)} (delta=${delta.toFixed(1)}) ${delta < GRID_ROW_HEIGHT ? "✅" : "❌"}`);
    }

    // Scenario B: Scroll down 2+ rows (top row fully cut off)
    {
      await kupua.page.keyboard.press("Home");
      await kupua.waitForSeekComplete(30_000);
      await kupua.page.waitForTimeout(500);

      const gridEl = kupua.page.locator('[aria-label="Image results grid"]');
      const gridBox = await gridEl.boundingBox();
      await kupua.page.mouse.move(gridBox!.x + gridBox!.width / 2, gridBox!.y + gridBox!.height / 2);
      await kupua.page.mouse.wheel(0, GRID_ROW_HEIGHT * 2.3);
      await kupua.page.waitForTimeout(500);

      const pre = await getGridDiag(kupua.page);
      kupua.startConsoleCapture();
      await kupua.seekTo(0.5, 30_000);
      const post = await getGridDiag(kupua.page);

      const delta = post ? Math.abs(post.scrollTop - pre!.scrollTop) : -1;
      const subRowBefore = pre ? pre.scrollTop % GRID_ROW_HEIGHT : 0;
      const subRowAfter = post ? post.scrollTop % GRID_ROW_HEIGHT : 0;
      const subRowDelta = Math.abs(subRowAfter - subRowBefore);
      scenarios.push({
        name: "B: 2+ rows from top (partial cut-off)",
        preScrollTop: pre?.scrollTop,
        postScrollTop: post?.scrollTop,
        delta,
        subRowBefore,
        subRowAfter,
        subRowDelta,
        preserved: subRowDelta < 5,
        seekTargetLocalIndex: post?.seekTargetLocalIndex,
        preDiag: pre,
        postDiag: post,
        seekLogs: kupua.getConsoleLogs(/\[seek\]/),
      });
      console.log(`  B: scrollTop ${pre?.scrollTop.toFixed(1)} → ${post?.scrollTop.toFixed(1)} (delta=${delta.toFixed(1)}) ${delta < GRID_ROW_HEIGHT ? "✅" : "❌"}`);
    }

    // Scenario C: Scroll to near-bottom
    {
      await kupua.page.keyboard.press("Home");
      await kupua.waitForSeekComplete(30_000);
      await kupua.page.waitForTimeout(500);

      await kupua.page.evaluate(() => {
        const el = document.querySelector('[aria-label="Image results grid"]');
        if (el) {
          el.scrollTop = el.scrollHeight - el.clientHeight;
          el.dispatchEvent(new Event("scroll"));
        }
      });
      await kupua.page.waitForTimeout(1000);

      const pre = await getGridDiag(kupua.page);
      kupua.startConsoleCapture();
      await kupua.seekTo(0.3, 30_000);
      const post = await getGridDiag(kupua.page);

      const delta = post ? Math.abs(post.scrollTop - pre!.scrollTop) : -1;
      scenarios.push({
        name: "C: near-bottom scroll then seek 30%",
        preScrollTop: pre?.scrollTop,
        postScrollTop: post?.scrollTop,
        delta,
        preserved: delta < GRID_ROW_HEIGHT,
        seekTargetLocalIndex: post?.seekTargetLocalIndex,
        preResultsLength: pre?.resultsLength,
        postResultsLength: post?.resultsLength,
        preDiag: pre,
        postDiag: post,
        seekLogs: kupua.getConsoleLogs(/\[seek\]/),
      });
      console.log(`  C: scrollTop ${pre?.scrollTop.toFixed(1)} → ${post?.scrollTop.toFixed(1)} (delta=${delta.toFixed(1)}) ${delta < GRID_ROW_HEIGHT ? "✅" : "❌"}`);
    }

    // Scenario D: Half-row from BOTTOM — scroll so bottom row is cut off
    // This is pt 3 from the user's manual test: "initial top row being cutoff"
    {
      await kupua.page.keyboard.press("Home");
      await kupua.waitForSeekComplete(30_000);
      await kupua.page.waitForTimeout(500);

      // Scroll to maxScroll minus half a row — bottom row partially visible
      await kupua.page.evaluate((halfRow) => {
        const el = document.querySelector('[aria-label="Image results grid"]');
        if (el) {
          el.scrollTop = el.scrollHeight - el.clientHeight - halfRow;
          el.dispatchEvent(new Event("scroll"));
        }
      }, GRID_ROW_HEIGHT * 0.5);
      await kupua.page.waitForTimeout(500);

      const pre = await getGridDiag(kupua.page);
      kupua.startConsoleCapture();
      await kupua.seekTo(0.5, 30_000);
      const post = await getGridDiag(kupua.page);

      const delta = post ? Math.abs(post.scrollTop - pre!.scrollTop) : -1;
      scenarios.push({
        name: "D: half-row from bottom",
        preScrollTop: pre?.scrollTop,
        postScrollTop: post?.scrollTop,
        delta,
        preserved: delta < GRID_ROW_HEIGHT,
        seekTargetLocalIndex: post?.seekTargetLocalIndex,
        preResultsLength: pre?.resultsLength,
        postResultsLength: post?.resultsLength,
        preDiag: pre,
        postDiag: post,
        seekLogs: kupua.getConsoleLogs(/\[seek\]/),
      });
      console.log(`  D: scrollTop ${pre?.scrollTop.toFixed(1)} → ${post?.scrollTop.toFixed(1)} (delta=${delta.toFixed(1)}) ${delta < GRID_ROW_HEIGHT ? "✅" : "❌"}`);
    }

    // Scenario E: Press End TWICE (to get to the real bottom), then seek
    // End key once → atRealEnd buffer. End key again → same buffer, scroll to
    // actual bottom. Then seek to 30% — should preserve the scrollTop.
    {
      await kupua.page.keyboard.press("End");
      await kupua.page.waitForTimeout(2000);
      await kupua.waitForSeekComplete(60_000);
      // Second End — should scroll to the very bottom of the buffer
      await kupua.page.keyboard.press("End");
      await kupua.page.waitForTimeout(1000);

      const pre = await getGridDiag(kupua.page);
      kupua.startConsoleCapture();
      await kupua.seekTo(0.3, 30_000);
      const post = await getGridDiag(kupua.page);

      const delta = post ? Math.abs(post.scrollTop - pre!.scrollTop) : -1;
      scenarios.push({
        name: "E: End×2 (real bottom) then seek 30%",
        preScrollTop: pre?.scrollTop,
        postScrollTop: post?.scrollTop,
        delta,
        preserved: delta < GRID_ROW_HEIGHT,
        seekTargetLocalIndex: post?.seekTargetLocalIndex,
        preResultsLength: pre?.resultsLength,
        postResultsLength: post?.resultsLength,
        preDiag: pre,
        postDiag: post,
        seekLogs: kupua.getConsoleLogs(/\[seek\]/),
      });
      console.log(`  E: scrollTop ${pre?.scrollTop.toFixed(1)} → ${post?.scrollTop.toFixed(1)} (delta=${delta.toFixed(1)}) ${delta < GRID_ROW_HEIGHT ? "✅" : "❌"}`);
    }

    // Scenario F: Seek to 50%, scroll down 1.5 rows, then seek to 70%
    // This is the sequential seek scenario — should preserve scroll offset
    {
      await kupua.seekTo(0.5, 30_000);
      await kupua.page.waitForTimeout(500);

      const gridEl = kupua.page.locator('[aria-label="Image results grid"]');
      const gridBox = await gridEl.boundingBox();
      await kupua.page.mouse.move(gridBox!.x + gridBox!.width / 2, gridBox!.y + gridBox!.height / 2);
      await kupua.page.mouse.wheel(0, GRID_ROW_HEIGHT * 1.5);
      await kupua.page.waitForTimeout(500);

      const pre = await getGridDiag(kupua.page);
      kupua.startConsoleCapture();
      await kupua.seekTo(0.7, 30_000);
      const post = await getGridDiag(kupua.page);

      const delta = post ? Math.abs(post.scrollTop - pre!.scrollTop) : -1;
      scenarios.push({
        name: "F: seek 50% → scroll 1.5 rows → seek 70%",
        preScrollTop: pre?.scrollTop,
        postScrollTop: post?.scrollTop,
        delta,
        preserved: delta < GRID_ROW_HEIGHT,
        seekTargetLocalIndex: post?.seekTargetLocalIndex,
        preDiag: pre,
        postDiag: post,
        seekLogs: kupua.getConsoleLogs(/\[seek\]/),
      });
      console.log(`  F: scrollTop ${pre?.scrollTop.toFixed(1)} → ${post?.scrollTop.toFixed(1)} (delta=${delta.toFixed(1)}) ${delta < GRID_ROW_HEIGHT ? "✅" : "❌"}`);
    }

    recordResult("S20", { total, GRID_ROW_HEIGHT, scenarios });

    // Assert scroll preservation for scenarios where it should work.
    // A: half-row from top → headroom pre-set preserves sub-row offset
    // B: 2+ rows from top → headroom pre-set preserves sub-row offset
    //    For A and B, absolute scrollTop changes (headroom added) but
    //    sub-row offset is preserved. Check subRowDelta.
    // F: sequential seek (50%→scroll→70%) → reverse-compute preserves
    //    scrollTop directly (no headroom zone). Check absolute delta.
    //
    // C: near-bottom scroll → buffer-shrink may clamp (accepted)
    // D: half-row from bottom → buffer-shrink may clamp (accepted)
    // E: End×2 → seek → buffer-shrink always clamps (accepted)
    for (const s of scenarios) {
      if (["A", "B"].some((prefix) => s.name.startsWith(prefix))) {
        expect(
          s.subRowDelta,
          `${s.name}: sub-row offset changed by ${s.subRowDelta.toFixed(1)} ` +
          `(before=${s.subRowBefore.toFixed(1)}, after=${s.subRowAfter.toFixed(1)}). ` +
          `Vertical position was not preserved.`,
        ).toBeLessThan(5);
      }
      if (s.name.startsWith("F")) {
        expect(
          s.delta,
          `${s.name}: scrollTop delta ${s.delta.toFixed(1)} exceeds rowHeight ${GRID_ROW_HEIGHT}. ` +
          `Scroll position was not preserved.`,
        ).toBeLessThan(GRID_ROW_HEIGHT);
      }
    }
  });

  // -------------------------------------------------------------------------
  // S21: Aggressive swimming test — rapid wheel events like real trackpad
  //
  // The S14/S15 swimming tests use gentle 50px / 200ms scrolls. Real users
  // scroll with trackpad/wheel which fires many rapid events. This test
  // simulates that: 150px deltas, 50ms apart, 40 steps = 2 seconds of
  // aggressive scrolling.
  // -------------------------------------------------------------------------

  test("S21: aggressive scroll after seek — realistic wheel input", async ({ kupua }) => {
    await kupua.gotoWithParams(`until=${STABLE_UNTIL}`);
    const total = await requireRealData(kupua);

    await kupua.seekTo(0.5, 30_000);
    await kupua.page.waitForTimeout(1000);

    kupua.startConsoleCapture();

    // Rapid wheel scrolling — more like real trackpad
    const result = await detectSwimming(kupua.page, 40, 150, 50);

    const logs = kupua.getConsoleLogs(/\[prepend-comp\]|\[seek\]|\[extend/);
    const totalShifts = result.totalShifts;
    console.log(`\n  VERDICT: ${totalShifts === 0 ? "✅ NO SWIMMING" : `❌ ${totalShifts} SHIFTS`}`);
    for (const s of result.shifts.slice(0, 10)) {
      console.log(`    step ${s.step}: offset ${s.beforeOffset}→${s.afterOffset} (Δ${s.afterOffset - s.beforeOffset}), scrollTop ${s.beforeScrollTop.toFixed(0)}→${s.afterScrollTop.toFixed(0)}`);
    }

    recordResult("S21", {
      total,
      scrollParams: { steps: 40, deltaPerStep: 150, delayMs: 50 },
      swimming: result,
      consoleLogs: logs,
      verdict: totalShifts === 0 ? "STABLE" : `SWIMMING(${totalShifts})`,
    });
  });

  // -------------------------------------------------------------------------
  // S22: Scroll-up after seek — can the user scroll up immediately?
  // -------------------------------------------------------------------------

  test("S22: scroll-up after seek — immediate upward scroll", async ({ kupua }) => {
    await kupua.gotoWithParams(`until=${STABLE_UNTIL}`);
    const total = await requireRealData(kupua);

    kupua.startConsoleCapture();

    // Seek to 50%
    await kupua.seekTo(0.5, 30_000);
    const postSeek = await getGridDiag(kupua.page);
    console.log(`\n  [post-seek] offset=${postSeek?.bufferOffset}, len=${postSeek?.resultsLength}, scrollTop=${postSeek?.scrollTop.toFixed(1)}`);

    // Wait for full settle window
    await kupua.page.waitForTimeout(1500);

    const scrollBefore = await kupua.page.evaluate(() => {
      const el = document.querySelector('[aria-label="Image results grid"]');
      return el?.scrollTop ?? 0;
    });
    const storeBefore = await getStoreInternals(kupua.page);

    // Scroll UP with mouse.wheel — 5 steps of -200px to verify scroll works
    const gridEl = kupua.page.locator('[aria-label="Image results grid"]');
    const gridBox = await gridEl.boundingBox();
    if (!gridBox) { console.log("  ERROR: no grid box"); return; }
    await kupua.page.mouse.move(
      gridBox.x + gridBox.width / 2,
      gridBox.y + gridBox.height / 2,
    );
    for (let i = 0; i < 5; i++) {
      await kupua.page.mouse.wheel(0, -200);
      await kupua.page.waitForTimeout(100);
    }
    await kupua.page.waitForTimeout(500);

    const scrollAfterSmall = await kupua.page.evaluate(() => {
      const el = document.querySelector('[aria-label="Image results grid"]');
      return el?.scrollTop ?? 0;
    });
    const scrollDecreased = scrollAfterSmall < scrollBefore;

    // Phase 2: Continue scrolling to trigger extendBackward past the
    // bidirectional headroom (~100 items). With 7 cols and ~242px rows,
    // need to scroll ~14 rows × 242px ≈ 3400px to go from index ~93
    // to below EXTEND_THRESHOLD (50). 20 more events × 200px = 4000px.
    for (let i = 0; i < 20; i++) {
      await kupua.page.mouse.wheel(0, -200);
      await kupua.page.waitForTimeout(100);
    }
    await kupua.page.waitForTimeout(1500);

    const scrollAfter = await kupua.page.evaluate(() => {
      const el = document.querySelector('[aria-label="Image results grid"]');
      return el?.scrollTop ?? 0;
    });
    const storeAfter = await getStoreInternals(kupua.page);

    const backwardExtendFired = (storeAfter?.bufferOffset ?? 0) < (storeBefore?.bufferOffset ?? 0);
    const bufferGrew = (storeAfter?.resultsLength ?? 0) > (storeBefore?.resultsLength ?? 0);

    console.log(`\n  scrollTop: ${scrollBefore.toFixed(1)} → ${scrollAfterSmall.toFixed(1)} (phase 1, delta=${(scrollAfterSmall - scrollBefore).toFixed(1)})`);
    console.log(`  scrollTop after full scroll: ${scrollAfter.toFixed(1)}`);
    console.log(`  offset: ${storeBefore?.bufferOffset} → ${storeAfter?.bufferOffset}`);
    console.log(`  len: ${storeBefore?.resultsLength} → ${storeAfter?.resultsLength}`);
    console.log(`  scrollDecreased: ${scrollDecreased}`);
    console.log(`  backwardExtendFired: ${backwardExtendFired}`);
    console.log(`  bufferGrew: ${bufferGrew}`);
    console.log(`\n  VERDICT: ${scrollDecreased ? "✅ CAN SCROLL UP" : "❌ CANNOT SCROLL UP"}`);

    const logs = kupua.getConsoleLogs(/\[seek\]|\[extend|\[prepend-comp\]/);

    recordResult("S22", {
      total,
      scrollBefore,
      scrollAfter,
      scrollDelta: scrollAfter - scrollBefore,
      scrollDecreased,
      backwardExtendFired,
      bufferGrew,
      storeBefore,
      storeAfter,
      consoleLogs: logs,
      verdict: scrollDecreased ? "CAN_SCROLL_UP" : "BLOCKED",
    });

    expect(scrollDecreased, "User must be able to scroll up after seeking").toBe(true);
    // With bidirectional seek, the user starts in the buffer middle (~100 items
    // of headroom above). Phase 2 scrolls 20 more events past the headroom to
    // trigger extendBackward. On real data with 7 cols, this should bring
    // startIndex below EXTEND_THRESHOLD (50).
    const seekOffset = postSeek?.bufferOffset ?? 0;
    const extendFiredDuringSettle = (storeBefore?.bufferOffset ?? 0) < seekOffset;
    expect(
      backwardExtendFired || extendFiredDuringSettle,
      `extendBackward must fire at some point after seek — bufferOffset should decrease ` +
      `(seekOffset=${seekOffset}, beforeScroll=${storeBefore?.bufferOffset}, afterScroll=${storeAfter?.bufferOffset})`,
    ).toBe(true);
  });

  // -------------------------------------------------------------------------
  // S23: Settle-window stability — rAF scrollTop trace + CLS after seek
  //
  // Phase 2 upgrade: replaced 50ms setTimeout polling with frame-accurate
  // sampleScrollTopAtFrameRate (rAF loop). Also captures CLS via
  // PerformanceObserver for layout-shift entries. The rAF trace catches
  // 16ms swimming events that the old 50ms poll missed ~50% of the time.
  // CLS doesn't catch scrollTop-based swimming (see plan Context) but it
  // catches layout shifts from virtualizer height changes.
  // -------------------------------------------------------------------------

  test("S23: settle-window stability — rAF scrollTop trace + CLS after seek", async ({ kupua }) => {
    await kupua.gotoWithParams(`until=${STABLE_UNTIL}`);
    const total = await requireRealData(kupua);

    // Scroll to a partial-row position first
    const gridEl = kupua.page.locator('[aria-label="Image results grid"]');
    const gridBox = await gridEl.boundingBox();
    if (!gridBox) { console.log("  ERROR: no grid box"); return; }
    await kupua.page.mouse.move(
      gridBox.x + gridBox.width / 2,
      gridBox.y + gridBox.height / 2,
    );
    await kupua.page.mouse.wheel(0, GRID_ROW_HEIGHT * 0.5);
    await kupua.page.waitForTimeout(500);

    kupua.startConsoleCapture();

    // Install CLS observer BEFORE seeking — captures layout-shift entries
    // during the seek + settle window. CLS doesn't catch scrollTop-based
    // swimming (programmatic scroll, not CSS layout shift), but it catches
    // virtualizer height changes during buffer replacement.
    await kupua.page.evaluate(() => {
      (window as any).__kupua_cls_entries__ = [];
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          (window as any).__kupua_cls_entries__.push({
            value: (entry as any).value,
            hadRecentInput: (entry as any).hadRecentInput,
            startTime: entry.startTime,
            sources: (entry as any).sources?.map((s: any) => ({
              node: s.node?.tagName ?? null,
              previousRect: s.previousRect ? { x: s.previousRect.x, y: s.previousRect.y, width: s.previousRect.width, height: s.previousRect.height } : null,
              currentRect: s.currentRect ? { x: s.currentRect.x, y: s.currentRect.y, width: s.currentRect.width, height: s.currentRect.height } : null,
            })) ?? [],
          });
        }
      });
      observer.observe({ type: "layout-shift", buffered: false });
      (window as any).__kupua_cls_observer__ = observer;
    });

    // Seek via low-level click (seekTo adds 200ms wait which skips early window)
    const trackBox = await kupua.scrubber.boundingBox();
    expect(trackBox).not.toBeNull();
    await kupua.page.mouse.click(
      trackBox!.x + trackBox!.width / 2,
      trackBox!.y + 0.5 * trackBox!.height,
    );

    // Wait for data arrival
    await kupua.waitForSeekComplete(30_000);

    // ── rAF scrollTop trace ──
    // Captures every painted frame for 2s — the full settle + deferred scroll
    // window. ~120 samples at 60fps. This replaces the old 50ms setTimeout
    // polling which had ~50% chance of missing a 16-32ms swimming event.
    const scrollTopTrace = await kupua.sampleScrollTopAtFrameRate(2000);

    // Also sample store state at the start and end of the trace for context
    const storeAfterTrace = await kupua.page.evaluate(
      ({ MIN_CELL_WIDTH, ROW_HEIGHT }: any) => {
        const el = document.querySelector('[aria-label="Image results grid"]') as HTMLElement;
        const store = (window as any).__kupua_store__;
        if (!el || !store) return null;
        const s = store.getState();
        const cols = Math.max(1, Math.floor(el.clientWidth / MIN_CELL_WIDTH));
        const firstRow = Math.floor(el.scrollTop / ROW_HEIGHT);
        const firstLocalIdx = firstRow * cols;
        return {
          scrollTop: el.scrollTop,
          offset: s.bufferOffset,
          len: s.results.length,
          firstVisibleGlobalPos: firstLocalIdx + s.bufferOffset,
        };
      },
      { MIN_CELL_WIDTH: GRID_MIN_CELL_WIDTH, ROW_HEIGHT: GRID_ROW_HEIGHT },
    );

    // ── Monotonicity check ──
    // A non-monotonic scrollTop change = swimming (viewport jumped backward).
    // Sub-pixel tolerance of 0.5px for browser rounding.
    let nonMonotonicCount = 0;
    let maxBackwardJump = 0;
    const violations: Array<{ frame: number; prev: number; curr: number; delta: number }> = [];
    for (let i = 1; i < scrollTopTrace.length; i++) {
      const delta = scrollTopTrace[i] - scrollTopTrace[i - 1];
      if (delta < -0.5) {
        nonMonotonicCount++;
        const jump = Math.abs(delta);
        if (jump > maxBackwardJump) maxBackwardJump = jump;
        if (violations.length < 10) {
          violations.push({ frame: i, prev: scrollTopTrace[i - 1], curr: scrollTopTrace[i], delta });
        }
      }
    }

    // ── Also compute content-shift metric (legacy, for comparison) ──
    // Poll a few snapshots for firstVisibleGlobalPos to maintain continuity
    // with the old S23 metric. This runs AFTER the rAF trace (trace is the
    // primary measurement now).
    const snapshots: Array<{ t: number; scrollTop: number; offset: number; len: number; firstVisibleGlobalPos: number }> = [];
    const startT = Date.now();
    for (let i = 0; i < 20; i++) {
      await kupua.page.waitForTimeout(50);
      const snap = await kupua.page.evaluate(
        ({ MIN_CELL_WIDTH, ROW_HEIGHT }: any) => {
          const el = document.querySelector('[aria-label="Image results grid"]') as HTMLElement;
          const store = (window as any).__kupua_store__;
          if (!el || !store) return null;
          const s = store.getState();
          const cols = Math.max(1, Math.floor(el.clientWidth / MIN_CELL_WIDTH));
          const firstRow = Math.floor(el.scrollTop / ROW_HEIGHT);
          const firstLocalIdx = firstRow * cols;
          return {
            scrollTop: el.scrollTop,
            offset: s.bufferOffset,
            len: s.results.length,
            firstVisibleGlobalPos: firstLocalIdx + s.bufferOffset,
          };
        },
        { MIN_CELL_WIDTH: GRID_MIN_CELL_WIDTH, ROW_HEIGHT: GRID_ROW_HEIGHT },
      );
      if (snap) snapshots.push({ t: Date.now() - startT, ...snap });
    }

    let maxContentShift = 0;
    let maxShiftStep = -1;
    for (let i = 1; i < snapshots.length; i++) {
      const shift = Math.abs(
        snapshots[i].firstVisibleGlobalPos - snapshots[i - 1].firstVisibleGlobalPos,
      );
      if (shift > maxContentShift) {
        maxContentShift = shift;
        maxShiftStep = i;
      }
    }

    // ── Collect CLS entries ──
    const clsEntries = await kupua.page.evaluate(() => {
      const observer = (window as any).__kupua_cls_observer__;
      if (observer) observer.disconnect();
      return (window as any).__kupua_cls_entries__ ?? [];
    });
    const clsTotal = clsEntries.reduce((sum: number, e: any) => sum + (e.hadRecentInput ? 0 : e.value), 0);

    // ── Print diagnostics ──
    const cols = await kupua.page.evaluate(({ MIN_CELL_WIDTH }: any) => {
      const el = document.querySelector('[aria-label="Image results grid"]') as HTMLElement;
      return el ? Math.max(1, Math.floor(el.clientWidth / MIN_CELL_WIDTH)) : 7;
    }, { MIN_CELL_WIDTH: GRID_MIN_CELL_WIDTH });
    const MAX_SHIFT = cols + 1;

    console.log(`\n  ── rAF SCROLL TRACE (2s, ${scrollTopTrace.length} frames) ──`);
    console.log(`  first=${scrollTopTrace[0]?.toFixed(1)}, last=${scrollTopTrace[scrollTopTrace.length - 1]?.toFixed(1)}`);
    console.log(`  nonMonotonicFrames=${nonMonotonicCount}, maxBackwardJump=${maxBackwardJump.toFixed(1)}px`);
    if (violations.length > 0) {
      for (const v of violations) {
        console.log(`    frame ${v.frame}: ${v.prev.toFixed(1)} → ${v.curr.toFixed(1)} (Δ${v.delta.toFixed(1)})`);
      }
    }
    console.log(`\n  ── CONTENT SHIFT (legacy metric, 20 samples) ──`);
    console.log(`  maxContentShift=${maxContentShift} items at step ${maxShiftStep} (limit: ${MAX_SHIFT}, cols: ${cols})`);
    console.log(`\n  ── CLS (PerformanceObserver layout-shift) ──`);
    console.log(`  entries=${clsEntries.length}, total CLS=${clsTotal.toFixed(4)}`);
    for (const e of clsEntries.slice(0, 5)) {
      console.log(`    value=${e.value.toFixed(4)} hadRecentInput=${e.hadRecentInput} t=${e.startTime.toFixed(0)}ms sources=${e.sources.length}`);
    }

    const monotonicOk = nonMonotonicCount === 0;
    const contentShiftOk = maxContentShift <= MAX_SHIFT;
    console.log(`\n  VERDICT: ${monotonicOk ? "✅ MONOTONIC" : `❌ ${nonMonotonicCount} BACKWARD JUMPS`} | ${contentShiftOk ? "✅ STABLE" : `❌ CONTENT SHIFT ${maxContentShift}`} | CLS=${clsTotal.toFixed(4)}`);

    const logs = kupua.getConsoleLogs(/\[seek\]|\[prepend-comp\]|\[extend/);

    recordResult("S23", {
      total,
      // rAF trace — primary measurement
      rAfTrace: {
        sampleCount: scrollTopTrace.length,
        first: scrollTopTrace[0] ?? null,
        last: scrollTopTrace[scrollTopTrace.length - 1] ?? null,
        nonMonotonicCount,
        maxBackwardJump,
        violations,
        // Include a decimated trace (every 10th sample) to keep JSON manageable
        decimatedTrace: scrollTopTrace.filter((_, i) => i % 10 === 0),
      },
      // Content shift — legacy metric for continuity
      contentShift: {
        snapshotCount: snapshots.length,
        maxContentShift,
        maxShiftStep,
        cols,
        maxShiftLimit: MAX_SHIFT,
      },
      // CLS — layout shift detection
      cls: {
        entryCount: clsEntries.length,
        totalCls: +clsTotal.toFixed(4),
        entries: clsEntries.slice(0, 10), // cap at 10 for report size
      },
      storeAfterTrace,
      consoleLogs: logs,
      verdict: {
        monotonic: monotonicOk,
        contentShiftOk,
        cls: clsTotal,
      },
    });

    // Primary assertion: scrollTop must be monotonically non-decreasing
    // during the settle window. A backward jump = swimming.
    expect(
      nonMonotonicCount,
      `scrollTop was non-monotonic: ${nonMonotonicCount} backward jumps ` +
      `(max jump: ${maxBackwardJump.toFixed(1)}px). This is swimming.`,
    ).toBe(0);

    // Secondary assertion: visible content must not shift beyond tolerance
    expect(
      maxContentShift,
      `Visible content shifted by ${maxContentShift} items (limit: ${MAX_SHIFT}, cols: ${cols})`,
    ).toBeLessThanOrEqual(MAX_SHIFT);
  });

  // -------------------------------------------------------------------------
  // S24: Seek from various row offsets — no swim in headroom zone
  // -------------------------------------------------------------------------

  test("S24: seek from row offsets 0.5/1.5/5.5 — no swim", async ({ kupua }) => {
    await kupua.gotoWithParams(`until=${STABLE_UNTIL}`);
    const total = await requireRealData(kupua);

    kupua.startConsoleCapture();

    const gridEl = kupua.page.locator('[aria-label="Image results grid"]');
    const gridBox = await gridEl.boundingBox();
    if (!gridBox) { console.log("  ERROR: no grid box"); return; }

    const results: Array<{
      rowOffset: number;
      scrollPx: number;
      maxShift: number;
      firstPos: number;
      lastPos: number;
      snapshotCount: number;
      subRowBefore: number;
      subRowAfter: number;
    }> = [];

    for (const rowOffset of [0.5, 1.5, 5.5]) {
      // Reset to top
      await kupua.page.keyboard.press("Home");
      await kupua.page.waitForTimeout(500);

      // Scroll to the target row offset
      const scrollPx = Math.round(GRID_ROW_HEIGHT * rowOffset);
      await kupua.page.mouse.move(
        gridBox.x + gridBox.width / 2,
        gridBox.y + gridBox.height / 2,
      );
      await kupua.page.mouse.wheel(0, scrollPx);
      await kupua.page.waitForTimeout(300);

      // Capture pre-seek scrollTop for position preservation check
      const preScrollTop = await kupua.page.evaluate(() => {
        const el = document.querySelector('[aria-label="Image results grid"]');
        return el ? el.scrollTop : 0;
      });

      // Seek to 50%
      await kupua.seekTo(0.5, 30_000);

      // Capture post-seek scrollTop for sub-row offset check
      const postScrollTop = await kupua.page.evaluate(() => {
        const el = document.querySelector('[aria-label="Image results grid"]');
        return el ? el.scrollTop : 0;
      });

      const subRowBefore = preScrollTop % GRID_ROW_HEIGHT;
      const subRowAfter = postScrollTop % GRID_ROW_HEIGHT;

      // Poll for 3 seconds to detect content shift
      const snapshots: Array<{ t: number; pos: number }> = [];
      const start = Date.now();
      for (let i = 0; i < 60; i++) {
        const diag = await getGridDiag(kupua.page);
        if (diag) {
          snapshots.push({
            t: Date.now() - start,
            pos: diag.firstVisibleGlobalPos,
          });
        }
        await kupua.page.waitForTimeout(50);
      }

      // Calculate max content shift
      let maxShift = 0;
      for (let j = 1; j < snapshots.length; j++) {
        const shift = Math.abs(snapshots[j].pos - snapshots[j - 1].pos);
        if (shift > maxShift) maxShift = shift;
      }

      const entry = {
        rowOffset,
        scrollPx,
        maxShift,
        firstPos: snapshots[0]?.pos ?? -1,
        lastPos: snapshots[snapshots.length - 1]?.pos ?? -1,
        snapshotCount: snapshots.length,
        subRowBefore,
        subRowAfter,
      };
      results.push(entry);

      console.log(
        `\n  [row=${rowOffset}] scrollPx=${scrollPx}, maxShift=${maxShift}, ` +
        `subRow: ${subRowBefore.toFixed(1)} → ${subRowAfter.toFixed(1)}, ` +
        `scrollTop: ${preScrollTop.toFixed(1)} → ${postScrollTop.toFixed(1)}, ` +
        `first=${entry.firstPos}, last=${entry.lastPos}, snaps=${entry.snapshotCount}`,
      );
    }

    const cols = await kupua.page.evaluate(() => {
      const el = document.querySelector('[aria-label="Image results grid"]');
      return el ? Math.max(1, Math.floor(el.clientWidth / 280)) : 7;
    });
    const MAX_SHIFT = cols + 1;

    recordResult("S24", {
      total,
      cols,
      maxShiftLimit: MAX_SHIFT,
      results,
      consoleLogs: kupua.getConsoleLogs(/\[seek\]|\[prepend-comp\]/),
      verdict: results.every((r) => r.maxShift <= MAX_SHIFT && Math.abs(r.subRowAfter - r.subRowBefore) < 5)
        ? "PERFECT"
        : results.every((r) => r.maxShift <= MAX_SHIFT)
          ? "NO_SWIM_BUT_POSITION_LOST"
          : "SWIM_DETECTED",
    });

    for (const r of results) {
      expect(
        r.maxShift,
        `Seek from row offset ${r.rowOffset} caused ${r.maxShift}-item content shift ` +
        `(limit: ${MAX_SHIFT}, cols: ${cols}). Swimming in headroom zone.`,
      ).toBeLessThanOrEqual(MAX_SHIFT);

      expect(
        Math.abs(r.subRowAfter - r.subRowBefore),
        `Seek from row offset ${r.rowOffset}: sub-row offset changed from ` +
        `${r.subRowBefore.toFixed(1)} to ${r.subRowAfter.toFixed(1)}. ` +
        `Vertical position was not preserved.`,
      ).toBeLessThan(5);
    }
  });

  // -------------------------------------------------------------------------
  // S25: Fresh-app cold-start seek — navigate, wait, seek without scrolling
  //
  // The most common user scenario: user arrives at the app, sees results,
  // clicks the scrubber at 50% without scrolling first. This is the exact
  // path that the Agent 11-13 bug class affected: scrollTop=0, no headroom,
  // backward items missing. Existing smoke tests all pre-scroll or test
  // scroll-up — none test this cold-start path on real data.
  //
  // Asserts:
  //   1. bufferOffset > 0 (backward items loaded — bidirectional seek)
  //   2. scrollTop moved to headroom position (not stuck at 0)
  //   3. firstVisibleGlobalPos stable over 1.5s (zero content shift)
  //   4. scrollTop monotonically non-decreasing (rAF trace, no swimming)
  // -------------------------------------------------------------------------

  test("S25: fresh-app cold-start seek — no pre-scroll, seek to 50%", async ({ kupua }) => {
    await kupua.gotoWithParams(`until=${STABLE_UNTIL}`);
    const total = await requireRealData(kupua);

    kupua.startConsoleCapture();

    // Verify we're at scrollTop=0 — no pre-scrolling
    const preScrollTop = await kupua.getScrollTop();
    expect(preScrollTop).toBe(0);

    const preDiag = await getGridDiag(kupua.page);
    console.log(`\n  [pre-seek] scrollTop=${preDiag?.scrollTop.toFixed(1)}, offset=${preDiag?.bufferOffset}, len=${preDiag?.resultsLength}`);

    // Seek to 50% via seekTo (waits for seek completion)
    await kupua.seekTo(0.5, 30_000);

    const postDiag = await getGridDiag(kupua.page);
    const store = await getStoreInternals(kupua.page);
    if (!postDiag) { console.log("  ERROR: no grid diag"); return; }

    console.log(`\n  [post-seek] scrollTop=${postDiag.scrollTop.toFixed(1)}, offset=${postDiag.bufferOffset}, len=${postDiag.resultsLength}`);
    console.log(`  seekTargetLocalIndex=${postDiag.seekTargetLocalIndex}, firstVisibleGlobalPos=${postDiag.firstVisibleGlobalPos}`);

    // Assertion 1: backward items loaded (bidirectional seek)
    const hasHeadroom = postDiag.bufferOffset > 0 || (store?.bufferOffset ?? 0) > 0;
    console.log(`  bufferOffset=${postDiag.bufferOffset} → ${hasHeadroom ? "✅ HEADROOM" : "❌ NO HEADROOM"}`);

    // Assertion 2: scrollTop moved from 0 to headroom position
    const scrollMoved = postDiag.scrollTop > 0;
    console.log(`  scrollTop=${postDiag.scrollTop.toFixed(1)} → ${scrollMoved ? "✅ MOVED" : "❌ STUCK AT 0"}`);

    // Assertion 3: firstVisibleGlobalPos stable over 1.5s
    // Use coarser polling (50ms) — this measures content stability, not pixel precision
    const posSnapshots: number[] = [];
    for (let i = 0; i < 30; i++) {
      await kupua.page.waitForTimeout(50);
      const diag = await getGridDiag(kupua.page);
      if (diag) posSnapshots.push(diag.firstVisibleGlobalPos);
    }

    let maxPosShift = 0;
    for (let i = 1; i < posSnapshots.length; i++) {
      const shift = Math.abs(posSnapshots[i] - posSnapshots[i - 1]);
      if (shift > maxPosShift) maxPosShift = shift;
    }
    const posStable = maxPosShift === 0;
    console.log(`  content stability: maxShift=${maxPosShift} items over 1.5s → ${posStable ? "✅ STABLE" : `❌ SHIFTED`}`);

    // Assertion 4: rAF scrollTop monotonicity (frame-accurate swimming detection)
    const scrollTrace = await kupua.sampleScrollTopAtFrameRate(1500);
    let backwardJumps = 0;
    let maxJump = 0;
    for (let i = 1; i < scrollTrace.length; i++) {
      const delta = scrollTrace[i] - scrollTrace[i - 1];
      if (delta < -0.5) {
        backwardJumps++;
        if (Math.abs(delta) > maxJump) maxJump = Math.abs(delta);
      }
    }
    const monotonicOk = backwardJumps === 0;
    console.log(`  rAF trace: ${scrollTrace.length} frames, backwardJumps=${backwardJumps}, maxJump=${maxJump.toFixed(1)}px → ${monotonicOk ? "✅ MONOTONIC" : "❌ SWIMMING"}`);

    const seekLogs = kupua.getConsoleLogs(/\[seek\]|\[seek-diag\]|\[extend/);

    const expectedGlobalPos = Math.floor(total * 0.5);
    const drift = postDiag.firstVisibleGlobalPos - expectedGlobalPos;
    const driftPct = (drift / total) * 100;

    console.log(`\n  position: visible=${postDiag.firstVisibleGlobalPos}, expected~${expectedGlobalPos}, drift=${drift} (${driftPct.toFixed(2)}%)`);
    console.log(`  VERDICT: ${hasHeadroom && scrollMoved && posStable && monotonicOk ? "✅ PERFECT" : "❌ ISSUES DETECTED"}`);

    recordResult("S25", {
      total,
      preScrollTop,
      postDiag,
      storeInternals: store,
      hasHeadroom,
      scrollMoved,
      contentStability: {
        maxPosShift,
        snapshotCount: posSnapshots.length,
        firstPos: posSnapshots[0] ?? null,
        lastPos: posSnapshots[posSnapshots.length - 1] ?? null,
      },
      rAfTrace: {
        sampleCount: scrollTrace.length,
        first: scrollTrace[0] ?? null,
        last: scrollTrace[scrollTrace.length - 1] ?? null,
        backwardJumps,
        maxJump,
      },
      seekAccuracy: {
        expectedGlobalPos,
        actualFirstVisibleGlobalPos: postDiag.firstVisibleGlobalPos,
        drift,
        driftPct: +driftPct.toFixed(4),
      },
      seekLogs: seekLogs.slice(-20),
      verdict: {
        hasHeadroom,
        scrollMoved,
        contentStable: posStable,
        monotonic: monotonicOk,
        accuracyOk: Math.abs(driftPct) < 10,
      },
    });

    // Hard assertions
    expect(hasHeadroom, "Bidirectional seek must load backward items (bufferOffset > 0)").toBe(true);
    expect(scrollMoved, "scrollTop must move from 0 to headroom position after seek").toBe(true);
    expect(maxPosShift, `Content shifted by ${maxPosShift} items during settle window`).toBe(0);
    expect(backwardJumps, `scrollTop had ${backwardJumps} backward jumps (swimming)`).toBe(0);
    expect(Math.abs(driftPct), `Seek accuracy drift ${driftPct.toFixed(2)}% exceeds 10%`).toBeLessThan(10);
  });

  // -------------------------------------------------------------------------
  // S26: Sustained scroll-up swimming — seek to 50%, scroll UP 10,000+px
  //
  // This is the detection test for the backward-prepend swimming bug.
  // After seek, bidirectional headroom gives ~100 items (~14 rows, ~4,200px)
  // above the viewport. Once the user scrolls UP past that headroom,
  // extendBackward fires and prepends items — the scrollTop compensation
  // may produce a 1-frame artifact where cells "dance" to wrong positions.
  //
  // Detection: sample firstVisibleGlobalPos after each wheel step. When
  // scrolling UP, this value must monotonically DECREASE (or stay the same).
  // Any INCREASE = the viewport jumped backward = swimming detected.
  //
  // S26a tests scroll-UP (where the bug manifests).
  // S26b tests scroll-DOWN as a control (forward extend is flash-free).
  // -------------------------------------------------------------------------

  test("S26a: sustained scroll-up after seek — swimming detection", async ({ kupua }) => {
    await kupua.gotoWithParams(`until=${STABLE_UNTIL}`);
    const total = await requireRealData(kupua);

    kupua.startConsoleCapture();

    // Seek to 50%
    await kupua.seekTo(0.5, 30_000);
    const postSeek = await getGridDiag(kupua.page);
    if (!postSeek) { console.log("  ERROR: no grid diag"); return; }

    console.log(`\n  [post-seek] offset=${postSeek.bufferOffset}, len=${postSeek.resultsLength}, scrollTop=${postSeek.scrollTop.toFixed(1)}`);
    console.log(`  headroom: ${postSeek.seekTargetLocalIndex} items above viewport (${(postSeek.seekTargetLocalIndex / postSeek.cols).toFixed(1)} rows, ${((postSeek.seekTargetLocalIndex / postSeek.cols) * GRID_ROW_HEIGHT).toFixed(0)}px)`);

    // Wait for full settle
    await kupua.page.waitForTimeout(2000);

    // Position cursor over the grid
    const gridEl = kupua.page.locator('[aria-label="Image results grid"]');
    const gridBox = await gridEl.boundingBox();
    if (!gridBox) { console.log("  ERROR: no grid box"); return; }
    await kupua.page.mouse.move(
      gridBox.x + gridBox.width / 2,
      gridBox.y + gridBox.height / 2,
    );

    // -----------------------------------------------------------------------
    // Start rAF-based continuous sampler — captures every frame during scroll.
    // This catches sub-frame artifacts that 100ms polling misses.
    // -----------------------------------------------------------------------
    await kupua.page.evaluate(
      ({ MIN_CELL_WIDTH, ROW_HEIGHT }: any) => {
        const w = window as any;
        w.__s26a_samples = [];
        w.__s26a_running = true;
        const loop = () => {
          if (!w.__s26a_running) return;
          const el = document.querySelector('[aria-label="Image results grid"]');
          const store = w.__kupua_store__;
          if (el && store) {
            const s = store.getState();
            const cols = Math.max(1, Math.floor(el.clientWidth / MIN_CELL_WIDTH));
            const firstRow = Math.floor(el.scrollTop / ROW_HEIGHT);
            const firstLocalIdx = firstRow * cols;
            const pos = firstLocalIdx + s.bufferOffset;
            const arr = w.__s26a_samples;
            // Deduplicate: only record when value changes
            if (arr.length === 0 || arr[arr.length - 1].pos !== pos) {
              arr.push({
                pos,
                t: performance.now(),
                scrollTop: el.scrollTop,
                bufferOffset: s.bufferOffset,
                len: s.results.length,
                prependGen: s._prependGeneration,
              });
            }
          }
          requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
      },
      { MIN_CELL_WIDTH: GRID_MIN_CELL_WIDTH, ROW_HEIGHT: GRID_ROW_HEIGHT },
    );

    // Scroll UP in small steps
    const steps = 80;
    const deltaPerStep = -150;
    const delayMs = 100;

    for (let step = 0; step < steps; step++) {
      await kupua.page.mouse.wheel(0, deltaPerStep);
      await kupua.page.waitForTimeout(delayMs);
    }

    // Stop sampler and retrieve data
    const rafSamples: Array<{
      pos: number;
      t: number;
      scrollTop: number;
      bufferOffset: number;
      len: number;
      prependGen: number;
    }> = await kupua.page.evaluate(() => {
      const w = window as any;
      w.__s26a_running = false;
      return w.__s26a_samples ?? [];
    });

    // Also take a final snapshot for store state
    const finalSnap = await kupua.page.evaluate(() => {
      const store = (window as any).__kupua_store__;
      if (!store) return null;
      const s = store.getState();
      return {
        bufferOffset: s.bufferOffset,
        resultsLength: s.results.length,
        prependGen: s._prependGeneration,
      };
    });

    // Build step-like samples for compatibility (one per distinct position)
    const samples = rafSamples.map((s, i) => ({
      step: i,
      firstVisibleGlobalPos: s.pos,
      bufferOffset: s.bufferOffset,
      resultsLength: s.len,
      scrollTop: s.scrollTop,
      prependGen: s.prependGen,
    }));

    // Detect monotonicity violations: when scrolling UP, firstVisibleGlobalPos
    // must only decrease (or stay the same). Any increase = swimming.
    const violations: Array<{
      step: number;
      prevPos: number;
      currPos: number;
      jump: number;
      prependGen: number;
      timeDelta: number;
    }> = [];

    for (let i = 1; i < rafSamples.length; i++) {
      const prev = rafSamples[i - 1];
      const curr = rafSamples[i];
      if (curr.pos > prev.pos) {
        violations.push({
          step: i,
          prevPos: prev.pos,
          currPos: curr.pos,
          jump: curr.pos - prev.pos,
          prependGen: curr.prependGen,
          timeDelta: Math.round(curr.t - prev.t),
        });
      }
    }

    // Count how many extendBackward cycles occurred
    const prependGens = new Set(samples.map(s => s.prependGen));
    const prependCount = Math.max(0, prependGens.size - 1);
    const offsetStart = samples[0]?.bufferOffset ?? 0;
    const offsetEnd = samples[samples.length - 1]?.bufferOffset ?? 0;
    const totalScrolled = Math.abs(
      (samples[samples.length - 1]?.scrollTop ?? 0) - (samples[0]?.scrollTop ?? 0),
    );

    console.log(`\n  ── S26a SUSTAINED SCROLL-UP ──`);
    console.log(`  steps=${steps}, delta=${deltaPerStep}px, delay=${delayMs}ms`);
    console.log(`  rAF samples: ${rafSamples.length} distinct positions (deduplicated)`);
    console.log(`  totalScrolledPx=${totalScrolled.toFixed(0)}`);
    console.log(`  bufferOffset: ${offsetStart} → ${offsetEnd} (Δ${offsetEnd - offsetStart})`);
    console.log(`  extendBackward cycles: ${prependCount} (prependGens: ${[...prependGens].join(",")})`);
    console.log(`  firstVisibleGlobalPos: ${samples[0]?.firstVisibleGlobalPos} → ${samples[samples.length - 1]?.firstVisibleGlobalPos}`);
    console.log(`  monotonicity violations: ${violations.length}`);
    for (const v of violations.slice(0, 10)) {
      console.log(`    frame ${v.step}: ${v.prevPos} → ${v.currPos} (jump +${v.jump}, prependGen=${v.prependGen}, Δt=${v.timeDelta}ms)`);
    }
    console.log(`\n  VERDICT: ${violations.length === 0 ? "✅ NO SWIMMING" : `❌ ${violations.length} BACKWARD JUMPS (swimming)`}`);

    const logs = kupua.getConsoleLogs(/\[prepend-comp\]|\[prepend-pre-comp\]|\[seek\]|\[extend/);

    recordResult("S26a", {
      total,
      postSeekDiag: postSeek,
      scrollParams: { steps, deltaPerStep, delayMs },
      rafSampleCount: rafSamples.length,
      totalScrolledPx: totalScrolled,
      bufferOffsetStart: offsetStart,
      bufferOffsetEnd: offsetEnd,
      prependCount,
      prependGens: [...prependGens],
      firstPosStart: samples[0]?.firstVisibleGlobalPos,
      firstPosEnd: samples[samples.length - 1]?.firstVisibleGlobalPos,
      violationCount: violations.length,
      violations: violations.slice(0, 20),
      sampleCount: samples.length,
      consoleLogs: logs.slice(-30),
      verdict: violations.length === 0 ? "STABLE" : `SWIMMING(${violations.length})`,
    });

    // The assertion: monotonic firstVisibleGlobalPos when scrolling up.
    // At least one extendBackward must have fired for this test to be meaningful.
    expect(
      prependCount,
      `extendBackward must fire during sustained scroll-up (offset ${offsetStart} → ${offsetEnd}). ` +
      `Need more scroll distance or headroom was not consumed.`,
    ).toBeGreaterThan(0);

    expect(
      violations.length,
      `Swimming detected: ${violations.length} backward jumps in firstVisibleGlobalPos ` +
      `during sustained scroll-up after seek. ` +
      `First violation at frame ${violations[0]?.step}: ` +
      `pos ${violations[0]?.prevPos} → ${violations[0]?.currPos} (jump +${violations[0]?.jump}, Δt=${violations[0]?.timeDelta}ms).`,
    ).toBe(0);
  });

  test("S26b: sustained scroll-down after seek — forward eviction swimming probe", async ({ kupua }) => {
    await kupua.gotoWithParams(`until=${STABLE_UNTIL}`);
    const total = await requireRealData(kupua);

    kupua.startConsoleCapture();

    // Seek to 50%
    await kupua.seekTo(0.5, 30_000);
    const postSeek = await getGridDiag(kupua.page);
    if (!postSeek) { console.log("  ERROR: no grid diag"); return; }

    console.log(`\n  [post-seek] offset=${postSeek.bufferOffset}, len=${postSeek.resultsLength}, scrollTop=${postSeek.scrollTop.toFixed(1)}`);

    // Wait for full settle
    await kupua.page.waitForTimeout(2000);

    // Position cursor over the grid
    const gridEl = kupua.page.locator('[aria-label="Image results grid"]');
    const gridBox = await gridEl.boundingBox();
    if (!gridBox) { console.log("  ERROR: no grid box"); return; }

    // FORWARD EVICTION PROBE — scroll far enough to fill buffer to
    // BUFFER_CAPACITY (1000) and trigger forward eviction.
    await kupua.page.mouse.move(
      gridBox.x + gridBox.width / 2,
      gridBox.y + gridBox.height / 2,
    );

    // -----------------------------------------------------------------------
    // Start rAF-based continuous sampler (same as S26a but for scroll-down)
    // -----------------------------------------------------------------------
    await kupua.page.evaluate(
      ({ MIN_CELL_WIDTH, ROW_HEIGHT }: any) => {
        const w = window as any;
        w.__s26b_samples = [];
        w.__s26b_running = true;
        const loop = () => {
          if (!w.__s26b_running) return;
          const el = document.querySelector('[aria-label="Image results grid"]');
          const store = w.__kupua_store__;
          if (el && store) {
            const s = store.getState();
            const cols = Math.max(1, Math.floor(el.clientWidth / MIN_CELL_WIDTH));
            const firstRow = Math.floor(el.scrollTop / ROW_HEIGHT);
            const firstLocalIdx = firstRow * cols;
            const pos = firstLocalIdx + s.bufferOffset;
            const arr = w.__s26b_samples;
            // Deduplicate: only record when value changes
            if (arr.length === 0 || arr[arr.length - 1].pos !== pos) {
              arr.push({
                pos,
                t: performance.now(),
                scrollTop: el.scrollTop,
                bufferOffset: s.bufferOffset,
                len: s.results.length,
                forwardEvictGen: s._forwardEvictGeneration,
              });
            }
          }
          requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
      },
      { MIN_CELL_WIDTH: GRID_MIN_CELL_WIDTH, ROW_HEIGHT: GRID_ROW_HEIGHT },
    );

    const steps = 200;
    const deltaPerStep = 200;
    const delayMs = 100;

    for (let step = 0; step < steps; step++) {
      await kupua.page.mouse.wheel(0, deltaPerStep);
      await kupua.page.waitForTimeout(delayMs);
    }

    // Stop sampler and retrieve data
    const rafSamples: Array<{
      pos: number;
      t: number;
      scrollTop: number;
      bufferOffset: number;
      len: number;
      forwardEvictGen: number;
    }> = await kupua.page.evaluate(() => {
      const w = window as any;
      w.__s26b_running = false;
      return w.__s26b_samples ?? [];
    });

    // Build step-like samples for compatibility
    const samples = rafSamples.map((s, i) => ({
      step: i,
      firstVisibleGlobalPos: s.pos,
      bufferOffset: s.bufferOffset,
      resultsLength: s.len,
      scrollTop: s.scrollTop,
      forwardEvictGen: s.forwardEvictGen,
    }));

    // Detect monotonicity violations: when scrolling DOWN, firstVisibleGlobalPos
    // must only increase (or stay the same). Any decrease = swimming.
    const violations: Array<{
      step: number;
      prevPos: number;
      currPos: number;
      jump: number;
      forwardEvictGen: number;
      bufferOffset: number;
      resultsLength: number;
      timeDelta: number;
    }> = [];

    for (let i = 1; i < rafSamples.length; i++) {
      const prev = rafSamples[i - 1];
      const curr = rafSamples[i];
      if (curr.pos < prev.pos) {
        violations.push({
          step: i,
          prevPos: prev.pos,
          currPos: curr.pos,
          jump: prev.pos - curr.pos,
          forwardEvictGen: curr.forwardEvictGen,
          bufferOffset: curr.bufferOffset,
          resultsLength: curr.len,
          timeDelta: Math.round(curr.t - prev.t),
        });
      }
    }

    // Count eviction cycles and buffer growth
    const evictGens = new Set(samples.map(s => s.forwardEvictGen));
    const evictCount = Math.max(0, evictGens.size - 1);
    const maxLen = Math.max(...samples.map(s => s.resultsLength));
    const offsetStart = samples[0]?.bufferOffset ?? 0;
    const offsetEnd = samples[samples.length - 1]?.bufferOffset ?? 0;
    const totalScrolled = Math.abs(
      (samples[samples.length - 1]?.scrollTop ?? 0) - (samples[0]?.scrollTop ?? 0),
    );

    console.log(`\n  ── S26b SUSTAINED SCROLL-DOWN (forward eviction probe) ──`);
    console.log(`  steps=${steps}, delta=${deltaPerStep}px, delay=${delayMs}ms`);
    console.log(`  rAF samples: ${rafSamples.length} distinct positions (deduplicated)`);
    console.log(`  totalScrolledPx=${totalScrolled.toFixed(0)}`);
    console.log(`  bufferOffset: ${offsetStart} → ${offsetEnd} (Δ${offsetEnd - offsetStart})`);
    console.log(`  maxBufferLen: ${maxLen} (BUFFER_CAPACITY=1000)`);
    console.log(`  forwardEvict cycles: ${evictCount} (evictGens: ${[...evictGens].join(",")})`);
    console.log(`  firstVisibleGlobalPos: ${samples[0]?.firstVisibleGlobalPos} → ${samples[samples.length - 1]?.firstVisibleGlobalPos}`);
    console.log(`  monotonicity violations: ${violations.length}`);
    for (const v of violations.slice(0, 15)) {
      console.log(`    frame ${v.step}: ${v.prevPos} → ${v.currPos} (jump -${v.jump}, evictGen=${v.forwardEvictGen}, offset=${v.bufferOffset}, len=${v.resultsLength}, Δt=${v.timeDelta}ms)`);
    }

    // Compare with S26a for context
    const evictionTriggered = evictCount > 0;
    const violationsAtEviction = violations.filter(v => v.forwardEvictGen > 0);
    const violationsBeforeEviction = violations.filter(v => v.forwardEvictGen === 0);

    console.log(`\n  violations before eviction: ${violationsBeforeEviction.length}`);
    console.log(`  violations at/after eviction: ${violationsAtEviction.length}`);
    console.log(`  eviction triggered: ${evictionTriggered}`);
    console.log(`\n  VERDICT: ${violations.length === 0 ? "✅ NO SWIMMING" : `⚠️  ${violations.length} FORWARD JUMPS (${evictionTriggered ? "eviction-related" : "pre-eviction"})`}`);

    const logs = kupua.getConsoleLogs(/\[prepend-comp\]|\[prepend-pre-comp\]|\[seek\]|\[extend|\[evict/);

    recordResult("S26b", {
      total,
      postSeekDiag: postSeek,
      scrollParams: { steps, deltaPerStep, delayMs },
      rafSampleCount: rafSamples.length,
      totalScrolledPx: totalScrolled,
      bufferOffsetStart: offsetStart,
      bufferOffsetEnd: offsetEnd,
      maxBufferLen: maxLen,
      evictCount,
      evictGens: [...evictGens],
      evictionTriggered,
      firstPosStart: samples[0]?.firstVisibleGlobalPos,
      firstPosEnd: samples[samples.length - 1]?.firstVisibleGlobalPos,
      violationCount: violations.length,
      violationsBeforeEviction: violationsBeforeEviction.length,
      violationsAtEviction: violationsAtEviction.length,
      violations: violations.slice(0, 20),
      sampleCount: samples.length,
      consoleLogs: logs.slice(-30),
      verdict: violations.length === 0 ? "STABLE" : `SWIMMING(${violations.length})`,
    });

    // SOFT ASSERTION: we expect this to pass (forward extend = append = free),
    // but if forward eviction causes detectable swimming, we want to know
    // WITHOUT failing the suite. Log a warning instead.
    if (violations.length > 0) {
      console.log(
        `\n  ⚠️  FORWARD SWIMMING DETECTED — ${violations.length} violations. ` +
        `This is the "less bad" flash (valid positions). Not blocking.`,
      );
    }

    // Hard assertion: extendForward must fire (proves we scrolled enough)
    const bufferGrew = maxLen > postSeek.resultsLength;
    expect(
      bufferGrew,
      `Buffer didn't grow during scroll-down (max len=${maxLen}, initial=${postSeek.resultsLength}). ` +
      `extendForward may not have fired — test needs more scroll distance.`,
    ).toBe(true);
  });

  // -------------------------------------------------------------------------
  // S27: FOCC (Flash Of Correct Content) — DOM-level detection v3
  //
  // V1 findings: simple img-count-vs-peak sampling produced false positives.
  // During scroll, the viewport straddles row boundaries differently,
  // changing visible cell count (49 → 42) — but every visible cell ALWAYS
  // had its <img>. FOCC is not about cells losing images.
  //
  // V2 strategy — multi-signal FOCC detection (signals 1–4).
  // V3 enhancement — adds Signal 5 (CONTENT_SHIFT) to determine whether
  // SCROLL_JUMP frames show the SAME images at wrong positions (FOCC) or
  // DIFFERENT images entirely (FOIC). Also captures row `top` values and
  // all visible image srcs on signal frames for forensic analysis.
  //
  // Signal 1: SKELETON CELLS — any frame where a visible cell has no <img>
  //           (cellsWithImg < visibleCells on the SAME frame). This detects
  //           React unmounting/remounting cell content.
  //
  // Signal 2: ROW COUNT DROP — the number of virtualiser rows in the DOM
  //           drops between frames (TanStack Virtual removing rows during
  //           buffer mutation, re-adding them next frame).
  //
  // Signal 3: SCROLLTOP JUMP — during scroll-up, scrollTop should only
  //           decrease. A sudden increase = compensation artifact visible
  //           for one frame. During scroll-down, scrollTop should only
  //           increase; a decrease = forward-evict compensation flash.
  //
  // Signal 4: IMAGE IDENTITY CHANGE — track the first visible img src.
  //           If it changes between frames without a scroll that would
  //           explain it, the user briefly saw wrong content.
  //
  // Signal 5: CONTENT_SHIFT — on SCROLL_JUMP frames, compare the full set
  //           of visible image srcs with the previous frame. If the set is
  //           identical, it's FOCC (positional stutter). If different, it's
  //           FOIC (different content briefly shown). This is the definitive
  //           test of what the user actually sees in the flash frame.
  //
  // S27a: scroll UP (extendBackward)
  // S27b: scroll DOWN (forward eviction)
  // -------------------------------------------------------------------------

  test("S27a: FOCC scroll-up — DOM content drops during extendBackward", async ({ kupua }) => {
    await kupua.gotoWithParams(`until=${STABLE_UNTIL}`);
    const total = await requireRealData(kupua);

    kupua.startConsoleCapture();

    // Seek to 50%
    await kupua.seekTo(0.5, 30_000);
    const postSeek = await getGridDiag(kupua.page);
    if (!postSeek) { console.log("  ERROR: no grid diag"); return; }

    console.log(`\n  [post-seek] offset=${postSeek.bufferOffset}, len=${postSeek.resultsLength}, scrollTop=${postSeek.scrollTop.toFixed(1)}`);
    console.log(`  headroom: ${postSeek.seekTargetLocalIndex} items (${(postSeek.seekTargetLocalIndex / postSeek.cols).toFixed(1)} rows)`);

    // Wait for settle + thumbnail loading
    await kupua.page.waitForTimeout(3000);

    // Position cursor over grid
    const gridEl = kupua.page.locator('[aria-label="Image results grid"]');
    const gridBox = await gridEl.boundingBox();
    if (!gridBox) { console.log("  ERROR: no grid box"); return; }
    await kupua.page.mouse.move(
      gridBox.x + gridBox.width / 2,
      gridBox.y + gridBox.height / 2,
    );

    // -----------------------------------------------------------------------
    // Install rAF DOM sampler v3 — multi-signal FOCC detection + content
    // identity analysis. Records EVERY frame (no filtering) to catch
    // single-frame glitches. On SCROLL_JUMP frames, captures full image
    // src set and row tops for forensic comparison.
    // -----------------------------------------------------------------------
    await kupua.page.evaluate(
      ({ ROW_HEIGHT }: { ROW_HEIGHT: number }) => {
        const w = window as any;
        w.__focc2 = {
          samples: [] as any[],
          skeletonFrames: 0,     // Signal 1: frames where cellsWithImg < visibleCells
          rowDropFrames: 0,      // Signal 2: frames where row count dropped
          scrollJumpFrames: 0,   // Signal 3: scrollTop went wrong direction
          imgChangeFrames: 0,    // Signal 4: first visible img src changed unexpectedly
          contentShiftSame: 0,   // Signal 5: SCROLL_JUMP with SAME image set (FOCC)
          contentShiftDiff: 0,   // Signal 5: SCROLL_JUMP with DIFFERENT image set (FOIC)
          totalFrames: 0,
          prevRowCount: -1,
          prevScrollTop: -1,
          prevFirstImgSrc: "",
          prevVisibleCells: -1,
          prevImgSrcs: [] as string[],  // all visible img srcs from previous frame
          prevRowTops: [] as number[],  // row top positions from previous frame
          running: true,
        };

        const state = w.__focc2;

        const loop = () => {
          if (!state.running) return;
          state.totalFrames++;

          const el = document.querySelector('[aria-label="Image results grid"]') as HTMLElement;
          const store = w.__kupua_store__;
          if (!el || !store) { requestAnimationFrame(loop); return; }

          const s = store.getState();
          const scrollTop = el.scrollTop;
          const viewportTop = scrollTop;
          const viewportBottom = scrollTop + el.clientHeight;

          const sizer = el.firstElementChild;
          if (!sizer) { requestAnimationFrame(loop); return; }

          let visibleCells = 0;
          let cellsWithImg = 0;
          let visibleRowCount = 0;
          let firstImgSrc = "";
          const allImgSrcs: string[] = [];
          const rowTops: number[] = [];

          const rows = sizer.children;
          for (let r = 0; r < rows.length; r++) {
            const row = rows[r] as HTMLElement;
            const rowTop = parseFloat(row.style.top);
            const rowBottom = rowTop + ROW_HEIGHT;

            // Only count rows actually overlapping the viewport
            if (rowBottom <= viewportTop || rowTop >= viewportBottom) continue;
            visibleRowCount++;
            rowTops.push(rowTop);

            const cells = row.querySelectorAll("[data-grid-cell]");
            for (let c = 0; c < cells.length; c++) {
              visibleCells++;
              const img = cells[c].querySelector("img") as HTMLImageElement | null;
              if (img) {
                cellsWithImg++;
                const src = img.src ? img.src.slice(-40) : "";
                allImgSrcs.push(src);
                if (!firstImgSrc && src) firstImgSrc = src;
              }
            }
          }

          // --- Signal detection ---
          let signals = 0;
          let signalNames = "";
          let isScrollJump = false;

          // Signal 1: Skeleton cells (visible cell without img)
          if (visibleCells > 0 && cellsWithImg < visibleCells) {
            state.skeletonFrames++;
            signals++;
            signalNames += "SKELETON ";
          }

          // Signal 2: Row count drop (rows disappeared from DOM)
          if (state.prevRowCount > 0 && visibleRowCount < state.prevRowCount - 1) {
            state.rowDropFrames++;
            signals++;
            signalNames += "ROW_DROP ";
          }

          // Signal 3: ScrollTop jump (wrong direction for scroll-up)
          // During scroll-up, scrollTop should decrease. An increase > 1px = jump.
          if (state.prevScrollTop > 0 && scrollTop > state.prevScrollTop + 1) {
            state.scrollJumpFrames++;
            signals++;
            signalNames += "SCROLL_JUMP ";
            isScrollJump = true;
          }

          // Signal 4: First visible image changed identity
          if (state.prevFirstImgSrc && firstImgSrc &&
              firstImgSrc !== state.prevFirstImgSrc &&
              Math.abs(scrollTop - state.prevScrollTop) < ROW_HEIGHT * 0.5) {
            state.imgChangeFrames++;
            signals++;
            signalNames += "IMG_CHANGE ";
          }

          // Signal 5: Content identity on SCROLL_JUMP frames.
          // Compare the sorted set of visible image srcs with previous frame.
          // If identical → FOCC (same content, wrong position).
          // If different → FOIC (different content briefly shown).
          let contentVerdict = "";
          if (isScrollJump && state.prevImgSrcs.length > 0 && allImgSrcs.length > 0) {
            const prevSet = state.prevImgSrcs.slice().sort().join("|");
            const curSet = allImgSrcs.slice().sort().join("|");
            if (prevSet === curSet) {
              state.contentShiftSame++;
              contentVerdict = "SAME_CONTENT";
              signalNames += "CONTENT_SAME ";
            } else {
              state.contentShiftDiff++;
              contentVerdict = "DIFF_CONTENT";
              signalNames += "CONTENT_DIFF ";
              // Count overlap: how many images are in both sets?
              const prevArr = state.prevImgSrcs.slice().sort();
              const curArr = allImgSrcs.slice().sort();
              let overlap = 0;
              let pi = 0, ci = 0;
              while (pi < prevArr.length && ci < curArr.length) {
                if (prevArr[pi] === curArr[ci]) { overlap++; pi++; ci++; }
                else if (prevArr[pi] < curArr[ci]) pi++;
                else ci++;
              }
              contentVerdict += `(overlap=${overlap}/${Math.max(prevArr.length, curArr.length)})`;
            }
          }

          // Record frame if any signal fired, or every 120th frame for context
          if (signals > 0 || state.totalFrames % 120 === 0) {
            const sample: any = {
              frame: state.totalFrames,
              t: performance.now(),
              scrollTop,
              scrollTopDelta: scrollTop - (state.prevScrollTop > 0 ? state.prevScrollTop : scrollTop),
              visibleRows: visibleRowCount,
              visibleCells,
              cellsWithImg,
              firstImgSrc,
              signals: signalNames.trim() || "periodic",
              prependGen: s._prependGeneration,
              forwardEvictGen: s._forwardEvictGeneration,
              bufferOffset: s.bufferOffset,
              resultsLength: s.results.length,
              prevScrollTop: state.prevScrollTop,
              prevRowCount: state.prevRowCount,
            };
            // On signal frames, include forensic data
            if (signals > 0) {
              sample.rowTops = rowTops.slice(0, 5);          // first 5 row tops
              sample.prevRowTops = state.prevRowTops.slice(0, 5);
              sample.imgCount = allImgSrcs.length;
              sample.prevImgCount = state.prevImgSrcs.length;
              sample.contentVerdict = contentVerdict || "N/A";
              // On SCROLL_JUMP, also store first 3 img srcs from each frame
              if (isScrollJump) {
                sample.curImgs = allImgSrcs.slice(0, 3);
                sample.prevImgs = state.prevImgSrcs.slice(0, 3);
              }
            }
            state.samples.push(sample);
          }

          // Update prev state
          state.prevRowCount = visibleRowCount;
          state.prevScrollTop = scrollTop;
          state.prevFirstImgSrc = firstImgSrc;
          state.prevVisibleCells = visibleCells;
          state.prevImgSrcs = allImgSrcs;
          state.prevRowTops = rowTops;

          requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
      },
      { ROW_HEIGHT: GRID_ROW_HEIGHT },
    );

    // Scroll UP in small steps — same as S26a
    const steps = 80;
    const deltaPerStep = -150;
    const delayMs = 100;

    for (let step = 0; step < steps; step++) {
      await kupua.page.mouse.wheel(0, deltaPerStep);
      await kupua.page.waitForTimeout(delayMs);
    }

    // Stop sampler and retrieve data
    const result = await kupua.page.evaluate(() => {
      const w = window as any;
      const state = w.__focc2;
      state.running = false;
      return {
        samples: state.samples,
        skeletonFrames: state.skeletonFrames,
        rowDropFrames: state.rowDropFrames,
        scrollJumpFrames: state.scrollJumpFrames,
        imgChangeFrames: state.imgChangeFrames,
        contentShiftSame: state.contentShiftSame,
        contentShiftDiff: state.contentShiftDiff,
        totalFrames: state.totalFrames,
      };
    });

    const { samples, skeletonFrames, rowDropFrames, scrollJumpFrames, imgChangeFrames,
            contentShiftSame, contentShiftDiff, totalFrames } = result;
    const prependGens = new Set(samples.map((s: any) => s.prependGen));
    const prependCount = Math.max(0, prependGens.size - 1);

    // Separate signal events from periodic snapshots
    const signalEvents = samples.filter((s: any) => s.signals !== "periodic");
    const periodicEvents = samples.filter((s: any) => s.signals === "periodic");

    console.log(`\n  ── S27a FOCC SCROLL-UP v3 (multi-signal + content identity) ──`);
    console.log(`  steps=${steps}, delta=${deltaPerStep}px, delay=${delayMs}ms`);
    console.log(`  totalFrames=${totalFrames}, recorded=${samples.length} (${signalEvents.length} signals + ${periodicEvents.length} periodic)`);
    console.log(`  extendBackward cycles: ${prependCount}`);
    console.log(`\n  Signal 1 — SKELETON (cell without img):     ${skeletonFrames} frames`);
    console.log(`  Signal 2 — ROW_DROP (row count decreased):   ${rowDropFrames} frames`);
    console.log(`  Signal 3 — SCROLL_JUMP (scrollTop increased): ${scrollJumpFrames} frames`);
    console.log(`  Signal 4 — IMG_CHANGE (image identity):      ${imgChangeFrames} frames`);
    console.log(`  Signal 5 — CONTENT on SCROLL_JUMP: same=${contentShiftSame} diff=${contentShiftDiff}`);
    if (scrollJumpFrames > 0) {
      console.log(`\n  ★ VERDICT: SCROLL_JUMP frames show ${contentShiftSame > 0 ? "SAME" : ""}${contentShiftSame > 0 && contentShiftDiff > 0 ? " + " : ""}${contentShiftDiff > 0 ? "DIFFERENT" : ""} content`);
      console.log(`    → ${contentShiftDiff === 0 ? "FOCC (positional stutter only)" : "FOIC (different images briefly visible)"}`);
    }

    if (signalEvents.length > 0) {
      console.log(`\n  ── signal events (first 20) ──`);
      for (const s of signalEvents.slice(0, 20)) {
        let line = `    frame ${s.frame}: [${s.signals}] scrollTop=${s.scrollTop.toFixed(0)} ` +
          `(prev=${s.prevScrollTop?.toFixed(0)}, Δ=${s.scrollTopDelta?.toFixed(0)}), ` +
          `rows=${s.visibleRows} (prev=${s.prevRowCount}), ` +
          `cells=${s.visibleCells}, img=${s.cellsWithImg}, prependGen=${s.prependGen}, offset=${s.bufferOffset}`;
        if (s.contentVerdict && s.contentVerdict !== "N/A") {
          line += `\n           content: ${s.contentVerdict}`;
          if (s.curImgs) line += `\n           curImgs[0..2]: ${JSON.stringify(s.curImgs)}`;
          if (s.prevImgs) line += `\n           prevImgs[0..2]: ${JSON.stringify(s.prevImgs)}`;
          if (s.rowTops) line += `\n           rowTops: [${s.rowTops.join(", ")}] prev: [${s.prevRowTops?.join(", ") ?? "?"}]`;
        }
        console.log(line);
      }
    }

    console.log(`\n  ── periodic snapshots (context) ──`);
    for (const p of periodicEvents.slice(0, 8)) {
      console.log(
        `    frame ${p.frame}: scrollTop=${p.scrollTop.toFixed(0)}, rows=${p.visibleRows}, ` +
        `cells=${p.visibleCells}, img=${p.cellsWithImg}, prependGen=${p.prependGen}, offset=${p.bufferOffset}`,
      );
    }

    const totalSignals = skeletonFrames + rowDropFrames + scrollJumpFrames + imgChangeFrames;
    console.log(`\n  VERDICT: ${totalSignals === 0 ? "✅ NO FOCC SIGNALS" : `❌ ${totalSignals} FOCC SIGNALS DETECTED`}`);

    const logs = kupua.getConsoleLogs(/\[prepend-comp\]|\[prepend-pre-comp\]|\[extend|\[seek\]/);

    recordResult("S27a", {
      total,
      postSeekDiag: postSeek,
      scrollParams: { steps, deltaPerStep, delayMs },
      totalFrames,
      recordedSamples: samples.length,
      prependCount,
      prependGens: [...prependGens],
      signals: {
        skeleton: skeletonFrames,
        rowDrop: rowDropFrames,
        scrollJump: scrollJumpFrames,
        imgChange: imgChangeFrames,
        contentShiftSame,
        contentShiftDiff,
        total: totalSignals,
      },
      contentVerdict: contentShiftDiff === 0
        ? (contentShiftSame > 0 ? "FOCC" : "UNKNOWN")
        : "FOIC",
      signalEvents: signalEvents.slice(0, 30),
      periodicSnapshots: periodicEvents.slice(0, 15),
      consoleLogs: logs.slice(-30),
      verdict: totalSignals === 0 ? "NO_FOCC" : `FOCC(signals=${totalSignals})`,
    });

    // Hard assertion: at least one extendBackward must fire
    expect(
      prependCount,
      `extendBackward must fire during sustained scroll-up (need more scroll distance).`,
    ).toBeGreaterThan(0);

    // Soft report — log but don't fail
    if (totalSignals > 0) {
      console.log(
        `\n  ⚠️  FOCC SIGNALS: skeleton=${skeletonFrames}, rowDrop=${rowDropFrames}, ` +
        `scrollJump=${scrollJumpFrames}, imgChange=${imgChangeFrames}`,
      );
    }
  });

  test("S27b: FOCC scroll-down — DOM content drops during forward eviction", async ({ kupua }) => {
    await kupua.gotoWithParams(`until=${STABLE_UNTIL}`);
    const total = await requireRealData(kupua);

    kupua.startConsoleCapture();

    // Seek to 50%
    await kupua.seekTo(0.5, 30_000);
    const postSeek = await getGridDiag(kupua.page);
    if (!postSeek) { console.log("  ERROR: no grid diag"); return; }

    console.log(`\n  [post-seek] offset=${postSeek.bufferOffset}, len=${postSeek.resultsLength}, scrollTop=${postSeek.scrollTop.toFixed(1)}`);

    // Wait for settle + thumbnail loading
    await kupua.page.waitForTimeout(3000);

    // Position cursor over grid
    const gridEl = kupua.page.locator('[aria-label="Image results grid"]');
    const gridBox = await gridEl.boundingBox();
    if (!gridBox) { console.log("  ERROR: no grid box"); return; }
    await kupua.page.mouse.move(
      gridBox.x + gridBox.width / 2,
      gridBox.y + gridBox.height / 2,
    );

    // -----------------------------------------------------------------------
    // Install rAF DOM sampler v3 — same as S27a but scroll direction is DOWN
    // -----------------------------------------------------------------------
    await kupua.page.evaluate(
      ({ ROW_HEIGHT }: { ROW_HEIGHT: number }) => {
        const w = window as any;
        w.__focc2 = {
          samples: [] as any[],
          skeletonFrames: 0,
          rowDropFrames: 0,
          scrollJumpFrames: 0,
          imgChangeFrames: 0,
          contentShiftSame: 0,
          contentShiftDiff: 0,
          totalFrames: 0,
          prevRowCount: -1,
          prevScrollTop: -1,
          prevFirstImgSrc: "",
          prevVisibleCells: -1,
          prevImgSrcs: [] as string[],
          prevRowTops: [] as number[],
          running: true,
        };

        const state = w.__focc2;

        const loop = () => {
          if (!state.running) return;
          state.totalFrames++;

          const el = document.querySelector('[aria-label="Image results grid"]') as HTMLElement;
          const store = w.__kupua_store__;
          if (!el || !store) { requestAnimationFrame(loop); return; }

          const s = store.getState();
          const scrollTop = el.scrollTop;
          const viewportTop = scrollTop;
          const viewportBottom = scrollTop + el.clientHeight;

          const sizer = el.firstElementChild;
          if (!sizer) { requestAnimationFrame(loop); return; }

          let visibleCells = 0;
          let cellsWithImg = 0;
          let visibleRowCount = 0;
          let firstImgSrc = "";
          const allImgSrcs: string[] = [];
          const rowTops: number[] = [];

          const rows = sizer.children;
          for (let r = 0; r < rows.length; r++) {
            const row = rows[r] as HTMLElement;
            const rowTop = parseFloat(row.style.top);
            const rowBottom = rowTop + ROW_HEIGHT;

            if (rowBottom <= viewportTop || rowTop >= viewportBottom) continue;
            visibleRowCount++;
            rowTops.push(rowTop);

            const cells = row.querySelectorAll("[data-grid-cell]");
            for (let c = 0; c < cells.length; c++) {
              visibleCells++;
              const img = cells[c].querySelector("img") as HTMLImageElement | null;
              if (img) {
                cellsWithImg++;
                const src = img.src ? img.src.slice(-40) : "";
                allImgSrcs.push(src);
                if (!firstImgSrc && src) firstImgSrc = src;
              }
            }
          }

          let signals = 0;
          let signalNames = "";
          let isScrollJump = false;

          // Signal 1: Skeleton cells
          if (visibleCells > 0 && cellsWithImg < visibleCells) {
            state.skeletonFrames++;
            signals++;
            signalNames += "SKELETON ";
          }

          // Signal 2: Row count drop
          if (state.prevRowCount > 0 && visibleRowCount < state.prevRowCount - 1) {
            state.rowDropFrames++;
            signals++;
            signalNames += "ROW_DROP ";
          }

          // Signal 3: ScrollTop jump (wrong direction for scroll-down)
          // During scroll-down, scrollTop should increase. A decrease > 1px = jump.
          if (state.prevScrollTop > 0 && scrollTop < state.prevScrollTop - 1) {
            state.scrollJumpFrames++;
            signals++;
            signalNames += "SCROLL_JUMP ";
            isScrollJump = true;
          }

          // Signal 4: First visible image changed identity
          if (state.prevFirstImgSrc && firstImgSrc &&
              firstImgSrc !== state.prevFirstImgSrc &&
              Math.abs(scrollTop - state.prevScrollTop) < ROW_HEIGHT * 0.5) {
            state.imgChangeFrames++;
            signals++;
            signalNames += "IMG_CHANGE ";
          }

          // Signal 5: Content identity on SCROLL_JUMP frames
          let contentVerdict = "";
          if (isScrollJump && state.prevImgSrcs.length > 0 && allImgSrcs.length > 0) {
            const prevSet = state.prevImgSrcs.slice().sort().join("|");
            const curSet = allImgSrcs.slice().sort().join("|");
            if (prevSet === curSet) {
              state.contentShiftSame++;
              contentVerdict = "SAME_CONTENT";
              signalNames += "CONTENT_SAME ";
            } else {
              state.contentShiftDiff++;
              contentVerdict = "DIFF_CONTENT";
              signalNames += "CONTENT_DIFF ";
              const prevArr = state.prevImgSrcs.slice().sort();
              const curArr = allImgSrcs.slice().sort();
              let overlap = 0;
              let pi = 0, ci = 0;
              while (pi < prevArr.length && ci < curArr.length) {
                if (prevArr[pi] === curArr[ci]) { overlap++; pi++; ci++; }
                else if (prevArr[pi] < curArr[ci]) pi++;
                else ci++;
              }
              contentVerdict += `(overlap=${overlap}/${Math.max(prevArr.length, curArr.length)})`;
            }
          }

          if (signals > 0 || state.totalFrames % 120 === 0) {
            const sample: any = {
              frame: state.totalFrames,
              t: performance.now(),
              scrollTop,
              scrollTopDelta: scrollTop - (state.prevScrollTop > 0 ? state.prevScrollTop : scrollTop),
              visibleRows: visibleRowCount,
              visibleCells,
              cellsWithImg,
              firstImgSrc,
              signals: signalNames.trim() || "periodic",
              prependGen: s._prependGeneration,
              forwardEvictGen: s._forwardEvictGeneration,
              bufferOffset: s.bufferOffset,
              resultsLength: s.results.length,
              prevScrollTop: state.prevScrollTop,
              prevRowCount: state.prevRowCount,
            };
            if (signals > 0) {
              sample.rowTops = rowTops.slice(0, 5);
              sample.prevRowTops = state.prevRowTops.slice(0, 5);
              sample.imgCount = allImgSrcs.length;
              sample.prevImgCount = state.prevImgSrcs.length;
              sample.contentVerdict = contentVerdict || "N/A";
              if (isScrollJump) {
                sample.curImgs = allImgSrcs.slice(0, 3);
                sample.prevImgs = state.prevImgSrcs.slice(0, 3);
              }
            }
            state.samples.push(sample);
          }

          state.prevRowCount = visibleRowCount;
          state.prevScrollTop = scrollTop;
          state.prevFirstImgSrc = firstImgSrc;
          state.prevVisibleCells = visibleCells;
          state.prevImgSrcs = allImgSrcs;
          state.prevRowTops = rowTops;

          requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
      },
      { ROW_HEIGHT: GRID_ROW_HEIGHT },
    );

    // Scroll DOWN far enough to trigger forward eviction
    const steps = 200;
    const deltaPerStep = 200;
    const delayMs = 100;

    for (let step = 0; step < steps; step++) {
      await kupua.page.mouse.wheel(0, deltaPerStep);
      await kupua.page.waitForTimeout(delayMs);
    }

    // Stop sampler and retrieve data
    const result = await kupua.page.evaluate(() => {
      const w = window as any;
      const state = w.__focc2;
      state.running = false;
      return {
        samples: state.samples,
        skeletonFrames: state.skeletonFrames,
        rowDropFrames: state.rowDropFrames,
        scrollJumpFrames: state.scrollJumpFrames,
        imgChangeFrames: state.imgChangeFrames,
        contentShiftSame: state.contentShiftSame,
        contentShiftDiff: state.contentShiftDiff,
        totalFrames: state.totalFrames,
      };
    });

    const { samples, skeletonFrames, rowDropFrames, scrollJumpFrames, imgChangeFrames,
            contentShiftSame, contentShiftDiff, totalFrames } = result;
    const evictGens = new Set(samples.map((s: any) => s.forwardEvictGen));
    const evictCount = Math.max(0, evictGens.size - 1);
    const maxLen = Math.max(0, ...samples.map((s: any) => s.resultsLength));

    const signalEvents = samples.filter((s: any) => s.signals !== "periodic");
    const periodicEvents = samples.filter((s: any) => s.signals === "periodic");

    console.log(`\n  ── S27b FOCC SCROLL-DOWN v3 (multi-signal + content identity) ──`);
    console.log(`  steps=${steps}, delta=${deltaPerStep}px, delay=${delayMs}ms`);
    console.log(`  totalFrames=${totalFrames}, recorded=${samples.length} (${signalEvents.length} signals + ${periodicEvents.length} periodic)`);
    console.log(`  forwardEvict cycles: ${evictCount}, max buffer: ${maxLen}`);
    console.log(`\n  Signal 1 — SKELETON (cell without img):      ${skeletonFrames} frames`);
    console.log(`  Signal 2 — ROW_DROP (row count decreased):    ${rowDropFrames} frames`);
    console.log(`  Signal 3 — SCROLL_JUMP (scrollTop decreased): ${scrollJumpFrames} frames`);
    console.log(`  Signal 4 — IMG_CHANGE (image identity):       ${imgChangeFrames} frames`);
    console.log(`  Signal 5 — CONTENT on SCROLL_JUMP: same=${contentShiftSame} diff=${contentShiftDiff}`);
    if (scrollJumpFrames > 0) {
      console.log(`\n  ★ VERDICT: SCROLL_JUMP frames show ${contentShiftSame > 0 ? "SAME" : ""}${contentShiftSame > 0 && contentShiftDiff > 0 ? " + " : ""}${contentShiftDiff > 0 ? "DIFFERENT" : ""} content`);
      console.log(`    → ${contentShiftDiff === 0 ? "FOCC (positional stutter only)" : "FOIC (different images briefly visible)"}`);
    }

    if (signalEvents.length > 0) {
      console.log(`\n  ── signal events (first 20) ──`);
      for (const s of signalEvents.slice(0, 20)) {
        let line = `    frame ${s.frame}: [${s.signals}] scrollTop=${s.scrollTop.toFixed(0)} ` +
          `(prev=${s.prevScrollTop?.toFixed(0)}, Δ=${s.scrollTopDelta?.toFixed(0)}), ` +
          `rows=${s.visibleRows} (prev=${s.prevRowCount}), ` +
          `cells=${s.visibleCells}, img=${s.cellsWithImg}, evictGen=${s.forwardEvictGen}, ` +
          `offset=${s.bufferOffset}, len=${s.resultsLength}`;
        if (s.contentVerdict && s.contentVerdict !== "N/A") {
          line += `\n           content: ${s.contentVerdict}`;
          if (s.curImgs) line += `\n           curImgs[0..2]: ${JSON.stringify(s.curImgs)}`;
          if (s.prevImgs) line += `\n           prevImgs[0..2]: ${JSON.stringify(s.prevImgs)}`;
          if (s.rowTops) line += `\n           rowTops: [${s.rowTops.join(", ")}] prev: [${s.prevRowTops?.join(", ") ?? "?"}]`;
        }
        console.log(line);
      }
    }

    console.log(`\n  ── periodic snapshots (context) ──`);
    for (const p of periodicEvents.slice(0, 8)) {
      console.log(
        `    frame ${p.frame}: scrollTop=${p.scrollTop.toFixed(0)}, rows=${p.visibleRows}, ` +
        `cells=${p.visibleCells}, img=${p.cellsWithImg}, evictGen=${p.forwardEvictGen}, ` +
        `offset=${p.bufferOffset}, len=${p.resultsLength}`,
      );
    }

    const totalSignals = skeletonFrames + rowDropFrames + scrollJumpFrames + imgChangeFrames;
    console.log(`\n  VERDICT: ${totalSignals === 0 ? "✅ NO FOCC SIGNALS" : `❌ ${totalSignals} FOCC SIGNALS DETECTED`}`);

    const logs = kupua.getConsoleLogs(/\[prepend-comp\]|\[seek\]|\[extend|\[evict/);

    recordResult("S27b", {
      total,
      postSeekDiag: postSeek,
      scrollParams: { steps, deltaPerStep, delayMs },
      totalFrames,
      recordedSamples: samples.length,
      evictCount,
      evictGens: [...evictGens],
      maxBufferLen: maxLen,
      signals: {
        skeleton: skeletonFrames,
        rowDrop: rowDropFrames,
        scrollJump: scrollJumpFrames,
        imgChange: imgChangeFrames,
        contentShiftSame,
        contentShiftDiff,
        total: totalSignals,
      },
      contentVerdict: contentShiftDiff === 0
        ? (contentShiftSame > 0 ? "FOCC" : "UNKNOWN")
        : "FOIC",
      signalEvents: signalEvents.slice(0, 30),
      periodicSnapshots: periodicEvents.slice(0, 15),
      consoleLogs: logs.slice(-30),
      verdict: totalSignals === 0 ? "NO_FOCC" : `FOCC(signals=${totalSignals})`,
    });

    // Hard assertion: buffer must grow
    const bufferGrew = maxLen > postSeek.resultsLength;
    expect(
      bufferGrew,
      `Buffer didn't grow during scroll-down (max len=${maxLen}, initial=${postSeek.resultsLength}).`,
    ).toBe(true);

    // Soft report
    if (totalSignals > 0) {
      console.log(
        `\n  ⚠️  FOCC SIGNALS: skeleton=${skeletonFrames}, rowDrop=${rowDropFrames}, ` +
        `scrollJump=${scrollJumpFrames}, imgChange=${imgChangeFrames}`,
      );
    }
  });
});




