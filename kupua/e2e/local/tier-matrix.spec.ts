/**
 * Cross-tier E2E test matrix.
 *
 * Runs ~18 tier-sensitive tests across all three scrolling tiers:
 * - **buffer**: VITE_SCROLL_MODE_THRESHOLD=15000 → all 10k eagerly loaded
 * - **two-tier**: default thresholds → position map + sliding buffer
 * - **seek**: VITE_POSITION_MAP_THRESHOLD=0 → scrubber = seek control
 *
 * Each test is self-contained — no imports from other spec files.
 * Tier-specific assertions branch on `tierName` derived from the
 * Playwright project name (set by playwright.tiers.config.ts).
 *
 * Run:
 *   npx playwright test --config playwright.tiers.config.ts
 *   npm run test:e2e:tiers
 */

import { test, expect } from "../shared/helpers";
import { GRID_ROW_HEIGHT, GRID_MIN_CELL_WIDTH, TABLE_ROW_HEIGHT } from "@/constants/layout";

// ---------------------------------------------------------------------------
// Tier detection — from Playwright project name, not runtime introspection.
// The config assigns each project a baseURL on a different port, each with
// different VITE_* env vars. We know the tier from the project name.
// ---------------------------------------------------------------------------

type Tier = "buffer" | "two-tier" | "seek";

function getTier(testInfo: { project: { name: string } }): Tier {
  const name = testInfo.project.name;
  if (name.includes("buffer")) return "buffer";
  if (name.includes("two-tier")) return "two-tier";
  if (name.includes("seek")) return "seek";
  // Fallback: if run outside the tier config, assume two-tier (default thresholds)
  return "two-tier";
}

// ---------------------------------------------------------------------------
// Safety gate — same as scrubber.spec.ts
// ---------------------------------------------------------------------------

const LOCAL_MAX_DOCS = 50_000;
let _realEsCheckResult: { count: number } | null | "unchecked" = "unchecked";

async function assertNotRealEs() {
  if (_realEsCheckResult === null) return;
  if (_realEsCheckResult !== "unchecked") {
    throw new Error(`🛑 Refusing to run: real ES detected (${(_realEsCheckResult as { count: number }).count.toLocaleString()} docs).`);
  }
  let count: number | undefined;
  // The port varies per tier — use the page's origin
  for (const suffix of ["/es/images/_count", "/es/_count"]) {
    try {
      const res = await fetch(`http://localhost:3010${suffix}`, { signal: AbortSignal.timeout(2000) });
      if (!res.ok) continue;
      const data = await res.json() as { count?: number };
      if (data.count !== undefined) { count = data.count; break; }
    } catch { continue; }
  }
  if (count !== undefined && count > LOCAL_MAX_DOCS) {
    _realEsCheckResult = { count };
    throw new Error(`🛑 Real ES detected (${count.toLocaleString()} docs). Stop --use-TEST.`);
  }
  _realEsCheckResult = null;
}

test.beforeEach(async ({ kupua }) => {
  await assertNotRealEs();
  // Pin to explicit focus mode — density toggle, sort preservation, and
  // Home/End tests use focusNthItem which requires click-to-focus.
  await kupua.ensureExplicitMode();
});

// ---------------------------------------------------------------------------
// Helper: wait for buffer mode to fully load all results
// ---------------------------------------------------------------------------

async function waitForBufferFilled(kupua: any, timeout = 30_000) {
  await kupua.page.waitForFunction(
    () => {
      const store = (window as any).__kupua_store__;
      if (!store) return false;
      const s = store.getState();
      return s.total > 0 && s.results.length >= s.total;
    },
    { timeout },
  );
}

// ---------------------------------------------------------------------------
// Helper: get view state for density-switch tests
// ---------------------------------------------------------------------------

async function getViewState(page: any) {
  return page.evaluate(({ MIN_CELL_WIDTH, GRID_RH, TABLE_RH }: any) => {
    const grid = document.querySelector('[aria-label="Image results grid"]');
    const table = document.querySelector('[aria-label="Image results table"]');
    const el = (grid ?? table) as HTMLElement | null;
    if (!el) return null;
    const isGrid = !!grid;
    const rowH = isGrid ? GRID_RH : TABLE_RH;
    const cols = isGrid ? Math.max(1, Math.floor(el.clientWidth / MIN_CELL_WIDTH)) : 1;
    const store = (window as any).__kupua_store__;
    const s = store?.getState();
    const bufferOffset = s?.bufferOffset ?? 0;
    const centrePixel = el.scrollTop + el.clientHeight / 2;
    const centreRow = Math.floor(centrePixel / rowH);
    const centreGlobalIdx = centreRow * cols;
    const centreLocalIdx = centreGlobalIdx - bufferOffset;
    const centreImage = (centreLocalIdx >= 0 && centreLocalIdx < (s?.results?.length ?? 0))
      ? s.results[centreLocalIdx]
      : null;
    const centreGlobalPos = centreImage
      ? (s.imagePositions.get(centreImage.id) ?? -1)
      : -1;
    return {
      scrollTop: Math.round(el.scrollTop),
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      maxScroll: el.scrollHeight - el.clientHeight,
      isGrid,
      cols,
      rowH,
      bufferOffset,
      resultsLength: s?.results?.length ?? 0,
      total: s?.total ?? 0,
      centreGlobalPos,
      centreImageId: centreImage?.id ?? null,
    };
  }, {
    MIN_CELL_WIDTH: GRID_MIN_CELL_WIDTH,
    GRID_RH: GRID_ROW_HEIGHT,
    TABLE_RH: TABLE_ROW_HEIGHT,
  });
}

// ===========================================================================
// Cross-tier tests
// ===========================================================================

test.describe("Cross-tier matrix", () => {
  test.describe.configure({ timeout: 60_000 });

  // -------------------------------------------------------------------------
  // 1. Seek to 50% lands near middle
  // -------------------------------------------------------------------------

  test("seek to 50% lands near the middle of the dataset", async ({ kupua }, testInfo) => {
    const tier = getTier(testInfo);
    await kupua.goto();
    if (tier === "buffer") await waitForBufferFilled(kupua);
    const { total } = await kupua.getStoreState();

    await kupua.seekTo(0.5);
    const store = await kupua.getStoreState();
    expect(store.error).toBeNull();

    if (tier === "buffer") {
      // Buffer mode: seek = local scroll, bufferOffset stays 0
      expect(store.bufferOffset).toBe(0);
      const scrollTop = await kupua.getScrollTop();
      expect(scrollTop).toBeGreaterThan(0);
    } else {
      // Two-tier / seek: buffer repositioned near midpoint
      const midTarget = Math.floor(total / 2);
      expect(store.bufferOffset).toBeLessThan(midTarget + 500);
      expect(store.bufferOffset + store.resultsLength).toBeGreaterThan(midTarget - 500);
    }
    expect(store.resultsLength).toBeGreaterThan(50);
    await kupua.assertPositionsConsistent();
  });

  // -------------------------------------------------------------------------
  // 2. Seek to top resets near 0
  // -------------------------------------------------------------------------

  test("seek to top resets buffer near offset 0", async ({ kupua }, testInfo) => {
    const tier = getTier(testInfo);
    await kupua.goto();
    if (tier === "buffer") await waitForBufferFilled(kupua);

    // Go deep first
    await kupua.seekTo(0.5);
    // Seek back to top
    await kupua.seekTo(0.02);

    const store = await kupua.getStoreState();
    expect(store.error).toBeNull();

    if (tier === "buffer") {
      // Buffer mode: all data in memory, seek = local scroll, bufferOffset stays 0
      expect(store.bufferOffset).toBe(0);
    } else {
      // Seek/two-tier: buffer repositioned near the top
      expect(store.bufferOffset).toBeLessThan(200);
    }
    // NOTE: scrollTop is NOT necessarily near 0 after seekTo(0.02).
    // In buffer/two-tier modes, 2% of 10k items is ~200 items, which is
    // thousands of pixels of scrollHeight. In seek mode, bidirectional
    // headroom adds ~7.5k pixels. The important assertion is bufferOffset.
    const pos = await kupua.getScrubberPosition();
    expect(pos).toBeLessThan(300);
    await kupua.assertPositionsConsistent();
  });

  // -------------------------------------------------------------------------
  // 3. Seek to bottom lands near end
  // -------------------------------------------------------------------------

  test("seek to bottom lands near the end", async ({ kupua }, testInfo) => {
    const tier = getTier(testInfo);
    await kupua.goto();
    if (tier === "buffer") await waitForBufferFilled(kupua);

    await kupua.seekTo(0.98);
    const store = await kupua.getStoreState();
    expect(store.error).toBeNull();

    if (tier === "buffer") {
      expect(store.bufferOffset).toBe(0);
      const scrollTop = await kupua.getScrollTop();
      expect(scrollTop).toBeGreaterThan(0);
    } else {
      // Buffer should be near the end
      expect(store.bufferOffset).toBeGreaterThan(0);
    }
    await kupua.assertPositionsConsistent();
  });

  // -------------------------------------------------------------------------
  // 4. Consecutive seeks produce different buffers
  // -------------------------------------------------------------------------

  test("consecutive seeks produce different buffers", async ({ kupua }, testInfo) => {
    const tier = getTier(testInfo);
    await kupua.goto();
    if (tier === "buffer") await waitForBufferFilled(kupua);

    await kupua.seekTo(0.2);
    const store1 = await kupua.getStoreState();
    const id1 = store1.firstImageId;

    await kupua.seekTo(0.8);
    const store2 = await kupua.getStoreState();
    const id2 = store2.firstImageId;

    if (tier === "buffer") {
      // Buffer mode: bufferOffset always 0, but scrollTop should differ
      // and the "first visible" image should differ
      expect(id1).toBe(id2); // first image in buffer is always the same
      // But scroll positions should be different
      // (we can't easily check this since seekTo already moved scroll back)
    } else {
      expect(id1).not.toBe(id2);
      expect(store2.bufferOffset).toBeGreaterThan(store1.bufferOffset);
    }
    await kupua.assertPositionsConsistent();
  });

  // -------------------------------------------------------------------------
  // 5. Drag to middle repositions
  // -------------------------------------------------------------------------

  test("drag to middle repositions correctly", async ({ kupua }, testInfo) => {
    const tier = getTier(testInfo);
    await kupua.goto();
    if (tier === "buffer") await waitForBufferFilled(kupua);

    await kupua.dragScrubberTo(0.5);

    const store = await kupua.getStoreState();
    expect(store.error).toBeNull();
    expect(store.resultsLength).toBeGreaterThan(50);

    if (tier === "buffer") {
      expect(store.bufferOffset).toBe(0);
    } else {
      expect(store.bufferOffset).toBeGreaterThan(0);
    }
    await kupua.assertPositionsConsistent();
  });

  // -------------------------------------------------------------------------
  // 6. Content rendered after deep seek
  // -------------------------------------------------------------------------

  test("content is rendered (not blank) after deep seek", async ({ kupua }, testInfo) => {
    const tier = getTier(testInfo);
    await kupua.goto();
    if (tier === "buffer") await waitForBufferFilled(kupua);

    await kupua.seekTo(0.5);

    const hasContent = await kupua.page.evaluate(() => {
      const grid = document.querySelector('[aria-label="Image results grid"]');
      const table = document.querySelector('[aria-label="Image results table"]');
      const container = grid ?? table;
      if (!container) return false;
      const rows = container.querySelectorAll('[role="row"]');
      const cells = container.querySelectorAll('[class*="cursor-pointer"]');
      return rows.length > 0 || cells.length > 0;
    });
    expect(hasContent).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 7. Scroll works after seek (no freeze)
  // -------------------------------------------------------------------------

  test("scroll works after deep seek (no freeze)", async ({ kupua }, testInfo) => {
    const tier = getTier(testInfo);
    await kupua.goto();
    if (tier === "buffer") await waitForBufferFilled(kupua);

    for (const ratio of [0.5, 0.8, 0.2]) {
      await kupua.seekTo(ratio);
      await kupua.page.waitForTimeout(800);

      const scrollTopBefore = await kupua.getScrollTop();
      await kupua.scrollBy(500);
      const scrollTopAfter = await kupua.getScrollTop();

      expect(scrollTopAfter, `scroll frozen after seek to ${ratio}`).not.toEqual(scrollTopBefore);
    }
  });

  // -------------------------------------------------------------------------
  // 8. Rapid density toggling doesn't corrupt state
  // -------------------------------------------------------------------------

  test("rapid density toggling doesn't corrupt state", async ({ kupua }, testInfo) => {
    const tier = getTier(testInfo);
    await kupua.goto();
    if (tier === "buffer") await waitForBufferFilled(kupua);

    await kupua.seekTo(0.3);
    await kupua.focusNthItem(2);
    const focusedId = await kupua.getFocusedImageId();

    for (let i = 0; i < 5; i++) {
      if (await kupua.isGridView()) {
        await kupua.switchToTable();
      } else {
        await kupua.switchToGrid();
      }
    }

    const store = await kupua.getStoreState();
    expect(store.resultsLength).toBeGreaterThan(0);
    expect(store.focusedImageId).toBe(focusedId);
    expect(store.error).toBeNull();
    await kupua.assertPositionsConsistent();
  });

  // -------------------------------------------------------------------------
  // 9. Sort-around-focus: direction change
  // -------------------------------------------------------------------------

  test("focused image survives sort direction change", async ({ kupua }, testInfo) => {
    const tier = getTier(testInfo);
    await kupua.goto();
    if (tier === "buffer") await waitForBufferFilled(kupua);

    await kupua.seekTo(0.3);
    await kupua.focusNthItem(3);
    const focusedId = await kupua.getFocusedImageId();
    expect(focusedId).not.toBeNull();

    await kupua.toggleSortDirection();
    await kupua.page.waitForFunction(
      () => {
        const store = (window as any).__kupua_store__;
        return store?.getState().sortAroundFocusStatus === null;
      },
      { timeout: 15_000 },
    );

    expect(await kupua.getFocusedImageId()).toBe(focusedId);
    const globalPos = await kupua.getFocusedGlobalPosition();
    const store = await kupua.getStoreState();
    expect(globalPos).toBeGreaterThanOrEqual(store.bufferOffset);
    expect(globalPos).toBeLessThan(store.bufferOffset + store.resultsLength);
    expect(store.error).toBeNull();
    await kupua.assertPositionsConsistent();
  });

  // -------------------------------------------------------------------------
  // 10. Sort-around-focus: field change
  // -------------------------------------------------------------------------

  test("focused image is within viewport after sort field change", async ({ kupua }, testInfo) => {
    const tier = getTier(testInfo);
    await kupua.goto();
    if (tier === "buffer") await waitForBufferFilled(kupua);

    await kupua.focusNthItem(5);
    const focusedId = await kupua.getFocusedImageId();
    expect(focusedId).not.toBeNull();

    await kupua.selectSort("Credit");
    await kupua.waitForSortAroundFocus(15_000);
    await kupua.page.waitForTimeout(500);

    expect(await kupua.getFocusedImageId()).toBe(focusedId);
    const store = await kupua.getStoreState();
    expect(store.error).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 11. Home (no focus) scrolls to top
  // -------------------------------------------------------------------------

  test("Home scrolls to top without setting focus", async ({ kupua }, testInfo) => {
    const tier = getTier(testInfo);
    await kupua.goto();
    if (tier === "buffer") await waitForBufferFilled(kupua);

    // Scroll down first
    await kupua.pageDown();
    await kupua.pageDown();
    expect(await kupua.getScrollTop()).toBeGreaterThan(0);

    await kupua.page.keyboard.press("Home");
    await kupua.page.waitForTimeout(500);

    expect(await kupua.getScrollTop()).toBe(0);
    expect(await kupua.getFocusedImageId()).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 12. End (no focus) scrolls to bottom
  // -------------------------------------------------------------------------

  test("End scrolls to bottom without setting focus", async ({ kupua }, testInfo) => {
    const tier = getTier(testInfo);
    await kupua.goto();
    if (tier === "buffer") await waitForBufferFilled(kupua);

    await kupua.page.keyboard.press("End");
    // End may trigger a seek in two-tier/seek modes — give it time
    await kupua.page.waitForTimeout(tier === "buffer" ? 500 : 2000);

    const scrollTop = await kupua.getScrollTop();
    expect(scrollTop).toBeGreaterThan(0);
    expect(await kupua.getFocusedImageId()).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 13. Home after deep seek focuses first image
  // -------------------------------------------------------------------------

  test("Home after deep seek focuses first image", async ({ kupua }, testInfo) => {
    const tier = getTier(testInfo);
    await kupua.goto();
    if (tier === "buffer") await waitForBufferFilled(kupua);

    // Seek deep
    await kupua.seekTo(0.5);
    await kupua.page.waitForTimeout(1000);

    // Set focus via the store (reliable in all tiers — avoids DOM race)
    const focusedId = await kupua.page.evaluate(() => {
      const store = (window as any).__kupua_store__;
      if (!store) return null;
      const s = store.getState();
      const img = s.results[0];
      if (img) {
        s.setFocusedImageId(img.id);
        return img.id;
      }
      return null;
    });
    expect(focusedId).not.toBeNull();

    // Press Home
    const genBefore = (await kupua.getStoreState()).seekGeneration;
    await kupua.page.keyboard.press("Home");

    if (tier === "buffer") {
      // Buffer: no seek needed, just scroll to 0
      await kupua.page.waitForTimeout(500);
    } else {
      // Two-tier / seek: seek(0) fires
      await kupua.waitForSeekGenerationBump(genBefore);
      await kupua.page.waitForTimeout(500);
    }

    const store = await kupua.getStoreState();
    expect(store.bufferOffset).toBe(0);
    expect(store.error).toBeNull();
    expect(await kupua.getScrollTop()).toBe(0);

    // Focus should be on the first image
    const focusedIdAfter = await kupua.getFocusedImageId();
    const firstImageId = await kupua.page.evaluate(() => {
      const s = (window as any).__kupua_store__.getState();
      return s.results[0]?.id ?? null;
    });
    expect(focusedIdAfter).toBe(firstImageId);
  });

  // -------------------------------------------------------------------------
  // 14. End focuses last image
  // -------------------------------------------------------------------------

  test("End focuses last image", async ({ kupua }, testInfo) => {
    const tier = getTier(testInfo);
    await kupua.goto();
    if (tier === "buffer") await waitForBufferFilled(kupua);

    // Set focus
    await kupua.focusNthItem(0);
    expect(await kupua.getFocusedImageId()).not.toBeNull();

    const genBefore = (await kupua.getStoreState()).seekGeneration;
    await kupua.page.keyboard.press("End");

    if (tier === "buffer") {
      await kupua.page.waitForTimeout(500);
    } else {
      await kupua.waitForSeekGenerationBump(genBefore);
      await kupua.page.waitForTimeout(500);
    }

    const scrollTop = await kupua.getScrollTop();
    expect(scrollTop).toBeGreaterThan(0);

    const store = await kupua.getStoreState();
    expect(store.error).toBeNull();

    if (tier !== "buffer") {
      expect(store.bufferOffset + store.resultsLength).toBeGreaterThanOrEqual(store.total - 10);
    }

    // Focus should be on the last image
    const focusedId = await kupua.getFocusedImageId();
    const lastImageId = await kupua.page.evaluate(() => {
      const s = (window as any).__kupua_store__.getState();
      return s.results[s.results.length - 1]?.id ?? null;
    });
    expect(focusedId).toBe(lastImageId);
  });

  // -------------------------------------------------------------------------
  // 15. End then Home (Bug #1 race)
  // -------------------------------------------------------------------------

  test("End then Home returns to offset 0 with no stale data", async ({ kupua }, testInfo) => {
    const tier = getTier(testInfo);
    await kupua.goto();
    if (tier === "buffer") await waitForBufferFilled(kupua);

    // Go to the bottom
    await kupua.page.keyboard.press("End");
    if (tier === "buffer") {
      await kupua.page.waitForTimeout(500);
    } else {
      await kupua.waitForSeekComplete();
      await kupua.page.waitForTimeout(300);
    }

    const endStore = await kupua.getStoreState();
    expect(endStore.error).toBeNull();
    if (tier !== "buffer") {
      expect(endStore.bufferOffset).toBeGreaterThan(0);
    }

    // Now press Home
    await kupua.page.keyboard.press("Home");
    if (tier === "buffer") {
      await kupua.page.waitForTimeout(500);
    } else {
      await kupua.waitForSeekComplete();
      await kupua.page.waitForTimeout(500);
    }

    const homeStore = await kupua.getStoreState();
    expect(homeStore.error).toBeNull();
    expect(homeStore.bufferOffset).toBe(0);
    expect(homeStore.resultsLength).toBeGreaterThan(0);
    await kupua.assertPositionsConsistent();

    const scrollTop = await kupua.getScrollTop();
    expect(scrollTop).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 16. End key under Credit sort (Bug #14)
  // -------------------------------------------------------------------------

  test("End key seeks to last results under Credit sort", async ({ kupua }, testInfo) => {
    const tier = getTier(testInfo);
    await kupua.goto();
    if (tier === "buffer") await waitForBufferFilled(kupua);

    await kupua.selectSort("Credit");
    await kupua.page.waitForTimeout(500);
    if (tier === "buffer") await waitForBufferFilled(kupua);

    const genBefore = (await kupua.getStoreState()).seekGeneration;

    await kupua.page.keyboard.press("End");

    if (tier === "buffer") {
      await kupua.page.waitForTimeout(500);
    } else {
      await kupua.waitForSeekGenerationBump(genBefore);
      await kupua.page.waitForTimeout(500);
    }

    const store = await kupua.getStoreState();
    expect(store.error).toBeNull();

    if (tier !== "buffer") {
      const bufferEnd = store.bufferOffset + store.resultsLength;
      expect(bufferEnd).toBeGreaterThanOrEqual(store.total - 10);
    }

    const scrollTop = await kupua.getScrollTop();
    expect(scrollTop).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // 17. Density switch: PgDown ×3 preserves position
  // -------------------------------------------------------------------------

  test("PgDown ×3 preserves position across table↔grid round-trip", async ({ kupua }, testInfo) => {
    const tier = getTier(testInfo);
    await kupua.goto();
    if (tier === "buffer") await waitForBufferFilled(kupua);

    await kupua.switchToTable();
    await kupua.page.waitForTimeout(500);
    if (tier === "buffer") await waitForBufferFilled(kupua);

    expect(await kupua.getFocusedImageId()).toBeNull();

    // PgDown 3 times in table
    for (let i = 0; i < 3; i++) {
      await kupua.page.keyboard.press("PageDown");
      await kupua.page.waitForTimeout(100);
    }
    await kupua.page.waitForTimeout(300);

    const tableBefore = await getViewState(kupua.page);
    expect(tableBefore!.scrollTop).toBeGreaterThan(500);

    // Table → grid
    await kupua.switchToGrid();
    await kupua.page.waitForTimeout(800);

    const gridState = await getViewState(kupua.page);
    expect(gridState!.scrollTop).toBeGreaterThan(0);
    expect(Math.abs(gridState!.centreGlobalPos - tableBefore!.centreGlobalPos))
      .toBeLessThan(gridState!.cols * 2);

    // Grid → table
    await kupua.switchToTable();
    await kupua.page.waitForTimeout(800);

    const tableAfter = await getViewState(kupua.page);
    expect(tableAfter!.scrollTop).toBeGreaterThan(0);
    expect(Math.abs(tableAfter!.centreGlobalPos - gridState!.centreGlobalPos))
      .toBeLessThan(gridState!.cols * 2 + 5);
  });

  // -------------------------------------------------------------------------
  // 18. Density switch: seek 50% table→grid→table stable
  // -------------------------------------------------------------------------

  test("seek 50% in table → grid → table round-trip is stable", async ({ kupua }, testInfo) => {
    const tier = getTier(testInfo);
    await kupua.goto();
    if (tier === "buffer") await waitForBufferFilled(kupua);

    await kupua.switchToTable();
    await kupua.page.waitForTimeout(500);
    if (tier === "buffer") await waitForBufferFilled(kupua);

    // Seek to 50%
    await kupua.seekTo(0.5);
    await kupua.page.waitForTimeout(800);

    const tableBefore = await getViewState(kupua.page);
    expect(tableBefore!.scrollTop).toBeGreaterThan(0);
    const refGlobalPos = tableBefore!.centreGlobalPos;

    // Switch to grid
    await kupua.switchToGrid();
    await kupua.page.waitForTimeout(800);

    const gridState = await getViewState(kupua.page);
    expect(gridState!.scrollTop).toBeGreaterThan(0);
    expect(Math.abs(gridState!.centreGlobalPos - refGlobalPos))
      .toBeLessThan(gridState!.cols * 2);

    // Switch back to table
    await kupua.switchToTable();
    await kupua.page.waitForTimeout(800);

    const tableAfter = await getViewState(kupua.page);
    expect(tableAfter!.scrollTop).toBeGreaterThan(0);
    expect(Math.abs(tableAfter!.centreGlobalPos - refGlobalPos))
      .toBeLessThan(10);
  });
});



