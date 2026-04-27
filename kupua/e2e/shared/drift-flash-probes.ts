/**
 * Drift & Flash measurement probes.
 *
 * Extracted from `phantom-drift-diag.spec.ts` and extended with flash
 * detection. Used by both local tier-matrix tests and smoke diagnostics.
 *
 * - **Drift** = tracked image moves to a different viewport position
 *   between two settled states (before/after an operation).
 * - **Flash** = wrong content or scroll position visible for ≥1 frame
 *   during a transition (detected via rAF sampling).
 */

import type { Page } from "@playwright/test";
import {
  GRID_ROW_HEIGHT,
  GRID_MIN_CELL_WIDTH,
  TABLE_ROW_HEIGHT,
} from "@/constants/layout";

// ---------------------------------------------------------------------------
// Position probe — full settled-state snapshot
// ---------------------------------------------------------------------------

export interface PositionProbe {
  label: string;
  tMs: number;

  // Store
  total: number;
  bufferOffset: number;
  resultsLength: number;
  loading: boolean;
  sortAroundFocusStatus: string | null;
  focusedImageId: string | null;
  phantomFocusImageId: string | null;
  sortAroundFocusGeneration: number;
  orderBy: string | undefined;

  // Scroll container
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  containerBcrTop: number;
  containerPaddingTop: number;

  // Viewport anchor
  viewportAnchorId: string | null;
  viewportAnchorGlobalIdx: number | null;

  // Grid geometry
  columns: number;
  isGrid: boolean;

  // Tracked image — DOM coordinates
  trackingImageId: string | null;
  trackingInBuffer: boolean;
  trackingLocalIdx: number;
  trackingGlobalIdx: number;
  trackingRowIdx: number;
  trackingColIdx: number;
  trackingBcrTop: number | null;
  trackingRelativeTop: number | null;
  trackingDomRatio: number | null;

  // Tracked image — geometry coordinates
  trackingGeoPixelTop: number;
  trackingGeoRatio: number;

  // Centre-of-viewport image
  centreImageId: string | null;
  centreLocalIdx: number;
  centreGlobalIdx: number;
  centreRowIdx: number;
  centreColIdx: number;
}

export async function captureProbe(
  page: Page,
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
      TABLE_RH,
    }) => {
      const store = (window as any).__kupua_store__;
      if (!store) throw new Error("Store not exposed");
      const s = store.getState();

      const grid = document.querySelector('[aria-label="Image results grid"]');
      const table = document.querySelector('[aria-label="Image results table"]');
      const container = (grid ?? table) as HTMLElement | null;
      if (!container) throw new Error("No scroll container found");
      const isGrid = !!grid;

      const scrollTop = container.scrollTop;
      const scrollHeight = container.scrollHeight;
      const clientHeight = container.clientHeight;
      const containerRect = container.getBoundingClientRect();
      const containerPaddingTop =
        parseFloat(getComputedStyle(container).paddingTop) || 0;

      const rowH = isGrid ? ROW_HEIGHT : TABLE_RH;
      const cols = isGrid
        ? Math.max(1, Math.floor(container.clientWidth / MIN_CELL_WIDTH))
        : 1;

      // Viewport anchor
      const getAnchor = (window as any).__kupua_getViewportAnchorId__;
      const viewportAnchorId: string | null =
        typeof getAnchor === "function" ? getAnchor() : null;
      const viewportAnchorGlobalIdx: number | null = viewportAnchorId
        ? (s.imagePositions.get(viewportAnchorId) ?? null)
        : null;

      // Tracked image
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
          trackingGeoPixelTop = trackingRowIdx * rowH;
          trackingGeoRatio =
            clientHeight > 0
              ? (trackingGeoPixelTop - scrollTop) / clientHeight
              : -1;

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
      const centreRow = Math.floor(centreScrollPx / rowH);
      const centreLocalIdx = centreRow * cols + Math.floor(cols / 2);
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
        isGrid,
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
      TABLE_RH: TABLE_ROW_HEIGHT,
    },
  );
}

// ---------------------------------------------------------------------------
// Visible cells snapshot
// ---------------------------------------------------------------------------

export interface VisibleCell {
  imageId: string;
  localIdx: number;
  globalIdx: number;
  row: number;
  col: number;
  domRelativeTop: number;
  geoTop: number;
  domGeoDelta: number;
}

export async function captureVisibleCells(page: Page): Promise<VisibleCell[]> {
  return page.evaluate(
    ({
      ROW_HEIGHT,
      MIN_CELL_WIDTH,
      TABLE_RH,
    }) => {
      const store = (window as any).__kupua_store__;
      if (!store) return [];
      const s = store.getState();

      const grid = document.querySelector('[aria-label="Image results grid"]');
      const table = document.querySelector('[aria-label="Image results table"]');
      const container = (grid ?? table) as HTMLElement | null;
      if (!container) return [];

      const isGrid = !!grid;
      const containerRect = container.getBoundingClientRect();
      const rowH = isGrid ? ROW_HEIGHT : TABLE_RH;
      const cols = isGrid
        ? Math.max(1, Math.floor(container.clientWidth / MIN_CELL_WIDTH))
        : 1;

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
        const geoTop = row * rowH;
        const domRelativeTop =
          elRect.top - containerRect.top + container.scrollTop;
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

      cells.sort((a, b) => a.globalIdx - b.globalIdx);
      return cells;
    },
    {
      ROW_HEIGHT: GRID_ROW_HEIGHT,
      MIN_CELL_WIDTH: GRID_MIN_CELL_WIDTH,
      TABLE_RH: TABLE_ROW_HEIGHT,
    },
  );
}

// ---------------------------------------------------------------------------
// Wait for settle
// ---------------------------------------------------------------------------

export async function waitForSettle(page: Page, timeout = 30_000) {
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

// ---------------------------------------------------------------------------
// Transition sampling — rAF-rate capture during an operation
// ---------------------------------------------------------------------------

export interface TransitionSample {
  /** Frame index (0-based) */
  frameIdx: number;
  /** performance.now() timestamp */
  timestamp: number;
  /** Scroll container scrollTop */
  scrollTop: number;
  /** Store loading state */
  loading: boolean;
  /** Store bufferOffset */
  bufferOffset: number;
  /** Store results.length */
  resultsLength: number;
  /** Store sortAroundFocusStatus */
  safStatus: string | null;
  /** First visible [data-image-id] in viewport (top-most) */
  firstVisibleId: string | null;
  /** First visible image's global index */
  firstVisibleGlobalIdx: number;
  /** Last visible [data-image-id] in viewport */
  lastVisibleId: string | null;
  /** Last visible image's global index */
  lastVisibleGlobalIdx: number;
  /** Tracked image: is it rendered in the DOM? */
  trackedInDom: boolean;
  /** Tracked image: viewport ratio (0=top, 1=bottom, <0 or >1 = off-screen) */
  trackedViewportRatio: number | null;
  /** Tracked image: global index in current sort order */
  trackedGlobalIdx: number;
  /** Tracked image: column (0-based) within the buffer */
  trackedCol: number;
  /** Tracked image: row (0-based) within the buffer */
  trackedRow: number;
  /** Store: focusedImageId (explicit focus) */
  focusedImageId: string | null;
  /** Store: _phantomFocusImageId (one-shot phantom anchor) */
  phantomFocusImageId: string | null;
}

/**
 * Start rAF-rate sampling of scroll position and visible content.
 * Call this BEFORE triggering the action, then call `stopTransitionSampling`
 * after the action settles to collect the samples.
 *
 * The sampling loop runs in the browser and pushes to a global array.
 */
export async function startTransitionSampling(
  page: Page,
  trackingImageId: string | null,
): Promise<void> {
  await page.evaluate(
    ({ trackId, ROW_HEIGHT, MIN_CELL_WIDTH, TABLE_RH }) => {
      const w = window as any;
      w.__driftFlashSamples = [];
      w.__driftFlashSampling = true;
      w.__driftFlashFrameIdx = 0;

      function sample() {
        if (!w.__driftFlashSampling) return;

        const store = w.__kupua_store__;
        if (!store) {
          requestAnimationFrame(sample);
          return;
        }
        const s = store.getState();

        const grid = document.querySelector(
          '[aria-label="Image results grid"]',
        );
        const table = document.querySelector(
          '[aria-label="Image results table"]',
        );
        const container = (grid ?? table) as HTMLElement | null;
        if (!container) {
          requestAnimationFrame(sample);
          return;
        }

        const isGrid = !!grid;
        const containerRect = container.getBoundingClientRect();
        const rowH = isGrid ? ROW_HEIGHT : TABLE_RH;
        const cols = isGrid
          ? Math.max(1, Math.floor(container.clientWidth / MIN_CELL_WIDTH))
          : 1;

        // Find first and last visible images
        let firstVisibleId: string | null = null;
        let firstVisibleGlobalIdx = -1;
        let lastVisibleId: string | null = null;
        let lastVisibleGlobalIdx = -1;
        let trackedInDom = false;
        let trackedViewportRatio: number | null = null;
        let trackedGlobalIdx = -1;
        let trackedCol = -1;
        let trackedRow = -1;

        const elements = container.querySelectorAll("[data-image-id]");
        for (const el of elements) {
          const imageId = (el as HTMLElement).dataset.imageId;
          if (!imageId) continue;

          const elRect = el.getBoundingClientRect();
          // Skip if completely outside viewport
          if (
            elRect.bottom < containerRect.top ||
            elRect.top > containerRect.bottom
          )
            continue;

          const gIdx = s.imagePositions.get(imageId);
          if (gIdx === undefined) continue;

          if (
            firstVisibleId === null ||
            gIdx < firstVisibleGlobalIdx
          ) {
            firstVisibleId = imageId;
            firstVisibleGlobalIdx = gIdx;
          }
          if (
            lastVisibleId === null ||
            gIdx > lastVisibleGlobalIdx
          ) {
            lastVisibleId = imageId;
            lastVisibleGlobalIdx = gIdx;
          }

          // Track specific image
          if (trackId && imageId === trackId) {
            trackedInDom = true;
            trackedViewportRatio =
              containerRect.height > 0
                ? (elRect.top - containerRect.top) / containerRect.height
                : null;
            trackedGlobalIdx = gIdx;
            const localIdx = gIdx - s.bufferOffset;
            if (localIdx >= 0 && localIdx < s.results.length) {
              trackedCol = localIdx % cols;
              trackedRow = Math.floor(localIdx / cols);
            }
          }
        }

        w.__driftFlashSamples.push({
          frameIdx: w.__driftFlashFrameIdx++,
          timestamp: performance.now(),
          scrollTop: container.scrollTop,
          loading: s.loading,
          bufferOffset: s.bufferOffset,
          resultsLength: s.results.length,
          safStatus: s.sortAroundFocusStatus,
          firstVisibleId,
          firstVisibleGlobalIdx,
          lastVisibleId,
          lastVisibleGlobalIdx,
          trackedInDom,
          trackedViewportRatio,
          trackedGlobalIdx,
          trackedCol,
          trackedRow,
          focusedImageId: s.focusedImageId ?? null,
          phantomFocusImageId: s._phantomFocusImageId ?? null,
        });

        requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    },
    {
      trackId: trackingImageId,
      ROW_HEIGHT: GRID_ROW_HEIGHT,
      MIN_CELL_WIDTH: GRID_MIN_CELL_WIDTH,
      TABLE_RH: TABLE_ROW_HEIGHT,
    },
  );
}

/**
 * Stop rAF sampling and return all collected samples.
 */
export async function stopTransitionSampling(
  page: Page,
): Promise<TransitionSample[]> {
  return page.evaluate(() => {
    const w = window as any;
    w.__driftFlashSampling = false;
    const samples = w.__driftFlashSamples ?? [];
    delete w.__driftFlashSamples;
    delete w.__driftFlashSampling;
    delete w.__driftFlashFrameIdx;
    return samples;
  });
}

// ---------------------------------------------------------------------------
// Analysis: drift
// ---------------------------------------------------------------------------

export interface DriftMeasurement {
  /** Tracked image viewport ratio before action */
  preRatio: number;
  /** Tracked image viewport ratio after action */
  postRatio: number;
  /** Absolute drift in viewport ratio units */
  driftRatio: number;
  /** Drift in pixels (ratio × clientHeight) */
  driftPx: number;
  /** Was the tracked image in the buffer before? */
  preInBuffer: boolean;
  /** Was the tracked image in the buffer after? */
  postInBuffer: boolean;
  /** Was the tracked image the viewport anchor before? */
  preWasAnchor: boolean;
  /** Was the tracked image the viewport anchor after? */
  postWasAnchor: boolean;
}

export function measureDrift(
  pre: PositionProbe,
  post: PositionProbe,
): DriftMeasurement {
  // Prefer DOM ratios — they account for virtualizer positioning (paddingTop,
  // transform) that make raw geometry calculations wrong when bufferOffset changes.
  // Fall back to geometry ratios only when the DOM element isn't rendered.
  const preRatio = pre.trackingDomRatio ?? pre.trackingGeoRatio;
  const postRatio = post.trackingDomRatio ?? post.trackingGeoRatio;
  return {
    preRatio,
    postRatio,
    driftRatio: Math.abs(postRatio - preRatio),
    driftPx: Math.abs(postRatio - preRatio) * post.clientHeight,
    preInBuffer: pre.trackingInBuffer,
    postInBuffer: post.trackingInBuffer,
    preWasAnchor: pre.viewportAnchorId === pre.trackingImageId,
    postWasAnchor: post.viewportAnchorId === post.trackingImageId,
  };
}

// ---------------------------------------------------------------------------
// Analysis: flash
// ---------------------------------------------------------------------------

export interface FlashAnalysis {
  totalFrames: number;
  /** Duration of sampling in ms */
  durationMs: number;

  // Scroll flash: did scrollTop ever jump to near-zero from a deep position?
  scrollFlashDetected: boolean;
  /** Min scrollTop seen during transition */
  scrollTopMin: number;
  /** Max scrollTop seen during transition */
  scrollTopMax: number;
  /** Frames where scrollTop was < 10% of starting scrollTop */
  scrollFlashFrames: number;

  // Content flash: did the visible region jump to a very different part of the dataset?
  contentFlashDetected: boolean;
  /** Frames where first visible image was >50% of dataset away from expected region */
  contentFlashFrames: number;

  // Tracked image flash: did the tracked image disappear from viewport?
  trackedImageLostFrames: number;
  /** Frames where tracked image was in DOM but viewport ratio was off-screen */
  trackedImageOffScreenFrames: number;
}

export function analyzeFlash(
  samples: TransitionSample[],
  preScrollTop: number,
  preFirstVisibleGlobalIdx: number,
  postFirstVisibleGlobalIdx: number,
  totalImages: number,
): FlashAnalysis {
  if (samples.length === 0) {
    return {
      totalFrames: 0,
      durationMs: 0,
      scrollFlashDetected: false,
      scrollTopMin: 0,
      scrollTopMax: 0,
      scrollFlashFrames: 0,
      contentFlashDetected: false,
      contentFlashFrames: 0,
      trackedImageLostFrames: 0,
      trackedImageOffScreenFrames: 0,
    };
  }

  const durationMs =
    samples[samples.length - 1].timestamp - samples[0].timestamp;

  // Scroll flash (F1 pattern): scrollTop drops to near-zero WHILE content
  // is still from the deep region. We detect this as: scrollTop < 10% of
  // pre-action scrollTop AND first visible image is still from the pre-action
  // region (within 20% of total of pre position). This avoids false positives
  // when sort-around-focus legitimately repositions both buffer and scroll.
  const scrollFlashThreshold = Math.max(preScrollTop * 0.1, 100);
  let scrollFlashFrames = 0;
  let scrollTopMin = Infinity;
  let scrollTopMax = -Infinity;
  const preRegionThreshold = totalImages * 0.2;
  for (const s of samples) {
    scrollTopMin = Math.min(scrollTopMin, s.scrollTop);
    scrollTopMax = Math.max(scrollTopMax, s.scrollTop);
    if (
      preScrollTop > 1000 &&
      s.scrollTop < scrollFlashThreshold &&
      s.firstVisibleGlobalIdx >= 0 &&
      Math.abs(s.firstVisibleGlobalIdx - preFirstVisibleGlobalIdx) <
        preRegionThreshold
    ) {
      // scrollTop dropped but content is still from the old deep region =
      // the user sees deep-position content at the top of the viewport.
      scrollFlashFrames++;
    }
  }
  const scrollFlashDetected = scrollFlashFrames > 0;

  // Content flash: visible region jumps far from both pre and post positions.
  // "Far" = first visible global index is > 30% of total away from both
  // the pre and post expected regions.
  const contentThreshold = totalImages * 0.3;
  let contentFlashFrames = 0;
  for (const s of samples) {
    if (s.firstVisibleGlobalIdx < 0) continue; // no content visible
    const distFromPre = Math.abs(
      s.firstVisibleGlobalIdx - preFirstVisibleGlobalIdx,
    );
    const distFromPost = Math.abs(
      s.firstVisibleGlobalIdx - postFirstVisibleGlobalIdx,
    );
    if (distFromPre > contentThreshold && distFromPost > contentThreshold) {
      contentFlashFrames++;
    }
  }
  const contentFlashDetected = contentFlashFrames > 0;

  // Tracked image: frames where it's not in DOM or off-screen
  let trackedImageLostFrames = 0;
  let trackedImageOffScreenFrames = 0;
  for (const s of samples) {
    if (!s.trackedInDom) {
      trackedImageLostFrames++;
    } else if (
      s.trackedViewportRatio !== null &&
      (s.trackedViewportRatio < -0.1 || s.trackedViewportRatio > 1.1)
    ) {
      trackedImageOffScreenFrames++;
    }
  }

  return {
    totalFrames: samples.length,
    durationMs,
    scrollFlashDetected,
    scrollTopMin,
    scrollTopMax,
    scrollFlashFrames,
    contentFlashDetected,
    contentFlashFrames,
    trackedImageLostFrames,
    trackedImageOffScreenFrames,
  };
}

// ---------------------------------------------------------------------------
// Position flash analysis — tracks (col, row) of a reference image
// ---------------------------------------------------------------------------

export interface PositionFlashResult {
  /** Did the tracked image visit >2 distinct (col, row) positions? */
  flashDetected: boolean;
  /** All distinct (col, row) positions visited, in order of first appearance */
  positions: Array<{ col: number; row: number; firstFrame: number; lastFrame: number; frameCount: number }>;
  /** Number of distinct positions (1 = no movement, 2 = drift only, 3+ = flash) */
  distinctPositions: number;
  /** Frames where tracked image was not in the buffer at all */
  lostFrames: number;
  /** Total frames sampled */
  totalFrames: number;
  /** Duration in ms */
  durationMs: number;
}

/**
 * Analyze the (col, row) trajectory of a tracked image through a transition.
 *
 * A "position flash" is when the image visits >2 distinct (col, row) positions:
 *   Position A (initial) → Position B (unwanted intermediate) → Position C (final)
 *
 * This works for both explicit focus and phantom/no-focus mode — just pass any
 * visible image ID as the tracking target.
 */
export function analyzePositionFlash(
  samples: TransitionSample[],
): PositionFlashResult {
  if (samples.length === 0) {
    return {
      flashDetected: false,
      positions: [],
      distinctPositions: 0,
      lostFrames: 0,
      totalFrames: 0,
      durationMs: 0,
    };
  }

  const durationMs = samples[samples.length - 1].timestamp - samples[0].timestamp;

  // Build the trajectory: sequence of (col, row) positions
  const positions: PositionFlashResult["positions"] = [];
  let lostFrames = 0;
  let currentKey = "";

  for (const s of samples) {
    if (s.trackedCol < 0 || s.trackedRow < 0) {
      lostFrames++;
      continue;
    }

    const key = `${s.trackedCol},${s.trackedRow}`;
    if (key !== currentKey) {
      // New position
      const existing = positions.find(p => p.col === s.trackedCol && p.row === s.trackedRow);
      if (existing) {
        // Revisiting a previous position
        existing.lastFrame = s.frameIdx;
        existing.frameCount++;
      } else {
        positions.push({
          col: s.trackedCol,
          row: s.trackedRow,
          firstFrame: s.frameIdx,
          lastFrame: s.frameIdx,
          frameCount: 1,
        });
      }
      currentKey = key;
    } else {
      // Same position — update last frame and count
      const last = positions[positions.length - 1];
      if (last) {
        last.lastFrame = s.frameIdx;
        last.frameCount++;
      }
    }
  }

  return {
    flashDetected: positions.length > 2,
    positions,
    distinctPositions: positions.length,
    lostFrames,
    totalFrames: samples.length,
    durationMs,
  };
}

export function logPositionFlash(result: PositionFlashResult) {
  console.log(`\n  ── Position Flash Analysis (${result.totalFrames} frames, ${result.durationMs.toFixed(0)}ms) ──`);
  console.log(`  Distinct positions: ${result.distinctPositions}${result.flashDetected ? " ⚠ FLASH" : ""}`);
  for (const p of result.positions) {
    console.log(`    (col=${p.col}, row=${p.row}) frames ${p.firstFrame}–${p.lastFrame} (${p.frameCount} frames)`);
  }
  if (result.lostFrames > 0) {
    console.log(`  Lost frames (not in buffer): ${result.lostFrames}`);
  }
}

// ---------------------------------------------------------------------------
// Pretty-print (for console output / test reporting)
// ---------------------------------------------------------------------------

export function logProbe(probe: PositionProbe) {
  const lines = [
    `\n╔══════════════════════════════════════════════════════════════`,
    `║ PROBE: ${probe.label} (t=${probe.tMs}ms)`,
    `╠══════════════════════════════════════════════════════════════`,
    `║ Store: total=${probe.total}, offset=${probe.bufferOffset}, ` +
      `results=${probe.resultsLength}, loading=${probe.loading}`,
    `║ Sort: orderBy=${probe.orderBy}, safGen=${probe.sortAroundFocusGeneration}, ` +
      `safStatus=${probe.sortAroundFocusStatus}`,
    `║ Focus: explicit=${probe.focusedImageId}, phantom=${probe.phantomFocusImageId}`,
    `║ Scroll: top=${probe.scrollTop.toFixed(1)}, height=${probe.scrollHeight}, ` +
      `client=${probe.clientHeight}`,
    `║ Anchor: id=${probe.viewportAnchorId}, globalIdx=${probe.viewportAnchorGlobalIdx}`,
    `║ Tracking: id=${probe.trackingImageId?.slice(0, 16) ?? "N/A"}, ` +
      `inBuffer=${probe.trackingInBuffer}, globalIdx=${probe.trackingGlobalIdx}`,
    `║ GEO ratio=${probe.trackingGeoRatio.toFixed(4)}, ` +
      `DOM ratio=${probe.trackingDomRatio?.toFixed(4) ?? "N/A"}`,
  ];
  console.log(lines.join("\n"));
}

export function logFlash(analysis: FlashAnalysis) {
  const lines = [
    `\n── Flash Analysis (${analysis.totalFrames} frames, ${analysis.durationMs.toFixed(0)}ms) ──`,
    `  Scroll flash: ${analysis.scrollFlashDetected ? "YES" : "no"} ` +
      `(${analysis.scrollFlashFrames} frames, ` +
      `scrollTop range: ${analysis.scrollTopMin.toFixed(0)}–${analysis.scrollTopMax.toFixed(0)})`,
    `  Content flash: ${analysis.contentFlashDetected ? "YES" : "no"} ` +
      `(${analysis.contentFlashFrames} frames)`,
    `  Tracked lost: ${analysis.trackedImageLostFrames} frames, ` +
      `off-screen: ${analysis.trackedImageOffScreenFrames} frames`,
  ];
  console.log(lines.join("\n"));
}

export function logDrift(drift: DriftMeasurement) {
  const lines = [
    `\n── Drift Measurement ──`,
    `  Pre ratio: ${drift.preRatio.toFixed(4)} → Post ratio: ${drift.postRatio.toFixed(4)}`,
    `  Drift: ${drift.driftRatio.toFixed(4)} (${drift.driftPx.toFixed(1)}px)`,
    `  Pre in buffer: ${drift.preInBuffer}, Post in buffer: ${drift.postInBuffer}`,
    `  Pre was anchor: ${drift.preWasAnchor}, Post was anchor: ${drift.postWasAnchor}`,
  ];
  console.log(lines.join("\n"));
}
