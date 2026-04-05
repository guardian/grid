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
 * MANUAL INVOCATION ONLY — see manual-smoke-test.spec.ts header.
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

import { test, expect, KupuaHelpers } from "./helpers";
import {
  GRID_ROW_HEIGHT,
  GRID_MIN_CELL_WIDTH,
} from "@/constants/layout";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

// ---------------------------------------------------------------------------
// Report output
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUT_DIR = path.join(__dirname, "..", "test-results");
const REPORT_PATH = path.join(OUT_DIR, "scroll-stability-report.json");

/** Accumulated test results — written to JSON after all tests complete. */
const report: Record<string, any> = {
  timestamp: new Date().toISOString(),
  tests: {},
};

function ensureOutDir() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
}

/** Save a test's result into the report. Also logs a compact summary. */
function recordResult(testId: string, data: Record<string, any>) {
  report.tests[testId] = { ...data, completedAt: new Date().toISOString() };
  console.log(`\n  [${testId}] JSON recorded → ${REPORT_PATH}`);
}

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

  // Write report after ALL tests in this describe block
  test.afterAll(() => {
    ensureOutDir();
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    console.log(`\n══════════════════════════════════════════════════════`);
    console.log(`  REPORT WRITTEN → ${REPORT_PATH}`);
    console.log(`  Tests recorded: ${Object.keys(report.tests).length}`);
    console.log(`══════════════════════════════════════════════════════\n`);
  });

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
      console.log(`  seekGeneration: ${store.seekGeneration}`);
      console.log("────────────────────────────────────────────────────\n");
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
      const preserved = scrollDelta < GRID_ROW_HEIGHT;

      scenarios.push({
        preScrollRows,
        preScrollTop: preDiag.scrollTop,
        postScrollTop: postDiag.scrollTop,
        scrollDelta,
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
      console.log(`  ${preserved ? "✅ PRESERVED" : "❌ NOT PRESERVED"}`);
    }

    recordResult("S13", { total, scenarios, GRID_ROW_HEIGHT });
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
      scenarios.push({
        name: "A: half-row scroll from top",
        preScrollTop: pre?.scrollTop,
        postScrollTop: post?.scrollTop,
        delta,
        preserved: delta < GRID_ROW_HEIGHT,
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
      scenarios.push({
        name: "B: 2+ rows from top (partial cut-off)",
        preScrollTop: pre?.scrollTop,
        postScrollTop: post?.scrollTop,
        delta,
        preserved: delta < GRID_ROW_HEIGHT,
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

    // Scroll UP with mouse.wheel — 5 steps of -200px
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
    await kupua.page.waitForTimeout(1500);

    const scrollAfter = await kupua.page.evaluate(() => {
      const el = document.querySelector('[aria-label="Image results grid"]');
      return el?.scrollTop ?? 0;
    });
    const storeAfter = await getStoreInternals(kupua.page);

    const scrollDecreased = scrollAfter < scrollBefore;
    const backwardExtendFired = (storeAfter?.bufferOffset ?? 0) < (storeBefore?.bufferOffset ?? 0);
    const bufferGrew = (storeAfter?.resultsLength ?? 0) > (storeBefore?.resultsLength ?? 0);

    console.log(`\n  scrollTop: ${scrollBefore.toFixed(1)} → ${scrollAfter.toFixed(1)} (delta=${(scrollAfter - scrollBefore).toFixed(1)})`);
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
    // On real data, extendBackward typically fires during the 1.5s settle window
    // (deferred scroll at ~800ms triggers it), so by the time we scroll up the
    // bufferOffset has already decreased. Assert that backward extend fired
    // either during settle (storeBefore already shows decreased offset vs post-seek)
    // or during the scroll-up itself.
    const seekOffset = postSeek?.bufferOffset ?? 0;
    const extendFiredDuringSettle = (storeBefore?.bufferOffset ?? 0) < seekOffset;
    expect(
      backwardExtendFired || extendFiredDuringSettle,
      `extendBackward must fire at some point after seek — bufferOffset should decrease ` +
      `(seekOffset=${seekOffset}, beforeScroll=${storeBefore?.bufferOffset}, afterScroll=${storeAfter?.bufferOffset})`,
    ).toBe(true);
  });

  // -------------------------------------------------------------------------
  // S23: Settle-window stability — high-frequency scrollTop polling after seek
  // -------------------------------------------------------------------------

  test("S23: settle-window stability — poll scrollTop 0-3s after seek", async ({ kupua }) => {
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

    // Seek via low-level click (seekTo adds 200ms wait which skips early window)
    const trackBox = await kupua.scrubber.boundingBox();
    expect(trackBox).not.toBeNull();
    await kupua.page.mouse.click(
      trackBox!.x + trackBox!.width / 2,
      trackBox!.y + 0.5 * trackBox!.height,
    );

    // Wait for data arrival
    await kupua.waitForSeekComplete(30_000);

    // Poll every 50ms for 3s — full settle + deferred scroll window.
    // Track firstVisibleGlobalPos (what the user sees), not just scrollTop
    // (which changes legitimately during prepend compensation).
    const snapshots: Array<{ t: number; scrollTop: number; offset: number; len: number; firstVisibleGlobalPos: number }> = [];
    const startT = Date.now();
    for (let i = 0; i < 60; i++) {
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

    // Find max consecutive visible content shift (not scrollTop drift)
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

    // Also track raw scrollTop drift for diagnostic purposes
    let maxScrollDrift = 0;
    for (let i = 1; i < snapshots.length; i++) {
      const drift = Math.abs(snapshots[i].scrollTop - snapshots[i - 1].scrollTop);
      if (drift > maxScrollDrift) maxScrollDrift = drift;
    }

    // Print timeline
    console.log(`\n  ── SETTLE WINDOW TIMELINE (50ms, 3s) ──`);
    let prevOffset = snapshots[0]?.offset;
    for (const s of snapshots) {
      const flag = s.offset !== prevOffset ? " ← OFFSET CHANGED" : "";
      console.log(
        `  ${s.t.toString().padStart(5)}ms: scrollTop=${s.scrollTop.toFixed(1)} offset=${s.offset} len=${s.len} visiblePos=${s.firstVisibleGlobalPos}${flag}`,
      );
      prevOffset = s.offset;
    }
    // Compute COLS dynamically from actual viewport (same formula as ImageGrid)
    const cols = await kupua.page.evaluate(({ MIN_CELL_WIDTH }: any) => {
      const el = document.querySelector('[aria-label="Image results grid"]') as HTMLElement;
      return el ? Math.max(1, Math.floor(el.clientWidth / MIN_CELL_WIDTH)) : 7;
    }, { MIN_CELL_WIDTH: GRID_MIN_CELL_WIDTH });
    const MAX_SHIFT = cols + 1; // 1 row + 1 item tolerance
    console.log(`\n  maxContentShift=${maxContentShift} items at step ${maxShiftStep} (limit: ${MAX_SHIFT}, cols: ${cols})`);
    console.log(`  maxScrollDrift=${maxScrollDrift.toFixed(1)}px (diagnostic only — scrollTop changes during compensation are expected)`);
    console.log(`  VERDICT: ${maxContentShift <= MAX_SHIFT ? "✅ STABLE" : `❌ CONTENT SHIFT ${maxContentShift} items`}`);

    const logs = kupua.getConsoleLogs(/\[seek\]|\[prepend-comp\]|\[extend/);

    recordResult("S23", {
      total,
      snapshotCount: snapshots.length,
      maxContentShift,
      maxShiftStep,
      maxScrollDrift,
      cols,
      maxShiftLimit: MAX_SHIFT,
      snapshots,
      consoleLogs: logs,
      verdict: maxContentShift <= MAX_SHIFT ? "STABLE" : `CONTENT_SHIFT(${maxContentShift})`,
    });

    expect(maxContentShift, `Visible content shifted by ${maxContentShift} items (limit: ${MAX_SHIFT}, cols: ${cols})`).toBeLessThanOrEqual(MAX_SHIFT);
  });
});




