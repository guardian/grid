/**
 * Phantom Drift Diagnostic — Real TEST Cluster
 *
 * Measures position drift on repeated browser back/forward cycles when
 * using phantom focus (click-to-open mode = no explicit focus ring).
 *
 * The test captures detailed coordinate data at every step so we can
 * identify exactly WHERE drift enters the pipeline. All data is written
 * to a structured JSON report AND to console logs.
 *
 * Run:
 *   Terminal 1: ./scripts/start.sh --use-TEST
 *   Terminal 2: npm --prefix kupua run test:smoke -- phantom-drift-diag
 *
 * or directly:
 *   npx playwright test --config kupua/playwright.smoke.config.ts \
 *     kupua/e2e/smoke/phantom-drift-diag.spec.ts 2>&1 | tee /tmp/kupua-drift.txt
 */

import { test, expect, KupuaHelpers } from "../shared/helpers";
import { GRID_ROW_HEIGHT, GRID_MIN_CELL_WIDTH, GRID_CELL_GAP } from "@/constants/layout";
import { recordResult } from "./smoke-report";

// Pin corpus for reproducibility across runs.
const STABLE_UNTIL = "2026-03-04T00:00:00";

// ---------------------------------------------------------------------------
// Guard — skip on local ES
// ---------------------------------------------------------------------------
async function requireRealData(kupua: KupuaHelpers): Promise<number> {
  const store = await kupua.getStoreState();
  if (store.total < 100_000) {
    test.skip(
      true,
      `Skipping: connected to local ES (total=${store.total}). Requires --use-TEST.`,
    );
  }
  return store.total;
}

// ---------------------------------------------------------------------------
// Core diagnostic: capture EVERY coordinate that matters
// ---------------------------------------------------------------------------

/**
 * A complete positional snapshot. Captures both coordinate systems
 * (DOM / getBoundingClientRect AND virtualizer geometry) so we can
 * compare them directly.
 */
interface PositionProbe {
  /** Step label for log readability */
  label: string;
  /** Timestamp (ms since test start) */
  tMs: number;

  // --- Store state ---
  total: number;
  bufferOffset: number;
  resultsLength: number;
  loading: boolean;
  sortAroundFocusStatus: string | null;
  focusedImageId: string | null;
  phantomFocusImageId: string | null;
  sortAroundFocusGeneration: number;
  orderBy: string | undefined;

  // --- Scroll container ---
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  /** Container's getBoundingClientRect().top */
  containerBcrTop: number;
  /** Container's computed paddingTop (e.g. from pt-1) */
  containerPaddingTop: number;

  // --- Viewport anchor ---
  /** ID from getViewportAnchorId() */
  viewportAnchorId: string | null;
  /** Global index of viewport anchor */
  viewportAnchorGlobalIdx: number | null;

  // --- Grid geometry ---
  columns: number;

  // --- Anchor image (if present): DOM coordinates ---
  /** The image ID we're tracking */
  trackingImageId: string | null;
  /** Is the tracked image in the current buffer? */
  trackingInBuffer: boolean;
  /** Buffer-local index of tracked image */
  trackingLocalIdx: number;
  /** Global index of tracked image */
  trackingGlobalIdx: number;
  /** Row index: floor(localIdx / columns) */
  trackingRowIdx: number;
  /** Column index: localIdx % columns */
  trackingColIdx: number;
  /** DOM: getBoundingClientRect().top of the [data-image-id] element */
  trackingBcrTop: number | null;
  /** DOM: element top relative to container top (bcrTop - containerBcrTop) */
  trackingRelativeTop: number | null;
  /** DOM-based ratio: (bcrTop - containerBcrTop) / clientHeight */
  trackingDomRatio: number | null;

  // --- Anchor image: geometry coordinates ---
  /** Geometry: floor(localIdx / columns) * ROW_HEIGHT */
  trackingGeoPixelTop: number;
  /** Geometry-based ratio: (geoPixelTop - scrollTop) / clientHeight */
  trackingGeoRatio: number;

  // --- Centre-of-viewport image (may differ from tracked) ---
  centreImageId: string | null;
  centreLocalIdx: number;
  centreGlobalIdx: number;
  centreRowIdx: number;
  centreColIdx: number;

  // --- Drift metrics (filled in post-processing) ---
  /** Pixel delta from initial position (geometry coords) */
  geoDriftPx?: number;
  /** Ratio delta from initial position */
  geoDriftRatio?: number;
}

async function captureProbe(
  page: import("@playwright/test").Page,
  label: string,
  testStartMs: number,
  trackingImageId: string | null,
): Promise<PositionProbe> {
  return page.evaluate(
    ({
      label,
      tMs,
      trackId,
      ROW_HEIGHT,
      MIN_CELL_WIDTH,
    }: {
      label: string;
      tMs: number;
      trackId: string | null;
      ROW_HEIGHT: number;
      MIN_CELL_WIDTH: number;
    }) => {
      const store = (window as any).__kupua_store__;
      if (!store) throw new Error("Store not exposed");
      const s = store.getState();

      // Scroll container
      const grid = document.querySelector('[aria-label="Image results grid"]');
      const table = document.querySelector('[aria-label="Image results table"]');
      const container = (grid ?? table) as HTMLElement | null;
      if (!container) throw new Error("No scroll container found");

      const scrollTop = container.scrollTop;
      const scrollHeight = container.scrollHeight;
      const clientHeight = container.clientHeight;
      const containerRect = container.getBoundingClientRect();
      const containerPaddingTop = parseFloat(getComputedStyle(container).paddingTop) || 0;

      const cols = grid
        ? Math.max(1, Math.floor(container.clientWidth / MIN_CELL_WIDTH))
        : 1;

      // Viewport anchor
      const getAnchor = (window as any).__kupua_getViewportAnchorId__;
      const viewportAnchorId: string | null =
        typeof getAnchor === "function" ? getAnchor() : null;
      const viewportAnchorGlobalIdx: number | null = viewportAnchorId
        ? (s.imagePositions.get(viewportAnchorId) ?? null)
        : null;

      // Tracked image coordinates
      let trackingInBuffer = false;
      let trackingLocalIdx = -1;
      let trackingGlobalIdx = -1;
      let trackingRowIdx = -1;
      let trackingColIdx = -1;
      let trackingBcrTop: number | null = null;
      let trackingRelativeTop: number | null = null;
      let trackingDomRatio: number | null = null;
      let trackingGeoPixelTop = -1;
      let trackingGeoRatio = -1;

      if (trackId) {
        const gIdx = s.imagePositions.get(trackId);
        if (gIdx !== undefined) {
          trackingGlobalIdx = gIdx;
          trackingLocalIdx = gIdx - s.bufferOffset;
          trackingInBuffer =
            trackingLocalIdx >= 0 && trackingLocalIdx < s.results.length;
          trackingRowIdx = Math.floor(trackingLocalIdx / cols);
          trackingColIdx = trackingLocalIdx % cols;
          trackingGeoPixelTop = trackingRowIdx * ROW_HEIGHT;
          trackingGeoRatio =
            clientHeight > 0
              ? (trackingGeoPixelTop - scrollTop) / clientHeight
              : -1;

          // DOM measurement
          const el = document.querySelector(
            `[data-image-id="${CSS.escape(trackId)}"]`,
          );
          if (el) {
            const elRect = el.getBoundingClientRect();
            trackingBcrTop = elRect.top;
            trackingRelativeTop = elRect.top - containerRect.top;
            trackingDomRatio =
              clientHeight > 0
                ? (elRect.top - containerRect.top) / clientHeight
                : null;
          }
        }
      }

      // Centre-of-viewport image
      const centreScrollPx = scrollTop + clientHeight / 2;
      const centreRow = Math.floor(centreScrollPx / ROW_HEIGHT);
      const centreLocalIdx = centreRow * cols + Math.floor(cols / 2); // middle column
      const centreImg = s.results[centreLocalIdx];
      const centreId = centreImg?.id ?? null;
      const centreGlobalIdx = centreId
        ? (s.imagePositions.get(centreId) ?? s.bufferOffset + centreLocalIdx)
        : s.bufferOffset + centreLocalIdx;
      const centreColIdx = centreLocalIdx % cols;

      return {
        label,
        tMs,
        total: s.total,
        bufferOffset: s.bufferOffset,
        resultsLength: s.results.length,
        loading: s.loading,
        sortAroundFocusStatus: s.sortAroundFocusStatus,
        focusedImageId: s.focusedImageId,
        phantomFocusImageId: s._phantomFocusImageId,
        sortAroundFocusGeneration: s.sortAroundFocusGeneration,
        orderBy: s.params?.orderBy,
        scrollTop,
        scrollHeight,
        clientHeight,
        containerBcrTop: containerRect.top,
        containerPaddingTop,
        columns: cols,
        viewportAnchorId,
        viewportAnchorGlobalIdx,
        trackingImageId: trackId,
        trackingInBuffer,
        trackingLocalIdx,
        trackingGlobalIdx,
        trackingRowIdx,
        trackingColIdx,
        trackingBcrTop,
        trackingRelativeTop,
        trackingDomRatio,
        trackingGeoPixelTop,
        trackingGeoRatio,
        centreImageId: centreId,
        centreLocalIdx,
        centreGlobalIdx,
        centreRowIdx: centreRow,
        centreColIdx,
      };
    },
    {
      label,
      tMs: Date.now() - testStartMs,
      trackId: trackingImageId,
      ROW_HEIGHT: GRID_ROW_HEIGHT,
      MIN_CELL_WIDTH: GRID_MIN_CELL_WIDTH,
    },
  );
}

/** Wait for search + sort-around-focus to settle. */
async function waitForSettle(
  page: import("@playwright/test").Page,
  timeout = 30_000,
) {
  await page.waitForFunction(
    () => {
      const store = (window as any).__kupua_store__;
      if (!store) return false;
      const s = store.getState();
      return !s.loading && !s.sortAroundFocusStatus && s.results.length > 0;
    },
    undefined,
    { timeout },
  );
  // Extra settle for scroll effects and virtualiser
  await page.waitForTimeout(2000);
}

/**
 * Capture all images visible in the viewport with their exact coordinates.
 * This gives us a "framebuffer" snapshot we can compare across cycles.
 */
async function captureVisibleCells(
  page: import("@playwright/test").Page,
): Promise<
  Array<{
    imageId: string;
    localIdx: number;
    globalIdx: number;
    row: number;
    col: number;
    /** DOM: getBoundingClientRect().top relative to container */
    domRelativeTop: number;
    /** Geometry: row * ROW_HEIGHT */
    geoTop: number;
    /** DOM - geometry delta (should be near-constant for all cells) */
    domGeoDelta: number;
  }>
> {
  return page.evaluate(
    ({ ROW_HEIGHT, MIN_CELL_WIDTH }: { ROW_HEIGHT: number; MIN_CELL_WIDTH: number }) => {
      const store = (window as any).__kupua_store__;
      if (!store) return [];
      const s = store.getState();

      const container = document.querySelector(
        '[aria-label="Image results grid"]',
      ) as HTMLElement | null;
      if (!container) return [];

      const containerRect = container.getBoundingClientRect();
      const cols = Math.max(
        1,
        Math.floor(container.clientWidth / MIN_CELL_WIDTH),
      );

      const cells: Array<{
        imageId: string;
        localIdx: number;
        globalIdx: number;
        row: number;
        col: number;
        domRelativeTop: number;
        geoTop: number;
        domGeoDelta: number;
      }> = [];

      const elements = container.querySelectorAll("[data-image-id]");
      for (const el of elements) {
        const imageId = (el as HTMLElement).dataset.imageId;
        if (!imageId) continue;

        const elRect = el.getBoundingClientRect();
        // Skip if not in viewport
        if (
          elRect.bottom < containerRect.top ||
          elRect.top > containerRect.bottom
        )
          continue;

        const gIdx = s.imagePositions.get(imageId);
        if (gIdx === undefined) continue;

        const localIdx = gIdx - s.bufferOffset;
        const row = Math.floor(localIdx / cols);
        const col = localIdx % cols;
        const geoTop = row * ROW_HEIGHT;
        const domRelativeTop = elRect.top - containerRect.top + container.scrollTop;
        const domGeoDelta = domRelativeTop - geoTop;

        cells.push({
          imageId,
          localIdx,
          globalIdx: gIdx,
          row,
          col,
          domRelativeTop,
          geoTop,
          domGeoDelta,
        });
      }

      // Sort by globalIdx for readability
      cells.sort((a, b) => a.globalIdx - b.globalIdx);
      return cells;
    },
    { ROW_HEIGHT: GRID_ROW_HEIGHT, MIN_CELL_WIDTH: GRID_MIN_CELL_WIDTH },
  );
}

// ---------------------------------------------------------------------------
// Pretty-print helpers (console output for agent readability)
// ---------------------------------------------------------------------------

function logProbe(probe: PositionProbe) {
  const lines = [
    `\n╔══════════════════════════════════════════════════════════════`,
    `║ PROBE: ${probe.label} (t=${probe.tMs}ms)`,
    `╠══════════════════════════════════════════════════════════════`,
    `║ Store: total=${probe.total}, bufferOffset=${probe.bufferOffset}, ` +
      `results=${probe.resultsLength}, loading=${probe.loading}`,
    `║ Sort: orderBy=${probe.orderBy}, safGen=${probe.sortAroundFocusGeneration}, ` +
      `safStatus=${probe.sortAroundFocusStatus}`,
    `║ Focus: explicit=${probe.focusedImageId}, phantom=${probe.phantomFocusImageId}`,
    `║ Scroll: top=${probe.scrollTop.toFixed(1)}, height=${probe.scrollHeight}, ` +
      `client=${probe.clientHeight}`,
    `║ Container: bcrTop=${probe.containerBcrTop.toFixed(1)}, ` +
      `paddingTop=${probe.containerPaddingTop}`,
    `║ Geometry: cols=${probe.columns}`,
    `║ ViewportAnchor: id=${probe.viewportAnchorId}, ` +
      `globalIdx=${probe.viewportAnchorGlobalIdx}`,
    `╠── Tracked Image ──────────────────────────────────────────────`,
    `║ id=${probe.trackingImageId}`,
    `║ inBuffer=${probe.trackingInBuffer}, localIdx=${probe.trackingLocalIdx}, ` +
      `globalIdx=${probe.trackingGlobalIdx}`,
    `║ row=${probe.trackingRowIdx}, col=${probe.trackingColIdx}`,
    `║ GEO: pixelTop=${probe.trackingGeoPixelTop}, ` +
      `ratio=${probe.trackingGeoRatio.toFixed(6)}`,
    `║ DOM: bcrTop=${probe.trackingBcrTop?.toFixed(1) ?? "N/A"}, ` +
      `relTop=${probe.trackingRelativeTop?.toFixed(1) ?? "N/A"}, ` +
      `ratio=${probe.trackingDomRatio?.toFixed(6) ?? "N/A"}`,
    probe.trackingDomRatio != null && probe.trackingGeoRatio >= 0
      ? `║ DELTA: dom-geo ratio = ${(probe.trackingDomRatio - probe.trackingGeoRatio).toFixed(6)} ` +
        `(${((probe.trackingDomRatio - probe.trackingGeoRatio) * probe.clientHeight).toFixed(1)}px)`
      : `║ DELTA: N/A`,
    `╠── Centre Image ───────────────────────────────────────────────`,
    `║ id=${probe.centreImageId}, localIdx=${probe.centreLocalIdx}, ` +
      `globalIdx=${probe.centreGlobalIdx}`,
    `║ row=${probe.centreRowIdx}, col=${probe.centreColIdx}`,
  ];

  if (probe.geoDriftPx !== undefined) {
    lines.push(
      `╠── DRIFT from initial ─────────────────────────────────────────`,
      `║ geoDriftPx=${probe.geoDriftPx.toFixed(1)}, ` +
        `geoDriftRatio=${probe.geoDriftRatio?.toFixed(6)}`,
    );
  }

  lines.push(
    `╚══════════════════════════════════════════════════════════════`,
  );
  console.log(lines.join("\n"));
}

function logCells(
  label: string,
  cells: Awaited<ReturnType<typeof captureVisibleCells>>,
) {
  console.log(`\n── Visible cells: ${label} (${cells.length} cells) ──`);
  for (const c of cells.slice(0, 12)) {
    console.log(
      `  [${c.globalIdx}] id=${c.imageId.slice(0, 12)}… ` +
        `row=${c.row} col=${c.col} ` +
        `geoTop=${c.geoTop} domRelTop=${c.domRelativeTop.toFixed(1)} ` +
        `Δ=${c.domGeoDelta.toFixed(1)}`,
    );
  }
  if (cells.length > 12) console.log(`  ... and ${cells.length - 12} more`);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Phantom Drift Diagnostic (real TEST cluster)", () => {
  test.describe.configure({ timeout: 180_000 });

  // MacBook Pro 14" Retina — fill the screen so the tester can watch
  test.use({ viewport: { width: 1512, height: 982 }, deviceScaleFactor: 2 });

  test.beforeEach(async ({ kupua }) => {
    // Click-to-open mode = phantom focus path (no focus ring)
    await kupua.ensurePhantomMode();
  });

  // =========================================================================
  // D1: Phantom anchor drift across back/forward cycles
  // =========================================================================
  test("D1: phantom anchor drift — back/forward cycle measurement", async ({
    page,
    kupua,
  }) => {
    const testStart = Date.now();
    const probes: PositionProbe[] = [];
    const cellSnapshots: Array<{
      label: string;
      cells: Awaited<ReturnType<typeof captureVisibleCells>>;
    }> = [];

    // --- Setup ---
    await kupua.gotoWithParams(`until=${STABLE_UNTIL}`);
    const total = await requireRealData(kupua);

    // Seek to ~50% — deep enough to stress position preservation
    await kupua.seekTo(0.5);
    await page.waitForTimeout(3000);

    // Capture initial state
    const p0 = await captureProbe(page, "initial-after-seek", testStart, null);
    logProbe(p0);
    probes.push(p0);

    // Use the viewport anchor as our tracking image from here on
    const trackId = p0.viewportAnchorId;
    expect(trackId).not.toBeNull();
    console.log(`\n🎯 TRACKING IMAGE: ${trackId}`);
    console.log(`   Global index: ${p0.viewportAnchorGlobalIdx}`);

    // Re-capture with tracking image
    const p0t = await captureProbe(page, "initial-tracked", testStart, trackId);
    logProbe(p0t);
    probes.push(p0t);

    const initialCells = await captureVisibleCells(page);
    logCells("initial", initialCells);
    cellSnapshots.push({ label: "initial", cells: initialCells });

    // Record the initial position as baseline for drift measurement
    const baselineGeoRatio = p0t.trackingGeoRatio;
    const baselineScrollTop = p0t.scrollTop;
    const baselineGeoPixelTop = p0t.trackingGeoPixelTop;

    // --- Sort change: creates history entry ---
    console.log("\n\n════════════════════════════════════════════════════════");
    console.log("  CHANGING SORT TO 'Taken on'");
    console.log("════════════════════════════════════════════════════════");

    kupua.startConsoleCapture();
    await kupua.selectSort("Taken on");
    await waitForSettle(page);

    const pSort = await captureProbe(page, "after-sort-change", testStart, trackId);
    logProbe(pSort);
    probes.push(pSort);

    const sortCells = await captureVisibleCells(page);
    logCells("after-sort", sortCells);
    cellSnapshots.push({ label: "after-sort", cells: sortCells });

    // The tracked image should now be at a different position (different sort)
    // Record the SORT-context anchor for forward cycles
    const sortAnchorId = pSort.viewportAnchorId;
    console.log(`\n🎯 SORT CONTEXT ANCHOR: ${sortAnchorId}`);

    // Capture console logs from the sort change (saveSortFocusRatio etc.)
    const sortLogs = kupua.getConsoleLogs();

    // --- Back/Forward cycles ---
    const CYCLES = 4;

    for (let cycle = 0; cycle < CYCLES; cycle++) {
      console.log(`\n\n${"═".repeat(60)}`);
      console.log(`  CYCLE ${cycle + 1}/${CYCLES}: BACK`);
      console.log(`${"═".repeat(60)}`);

      kupua.startConsoleCapture();
      await page.goBack();
      await waitForSettle(page);

      const pBack = await captureProbe(
        page,
        `cycle-${cycle + 1}-back`,
        testStart,
        trackId,
      );

      // Compute drift from initial
      pBack.geoDriftPx = pBack.trackingGeoPixelTop - baselineGeoPixelTop -
        (pBack.scrollTop - baselineScrollTop);
      // More useful: geo ratio drift (position-in-viewport)
      pBack.geoDriftRatio = pBack.trackingGeoRatio - baselineGeoRatio;

      logProbe(pBack);
      probes.push(pBack);

      const backCells = await captureVisibleCells(page);
      logCells(`cycle-${cycle + 1}-back`, backCells);
      cellSnapshots.push({ label: `cycle-${cycle + 1}-back`, cells: backCells });

      const backLogs = kupua.getConsoleLogs();

      // Check: is the tracked image still the viewport anchor?
      console.log(
        `  ▸ Viewport anchor after back: ${pBack.viewportAnchorId} ` +
          `(tracking: ${trackId}) — ${pBack.viewportAnchorId === trackId ? "SAME ✓" : "DIFFERENT ✗"}`,
      );
      console.log(
        `  ▸ Centre image: ${pBack.centreImageId} — ` +
          `${pBack.centreImageId === trackId ? "SAME ✓" : "DIFFERENT ✗"}`,
      );

      // --- Forward ---
      console.log(`\n\n${"═".repeat(60)}`);
      console.log(`  CYCLE ${cycle + 1}/${CYCLES}: FORWARD`);
      console.log(`${"═".repeat(60)}`);

      kupua.startConsoleCapture();
      await page.goForward();
      await waitForSettle(page);

      const pFwd = await captureProbe(
        page,
        `cycle-${cycle + 1}-forward`,
        testStart,
        sortAnchorId,
      );
      logProbe(pFwd);
      probes.push(pFwd);

      const fwdCells = await captureVisibleCells(page);
      logCells(`cycle-${cycle + 1}-forward`, fwdCells);
      cellSnapshots.push({
        label: `cycle-${cycle + 1}-forward`,
        cells: fwdCells,
      });

      const fwdLogs = kupua.getConsoleLogs();
    }

    // --- Analysis ---
    console.log("\n\n╔══════════════════════════════════════════════════════════");
    console.log("║ DRIFT SUMMARY");
    console.log("╠══════════════════════════════════════════════════════════");

    const backProbes = probes.filter((p) => p.label.includes("-back"));
    for (const bp of backProbes) {
      const inViewport =
        bp.trackingGeoRatio >= 0 && bp.trackingGeoRatio <= 1;
      console.log(
        `║ ${bp.label}: geoRatio=${bp.trackingGeoRatio.toFixed(4)} ` +
          `(initial=${baselineGeoRatio.toFixed(4)}, ` +
          `drift=${bp.geoDriftRatio?.toFixed(4)}) ` +
          `${inViewport ? "IN viewport" : "OUT OF viewport"} ` +
          `anchor=${bp.viewportAnchorId === trackId ? "SAME" : "DIFF"}`,
      );
    }
    console.log("╚══════════════════════════════════════════════════════════");

    // --- Record structured results ---
    recordResult("D1-phantom-drift", {
      total,
      trackingImageId: trackId,
      baselineGeoRatio,
      baselineScrollTop,
      baselineGeoPixelTop,
      sortAnchorId,
      cycles: CYCLES,
      probes,
      cellSnapshots: cellSnapshots.map((cs) => ({
        label: cs.label,
        cellCount: cs.cells.length,
        firstFew: cs.cells.slice(0, 6),
      })),
      sortLogs: sortLogs.slice(0, 50),
    });

    // --- Assertions (soft — we want the diagnostic data even if these fail) ---
    // Check that the tracked image is still in viewport on every back
    for (const bp of backProbes) {
      if (!bp.trackingInBuffer) {
        console.log(
          `⚠ ${bp.label}: tracked image NOT IN BUFFER — may have been evicted`,
        );
      }
    }
  });

  // =========================================================================
  // D2: Explicit focus control — should NOT drift
  // =========================================================================
  test("D2: explicit focus control — no drift expected", async ({
    page,
    kupua,
  }) => {
    const testStart = Date.now();
    const probes: PositionProbe[] = [];

    // Override to explicit mode for this test
    // Note: ensureExplicitMode must be called before goto
    // We already called ensurePhantomMode in beforeEach, but
    // Playwright's addInitScript is additive — last one wins per key.
    // Instead, set it directly.
    await page.addInitScript(() => {
      localStorage.setItem(
        "kupua-ui-prefs",
        JSON.stringify({ focusMode: "explicit" }),
      );
    });

    await kupua.gotoWithParams(`until=${STABLE_UNTIL}`);
    const total = await requireRealData(kupua);

    await kupua.seekTo(0.5);
    await page.waitForTimeout(3000);

    // Click an image to set explicit focus
    await kupua.focusNthItem(4);
    const focusedId = await kupua.getFocusedImageId();
    expect(focusedId).not.toBeNull();

    const p0 = await captureProbe(page, "initial-explicit", testStart, focusedId);
    logProbe(p0);
    probes.push(p0);

    const baselineGeoRatio = p0.trackingGeoRatio;

    // Sort change
    await kupua.selectSort("Taken on");
    await waitForSettle(page);

    const pSort = await captureProbe(page, "after-sort-explicit", testStart, focusedId);
    logProbe(pSort);
    probes.push(pSort);

    // Back/forward cycles
    const CYCLES = 3;
    for (let cycle = 0; cycle < CYCLES; cycle++) {
      await page.goBack();
      await waitForSettle(page);

      const pBack = await captureProbe(
        page,
        `explicit-cycle-${cycle + 1}-back`,
        testStart,
        focusedId,
      );
      pBack.geoDriftRatio = pBack.trackingGeoRatio - baselineGeoRatio;
      logProbe(pBack);
      probes.push(pBack);

      await page.goForward();
      await waitForSettle(page);

      const pFwd = await captureProbe(
        page,
        `explicit-cycle-${cycle + 1}-forward`,
        testStart,
        focusedId,
      );
      logProbe(pFwd);
      probes.push(pFwd);
    }

    const backProbes = probes.filter((p) => p.label.includes("-back"));
    console.log("\n\n══ EXPLICIT FOCUS DRIFT SUMMARY ══");
    for (const bp of backProbes) {
      console.log(
        `  ${bp.label}: geoRatio=${bp.trackingGeoRatio.toFixed(4)} ` +
          `drift=${bp.geoDriftRatio?.toFixed(4)} ` +
          `focusPreserved=${bp.focusedImageId === focusedId}`,
      );
    }

    recordResult("D2-explicit-focus-control", {
      total,
      focusedId,
      baselineGeoRatio,
      cycles: CYCLES,
      probes,
    });

    // Explicit focus should be perfectly preserved every cycle
    for (const bp of backProbes) {
      expect(bp.focusedImageId).toBe(focusedId);
    }
  });

  // =========================================================================
  // D3: Coordinate system comparison — DOM vs geometry
  // =========================================================================
  test("D3: DOM vs geometry coordinate delta", async ({ page, kupua }) => {
    await kupua.gotoWithParams(`until=${STABLE_UNTIL}`);
    await requireRealData(kupua);

    // Try multiple scroll positions
    const positions = [0.1, 0.3, 0.5, 0.7];
    const results: Array<{
      seekRatio: number;
      cells: Awaited<ReturnType<typeof captureVisibleCells>>;
      avgDomGeoDelta: number;
      maxDomGeoDelta: number;
    }> = [];

    for (const ratio of positions) {
      await kupua.seekTo(ratio);
      await page.waitForTimeout(3000);

      const cells = await captureVisibleCells(page);
      const deltas = cells.map((c) => c.domGeoDelta);
      const avg = deltas.length > 0
        ? deltas.reduce((a, b) => a + b, 0) / deltas.length
        : 0;
      const max = deltas.length > 0 ? Math.max(...deltas.map(Math.abs)) : 0;

      console.log(
        `\n  Seek ${(ratio * 100).toFixed(0)}%: ` +
          `${cells.length} cells, avgΔ=${avg.toFixed(2)}px, maxΔ=${max.toFixed(2)}px`,
      );
      logCells(`seek-${(ratio * 100).toFixed(0)}pct`, cells);

      results.push({
        seekRatio: ratio,
        cells: cells.slice(0, 10),
        avgDomGeoDelta: avg,
        maxDomGeoDelta: max,
      });
    }

    recordResult("D3-coord-system-delta", { results });

    // Informational — no hard assertions. We want to measure, not fail.
    for (const r of results) {
      console.log(
        `  [${(r.seekRatio * 100).toFixed(0)}%] DOM-geo avg delta: ${r.avgDomGeoDelta.toFixed(2)}px`,
      );
    }
  });
});
