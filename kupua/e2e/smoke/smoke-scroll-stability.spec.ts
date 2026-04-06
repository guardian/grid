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
    await kupua.goto();
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
    await kupua.goto();
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
    await kupua.goto();
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
    await kupua.goto();
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
    await kupua.goto();
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
    await kupua.goto();
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
    await kupua.goto();
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
    await kupua.goto();
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
    await kupua.goto();
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
    await kupua.goto();
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
    await kupua.goto();
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
    await kupua.goto();
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
    await kupua.goto();
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
    await kupua.goto();
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
});




