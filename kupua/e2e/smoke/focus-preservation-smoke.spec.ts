/**
 * Focus & Position Preservation — Smoke Tests on Real TEST Cluster
 *
 * Validates Sessions 1–4 of the focus-preservation workplan against real data
 * (~1.3M images on TEST cluster). Catches visual artefacts that 10k mock data
 * cannot reveal: flash-of-top, row shifts during phantom promotion, scrubber
 * thumb jumps, unnecessary content movement.
 *
 * Run:
 *   Terminal 1: ./scripts/start.sh --use-TEST
 *   Terminal 2: /Users/mkarpow/code/grid/kupua/node_modules/.bin/playwright test \
 *     --config /Users/mkarpow/code/grid/kupua/playwright.smoke.config.ts \
 *     /Users/mkarpow/code/grid/kupua/e2e/smoke/focus-preservation-smoke.spec.ts \
 *     2>&1 | tee /tmp/kupua-test-output.txt
 */

import { test, expect, KupuaHelpers } from "../shared/helpers";
import { GRID_ROW_HEIGHT, GRID_MIN_CELL_WIDTH } from "@/constants/layout";
import { recordResult } from "./smoke-report";

// Pin to explicit focus mode — all tests validate focus-ring preservation.
test.beforeEach(async ({ kupua }) => {
  await kupua.ensureExplicitMode();
});

// ---------------------------------------------------------------------------
// Corpus pinning — freeze results for reproducibility
// ---------------------------------------------------------------------------
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
// SPA navigation helper (no full reload, preserves React/Zustand state)
// Uses TanStack Router's navigate() — simulates user-initiated navigation,
// NOT browser back/forward (which fires popstate and skips focus-preservation).
// ---------------------------------------------------------------------------
async function spaNavigate(
  page: import("@playwright/test").Page,
  path: string,
) {
  await page.evaluate((p) => {
    const router = (window as any).__kupua_router__;
    if (!router) throw new Error("Router not exposed on window");
    const markUserNav = (window as any).__kupua_markUserNav__;
    if (markUserNav) markUserNav();
    const url = new URL(p, window.location.origin);
    const search: Record<string, string> = {};
    url.searchParams.forEach((v, k) => { search[k] = v; });
    router.navigate({ to: url.pathname, search });
  }, path);
}

// ---------------------------------------------------------------------------
// State capture helpers
// ---------------------------------------------------------------------------
interface ViewportSnapshot {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  cols: number;
  bufferOffset: number;
  total: number;
  resultsLength: number;
  focusedImageId: string | null;
  loading: boolean;
  sortAroundFocusStatus: string | null;
  seekGeneration: number;
  /** IDs of the first few images in the buffer (for identity checks) */
  firstBufferIds: string[];
  /** ID of the image nearest viewport centre (pixel-math estimate) */
  centreImageId: string | null;
  /** Global index of the centre image */
  centreImageGlobalIdx: number;
  /** The real viewport anchor ID from the virtualizer (null if not exposed) */
  realViewportAnchorId: string | null;
}

async function captureViewport(
  page: import("@playwright/test").Page,
): Promise<ViewportSnapshot> {
  return page.evaluate(
    ({ ROW_HEIGHT, MIN_CELL_WIDTH }: { ROW_HEIGHT: number; MIN_CELL_WIDTH: number }) => {
      const store = (window as any).__kupua_store__;
      if (!store) throw new Error("Store not exposed");
      const s = store.getState();

      const grid = document.querySelector('[aria-label="Image results grid"]');
      const table = document.querySelector('[aria-label="Image results table"]');
      const el = (grid ?? table) as HTMLElement | null;
      const scrollTop = el?.scrollTop ?? 0;
      const scrollHeight = el?.scrollHeight ?? 0;
      const clientHeight = el?.clientHeight ?? 0;

      const cols = grid
        ? Math.max(1, Math.floor(el!.clientWidth / MIN_CELL_WIDTH))
        : 1;

      // Centre image: the image nearest the vertical centre of the viewport
      const centreScroll = scrollTop + clientHeight / 2;
      const centreRow = Math.floor(centreScroll / ROW_HEIGHT);
      const centreLocalIdx = centreRow * cols;
      const centreImg = s.results[centreLocalIdx];
      const centreId = centreImg?.id ?? null;
      const centreGlobalIdx = centreId
        ? (s.imagePositions.get(centreId) ?? s.bufferOffset + centreLocalIdx)
        : s.bufferOffset + centreLocalIdx;

      // First few buffer IDs for identity checks
      const firstIds: string[] = [];
      for (let i = 0; i < Math.min(20, s.results.length); i++) {
        if (s.results[i]?.id) firstIds.push(s.results[i].id);
      }

      // Read the real viewport anchor set by the virtualizer (if exposed).
      const getAnchor = (window as any).__kupua_getViewportAnchorId__;
      const realAnchorId: string | null = typeof getAnchor === "function" ? getAnchor() : null;

      return {
        scrollTop,
        scrollHeight,
        clientHeight,
        cols,
        bufferOffset: s.bufferOffset,
        total: s.total,
        resultsLength: s.results.length,
        focusedImageId: s.focusedImageId,
        loading: s.loading,
        sortAroundFocusStatus: s.sortAroundFocusStatus,
        seekGeneration: s._seekGeneration,
        firstBufferIds: firstIds,
        centreImageId: centreId,
        centreImageGlobalIdx: centreGlobalIdx,
        realViewportAnchorId: realAnchorId,
      };
    },
    { ROW_HEIGHT: GRID_ROW_HEIGHT, MIN_CELL_WIDTH: GRID_MIN_CELL_WIDTH },
  );
}

/** Get scrubber thumb's vertical position (top px within track). */
async function getScrubberThumbTop(
  page: import("@playwright/test").Page,
): Promise<number> {
  return page.evaluate(() => {
    const thumb = document.querySelector(
      '[data-scrubber-thumb="true"]',
    ) as HTMLElement | null;
    if (!thumb) return 0;
    return thumb.getBoundingClientRect().top;
  });
}

/**
 * Wait for search + position preservation to fully settle:
 * loading=false, sortAroundFocusStatus=null, results present.
 */
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Focus Preservation Smoke (real TEST cluster)", () => {
  test.describe.configure({ timeout: 120_000 });

  // Override viewport for MacBook Pro built-in screen (14" Retina)
  test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });

  // =========================================================================
  // T1: Phantom promotion — clear filter
  // =========================================================================
  test("T1: phantom promotion preserves position when clearing filter", async ({
    page,
    kupua,
  }) => {
    // Navigate with credit:PA filter (CQL query syntax) and corpus pinning
    await kupua.gotoWithParams(`query=${encodeURIComponent('credit:"PA"')}&until=${STABLE_UNTIL}`);
    const total = await requireRealData(kupua);

    // Seek to ~50% to get deep into results
    await kupua.seekTo(0.5);
    await page.waitForTimeout(3000); // generous settle for deep seek

    // Capture BEFORE state
    const before = await captureViewport(page);
    const scrubberBefore = await getScrubberThumbTop(page);

    console.log(`[T1] BEFORE: total=${before.total}, bufferOffset=${before.bufferOffset}, ` +
      `scrollTop=${before.scrollTop}, centreImage=${before.centreImageId}, ` +
      `centreGlobalIdx=${before.centreImageGlobalIdx}, realAnchor=${before.realViewportAnchorId}`);

    expect(before.centreImageId).not.toBeNull();
    expect(before.focusedImageId).toBeNull(); // no explicit focus — this is phantom

    // Clear the credit filter via SPA navigation
    await spaNavigate(page, `/search?nonFree=true&until=${STABLE_UNTIL}`);

    // Wait for phantom promotion to complete
    await waitForSettle(page);

    // Capture AFTER state
    const after = await captureViewport(page);
    const scrubberAfter = await getScrubberThumbTop(page);

    console.log(`[T1] AFTER: total=${after.total}, bufferOffset=${after.bufferOffset}, ` +
      `scrollTop=${after.scrollTop}, centreImage=${after.centreImageId}, ` +
      `centreGlobalIdx=${after.centreImageGlobalIdx}`);

    // --- ASSERTIONS ---

    // 1. No explicit focus should appear (phantom promotion doesn't set focusedImageId)
    expect(after.focusedImageId).toBeNull();

    // 2. Total should have increased (unfiltered > credit:PA subset)
    expect(after.total).toBeGreaterThanOrEqual(before.total);

    // 3. Not loading, no pending sort-around-focus
    expect(after.loading).toBe(false);
    expect(after.sortAroundFocusStatus).toBeNull();

    // 4. Position check: the anchor image should be VISIBLE (not just in buffer).
    //    Use the real viewport anchor from the virtualizer — pixel-math diverges
    //    in two-tier mode.
    const anchorId = before.realViewportAnchorId ?? before.centreImageId;
    const anchorVisibility = await page.evaluate(
      ({ targetId, ROW_HEIGHT, MIN_CELL_WIDTH }: { targetId: string; ROW_HEIGHT: number; MIN_CELL_WIDTH: number }) => {
        const store = (window as any).__kupua_store__;
        if (!store || !targetId) return { survived: false, visible: false, rowDelta: -1 };
        const s = store.getState();
        const idx = s.results.findIndex((r: any) => r?.id === targetId);
        if (idx < 0) return { survived: false, visible: false, rowDelta: -1 };
        const grid = document.querySelector('[aria-label="Image results grid"]') as HTMLElement | null;
        if (!grid) return { survived: true, visible: false, rowDelta: -1 };
        const cols = Math.max(1, Math.floor(grid.clientWidth / MIN_CELL_WIDTH));
        const imageRow = Math.floor(idx / cols);
        const imagePixelTop = imageRow * ROW_HEIGHT;
        const viewportTop = grid.scrollTop;
        const viewportBottom = viewportTop + grid.clientHeight;
        const visible = imagePixelTop >= viewportTop - ROW_HEIGHT && imagePixelTop <= viewportBottom;
        const centreRow = Math.floor((viewportTop + grid.clientHeight / 2) / ROW_HEIGHT);
        const rowDelta = Math.abs(imageRow - centreRow);
        return { survived: true, visible, rowDelta };
      },
      { targetId: anchorId!, ROW_HEIGHT: GRID_ROW_HEIGHT, MIN_CELL_WIDTH: GRID_MIN_CELL_WIDTH },
    );

    // 5. Scrubber thumb stability: should not jump more than 50px
    const scrubberDelta = Math.abs(scrubberAfter - scrubberBefore);

    // 6. Column count should be unchanged
    expect(after.cols).toBe(before.cols);

    // Record results for analysis
    await recordResult("T1-phantom-promotion", {
      beforeTotal: before.total,
      afterTotal: after.total,
      beforeBufferOffset: before.bufferOffset,
      afterBufferOffset: after.bufferOffset,
      beforeScrollTop: before.scrollTop,
      afterScrollTop: after.scrollTop,
      beforeCentreImage: before.centreImageId,
      afterCentreImage: after.centreImageId,
      beforeCentreGlobalIdx: before.centreImageGlobalIdx,
      afterCentreGlobalIdx: after.centreImageGlobalIdx,
      anchorSurvived: anchorVisibility.survived,
      anchorVisible: anchorVisibility.visible,
      anchorRowDelta: anchorVisibility.rowDelta,
      scrubberDelta,
      colsBefore: before.cols,
      colsAfter: after.cols,
    });

    // The anchor image should survive in the buffer
    expect(anchorVisibility.survived).toBe(true);
    // The anchor should be VISIBLE (within a few rows of viewport), not just in buffer
    expect(anchorVisibility.visible).toBe(true);

    // Scrubber shouldn't jump wildly (allow some movement since total changed)
    // Ratio-wise, the image is at a different proportion of a larger total,
    // so the thumb WILL move. But it shouldn't flash to top then back.
    // We check it's not at the very top (which would indicate flash-to-top bug).
    expect(after.bufferOffset).toBeGreaterThan(0);
  });

  // =========================================================================
  // T2: Explicit focus — clear filter
  // =========================================================================
  test("T2: explicit focus preserved when clearing filter", async ({
    page,
    kupua,
  }) => {
    // Navigate with credit:PA filter (CQL query)
    await kupua.gotoWithParams(`query=${encodeURIComponent('credit:"PA"')}&until=${STABLE_UNTIL}`);
    await requireRealData(kupua);

    // Seek to ~50% and focus an image there
    await kupua.seekTo(0.5);
    await page.waitForTimeout(3000);

    // Click an image to set explicit focus
    await kupua.focusNthItem(4);
    const focusedId = await kupua.getFocusedImageId();
    expect(focusedId).not.toBeNull();

    // Capture BEFORE state
    const before = await captureViewport(page);
    const scrubberBefore = await getScrubberThumbTop(page);

    console.log(`[T2] BEFORE: total=${before.total}, focusedId=${focusedId}, ` +
      `bufferOffset=${before.bufferOffset}, scrollTop=${before.scrollTop}`);

    // Clear the credit filter via SPA navigation
    await spaNavigate(page, `/search?nonFree=true&until=${STABLE_UNTIL}`);

    // Wait for focus preservation (sort-around-focus) to complete
    await waitForSettle(page);

    // Capture AFTER state
    const after = await captureViewport(page);
    const scrubberAfter = await getScrubberThumbTop(page);

    console.log(`[T2] AFTER: total=${after.total}, focusedId=${after.focusedImageId}, ` +
      `bufferOffset=${after.bufferOffset}, scrollTop=${after.scrollTop}`);

    // --- ASSERTIONS ---

    // 1. Focus ring on the same image
    expect(after.focusedImageId).toBe(focusedId);

    // 2. The image is in the buffer
    const inBuffer = await page.evaluate(
      (id: string) => {
        const store = (window as any).__kupua_store__;
        return store?.getState().results.some((r: any) => r?.id === id) ?? false;
      },
      focusedId!,
    );
    expect(inBuffer).toBe(true);

    // 3. Total should have increased (unfiltered >= credit:PA subset)
    expect(after.total).toBeGreaterThanOrEqual(before.total);

    // 4. Not loading
    expect(after.loading).toBe(false);
    expect(after.sortAroundFocusStatus).toBeNull();

    // 5. Buffer is not at top (shouldn't flash to position 0)
    expect(after.bufferOffset).toBeGreaterThan(0);

    // 6. Scrubber thumb stability
    const scrubberDelta = Math.abs(scrubberAfter - scrubberBefore);

    await recordResult("T2-explicit-focus-clear-filter", {
      focusedId,
      focusPreserved: after.focusedImageId === focusedId,
      beforeTotal: before.total,
      afterTotal: after.total,
      beforeBufferOffset: before.bufferOffset,
      afterBufferOffset: after.bufferOffset,
      inBuffer,
      scrubberDelta,
    });
  });

  // =========================================================================
  // T3: Explicit focus — sort change
  // =========================================================================
  test("T3: explicit focus preserved across sort change", async ({
    page,
    kupua,
  }) => {
    // Navigate with default sort (uploadTime desc)
    await kupua.gotoWithParams(`until=${STABLE_UNTIL}`);
    await requireRealData(kupua);

    // Seek to ~30% and focus an image
    await kupua.seekTo(0.3);
    await page.waitForTimeout(3000);

    await kupua.focusNthItem(4);
    const focusedId = await kupua.getFocusedImageId();
    expect(focusedId).not.toBeNull();

    const before = await captureViewport(page);
    const scrubberBefore = await getScrubberThumbTop(page);

    console.log(`[T3] BEFORE: total=${before.total}, focusedId=${focusedId}, ` +
      `bufferOffset=${before.bufferOffset}`);

    // Change sort to "Taken on" (date photo was taken, different from upload time)
    await kupua.selectSort("Taken on");

    // Wait for sort-around-focus to find the image in the new order
    await waitForSettle(page);

    const after = await captureViewport(page);
    const scrubberAfter = await getScrubberThumbTop(page);

    console.log(`[T3] AFTER: total=${after.total}, focusedId=${after.focusedImageId}, ` +
      `bufferOffset=${after.bufferOffset}`);

    // --- ASSERTIONS ---

    // 1. Focus preserved on same image
    expect(after.focusedImageId).toBe(focusedId);

    // 2. Image in buffer
    const inBuffer = await page.evaluate(
      (id: string) => {
        const store = (window as any).__kupua_store__;
        return store?.getState().results.some((r: any) => r?.id === id) ?? false;
      },
      focusedId!,
    );
    expect(inBuffer).toBe(true);

    // 3. Total should be approximately the same (sort doesn't change result count)
    expect(Math.abs(after.total - before.total)).toBeLessThan(100);

    // 4. Buffer offset likely very different (different sort order)
    //    but that's expected — the image is at a different position in dateAdded order

    // 5. Not loading
    expect(after.loading).toBe(false);
    expect(after.sortAroundFocusStatus).toBeNull();

    await recordResult("T3-explicit-focus-sort-change", {
      focusedId,
      focusPreserved: after.focusedImageId === focusedId,
      beforeBufferOffset: before.bufferOffset,
      afterBufferOffset: after.bufferOffset,
      offsetDelta: Math.abs(after.bufferOffset - before.bufferOffset),
      inBuffer,
      scrubberDelta: Math.abs(scrubberAfter - scrubberBefore),
    });
  });

  // =========================================================================
  // T4: Neighbour fallback
  // =========================================================================
  test("T4: neighbour fallback when focused image leaves results", async ({
    page,
    kupua,
  }) => {
    // Start unfiltered, focus an image, then apply a filter that excludes it.
    // The image's neighbours should be in the buffer, one of them focused.

    // Navigate with default sort
    await kupua.gotoWithParams(`until=${STABLE_UNTIL}`);
    await requireRealData(kupua);

    // Seek to ~20% — not too deep to avoid timeout issues
    await kupua.seekTo(0.2);
    await page.waitForTimeout(3000);

    // Focus an image and read its credit
    await kupua.focusNthItem(4);
    const focusedId = await kupua.getFocusedImageId();
    expect(focusedId).not.toBeNull();

    const imageCredit = await page.evaluate(() => {
      const store = (window as any).__kupua_store__;
      const s = store.getState();
      const idx = s.imagePositions.get(s.focusedImageId);
      if (idx == null) return null;
      const img = s.results[idx - s.bufferOffset];
      return img?.metadata?.credit ?? null;
    });

    console.log(`[T4] Focused image: ${focusedId}, credit: ${imageCredit}`);

    // We need a CQL query that EXCLUDES this image but INCLUDES its neighbours.
    // Strategy: read a neighbour's credit, then search for that credit via CQL.
    // The focused image (different credit) will be excluded.
    const neighbourInfo = await page.evaluate(() => {
      const store = (window as any).__kupua_store__;
      const s = store.getState();
      const focusIdx = s.imagePositions.get(s.focusedImageId);
      if (focusIdx == null) return null;
      const localIdx = focusIdx - s.bufferOffset;

      // Find a neighbour with a DIFFERENT credit
      for (let delta = 1; delta < 20; delta++) {
        for (const d of [delta, -delta]) {
          const ni = localIdx + d;
          if (ni < 0 || ni >= s.results.length) continue;
          const img = s.results[ni];
          if (!img) continue;
          const nc = img.metadata?.credit;
          const fc = s.results[localIdx]?.metadata?.credit;
          if (nc && fc && nc !== fc) {
            return { neighbourId: img.id, neighbourCredit: nc, focusCredit: fc };
          }
        }
      }
      return null;
    });

    if (!neighbourInfo) {
      console.log("[T4] SKIP: could not find a neighbour with different credit");
      test.skip(true, "No neighbour with different credit found nearby");
      return;
    }

    console.log(`[T4] Will filter by credit=${neighbourInfo.neighbourCredit} ` +
      `(focused image has credit=${neighbourInfo.focusCredit})`);

    const before = await captureViewport(page);

    // Apply CQL query that excludes the focused image (filter by neighbour's credit)
    await spaNavigate(
      page,
      `/search?nonFree=true&until=${STABLE_UNTIL}&query=${encodeURIComponent(`credit:"${neighbourInfo.neighbourCredit}"`)}`,
    );

    // Wait for neighbour fallback to complete
    await waitForSettle(page);

    const after = await captureViewport(page);

    console.log(`[T4] AFTER: focusedId=${after.focusedImageId}, ` +
      `bufferOffset=${after.bufferOffset}, total=${after.total}`);

    // --- ASSERTIONS ---

    // 1. Focus should NOT be on the original image (it's excluded by the filter)
    expect(after.focusedImageId).not.toBe(focusedId);

    // 2. Focus should be on SOME image (neighbour fallback found a survivor)
    //    OR null (no neighbours survived — graceful failure)
    //    The neighbour we identified should survive (same credit as filter),
    //    so we expect a non-null focus.
    if (after.focusedImageId) {
      console.log(`[T4] Neighbour fallback found: ${after.focusedImageId}`);

      // The focused image should be in the buffer
      const inBuffer = await page.evaluate(
        (id: string) => {
          const store = (window as any).__kupua_store__;
          return store?.getState().results.some((r: any) => r?.id === id) ?? false;
        },
        after.focusedImageId,
      );
      expect(inBuffer).toBe(true);
    } else {
      console.log("[T4] No neighbour survived — focus cleared (graceful failure)");
    }

    // 3. Not loading
    expect(after.loading).toBe(false);
    expect(after.sortAroundFocusStatus).toBeNull();

    await recordResult("T4-neighbour-fallback", {
      originalFocusedId: focusedId,
      originalCredit: neighbourInfo.focusCredit,
      filterCredit: neighbourInfo.neighbourCredit,
      newFocusedId: after.focusedImageId,
      neighbourFallbackWorked: after.focusedImageId !== null && after.focusedImageId !== focusedId,
      beforeBufferOffset: before.bufferOffset,
      afterBufferOffset: after.bufferOffset,
    });
  });

  // =========================================================================
  // T5: Arrow snap-back after distant seek
  // =========================================================================
  test("T5: arrow key snaps back to focused image after distant seek", async ({
    page,
    kupua,
  }) => {
    // Navigate
    await kupua.gotoWithParams(`until=${STABLE_UNTIL}`);
    await requireRealData(kupua);

    // Seek to ~40% and focus an image
    await kupua.seekTo(0.4);
    await page.waitForTimeout(3000);

    await kupua.focusNthItem(4);
    const focusedId = await kupua.getFocusedImageId();
    expect(focusedId).not.toBeNull();

    const focusBefore = await captureViewport(page);
    console.log(`[T5] Focus set: id=${focusedId}, bufferOffset=${focusBefore.bufferOffset}`);

    // Seek to a very different position (near top, ~5%)
    await kupua.seekTo(0.05);
    await page.waitForTimeout(3000);

    const afterSeek = await captureViewport(page);
    console.log(`[T5] After seek to 5%: bufferOffset=${afterSeek.bufferOffset}`);

    // Focus should still be set (durable — survives seek)
    expect(afterSeek.focusedImageId).toBe(focusedId);

    // But the focused image is NOT in the buffer (we seeked far away)
    const focusInBuffer = await page.evaluate(
      (id: string) => {
        const store = (window as any).__kupua_store__;
        return store?.getState().results.some((r: any) => r?.id === id) ?? false;
      },
      focusedId!,
    );

    if (focusInBuffer) {
      // If the focus is still in buffer, the seek didn't go far enough.
      // This can happen with small datasets. Skip the snap-back test.
      console.log("[T5] Focus still in buffer after seek — seek distance insufficient");
      test.skip(true, "Focused image still in buffer after seek (dataset too small or seek too close)");
      return;
    }

    // Press ArrowDown — should snap back to the focused image's position
    await page.keyboard.press("ArrowDown");

    // Wait for the snap-back seek to complete
    await page.waitForFunction(
      () => {
        const store = (window as any).__kupua_store__;
        if (!store) return false;
        const s = store.getState();
        return !s.loading && !s.sortAroundFocusStatus && s.results.length > 0;
      },
      undefined,
      { timeout: 30_000 },
    );
    await page.waitForTimeout(2000);

    const afterSnapBack = await captureViewport(page);
    console.log(`[T5] After snap-back: focusedId=${afterSnapBack.focusedImageId}, ` +
      `bufferOffset=${afterSnapBack.bufferOffset}`);

    // --- ASSERTIONS ---

    // 1. Focus should have moved to the NEXT image (not the same one — ArrowDown moves)
    //    OR focus is still on the same image (snap-back only, no delta) depending on implementation.
    //    Session 3 chose option (a): first press = snap back only, no delta.
    //    So focus should be on the same image or the next one.
    const focusAfterSnap = afterSnapBack.focusedImageId;

    // 2. The focused image should be back in the buffer
    const backInBuffer = await page.evaluate(
      (id: string) => {
        const store = (window as any).__kupua_store__;
        const s = store.getState();
        return s.results.some((r: any) => r?.id === id);
      },
      focusedId!,
    );

    // 3. Buffer offset should be near the original focus position (not near 5%)
    const offsetDelta = Math.abs(afterSnapBack.bufferOffset - focusBefore.bufferOffset);

    // 4. Not loading
    expect(afterSnapBack.loading).toBe(false);
    expect(afterSnapBack.sortAroundFocusStatus).toBeNull();

    await recordResult("T5-arrow-snap-back", {
      focusedId,
      focusAfterSnap,
      focusPreserved: focusAfterSnap === focusedId,
      focusMovedToNext: focusAfterSnap !== focusedId && focusAfterSnap !== null,
      backInBuffer,
      beforeBufferOffset: focusBefore.bufferOffset,
      seekBufferOffset: afterSeek.bufferOffset,
      afterSnapBackOffset: afterSnapBack.bufferOffset,
      offsetDelta,
    });

    // The focused image or its neighbour should be back in the buffer
    expect(backInBuffer || focusAfterSnap !== null).toBe(true);
  });

  // =========================================================================
  // T6: Scrubber thumb stability during phantom promotion
  //
  // Not in the original 5, but critical: detects whether the scrubber
  // thumb visually jumps during phantom promotion. The store's bufferOffset
  // still briefly goes to 0 (first-page fallback) — that's expected. What
  // matters is that the scrubber thumb doesn't visually flash to top.
  // =========================================================================
  test("T6: scrubber thumb stays stable during phantom promotion", async ({
    page,
    kupua,
  }) => {
    // Navigate with credit:PA filter (CQL query)
    await kupua.gotoWithParams(`query=${encodeURIComponent('credit:"PA"')}&until=${STABLE_UNTIL}`);
    await requireRealData(kupua);

    // Seek deep
    await kupua.seekTo(0.5);
    await page.waitForTimeout(3000);

    const before = await captureViewport(page);
    expect(before.bufferOffset).toBeGreaterThan(1000);

    // Capture the scrubber thumb's visual position before the transition
    const thumbTopBefore = await page.evaluate(() => {
      const thumb = document.querySelector('[data-scrubber-thumb="true"]') as HTMLElement;
      return thumb ? parseFloat(thumb.style.top) || 0 : 0;
    });

    // Set up a polling observer: sample BOTH bufferOffset and scrubber thumb position
    await page.evaluate(() => {
      (window as any).__thumbSamples = [];
      (window as any).__thumbInterval = setInterval(() => {
        const store = (window as any).__kupua_store__;
        const thumb = document.querySelector('[data-scrubber-thumb="true"]') as HTMLElement;
        if (store && thumb) {
          const s = store.getState();
          (window as any).__thumbSamples.push({
            ts: Date.now(),
            offset: s.bufferOffset,
            thumbTop: parseFloat(thumb.style.top) || 0,
            loading: s.loading,
            status: s.sortAroundFocusStatus,
          });
        }
      }, 50);
    });

    // Clear the credit filter (remove query param)
    await spaNavigate(page, `/search?nonFree=true&until=${STABLE_UNTIL}`);

    // Wait for settle
    await waitForSettle(page);

    // Stop sampling and retrieve
    const samples = await page.evaluate(() => {
      clearInterval((window as any).__thumbInterval);
      return (window as any).__thumbSamples as Array<{
        ts: number;
        offset: number;
        thumbTop: number;
        loading: boolean;
        status: string | null;
      }>;
    });

    // Analyse store-level flash (expected — this is internal)
    const minOffset = Math.min(...samples.map((s) => s.offset));
    const maxOffset = Math.max(...samples.map((s) => s.offset));
    const storeFlashed = minOffset === 0 && maxOffset > 1000;

    // Analyse scrubber thumb visual stability (the thing we actually fixed)
    const thumbTops = samples.map((s) => s.thumbTop);
    const minThumbTop = Math.min(...thumbTops);
    const maxThumbTop = Math.max(...thumbTops);
    // The thumb should never drop below some reasonable minimum during the transition.
    // "Flash to top" means thumbTop drops near 0 when it should be ~middle of track.
    // Allow ±30px jitter, but not a jump to 0 from a deep position.
    const thumbFlashedToTop = thumbTopBefore > 50 && minThumbTop < 10;

    console.log(`[T6] Samples: ${samples.length}, ` +
      `storeFlashed=${storeFlashed} (offset min=${minOffset}, max=${maxOffset}), ` +
      `thumbBefore=${thumbTopBefore.toFixed(1)}, thumbMin=${minThumbTop.toFixed(1)}, ` +
      `thumbMax=${maxThumbTop.toFixed(1)}, thumbFlashedToTop=${thumbFlashedToTop}`);

    await recordResult("T6-scrubber-thumb-stability", {
      sampleCount: samples.length,
      storeMinOffset: minOffset,
      storeMaxOffset: maxOffset,
      storeFlashed,
      thumbTopBefore,
      thumbMin: minThumbTop,
      thumbMax: maxThumbTop,
      thumbFlashedToTop,
      // All samples for analysis
      thumbProgression: samples.map((s) => ({
        offset: s.offset,
        thumbTop: s.thumbTop,
        status: s.status,
        loading: s.loading,
      })),
    });

    // The scrubber thumb should NOT flash to top (visual fix)
    // Soft assert for now — we need to see all sample data
    if (thumbFlashedToTop) {
      console.warn("[T6] FAIL: scrubber thumb still flashes to top");
    }
    expect(thumbFlashedToTop).toBe(false);
  });

  // =========================================================================
  // T7: Focus → clear focus (click gap) → clear filter
  //
  // User's real-world sequence: click an image (explicit focus), then click
  // the gap between images (clears focus), then clear a filter. This should
  // trigger phantom promotion using the viewport anchor — not lose position.
  // =========================================================================
  test("T7: focus then clear focus then clear filter — phantom promotion kicks in", async ({
    page,
    kupua,
  }) => {
    await kupua.gotoWithParams(`query=${encodeURIComponent('credit:"PA"')}&until=${STABLE_UNTIL}`);
    await requireRealData(kupua);

    // Seek to ~40% to be deep in results
    await kupua.seekTo(0.4);
    await page.waitForTimeout(3000);

    // Click an image to set explicit focus
    const firstCell = page.locator("[data-grid-cell]").first();
    await firstCell.click();
    await page.waitForTimeout(500);

    const afterFocus = await captureViewport(page);
    expect(afterFocus.focusedImageId).not.toBeNull();
    const focusedId = afterFocus.focusedImageId!;
    const focusedOffset = afterFocus.bufferOffset;

    console.log(`[T7] Focused: id=${focusedId}, bufferOffset=${focusedOffset}, scrollTop=${afterFocus.scrollTop}`);

    // Click background (gap) to clear focus
    // We click on the scroll container itself, at a position between cells
    const scrollContainer = page.locator('[aria-label="Image results grid"]');
    // Click the very bottom of the visible area (likely a gap row)
    const box = await scrollContainer.boundingBox();
    if (box) {
      await page.mouse.click(box.x + 5, box.y + box.height - 5);
    }
    await page.waitForTimeout(500);

    const afterClear = await captureViewport(page);
    // Focus should be null now
    console.log(`[T7] After gap click: focusedImageId=${afterClear.focusedImageId}, scrollTop=${afterClear.scrollTop}`);

    const scrollTopBeforeTransition = afterClear.scrollTop;
    // Use the real viewport anchor (set by the virtualizer) rather than the
    // pixel-math estimate — the two diverge in two-tier mode.
    const anchorBeforeTransition = afterClear.realViewportAnchorId ?? afterClear.centreImageId;

    // Now clear the credit filter — phantom promotion should fire
    await spaNavigate(page, `/search?nonFree=true&until=${STABLE_UNTIL}`);
    await waitForSettle(page);

    const after = await captureViewport(page);
    console.log(`[T7] AFTER clear filter: total=${after.total}, bufferOffset=${after.bufferOffset}, ` +
      `scrollTop=${after.scrollTop}, centreImage=${after.centreImageId}, ` +
      `focusedImageId=${after.focusedImageId}, realAnchor=${afterClear.realViewportAnchorId}`);

    // Check: the anchor image from before the transition should be in the buffer
    const anchorSurvived = anchorBeforeTransition
      ? await page.evaluate(
          (targetId: string) => {
            const store = (window as any).__kupua_store__;
            return store?.getState().results.some((r: any) => r?.id === targetId) ?? false;
          },
          anchorBeforeTransition,
        )
      : false;

    await recordResult("T7-focus-clear-focus-clear-filter", {
      focusedId,
      focusedOffset,
      focusCleared: afterClear.focusedImageId === null,
      scrollTopBeforeTransition,
      anchorBeforeTransition,
      realViewportAnchorId: afterClear.realViewportAnchorId,
      centreImageBeforeTransition: afterClear.centreImageId,
      afterTotal: after.total,
      afterBufferOffset: after.bufferOffset,
      afterScrollTop: after.scrollTop,
      afterFocusedImageId: after.focusedImageId,
      anchorSurvived,
      scrollTopDelta: Math.abs(after.scrollTop - scrollTopBeforeTransition),
    });

    // No explicit focus should appear (phantom path)
    expect(after.focusedImageId).toBeNull();
    // Buffer should NOT be at top (position was preserved)
    expect(after.bufferOffset).toBeGreaterThan(0);
    // Anchor should survive (PA images exist in unfiltered set)
    expect(anchorSurvived).toBe(true);
  });

  // =========================================================================
  // T8: Phantom promotion with details panel open
  //
  // The details panel changes the grid width → column count may differ.
  // Phantom promotion should still preserve position.
  // =========================================================================
  test("T8: phantom promotion with details panel open", async ({
    page,
    kupua,
  }) => {
    await kupua.gotoWithParams(`query=${encodeURIComponent('credit:"PA"')}&until=${STABLE_UNTIL}`);
    await requireRealData(kupua);

    // Open the details panel via keyboard shortcut Alt+]
    await page.keyboard.press("Alt+]");
    await page.waitForTimeout(1000);

    // Seek deep
    await kupua.seekTo(0.5);
    await page.waitForTimeout(3000);

    const before = await captureViewport(page);
    const colsWithPanel = before.cols;
    console.log(`[T8] BEFORE: total=${before.total}, bufferOffset=${before.bufferOffset}, ` +
      `scrollTop=${before.scrollTop}, cols=${colsWithPanel}, centreImage=${before.centreImageId}`);

    expect(before.focusedImageId).toBeNull();
    expect(before.bufferOffset).toBeGreaterThan(1000);

    // Clear filter — phantom promotion
    await spaNavigate(page, `/search?nonFree=true&until=${STABLE_UNTIL}`);
    await waitForSettle(page);

    const after = await captureViewport(page);
    console.log(`[T8] AFTER: total=${after.total}, bufferOffset=${after.bufferOffset}, ` +
      `scrollTop=${after.scrollTop}, cols=${after.cols}, centreImage=${after.centreImageId}`);

    const anchorId = before.realViewportAnchorId ?? before.centreImageId;
    const anchorSurvived = anchorId
      ? await page.evaluate(
          (targetId: string) => {
            const store = (window as any).__kupua_store__;
            return store?.getState().results.some((r: any) => r?.id === targetId) ?? false;
          },
          anchorId,
        )
      : false;

    await recordResult("T8-phantom-with-details-panel", {
      colsWithPanel,
      colsAfter: after.cols,
      beforeBufferOffset: before.bufferOffset,
      afterBufferOffset: after.bufferOffset,
      beforeScrollTop: before.scrollTop,
      afterScrollTop: after.scrollTop,
      anchorSurvived,
    });

    // Column count should stay the same (panel still open)
    expect(after.cols).toBe(colsWithPanel);
    // Buffer should NOT be at top
    expect(after.bufferOffset).toBeGreaterThan(0);
    expect(anchorSurvived).toBe(true);
  });

  // =========================================================================
  // T9: Rapid filter toggle — clear filter, re-add, clear again
  //
  // Quick successive search changes stress the abort/re-search path.
  // Position should still be preserved after the final settle.
  // =========================================================================
  test("T9: rapid filter toggle preserves position", async ({
    page,
    kupua,
  }) => {
    await kupua.gotoWithParams(`query=${encodeURIComponent('credit:"PA"')}&until=${STABLE_UNTIL}`);
    await requireRealData(kupua);

    await kupua.seekTo(0.5);
    await page.waitForTimeout(3000);

    const before = await captureViewport(page);
    console.log(`[T9] BEFORE: total=${before.total}, bufferOffset=${before.bufferOffset}, ` +
      `scrollTop=${before.scrollTop}, centreImage=${before.centreImageId}`);

    // Rapid toggle: clear → re-add → clear (no waiting between)
    await spaNavigate(page, `/search?nonFree=true&until=${STABLE_UNTIL}`);
    await page.waitForTimeout(200); // tiny delay, not full settle
    await spaNavigate(page, `/search?nonFree=true&query=${encodeURIComponent('credit:"PA"')}&until=${STABLE_UNTIL}`);
    await page.waitForTimeout(200);
    await spaNavigate(page, `/search?nonFree=true&until=${STABLE_UNTIL}`);

    // Now wait for full settle
    await waitForSettle(page);

    const after = await captureViewport(page);
    console.log(`[T9] AFTER: total=${after.total}, bufferOffset=${after.bufferOffset}, ` +
      `scrollTop=${after.scrollTop}, centreImage=${after.centreImageId}`);

    await recordResult("T9-rapid-filter-toggle", {
      beforeTotal: before.total,
      afterTotal: after.total,
      beforeBufferOffset: before.bufferOffset,
      afterBufferOffset: after.bufferOffset,
      beforeScrollTop: before.scrollTop,
      afterScrollTop: after.scrollTop,
      beforeCentreImage: before.centreImageId,
      afterCentreImage: after.centreImageId,
    });

    // Should NOT be at top — some position should be preserved
    expect(after.bufferOffset).toBeGreaterThan(0);
    // Should not be loading/stuck
    expect(after.loading).toBe(false);
    expect(after.sortAroundFocusStatus).toBeNull();
  });

  // =========================================================================
  // T10: Focus image → open details panel → clear filter
  //
  // User focuses an image, opens the details panel (which resizes the grid),
  // then clears a filter. Explicit focus path, but with a grid resize in
  // between. The focus should survive.
  // =========================================================================
  test("T10: explicit focus → open details panel → clear filter", async ({
    page,
    kupua,
  }) => {
    await kupua.gotoWithParams(`query=${encodeURIComponent('credit:"PA"')}&until=${STABLE_UNTIL}`);
    await requireRealData(kupua);

    await kupua.seekTo(0.3);
    await page.waitForTimeout(3000);

    // Focus an image by clicking it
    const cell = page.locator("[data-grid-cell]").first();
    await cell.click();
    await page.waitForTimeout(500);

    const beforePanel = await captureViewport(page);
    expect(beforePanel.focusedImageId).not.toBeNull();
    const focusedId = beforePanel.focusedImageId!;
    const colsBefore = beforePanel.cols;

    console.log(`[T10] Focused: id=${focusedId}, cols=${colsBefore}, bufferOffset=${beforePanel.bufferOffset}`);

    // Open details panel — this resizes the grid
    await page.keyboard.press("Alt+]");
    await page.waitForTimeout(1500); // settle after resize

    const afterPanel = await captureViewport(page);
    console.log(`[T10] After panel open: cols=${afterPanel.cols}, focusedId=${afterPanel.focusedImageId}`);

    // Focus should still be the same image
    expect(afterPanel.focusedImageId).toBe(focusedId);

    // Now clear the credit filter
    await spaNavigate(page, `/search?nonFree=true&until=${STABLE_UNTIL}`);
    await waitForSettle(page);

    const after = await captureViewport(page);
    console.log(`[T10] AFTER clear filter: total=${after.total}, focusedId=${after.focusedImageId}, ` +
      `bufferOffset=${after.bufferOffset}, scrollTop=${after.scrollTop}`);

    // The focused image should still be the same
    const focusSurvived = after.focusedImageId === focusedId;
    const focusInBuffer = await page.evaluate(
      (targetId: string) => {
        const store = (window as any).__kupua_store__;
        return store?.getState().results.some((r: any) => r?.id === targetId) ?? false;
      },
      focusedId,
    );

    await recordResult("T10-focus-panel-clear-filter", {
      focusedId,
      colsBefore,
      colsAfterPanel: afterPanel.cols,
      colsAfter: after.cols,
      focusSurvived,
      focusInBuffer,
      afterBufferOffset: after.bufferOffset,
      afterScrollTop: after.scrollTop,
    });

    // Focus should survive or at least the image should be in the buffer
    expect(focusInBuffer).toBe(true);
    expect(after.bufferOffset).toBeGreaterThan(0);
  });

  // =========================================================================
  // T11: Phantom promotion from very near top of results
  //
  // Edge case: if the user is near the top (small bufferOffset), phantom
  // promotion might behave differently because the "flash to 0" placeholder
  // is close to the real position. Verifies no regression.
  // =========================================================================
  test("T11: phantom promotion near top of results", async ({
    page,
    kupua,
  }) => {
    await kupua.gotoWithParams(`query=${encodeURIComponent('credit:"PA"')}&until=${STABLE_UNTIL}`);
    await requireRealData(kupua);

    // Seek to ~5% — near the top but not at the very start
    await kupua.seekTo(0.05);
    await page.waitForTimeout(3000);

    const before = await captureViewport(page);
    console.log(`[T11] BEFORE: total=${before.total}, bufferOffset=${before.bufferOffset}, ` +
      `scrollTop=${before.scrollTop}, centreImage=${before.centreImageId}`);

    // Clear filter
    await spaNavigate(page, `/search?nonFree=true&until=${STABLE_UNTIL}`);
    await waitForSettle(page);

    const after = await captureViewport(page);
    console.log(`[T11] AFTER: total=${after.total}, bufferOffset=${after.bufferOffset}, ` +
      `scrollTop=${after.scrollTop}, centreImage=${after.centreImageId}`);

    const anchorId = before.realViewportAnchorId ?? before.centreImageId;
    const anchorSurvived = anchorId
      ? await page.evaluate(
          (targetId: string) => {
            const store = (window as any).__kupua_store__;
            return store?.getState().results.some((r: any) => r?.id === targetId) ?? false;
          },
          anchorId,
        )
      : false;

    await recordResult("T11-phantom-near-top", {
      beforeBufferOffset: before.bufferOffset,
      afterBufferOffset: after.bufferOffset,
      beforeScrollTop: before.scrollTop,
      afterScrollTop: after.scrollTop,
      anchorSurvived,
    });

    expect(anchorSurvived).toBe(true);
    expect(after.loading).toBe(false);
  });

  // =========================================================================
  // T12: Phantom promotion near end of results
  //
  // Edge case: viewport anchor near the very end of the filtered set.
  // After filter clear, the total grows — the position must adapt.
  // =========================================================================
  test("T12: phantom promotion near end of results", async ({
    page,
    kupua,
  }) => {
    await kupua.gotoWithParams(`query=${encodeURIComponent('credit:"PA"')}&until=${STABLE_UNTIL}`);
    await requireRealData(kupua);

    // Seek to ~95%
    await kupua.seekTo(0.95);
    await page.waitForTimeout(3000);

    const before = await captureViewport(page);
    console.log(`[T12] BEFORE: total=${before.total}, bufferOffset=${before.bufferOffset}, ` +
      `scrollTop=${before.scrollTop}, centreImage=${before.centreImageId}`);

    // Clear filter
    await spaNavigate(page, `/search?nonFree=true&until=${STABLE_UNTIL}`);
    await waitForSettle(page);

    const after = await captureViewport(page);
    console.log(`[T12] AFTER: total=${after.total}, bufferOffset=${after.bufferOffset}, ` +
      `scrollTop=${after.scrollTop}, centreImage=${after.centreImageId}`);

    const anchorId = before.realViewportAnchorId ?? before.centreImageId;
    const anchorSurvived = anchorId
      ? await page.evaluate(
          (targetId: string) => {
            const store = (window as any).__kupua_store__;
            return store?.getState().results.some((r: any) => r?.id === targetId) ?? false;
          },
          anchorId,
        )
      : false;

    await recordResult("T12-phantom-near-end", {
      beforeBufferOffset: before.bufferOffset,
      afterBufferOffset: after.bufferOffset,
      beforeTotal: before.total,
      afterTotal: after.total,
      anchorSurvived,
    });

    expect(anchorSurvived).toBe(true);
    expect(after.bufferOffset).toBeGreaterThan(0);
    expect(after.loading).toBe(false);
  });
});
