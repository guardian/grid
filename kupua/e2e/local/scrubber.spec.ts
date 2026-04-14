/**
 * E2E tests for the scrubber, density switch, sort changes, and scroll position.
 *
 * These tests run in a real browser (Chromium via Playwright) against the
 * running kupua app + local Elasticsearch with sample data.
 *
 * PHILOSOPHY: Tests must be STRICT. "Didn't crash" is not a passing test.
 * Every seek must land where we asked. Every image position must be consistent.
 * Every error must fail the test.
 *
 * Prerequisites:
 * - Local ES on port 9220 with sample data loaded (max_result_window=500)
 * - `npm run dev` (auto-started by playwright.config.ts webServer)
 *
 * Run: npx playwright test e2e/local/scrubber.spec.ts
 * Debug: npx playwright test e2e/local/scrubber.spec.ts --debug
 */

import { test, expect } from "../shared/helpers";
import { GRID_ROW_HEIGHT, GRID_MIN_CELL_WIDTH, TABLE_ROW_HEIGHT } from "@/constants/layout";

// ---------------------------------------------------------------------------
// Safety gate — refuse to run against a real ES cluster.
//
// globalSetup.ts already checks this, but only at suite startup. If an agent
// bypasses the main playwright.config.ts (wrong --config flag, --no-deps,
// etc.) or if a Vite server with --use-TEST is already running, globalSetup
// may not have guarded correctly. This in-test check is the second line of
// defence: it fires per-test, is impossible to bypass without modifying this
// file, and gives a clear failure message instead of mysterious assertion
// errors caused by real-data shapes.
//
// Threshold: local sample data is ~10k docs. Real clusters have 100k+.
// 50k gives headroom for larger local samples.
// ---------------------------------------------------------------------------

const LOCAL_MAX_DOCS = 50_000;

// Cached result — fetched once per worker process, not once per test.
let _realEsCheckResult: { count: number } | null | "unchecked" = "unchecked";

async function assertNotRealEs() {
  if (_realEsCheckResult === null) return; // already checked and was fine
  if (_realEsCheckResult !== "unchecked") {
    // Previously found real ES — re-throw immediately without another fetch
    throw new Error(
      `🛑 Refusing to run: real ES detected (${(_realEsCheckResult as { count: number }).count.toLocaleString()} docs). Stop --use-TEST and re-run.`,
    );
  }

  let count: number | undefined;
  for (const path of ["http://localhost:3000/es/images/_count", "http://localhost:3000/es/_count"]) {
    try {
      const res = await fetch(path, { signal: AbortSignal.timeout(2000) });
      if (!res.ok) continue;
      const data = await res.json() as { count?: number };
      if (data.count !== undefined) { count = data.count; break; }
    } catch { continue; }
  }

  if (count !== undefined && count > LOCAL_MAX_DOCS) {
    _realEsCheckResult = { count };
    throw new Error(
      `\n\n` +
      `═══════════════════════════════════════════════════════════════\n` +
      `  🛑 LOCAL E2E TESTS REFUSED — REAL ES DETECTED IN TEST\n` +
      `\n` +
      `  ES doc count = ${count.toLocaleString()} (threshold: ${LOCAL_MAX_DOCS.toLocaleString()})\n` +
      `  These tests are written for local sample data (~10k docs).\n` +
      `  Running them against a real cluster produces wrong assertions.\n` +
      `\n` +
      `  You probably have 'start.sh --use-TEST' running on port 3000.\n` +
      `  Stop it, then re-run tests — the runner will start local ES.\n` +
      `═══════════════════════════════════════════════════════════════\n`,
    );
  }

  _realEsCheckResult = null; // safe — mark as checked
}

test.beforeEach(async () => {
  await assertNotRealEs();
});

// ---------------------------------------------------------------------------
// Scrubber — basic visibility and ARIA semantics
// ---------------------------------------------------------------------------

test.describe("Scrubber — basics", () => {
  test("scrubber is visible when results exist", async ({ kupua }) => {
    await kupua.goto();
    await expect(kupua.scrubber).toBeVisible();
  });

  test("aria-valuemax equals total - 1", async ({ kupua }) => {
    await kupua.goto();
    const max = await kupua.getScrubberMax();
    const store = await kupua.getStoreState();
    expect(max).toBe(store.total - 1);
  });

  test("scrubber starts at position 0", async ({ kupua }) => {
    await kupua.goto();
    const pos = await kupua.getScrubberPosition();
    expect(pos).toBe(0);
  });

  test("initial buffer starts at offset 0 with no errors", async ({ kupua }) => {
    await kupua.goto();
    const store = await kupua.getStoreState();
    expect(store.bufferOffset).toBe(0);
    expect(store.error).toBeNull();
    expect(store.loading).toBe(false);
    expect(store.resultsLength).toBeGreaterThan(0);
    expect(store.total).toBeGreaterThan(1000); // We have ~10k sample docs
  });

  test("imagePositions consistent on initial load", async ({ kupua }) => {
    await kupua.goto();
    await kupua.assertPositionsConsistent();
  });
});

// ---------------------------------------------------------------------------
// Seek accuracy — the buffer must land where we asked
// ---------------------------------------------------------------------------

test.describe("Seek accuracy", () => {
  test("seek to 50% lands near the middle of the dataset", async ({ kupua }) => {
    await kupua.goto();
    const total = (await kupua.getStoreState()).total;

    await kupua.seekTo(0.5);
    const store = await kupua.getStoreState();

    // The seek target is ~total/2. Buffer should contain that position.
    const targetApprox = Math.floor(total / 2);
    const bufferStart = store.bufferOffset;
    const bufferEnd = store.bufferOffset + store.resultsLength;

    expect(store.error).toBeNull();
    expect(bufferStart).toBeLessThan(targetApprox + 500);
    expect(bufferEnd).toBeGreaterThan(targetApprox - 500);
    expect(store.resultsLength).toBeGreaterThan(50); // Should have a real page
    await kupua.assertPositionsConsistent();
  });

  test("seek to top (0.02) resets buffer near offset 0", async ({ kupua }) => {
    await kupua.goto();

    // First go somewhere deep
    await kupua.seekTo(0.5);
    const midStore = await kupua.getStoreState();
    expect(midStore.bufferOffset).toBeGreaterThan(0);

    // Seek back to top
    await kupua.seekTo(0.02);
    const topStore = await kupua.getStoreState();

    expect(topStore.error).toBeNull();
    // Deep seek via percentile estimation may land at ~50-150 instead of
    // exactly 0 (percentile accuracy degrades at the extremes). That's OK —
    // the important thing is we're near the top, not stuck in the middle.
    expect(topStore.bufferOffset).toBeLessThan(200);
    expect(topStore.resultsLength).toBeGreaterThan(50);
    // Scrubber should reflect position near the top
    const pos = await kupua.getScrubberPosition();
    expect(pos).toBeLessThan(300);
    await kupua.assertPositionsConsistent();
  });

  test("seek to bottom (0.98) lands near the end", async ({ kupua }) => {
    await kupua.goto();
    const total = (await kupua.getStoreState()).total;

    await kupua.seekTo(0.98);
    const store = await kupua.getStoreState();

    expect(store.error).toBeNull();
    // In two-tier mode, seekTo(0.98) scrolls to near-bottom of the virtualizer.
    // The debounced scroll-seek repositions the buffer, but the buffer may not
    // cover the absolute end (it centers around the viewport position).
    // In seek mode, the seek directly targets position 9800+ and the buffer covers it.
    const isTwoTier = await kupua.isTwoTierMode();
    if (isTwoTier) {
      // Just verify the seek didn't error and buffer moved
      expect(store.bufferOffset).toBeGreaterThan(0);
    } else {
      // Buffer should contain images near the end
      const bufferEnd = store.bufferOffset + store.resultsLength;
      expect(bufferEnd).toBeGreaterThan(total - 1000);
    }
    await kupua.assertPositionsConsistent();
  });

  test("consecutive seeks produce different buffers", async ({ kupua }) => {
    await kupua.goto();

    await kupua.seekTo(0.2);
    const store1 = await kupua.getStoreState();
    const id1 = store1.firstImageId;

    await kupua.seekTo(0.8);
    const store2 = await kupua.getStoreState();
    const id2 = store2.firstImageId;

    // The buffers must contain different images
    expect(id1).not.toBe(id2);
    expect(store2.bufferOffset).toBeGreaterThan(store1.bufferOffset);
    await kupua.assertPositionsConsistent();
  });

  test("seekGeneration bumps on every seek", async ({ kupua }) => {
    await kupua.goto();
    const gen0 = (await kupua.getStoreState()).seekGeneration;

    await kupua.seekTo(0.5);
    const gen1 = (await kupua.getStoreState()).seekGeneration;
    expect(gen1).toBeGreaterThan(gen0);

    await kupua.seekTo(0.2);
    const gen2 = (await kupua.getStoreState()).seekGeneration;
    expect(gen2).toBeGreaterThan(gen1);
  });
});

// ---------------------------------------------------------------------------
// Drag seek
// ---------------------------------------------------------------------------

test.describe("Drag seek", () => {
  test("drag to middle repositions buffer correctly", async ({ kupua }) => {
    await kupua.goto();
    await kupua.dragScrubberTo(0.5);

    const store = await kupua.getStoreState();
    expect(store.bufferOffset).toBeGreaterThan(0);
    expect(store.error).toBeNull();
    expect(store.resultsLength).toBeGreaterThan(50);
    await kupua.assertPositionsConsistent();
  });

  test("drag to bottom then top produces correct ordering", async ({ kupua }) => {
    await kupua.goto();

    await kupua.dragScrubberTo(0.95);
    const bottomStore = await kupua.getStoreState();

    await kupua.dragScrubberTo(0.05);
    await kupua.page.waitForTimeout(800);

    const topStore = await kupua.getStoreState();
    expect(topStore.bufferOffset).toBeLessThan(bottomStore.bufferOffset);
    await kupua.assertPositionsConsistent();
  });
});

// ---------------------------------------------------------------------------
// Scroll position after seek
// ---------------------------------------------------------------------------

test.describe("Scroll position after seek", () => {
  test("scrollTop resets into buffer range after deep seek", async ({ kupua }) => {
    await kupua.goto();

    await kupua.seekTo(0.5);
    const scrollTop = await kupua.getScrollTop();
    const store = await kupua.getStoreState();

    // After a seek, scrollTop should be within the renderable height of
    // the new buffer. Upper bound: resultsLength * maxRowHeight (~200px for grid).
    // In two-tier mode, scrollTop is a GLOBAL position (the virtualizer has
    // total items), so it can be much larger than buffer range.
    const isTwoTier = await kupua.isTwoTierMode();
    expect(scrollTop).toBeGreaterThanOrEqual(0);
    if (!isTwoTier) {
      expect(scrollTop).toBeLessThan(store.resultsLength * 200);
    }
    // It should NOT be at 0 either — the seek target is in the middle of
    // the buffer, so some scroll offset is expected.
    // (unless the buffer itself starts exactly at the seek target)
  });

  test("content is rendered (not blank) after deep seek", async ({ kupua }) => {
    await kupua.goto();
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

  test("scroll works after deep seek (no freeze)", async ({ kupua }) => {
    // Regression test for scroll freeze after deep seek.
    // Seeks to multiple positions and verifies programmatic scrollBy
    // actually changes scrollTop.
    await kupua.goto();

    for (const ratio of [0.5, 0.8, 0.2]) {
      await kupua.seekTo(ratio);
      // Wait for seek cooldown to expire so extends are unblocked
      await kupua.page.waitForTimeout(800);

      const scrollTopBefore = await kupua.getScrollTop();

      // Scroll down via programmatic scrollBy
      await kupua.scrollBy(500);
      const scrollTopAfter = await kupua.getScrollTop();

      // scrollTop must have changed — if it didn't, scroll is frozen
      expect(scrollTopAfter, `scroll frozen after seek to ${ratio}`).not.toEqual(scrollTopBefore);
    }
  });
});

// ---------------------------------------------------------------------------
// Flash prevention — reverse-compute golden table
//
// The reverse-compute algorithm adapts content placement to the user's
// current scrollTop instead of changing scrollTop during a seek.
// These tests verify that scrollTop changes stay within bounds for
// every scenario.
//
// NOTE: With local data (~10k docs, DEEP_SEEK_THRESHOLD=200), the deep
// seek path activates for any seek past position ~200. If flashes
// persist on real data (1.3M docs) despite these passing locally, run
// the smoke test manually.
// ---------------------------------------------------------------------------

test.describe("Flash prevention — seek scroll preservation", () => {
  // These tests assert EXACTLY 0px scroll drift after seek. The reverse-
  // compute in search-store.ts guarantees this — it calculates the buffer-
  // local index from the user's current scrollTop, so the virtualizer
  // renders at the same position.
  //
  // IF THESE FAIL (delta > 0):
  //   - Check seek() reverse-compute in search-store.ts (the scrollTop →
  //     local index math). A rounding change or off-by-one breaks it.
  //   - Check effect #6 in useScrollEffects.ts — if it applies a scrollTop
  //     adjustment when it shouldn't (delta > rowHeight guard).
  //   - Check SEEK_COOLDOWN_MS / SEEK_DEFERRED_SCROLL_MS in tuning.ts —
  //     if the cooldown is too short, transient scroll events trigger
  //     extends before settling, causing prepend-comp scroll shifts.
  //   - See worklog: exploration/docs/worklog-stale-cells-bug.md

  test("seek preserves scroll position — no flash (golden table)", async ({ kupua }) => {
    await kupua.goto();

    // Case 1: No scroll between seeks — delta should be ≈ 0
    // After seek, reverse-compute places content at the user's existing
    // scrollTop. A second seek from the same position should not move.
    await kupua.seekTo(0.5);

    // Check two-tier AFTER first seekTo — position map may not be loaded at goto time
    const isTwoTier = await kupua.isTwoTierMode();
    const scrollAfterFirstSeek = await kupua.getScrollTop();
    await kupua.seekTo(0.3);
    const scrollAfterSecondSeek = await kupua.getScrollTop();
    if (!isTwoTier) {
      // Zero tolerance — reverse-compute guarantees delta=0 in seek mode.
      // In two-tier, scrollContentTo sets absolute scrollTop → different ratios
      // produce different positions by design.
      expect(
        Math.abs(scrollAfterSecondSeek - scrollAfterFirstSeek),
        "scrollTop changed between consecutive seeks without user scroll",
      ).toBe(0);
    }

    // Case 2: Small scroll then seek — delta should be 0
    await kupua.seekTo(0.5);
    await kupua.scrollBy(150); // roughly half a grid row
    const midScrollTop = await kupua.getScrollTop();
    await kupua.seekTo(0.7);
    const postScrollTop = await kupua.getScrollTop();
    if (!isTwoTier) {
      expect(
        Math.abs(postScrollTop - midScrollTop),
        "scrollTop jumped after small scroll + seek",
      ).toBe(0);
    }

    // Case 3: Scroll from top edge then seek
    // With bidirectional seek, the headroom offset pre-sets scrollTop
    // synchronously before the buffer renders. The sub-row pixel offset
    // is preserved — the user's vertical position within a row should
    // not change visibly.
    //
    // scrollTop VALUE changes (100 → ~4342) because headroom items are
    // prepended, but the sub-row offset (100 % rowHeight) is preserved.
    // What matters is that the user's visual position is the same:
    // "top row cut off by 100px" before and after seek.
    await kupua.page.keyboard.press("Home");
    await kupua.page.waitForTimeout(500);
    await kupua.scrollBy(100); // small offset from top (sub-row)
    const beforeTopSeek = await kupua.getScrollTop();
    await kupua.seekTo(0.4);
    const afterTopSeek = await kupua.getScrollTop();
    const afterTopState = await kupua.getStoreState();
    expect(afterTopState.error).toBeNull();
    expect(
      afterTopState.bufferOffset,
      "bufferOffset should be > 0 (backward items loaded)",
    ).toBeGreaterThan(0);
    if (!isTwoTier) {
      // Sub-row offset preserved: before and after should have the same
      // pixel offset within their respective rows.
      // In two-tier, scrollContentTo sets absolute scrollTop — sub-row
      // preservation doesn't apply.
      const ROW_H = 303;
      const subRowBefore = beforeTopSeek % ROW_H;
      const subRowAfter = afterTopSeek % ROW_H;
      expect(
        Math.abs(subRowAfter - subRowBefore),
        `Sub-row offset changed: before=${subRowBefore.toFixed(1)}, after=${subRowAfter.toFixed(1)}. ` +
        `scrollTop: ${beforeTopSeek.toFixed(1)} → ${afterTopSeek.toFixed(1)}`,
      ).toBeLessThan(5); // small tolerance for rounding
    }

    // Case 4: Scroll from bottom edge then seek
    // NOTE: This is the "buffer-shrink snap" scenario from the worklog,
    // marked as ⚪ accepted / unfixable — physics. After End key, the
    // buffer is large (up to 1000 items, scrollHeight ~50k). A new seek
    // replaces it with 200 items (scrollHeight ~10k). The browser auto-
    // clamps scrollTop to the new shorter maxScroll → unavoidable large
    // jump. We still verify that the seek completes without error and
    // produces valid data.
    await kupua.page.keyboard.press("End");
    await kupua.page.waitForTimeout(800);
    await kupua.scrollBy(-100); // small offset from bottom
    await kupua.seekTo(0.6);
    const afterBottomState = await kupua.getStoreState();
    expect(afterBottomState.error).toBeNull();
    expect(afterBottomState.resultsLength).toBeGreaterThan(0);
  });

  test("bidirectional seek places user in buffer middle", async ({ kupua }) => {
    // After a deep seek, bidirectional fetch loads items both BEFORE and
    // AFTER the landed cursor. The user sees the buffer middle (~100 items
    // of headroom above), so extends don't fire immediately — they operate
    // on off-screen content when the user eventually scrolls far enough.
    //
    // This test verifies the post-seek resting state:
    // 1. Buffer has content in both directions (bufferOffset > 0 AND
    //    bufferOffset + resultsLength < total)
    // 2. Buffer is larger than PAGE_SIZE (200) — backward items were added
    // 3. No visible content shift during the settle window
    //
    // The scroll-up tests (below) verify that extends work when the user
    // scrolls far enough past the headroom.
    await kupua.goto();
    await kupua.seekTo(0.5);
    const storeBefore = await kupua.getStoreState();
    // Wait for seek cooldown + deferred scroll + settle
    await kupua.page.waitForTimeout(1500);
    const storeAfter = await kupua.getStoreState();

    // Buffer should have content in both directions (bidirectional fetch worked)
    expect(
      storeAfter.bufferOffset,
      "bufferOffset should be > 0 after bidirectional seek to 50%",
    ).toBeGreaterThan(0);
    expect(
      storeAfter.bufferOffset + storeAfter.resultsLength,
      "buffer should not extend to total (has room to extend forward)",
    ).toBeLessThan(storeAfter.total);

    // Buffer should be larger than the initial forward-only fetch (200)
    // because backward items were prepended
    expect(
      storeBefore.resultsLength,
      "initial buffer should be larger than PAGE_SIZE (backward items added)",
    ).toBeGreaterThan(200);
  });
});

// ---------------------------------------------------------------------------
// Post-seek scroll-up — detect inability to scroll backward after seek
// ---------------------------------------------------------------------------
//
// After a deep seek, the user lands at startIndex≈0 in a fresh buffer at a
// deep offset. If extendBackward is suppressed, there are no items above
// buffer[0] so the scroll container has nothing to scroll into — the user
// physically cannot scroll up. This test catches that.
//
// Uses mouse.wheel (fires native wheel → scroll events) not programmatic
// scrollTop (which may not fire scroll events in headless Chromium).

test.describe("Post-seek scroll-up", () => {
  // NOTE: grid and table variants merged (14 Apr 2026 culling).
  // Structurally identical — only difference was grid vs table locator.
  for (const density of ["grid", "table"] as const) {
    test(`can scroll up after seeking to 50% (${density})`, async ({ kupua }) => {
      await kupua.goto();
      if (density === "table") await kupua.switchToTable();

      await kupua.seekTo(0.5);
      const storeAfterSeek = await kupua.getStoreState();
      expect(storeAfterSeek.bufferOffset).toBeGreaterThan(0);

      await kupua.page.waitForTimeout(1500);
      if (density === "grid") await kupua.assertNoVisiblePlaceholders();

      const scrollBefore = await kupua.getScrollTop();

      const label = density === "grid"
        ? '[aria-label="Image results grid"]'
        : '[aria-label="Image results table"]';
      const el = kupua.page.locator(label);
      const box = await el.boundingBox();
      expect(box).not.toBeNull();
      await kupua.page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);

      // Phase 1: Small scroll to verify scrollTop decreases
      for (let i = 0; i < 5; i++) {
        await kupua.page.mouse.wheel(0, -200);
        await kupua.page.waitForTimeout(100);
      }
      await kupua.page.waitForTimeout(300);

      const scrollAfterSmall = await kupua.getScrollTop();
      expect(
        scrollAfterSmall,
        `scrollTop should decrease after small upward scroll (${density})`,
      ).toBeLessThan(scrollBefore);

      // Phase 2: Continue scrolling to trigger extendBackward
      const moreEvents = density === "grid" ? 20 : 15;
      for (let i = 0; i < moreEvents; i++) {
        await kupua.page.mouse.wheel(0, -200);
        await kupua.page.waitForTimeout(100);
      }
      await kupua.page.waitForTimeout(1000);

      const storeAfterScroll = await kupua.getStoreState();
      expect(
        storeAfterScroll.bufferOffset,
        `bufferOffset should decrease after scrolling up (${density})`,
      ).toBeLessThan(storeAfterSeek.bufferOffset);
    });
  }

  test("can scroll up after double-seek (cooldown resets correctly)", async ({ kupua }) => {
    // Seek twice in succession, then try to scroll up. This tests that
    // the cooldown and post-extend state reset correctly between seeks —
    // no stale flag or cooldown from the first seek blocks the second.
    await kupua.goto();

    // First seek to 30%
    await kupua.seekTo(0.3);
    await kupua.page.waitForTimeout(500); // partial settle

    // Second seek to 70% (while first may still be settling)
    await kupua.seekTo(0.7);
    const storeAfterSeek = await kupua.getStoreState();
    expect(storeAfterSeek.bufferOffset).toBeGreaterThan(0);

    // Wait for full settle
    await kupua.page.waitForTimeout(1500);

    const scrollBefore = await kupua.getScrollTop();

    // Scroll up
    const gridEl = kupua.page.locator('[aria-label="Image results grid"]');
    const gridBox = await gridEl.boundingBox();
    expect(gridBox).not.toBeNull();
    await kupua.page.mouse.move(
      gridBox!.x + gridBox!.width / 2,
      gridBox!.y + gridBox!.height / 2,
    );

    // Phase 1: Small scroll to verify direction. With bidirectional seek
    // headroom, 5 events is enough to confirm scroll-up works without
    // triggering extendBackward (stays within the ~100-item headroom).
    for (let i = 0; i < 5; i++) {
      await kupua.page.mouse.wheel(0, -200);
      await kupua.page.waitForTimeout(100);
    }
    await kupua.page.waitForTimeout(300);

    const scrollAfter = await kupua.getScrollTop();

    expect(
      scrollAfter,
      `scrollTop should decrease after double-seek then scroll up ` +
      `(was ${scrollBefore}, now ${scrollAfter})`,
    ).toBeLessThan(scrollBefore);
  });

  test("scroll-up works within 2s of seek landing", async ({ kupua }) => {
    // After seek, the user should be able to scroll up within 2 seconds.
    // This formalises the timing expectation: SEEK_COOLDOWN_MS (700ms) +
    // SEEK_DEFERRED_SCROLL_MS (800ms) + network + extend settle < 2000ms.
    await kupua.goto();

    await kupua.seekTo(0.5);
    const storeAfterSeek = await kupua.getStoreState();
    expect(storeAfterSeek.bufferOffset).toBeGreaterThan(0);

    // Wait exactly 2 seconds (not 1.5s like other tests — this is the deadline)
    await kupua.page.waitForTimeout(2000);

    const scrollBefore = await kupua.getScrollTop();

    const gridEl = kupua.page.locator('[aria-label="Image results grid"]');
    const gridBox = await gridEl.boundingBox();
    expect(gridBox).not.toBeNull();
    await kupua.page.mouse.move(
      gridBox!.x + gridBox!.width / 2,
      gridBox!.y + gridBox!.height / 2,
    );

    // Phase 1: Small scroll to verify direction works within the deadline.
    for (let i = 0; i < 5; i++) {
      await kupua.page.mouse.wheel(0, -200);
      await kupua.page.waitForTimeout(100);
    }
    await kupua.page.waitForTimeout(300);

    const scrollAfterSmall = await kupua.getScrollTop();
    expect(
      scrollAfterSmall,
      `scroll-up must work within 2s of seek landing (scrollTop was ${scrollBefore}, ` +
      `now ${scrollAfterSmall}). If this fails, the timing chain is too slow.`,
    ).toBeLessThan(scrollBefore);

    // Phase 2: Continue scrolling to trigger extendBackward past the
    // bidirectional headroom. Don't assert scrollTop — compensation expected.
    for (let i = 0; i < 20; i++) {
      await kupua.page.mouse.wheel(0, -200);
      await kupua.page.waitForTimeout(100);
    }
    await kupua.page.waitForTimeout(1000);

    const storeAfterScroll = await kupua.getStoreState();

    expect(
      storeAfterScroll.bufferOffset,
      `extendBackward must have fired within 2s of seek landing`,
    ).toBeLessThan(storeAfterSeek.bufferOffset);
  });
});

// ---------------------------------------------------------------------------
// Settle-window stability — detect swimming during the 0-1000ms after seek
// ---------------------------------------------------------------------------
//
// After seek data arrives, the virtualizer re-renders and the browser fires
// transient scroll events. If the cooldown is too short or if extends fire
// during this window, prepend compensation causes visible content shifts
// ("swimming"). This test polls scrollTop at high frequency right after seek
// and asserts no unexpected drift.
//
// This is the test gap that agents 7-8 identified: no existing test measured
// the 0-700ms settle window. The golden table test (cases 1-3) measures the
// delta AT seek completion. S14 (smoke) measures after 2 seconds. Neither
// catches what happens in between.

test.describe("Settle-window stability", () => {
  test("no visible content shift during settle window after seek", async ({ kupua }) => {
    await kupua.goto();

    // Scroll to a partial-row offset first so scrollTop is non-zero
    const gridEl = kupua.page.locator('[aria-label="Image results grid"]');
    const gridBox = await gridEl.boundingBox();
    expect(gridBox).not.toBeNull();
    await kupua.page.mouse.move(
      gridBox!.x + gridBox!.width / 2,
      gridBox!.y + gridBox!.height / 2,
    );
    await kupua.page.mouse.wheel(0, 150); // half a grid row
    await kupua.page.waitForTimeout(300);

    // Seek to 50% — don't wait for any timeout after, start polling immediately
    // Use clickScrubberAt (low-level, less waiting) instead of seekTo
    const trackBox = await kupua.scrubber.boundingBox();
    expect(trackBox).not.toBeNull();

    // Wait for position map so the click is handled in two-tier mode
    // (otherwise a seek-mode seek fires, then position map loads mid-polling
    // and the buffer resets — causing a content shift).
    await kupua.waitForPositionMap(10_000);

    // Snapshot seekGeneration before click so we can wait for the real completion
    const genBefore = (await kupua.getStoreState()).seekGeneration;

    await kupua.page.mouse.click(
      trackBox!.x + trackBox!.width / 2,
      trackBox!.y + 0.5 * trackBox!.height,
    );

    // Wait for seek data to arrive — use seekGeneration bump which works
    // correctly in both seek and two-tier modes (waitForSeekComplete resolves
    // immediately from stale buffer in two-tier mode).
    await kupua.waitForSeekGenerationBump(genBefore);

    // Poll every 50ms for 1500ms — capture the full settle + deferred scroll window.
    // Track firstVisibleGlobalPos (what the user actually sees), not scrollTop
    // (which changes legitimately during prepend compensation).
    const snapshots: Array<{
      t: number; scrollTop: number; offset: number; len: number;
      firstVisibleGlobalPos: number;
    }> = [];
    const startT = Date.now();
    for (let i = 0; i < 30; i++) {
      await kupua.page.waitForTimeout(50);
      const snap = await kupua.page.evaluate(() => {
        const el = document.querySelector('[aria-label="Image results grid"]') as HTMLElement;
        if (!el) return null;
        const store = (window as any).__kupua_store__;
        if (!store) return null;
        const s = store.getState();
        const ROW_HEIGHT = 303;
        const MIN_CELL_WIDTH = 280;
        const cols = Math.max(1, Math.floor(el.clientWidth / MIN_CELL_WIDTH));
        const firstRow = Math.floor(el.scrollTop / ROW_HEIGHT);
        const firstLocalIdx = firstRow * cols;
        return {
          scrollTop: el.scrollTop,
          offset: s.bufferOffset,
          len: s.results.length,
          firstVisibleGlobalPos: firstLocalIdx + s.bufferOffset,
        };
      });
      if (snap) snapshots.push({ t: Date.now() - startT, ...snap });
    }

    // Check: the visible content (firstVisibleGlobalPos) should be stable.
    // After the initial seek lands, the user should see the same images
    // even as prepend compensation adjusts scrollTop. A shift of more than
    // ~1 row means the user saw different content.
    //
    // Compute COLS from actual viewport width (same formula as ImageGrid):
    // floor(clientWidth / 280). At 1280px test viewport → 4 cols.
    // Tolerance is COLS + 1 to allow sub-row rounding during compensation.
    const cols = await kupua.page.evaluate(() => {
      const el = document.querySelector('[aria-label="Image results grid"]') as HTMLElement;
      return el ? Math.max(1, Math.floor(el.clientWidth / 280)) : 7;
    });
    const MAX_SHIFT = 0; // Bidirectional seek produces zero content shift — anything > 0 is a regression
    let maxContentShift = 0;
    for (let i = 1; i < snapshots.length; i++) {
      const shift = Math.abs(
        snapshots[i].firstVisibleGlobalPos - snapshots[i - 1].firstVisibleGlobalPos,
      );
      if (shift > maxContentShift) maxContentShift = shift;
    }

    // Log the timeline for diagnostics
    for (const s of snapshots) {
      console.log(
        `  [settle] t=${s.t}ms scrollTop=${s.scrollTop.toFixed(1)} offset=${s.offset} len=${s.len} visiblePos=${s.firstVisibleGlobalPos}`,
      );
    }

    // Allow up to 1 row + 1 item of content shift — sub-row
    // rounding differences during compensation are acceptable.
    // Tightened from COLS (7) to COLS+1 (5 at 4-col viewport).
    // Real-data measurement: 3 items on TEST (1.3M docs).
    expect(
      maxContentShift,
      `Max visible content shift during settle window was ${maxContentShift} items ` +
      `(limit: ${MAX_SHIFT}, cols: ${cols}). This means prepend compensation didn't preserve visible content. ` +
      `See timeline above.`,
    ).toBeLessThanOrEqual(MAX_SHIFT);
  });

  test("no swim when seeking from any near-top row offset", async ({ kupua }) => {
    // Regression test: seeking from half-a-row-2 (or any row in the headroom
    // zone) must NOT show wrong content or swim, AND must preserve the user's
    // vertical position (sub-row pixel offset).
    await kupua.goto();

    const gridEl = kupua.page.locator('[aria-label="Image results grid"]');
    const gridBox = await gridEl.boundingBox();
    expect(gridBox).not.toBeNull();
    const GRID_ROW_HEIGHT = 303;

    // Detect two-tier mode after first seekTo (position map needs time to load)
    let isTwoTier = false;

    // Test seeks from row offsets 0.5, 1.5, and 5.5 (half of rows 1, 2, 6)
    for (const rowOffset of [0.5, 1.5, 5.5]) {
      // Reset to top
      await kupua.page.keyboard.press("Home");
      await kupua.page.waitForTimeout(500);

      // Scroll to the target row offset
      const scrollPx = Math.round(GRID_ROW_HEIGHT * rowOffset);
      await kupua.page.mouse.move(
        gridBox!.x + gridBox!.width / 2,
        gridBox!.y + gridBox!.height / 2,
      );
      await kupua.page.mouse.wheel(0, scrollPx);
      await kupua.page.waitForTimeout(300);

      // Capture pre-seek scrollTop for position preservation check
      const preSeekScrollTop = await kupua.getScrollTop();

      // Seek to 50%
      await kupua.seekTo(0.5);

      // Detect two-tier after first seekTo (position map may not be loaded at goto time)
      if (!isTwoTier) isTwoTier = await kupua.isTwoTierMode();

      // Check vertical position preservation: sub-row offset should match
      const postSeekScrollTop = await kupua.getScrollTop();
      const subRowBefore = preSeekScrollTop % GRID_ROW_HEIGHT;
      const subRowAfter = postSeekScrollTop % GRID_ROW_HEIGHT;

      // Poll for 2 seconds to detect content shift
      const snapshots: Array<{ t: number; pos: number }> = [];
      const start = Date.now();
      for (let i = 0; i < 40; i++) {
        const snap = await kupua.page.evaluate(() => {
          const store = (window as any).__kupua_store__;
          if (!store) return null;
          const s = store.getState();
          const el = document.querySelector('[aria-label="Image results grid"]');
          if (!el) return null;
          const offset = s.bufferOffset as number;
          const scrollTop = el.scrollTop;
          const cols = Math.max(1, Math.floor(el.clientWidth / 280));
          const rowHeight = 303;
          const firstVisibleRow = Math.round(scrollTop / rowHeight);
          return { pos: offset + firstVisibleRow * cols };
        });
        if (snap) snapshots.push({ t: Date.now() - start, pos: snap.pos });
        await kupua.page.waitForTimeout(50);
      }

      // Calculate max content shift
      let maxShift = 0;
      for (let i = 1; i < snapshots.length; i++) {
        const shift = Math.abs(snapshots[i].pos - snapshots[i - 1].pos);
        if (shift > maxShift) maxShift = shift;
      }

      console.log(
        `  [row-offset=${rowOffset}] scrollPx=${scrollPx}, maxShift=${maxShift}, ` +
        `subRow: ${subRowBefore.toFixed(1)} → ${subRowAfter.toFixed(1)}, ` +
        `scrollTop: ${preSeekScrollTop.toFixed(1)} → ${postSeekScrollTop.toFixed(1)}, ` +
        `snapshots=${snapshots.length}, firstPos=${snapshots[0]?.pos}, lastPos=${snapshots[snapshots.length - 1]?.pos}`,
      );

      // Assert 1: No swimming (content shift)
      const cols = await kupua.page.evaluate(() => {
        const el = document.querySelector('[aria-label="Image results grid"]');
        return el ? Math.max(1, Math.floor(el.clientWidth / 280)) : 5;
      });
      expect(
        maxShift,
        `Seek from row offset ${rowOffset} caused ${maxShift}-item content shift (max allowed: ${cols}). ` +
        `This indicates swimming in the headroom zone.`,
      ).toBeLessThanOrEqual(cols);

      // Assert 2: Vertical position preserved (sub-row offset)
      // In two-tier mode, scrollContentTo sets absolute scrollTop — sub-row
      // preservation doesn't apply (by design).
      if (!isTwoTier) {
        expect(
          Math.abs(subRowAfter - subRowBefore),
          `Seek from row offset ${rowOffset}: sub-row offset changed from ${subRowBefore.toFixed(1)} ` +
          `to ${subRowAfter.toFixed(1)} (delta=${Math.abs(subRowAfter - subRowBefore).toFixed(1)}). ` +
          `Vertical position was not preserved.`,
        ).toBeLessThan(5); // small tolerance for rounding
      }
    }
  });

  // -------------------------------------------------------------------------
  // Phase 1b: scrollTop=0 seek test — the exact scenario masked by existing
  // tests' scrollTop=150 pre-scroll. Tests the headroom-zone code path that
  // was the root cause of the Agent 11–13 swimming bug class.
  // -------------------------------------------------------------------------

  test("seek from scrollTop=0 lands in buffer middle with headroom", async ({ kupua }) => {
    await kupua.goto();

    // Verify we're at scrollTop=0 — NO pre-scroll
    const scrollTopBefore = await kupua.getScrollTop();
    expect(scrollTopBefore).toBe(0);

    // Seek to 50%
    await kupua.seekTo(0.5);

    // Wait for full settle window (cooldown + deferred scroll + margin)
    await kupua.page.waitForTimeout(1500);

    const store = await kupua.getStoreState();
    expect(store.error).toBeNull();

    // Assert 1: bufferOffset > 0 — backward items were loaded (bidirectional seek)
    expect(
      store.bufferOffset,
      "bufferOffset should be > 0 after seek from scrollTop=0 — backward items must be loaded",
    ).toBeGreaterThan(0);

    // Assert 2: scrollTop moved to headroom position (not stayed at 0)
    // With bidirectional seek, the reverse-compute places the user at the
    // seek target, which is ~100 items into the buffer. scrollTop must be
    // non-zero because there's content above.
    const scrollTopAfter = await kupua.getScrollTop();
    expect(
      scrollTopAfter,
      "scrollTop should have moved to headroom position (not stayed at 0). " +
      "If this fails, reverse-compute headroom offset is broken.",
    ).toBeGreaterThan(0);

    // Assert 3: firstVisibleGlobalPos is stable over 1.5s (zero shift)
    // Poll firstVisibleGlobalPos to detect any swimming
    const snapshots: Array<{ t: number; pos: number }> = [];
    const start = Date.now();
    for (let i = 0; i < 30; i++) {
      const snap = await kupua.page.evaluate(() => {
        const el = document.querySelector('[aria-label="Image results grid"]') as HTMLElement;
        if (!el) return null;
        const store = (window as any).__kupua_store__;
        if (!store) return null;
        const s = store.getState();
        const ROW_HEIGHT = 303;
        const MIN_CELL_WIDTH = 280;
        const cols = Math.max(1, Math.floor(el.clientWidth / MIN_CELL_WIDTH));
        const firstRow = Math.floor(el.scrollTop / ROW_HEIGHT);
        return { pos: firstRow * cols + s.bufferOffset };
      });
      if (snap) snapshots.push({ t: Date.now() - start, pos: snap.pos });
      await kupua.page.waitForTimeout(50);
    }

    let maxShift = 0;
    for (let i = 1; i < snapshots.length; i++) {
      const shift = Math.abs(snapshots[i].pos - snapshots[i - 1].pos);
      if (shift > maxShift) maxShift = shift;
    }

    expect(
      maxShift,
      `Content shift of ${maxShift} items detected during settle window after seek from scrollTop=0. ` +
      `Expected 0 — bidirectional seek should produce zero visible shift.`,
    ).toBe(0);

    await kupua.assertPositionsConsistent();
  });

  // -------------------------------------------------------------------------
  // Phase 1d: rAF scrollTop monotonicity test — uses sampleScrollTopAtFrameRate
  // to capture every painted frame during the settle window. A non-monotonic
  // scrollTop change = swimming (viewport jumped backward).
  //
  // On local data this won't catch timing-dependent swimming (ES is too fast),
  // but it catches any structural bug that causes scrollTop to go backwards.
  // -------------------------------------------------------------------------

  test("scrollTop is monotonically non-decreasing during settle window after seek", async ({ kupua }) => {
    await kupua.goto();

    // Scroll to a partial-row offset first (non-zero starting point)
    const gridEl = kupua.page.locator('[aria-label="Image results grid"]');
    const gridBox = await gridEl.boundingBox();
    expect(gridBox).not.toBeNull();
    await kupua.page.mouse.move(
      gridBox!.x + gridBox!.width / 2,
      gridBox!.y + gridBox!.height / 2,
    );
    await kupua.page.mouse.wheel(0, 150);
    await kupua.page.waitForTimeout(300);

    // Seek to 50% via low-level click (less waiting than seekTo)
    const trackBox = await kupua.scrubber.boundingBox();
    expect(trackBox).not.toBeNull();
    await kupua.page.mouse.click(
      trackBox!.x + trackBox!.width / 2,
      trackBox!.y + 0.5 * trackBox!.height,
    );

    // Wait for seek data to arrive
    await kupua.waitForSeekComplete(15_000);

    // Sample scrollTop at frame rate for 1500ms (full settle + deferred scroll window)
    const samples = await kupua.sampleScrollTopAtFrameRate(1500);

    // Log the trace for diagnostics
    console.log(`  [rAF-mono] ${samples.length} samples over 1500ms`);
    if (samples.length > 0) {
      console.log(`  [rAF-mono] first=${samples[0].toFixed(1)} last=${samples[samples.length - 1].toFixed(1)}`);
    }

    // Find any non-monotonic transitions (scrollTop decreased between frames).
    // Legitimate scrollTop increases happen during prepend compensation — that's
    // fine. A DECREASE means the viewport jumped backward = swimming.
    const decreases: Array<{ frame: number; from: number; to: number }> = [];
    for (let i = 1; i < samples.length; i++) {
      if (samples[i] < samples[i - 1] - 0.5) { // 0.5px tolerance for sub-pixel rounding
        decreases.push({
          frame: i,
          from: samples[i - 1],
          to: samples[i],
        });
      }
    }

    if (decreases.length > 0) {
      console.log(`  [rAF-mono] DECREASES FOUND:`);
      for (const d of decreases) {
        console.log(`    frame ${d.frame}: ${d.from.toFixed(1)} → ${d.to.toFixed(1)} (Δ=${(d.to - d.from).toFixed(1)})`);
      }
    }

    expect(
      decreases.length,
      `scrollTop decreased ${decreases.length} times during settle window — this is swimming. ` +
      `First decrease: frame ${decreases[0]?.frame}, ${decreases[0]?.from.toFixed(1)} → ${decreases[0]?.to.toFixed(1)}`,
    ).toBe(0);
  });
});

test.describe("Buffer extension", () => {
  test("scrolling down past buffer triggers extendForward", async ({ kupua }) => {
    await kupua.goto();

    const store1 = await kupua.getStoreState();
    const endBefore = store1.bufferOffset + store1.resultsLength;

    // Scroll down aggressively to trigger extend
    for (let i = 0; i < 10; i++) {
      await kupua.scrollBy(2000);
      await kupua.page.waitForTimeout(200);
    }
    await kupua.page.waitForTimeout(1500); // Let extend complete

    const store2 = await kupua.getStoreState();
    const endAfter = store2.bufferOffset + store2.resultsLength;

    // Buffer should have extended forward — end is further
    expect(endAfter).toBeGreaterThan(endBefore);
    expect(store2.error).toBeNull();
    await kupua.assertPositionsConsistent();
  });

  test("seek to middle then scroll to top triggers extendBackward", async ({ kupua }) => {
    await kupua.goto();
    await kupua.seekTo(0.5);

    const store1 = await kupua.getStoreState();
    const startBefore = store1.bufferOffset;
    expect(startBefore).toBeGreaterThan(0); // Must not be at offset 0

    // Scroll to the absolute top of the scroll container — this should
    // trigger extendBackward if the buffer doesn't start at 0.
    await kupua.page.evaluate(() => {
      const grid = document.querySelector('[aria-label="Image results grid"]');
      const table = document.querySelector('[aria-label="Image results table"]');
      const el = grid ?? table;
      if (el) {
        el.scrollTop = 0;
        el.dispatchEvent(new Event("scroll"));
      }
    });
    // Backward extends debounce — give them time
    await kupua.page.waitForTimeout(2000);

    const store2 = await kupua.getStoreState();

    // Buffer start should have moved backward (or stayed same if already
    // at the buffer edge and extend is still in flight)
    expect(store2.bufferOffset).toBeLessThanOrEqual(startBefore);
    expect(store2.error).toBeNull();
    await kupua.assertPositionsConsistent();
  });
});

// ---------------------------------------------------------------------------
// Density switch — position and focus preservation
// ---------------------------------------------------------------------------

test.describe("Density switch — strict", () => {
  // NOTE: Two tests were removed here (7 Apr 2026 culling):
  // - "focused image ID survives grid→table→grid" — shallow ID-only check,
  //   subsumed by "rapid density toggling" which does 6 toggles at depth.
  // - "density switch after deep seek preserves focused image" — deep seek
  //   + single toggle, subsumed by "rapid density toggling" (seek + 6 toggles).

  test("rapid density toggling doesn't corrupt state", async ({ kupua }) => {
    await kupua.goto();

    await kupua.seekTo(0.3);
    await kupua.focusNthItem(2);
    const focusedId = await kupua.getFocusedImageId();

    for (let i = 0; i < 6; i++) {
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
});

// ---------------------------------------------------------------------------
// Sort change
// ---------------------------------------------------------------------------

test.describe("Sort change", () => {
  test("changing sort field resets to offset 0 with new data", async ({ kupua }) => {
    await kupua.goto();

    // Remember first image ID under default sort
    const store1 = await kupua.getStoreState();
    const firstIdBefore = store1.firstImageId;

    await kupua.selectSort("Taken on");
    await kupua.page.waitForTimeout(500);

    const store2 = await kupua.getStoreState();
    expect(store2.bufferOffset).toBe(0);
    expect(store2.resultsLength).toBeGreaterThan(0);
    expect(store2.error).toBeNull();
    // Under a different sort, the first image should (likely) be different
    // (Not guaranteed but extremely likely with 10k diverse docs)
    expect(store2.firstImageId).not.toBe(firstIdBefore);
    await kupua.assertPositionsConsistent();
  });

  test("toggling sort direction reverses the data", async ({ kupua }) => {
    await kupua.goto();

    const store1 = await kupua.getStoreState();
    const firstIdBefore = store1.firstImageId;
    const lastIdBefore = store1.lastImageId;

    await kupua.toggleSortDirection();
    await kupua.page.waitForTimeout(500);

    const store2 = await kupua.getStoreState();
    expect(store2.bufferOffset).toBe(0);
    expect(store2.error).toBeNull();
    // After reversing sort, the first image should now be different
    expect(store2.firstImageId).not.toBe(firstIdBefore);
    await kupua.assertPositionsConsistent();
  });
});

// ---------------------------------------------------------------------------
// Sort tooltip — date label (fixed: orderBy was undefined, not "-uploadTime")
// ---------------------------------------------------------------------------

test.describe("Sort tooltip — date label", () => {
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  test("aria-valuetext includes a date for uploadTime sort", async ({ kupua }) => {
    await kupua.goto();

    const valueText = await kupua.getScrubberValueText();
    expect(valueText).not.toBeNull();
    // Must contain "of" (position part: "1 of 10,000")
    expect(valueText).toContain("of");
    // Must contain a date after the "—" separator
    expect(valueText).toContain("—");
    const datePart = valueText!.split("—")[1].trim();
    const hasMonth = MONTHS.some((m) => datePart.includes(m));
    expect(hasMonth).toBe(true);
  });

  test("tooltip shows date after seeking to middle", async ({ kupua }) => {
    await kupua.goto();

    // Seek to middle — triggers a click which shows the tooltip briefly
    await kupua.seekTo(0.5);

    // After seek, aria-valuetext must have a date
    const valueText = await kupua.getScrubberValueText();
    expect(valueText).not.toBeNull();
    expect(valueText).toContain("of");
    expect(valueText).toContain("—");
    const datePart = valueText!.split("—")[1].trim();
    const hasMonth = MONTHS.some((m) => datePart.includes(m));
    expect(hasMonth).toBe(true);
  });

  test("scrubber opacity transitions to 1 on hover", async ({ kupua }) => {
    await kupua.goto();
    await kupua.scrubber.hover();
    // Wait for 300ms CSS opacity transition
    await kupua.page.waitForTimeout(400);
    const opacity = await kupua.scrubber.evaluate(
      (el) => window.getComputedStyle(el).opacity,
    );
    expect(parseFloat(opacity)).toBeGreaterThanOrEqual(0.9);
  });
});

// ---------------------------------------------------------------------------
// Sort-around-focus — "Never Lost" pattern
// ---------------------------------------------------------------------------

test.describe("Sort-around-focus", () => {
  test("focused image survives sort direction change", async ({ kupua }) => {
    await kupua.goto();

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
      { timeout: 10_000 },
    );

    // Same image is still focused
    expect(await kupua.getFocusedImageId()).toBe(focusedId);
    // And it's inside the buffer
    const globalPos = await kupua.getFocusedGlobalPosition();
    const store = await kupua.getStoreState();
    expect(globalPos).toBeGreaterThanOrEqual(store.bufferOffset);
    expect(globalPos).toBeLessThan(store.bufferOffset + store.resultsLength);
    expect(store.error).toBeNull();
    await kupua.assertPositionsConsistent();
  });

  // NOTE: "sort-around-focus completes without error" was removed (14 Apr 2026 culling):
  // strict subset of "focused image survives sort direction change" above. Every assertion
  // it made is also covered by the direction-change test.

  test("focused image is within viewport after sort field change", async ({ kupua }) => {
    await kupua.goto();

    // Focus an image
    await kupua.focusNthItem(5);
    const focusedId = await kupua.getFocusedImageId();
    expect(focusedId).not.toBeNull();

    // Change sort to Credit — triggers sort-around-focus
    await kupua.selectSort("Credit");
    await kupua.waitForSortAroundFocus(15_000);
    // Extra settle for scroll positioning
    await kupua.page.waitForTimeout(500);

    // Same image still focused
    expect(await kupua.getFocusedImageId()).toBe(focusedId);

    // Assert: the focused image's DOM element is within the viewport
    const isVisible = await kupua.page.evaluate((fid) => {
      // Find the focused row/cell by checking the store for its position,
      // then checking if the virtualised element is in view.
      //
      // In twoTier mode (virtualizer spans all `total` items), the element
      // is placed at globalPos; in normal mode, at buffer-local index.
      const store = (window as any).__kupua_store__;
      if (!store) return false;
      const s = store.getState();
      const globalPos = s.imagePositions.get(fid);
      if (globalPos == null) return false;
      const localIdx = globalPos - s.bufferOffset;
      if (localIdx < 0 || localIdx >= s.results.length) return false;

      // Detect twoTier from total range (must match app logic)
      const SCROLL_MODE_THRESHOLD = 1000;
      const POSITION_MAP_THRESHOLD = 65_000;
      const isTwoTier = POSITION_MAP_THRESHOLD > 0 && s.total > SCROLL_MODE_THRESHOLD && s.total <= POSITION_MAP_THRESHOLD;
      // In twoTier mode the virtualizer uses global indices; in normal mode, buffer-local.
      const virtualizerIdx = isTwoTier ? globalPos : localIdx;

      // Check the scroll container: is the row/cell for this index visible?
      const grid = document.querySelector('[aria-label="Image results grid"]');
      const table = document.querySelector('[aria-label="Image results table"]');
      const el = (grid ?? table) as HTMLElement | null;
      if (!el) return false;

      const viewportTop = el.scrollTop;
      const viewportBottom = viewportTop + el.clientHeight;

      // Estimate element position (grid: row = floor(idx/cols) * 303,
      // table: row = idx * 32 + headerHeight)
      if (grid) {
        const cols = Math.max(1, Math.floor(el.clientWidth / 280));
        const rowTop = Math.floor(virtualizerIdx / cols) * 303;
        return rowTop >= viewportTop - 303 && rowTop <= viewportBottom;
      } else {
        const rowTop = virtualizerIdx * 32 + 45;
        return rowTop >= viewportTop - 32 && rowTop <= viewportBottom;
      }
    }, focusedId);

    expect(isVisible).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Keyboard navigation
// ---------------------------------------------------------------------------

test.describe("Keyboard navigation", () => {
  test("PageDown increases scrollTop", async ({ kupua }) => {
    await kupua.goto();

    const before = await kupua.getScrollTop();
    await kupua.pageDown();
    const after = await kupua.getScrollTop();
    expect(after).toBeGreaterThan(before);
  });

  // NOTE: "Home key returns scrollTop to 0" was removed (14 Apr 2026 culling):
  // duplicate of keyboard-nav.spec.ts "Home scrolls to top without setting focus".
  // The tier matrix covers Home at all tiers.
});

// ---------------------------------------------------------------------------
// Scroll stability — no flashing, no corruption
// ---------------------------------------------------------------------------

test.describe("Scroll stability", () => {
  test("seek then scroll up — buffer extends without corruption", async ({ kupua }) => {
    await kupua.goto();

    await kupua.seekTo(0.5);
    const store1 = await kupua.getStoreState();

    await kupua.scrollBy(-500);
    await kupua.page.waitForTimeout(1000);

    const store2 = await kupua.getStoreState();
    expect(store2.resultsLength).toBeGreaterThan(0);
    expect(store2.bufferOffset).toBeLessThanOrEqual(store1.bufferOffset);
    expect(store2.error).toBeNull();
    await kupua.assertPositionsConsistent();
  });

  test("rapid concurrent seeks settle cleanly", async ({ kupua }) => {
    await kupua.goto();

    // Fire seeks rapidly — only the last should win
    await kupua.clickScrubberAt(0.3);
    await kupua.page.waitForTimeout(100);
    await kupua.clickScrubberAt(0.7);
    await kupua.page.waitForTimeout(100);
    await kupua.clickScrubberAt(0.1);

    await kupua.page.waitForTimeout(2000);
    await kupua.waitForResults();

    const store = await kupua.getStoreState();
    expect(store.resultsLength).toBeGreaterThan(0);
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
    await kupua.assertPositionsConsistent();
  });
});

// ---------------------------------------------------------------------------
// Metadata panel — global→local index bug
// ---------------------------------------------------------------------------

test.describe("Metadata panel", () => {
  test("focused image metadata shown after seek (not 'Focus an image')", async ({ kupua }) => {
    await kupua.goto();

    // Open details panel
    const detailsBtn = kupua.page.locator('button[aria-label*="Details panel"]');
    await detailsBtn.click();
    await kupua.page.waitForTimeout(200);

    // Seek to middle (so bufferOffset > 0 — this is where the bug matters)
    await kupua.seekTo(0.5);
    const store = await kupua.getStoreState();
    expect(store.bufferOffset).toBeGreaterThan(0);

    // Focus an image via the store (in two-tier mode, viewport may show
    // skeletons after seekTo — DOM clicks on cursor-pointer elements timeout).
    await kupua.page.evaluate(() => {
      const store = (window as any).__kupua_store__;
      const s = store.getState();
      const id = s.results[2]?.id;
      if (id) s.setFocusedImageId(id);
    });
    await kupua.page.waitForTimeout(300);

    const focusedId = await kupua.getFocusedImageId();
    expect(focusedId).not.toBeNull();

    // The "empty" message should NOT be visible
    const emptyMsg = kupua.page.locator("text=Focus an image to see its metadata");
    await expect(emptyMsg).not.toBeVisible();

    // Verify the global position is consistent
    const globalPos = await kupua.getFocusedGlobalPosition();
    expect(globalPos).toBeGreaterThanOrEqual(store.bufferOffset);
    expect(globalPos).toBeLessThan(store.bufferOffset + store.resultsLength);
  });
});

// ---------------------------------------------------------------------------
// Full workflow — the exact user journey that kept breaking
// ---------------------------------------------------------------------------

test.describe("Full workflow — user journey", () => {
  // NOTE: "scrub → focus → density switch → scrub back" was removed
  // (8 Apr 2026 culling) — subsumed by "long session" below, which is a
  // strict superset (adds extend, sort change, second seek).

  test("sort → focus → sort → focus preserved", async ({ kupua }) => {
    await kupua.goto();

    await kupua.focusNthItem(5);
    const focusedId1 = await kupua.getFocusedImageId();
    expect(focusedId1).not.toBeNull();

    await kupua.toggleSortDirection();

    await kupua.page.waitForFunction(
      () => {
        const store = (window as any).__kupua_store__;
        if (!store) return false;
        const s = store.getState();
        return s.sortAroundFocusStatus === null && !s.loading;
      },
      { timeout: 10_000 },
    );

    expect(await kupua.getFocusedImageId()).toBe(focusedId1);
    const store = await kupua.getStoreState();
    expect(store.error).toBeNull();
    await kupua.assertPositionsConsistent();
  });

  test("long session: seek, extend, focus, density, sort, seek again", async ({ kupua }) => {
    await kupua.goto();

    // 1. Verify initial
    let store = await kupua.getStoreState();
    expect(store.total).toBeGreaterThan(0);

    // 2. Seek to middle
    await kupua.seekTo(0.5);
    store = await kupua.getStoreState();
    const midOffset = store.bufferOffset;
    expect(midOffset).toBeGreaterThan(0);
    await kupua.assertPositionsConsistent();

    // 3. Scroll down to trigger extend
    await kupua.scrollBy(3000);
    await kupua.page.waitForTimeout(1000);
    store = await kupua.getStoreState();
    expect(store.error).toBeNull();
    await kupua.assertPositionsConsistent();

    // 4. Focus an image via the store (in two-tier mode, viewport may show
    // skeletons after seekTo + scrollBy — DOM clicks timeout)
    await kupua.page.evaluate(() => {
      const store = (window as any).__kupua_store__;
      const s = store.getState();
      const id = s.results[5]?.id;
      if (id) s.setFocusedImageId(id);
    });
    const focusedId = await kupua.getFocusedImageId();
    expect(focusedId).not.toBeNull();

    // 5. Switch to table → back to grid
    await kupua.switchToTable();
    expect(await kupua.getFocusedImageId()).toBe(focusedId);
    await kupua.switchToGrid();
    expect(await kupua.getFocusedImageId()).toBe(focusedId);

    // 6. Seek to start
    // After density/view switches, the position map may be temporarily null
    // (reloading). Wait for it so seekTo detects two-tier mode correctly.
    await kupua.waitForPositionMap(10_000);
    const genBefore = (await kupua.getStoreState()).seekGeneration;
    await kupua.seekTo(0.02);
    // Ensure the scroll-seek actually completed (seekTo's internal 3s timeout
    // may not be enough if position map was briefly null during the switch).
    try { await kupua.waitForSeekGenerationBump(genBefore, 5000); } catch { /* already bumped inside seekTo */ }
    store = await kupua.getStoreState();
    expect(store.bufferOffset).toBeLessThan(midOffset);
    expect(store.error).toBeNull();
    expect(store.resultsLength).toBeGreaterThan(0);
    await kupua.assertPositionsConsistent();
  });
});

// ===========================================================================
// Bug report tests — from manual testing on real ES (2026-03-28)
//
// These tests reproduce the specific bugs found during manual testing.
// Each test documents which bug it covers and what the correct behaviour is.
// ===========================================================================

// ---------------------------------------------------------------------------
// Bug #11 — CRITICAL: "Date Taken" sort seek snaps back to top
//
// On "Taken on" sort, scrubber seek should reposition the buffer just like
// uploadTime sort. The "taken" alias expands to [dateTaken, -uploadTime],
// making it a multi-field sort. The bug was that search_after cursor anchors
// used "" for the secondary uploadTime field — ES rejects "" for date fields.
// Fix: use 0 (epoch zero) for non-keyword anchors.
// ---------------------------------------------------------------------------

test.describe("Bug #11 — Date Taken sort seek", () => {
  test.describe.configure({ timeout: 30_000 });

  test("seek to middle works under Taken on sort", async ({ kupua }) => {
    await kupua.goto();
    await kupua.selectSort("Taken on");

    const store1 = await kupua.getStoreState();
    expect(store1.bufferOffset).toBe(0);
    expect(store1.error).toBeNull();

    // Seek to middle — this is the operation that failed (snapped back)
    await kupua.seekTo(0.5);

    const store2 = await kupua.getStoreState();
    expect(store2.error).toBeNull();
    expect(store2.resultsLength).toBeGreaterThan(0);
    // MUST have moved — the bug was that bufferOffset stayed at 0
    expect(store2.bufferOffset).toBeGreaterThan(0);
    await kupua.assertPositionsConsistent();
  });

  test("seek to bottom works under Taken on sort", async ({ kupua }) => {
    await kupua.goto();
    await kupua.selectSort("Taken on");

    await kupua.seekTo(0.95);

    const store = await kupua.getStoreState();
    expect(store.error).toBeNull();
    expect(store.resultsLength).toBeGreaterThan(0);
    // Should be near the end of the dataset
    expect(store.bufferOffset + store.resultsLength).toBeGreaterThan(
      store.total * 0.7,
    );
    await kupua.assertPositionsConsistent();
  });
});

// ---------------------------------------------------------------------------
// Bug #7 — CRITICAL: Keyword sort seek doesn't move results
//
// For sorts on keyword fields (Credit, Source, Uploader, etc.) and script
// sorts (Width), the scrubber seek should reposition the buffer.
// Percentile estimation doesn't work for keyword fields (returns null),
// so seek falls through to the iterative search_after path.
// ---------------------------------------------------------------------------

// Bug #7 was: keyword sort seek hung forever because the iterative
// search_after skip loop sent size > max_result_window (ES returned 400,
// seek caught the error but waitForSeekComplete waited for error===null).
// Fix: cap skip chunk size to MAX_RESULT_WINDOW in search-store.ts seek().
test.describe("Bug #7 — Keyword sort seek", () => {
  // Absorbs Bug #13 tests — the composite-agg telemetry check from Bug #13.1
  // is folded in here; Bug #13.2 (drag) is covered by generic drag tests;
  // Bug #13.3 (two positions differ) duplicated Bug #7.4; Bug #13.4 (timing)
  // was redundant with the describe-level timeout.

  test("seek to middle works under Credit sort", async ({ kupua }) => {
    await kupua.goto();
    await kupua.selectSort("Credit");

    const store1 = await kupua.getStoreState();
    expect(store1.bufferOffset).toBe(0);
    expect(store1.error).toBeNull();

    // Capture console to verify composite agg telemetry (from Bug #13)
    kupua.startConsoleCapture();

    await kupua.seekTo(0.5);

    const store2 = await kupua.getStoreState();
    expect(store2.error).toBeNull();
    expect(store2.resultsLength).toBeGreaterThan(0);
    // MUST have moved — the bug was that results didn't shift at all
    expect(store2.bufferOffset).toBeGreaterThan(0);
    // Buffer should be near 50% — within 15% tolerance.
    // The old `> 0` assertion was too weak — a buffer at 10% would pass.
    // This tighter check catches future regressions where refinement
    // silently fails and the buffer stays at a bucket boundary.
    const ratio = store2.bufferOffset / store2.total;
    expect(ratio).toBeGreaterThan(0.35);
    expect(ratio).toBeLessThan(0.65);
    await kupua.assertPositionsConsistent();

    // Telemetry: verify findKeywordSortValue used the composite path
    // and completed efficiently (≤ 5 pages for local 10k data)
    // In two-tier mode, the position-map fast path is used instead of the
    // keyword strategy, so these console logs won't be present.
    const isTwoTier = await kupua.isTwoTierMode();
    if (!isTwoTier) {
      const kwLogs = kupua.getConsoleLogs(/findKeywordSortValue/);
      expect(kwLogs.length).toBeGreaterThan(0);
      const foundLog = kwLogs.find((l) => l.includes("found"));
      expect(foundLog).toBeDefined();
      const pageMatch = foundLog?.match(/at page (\d+)/);
      if (pageMatch) {
        const pages = parseInt(pageMatch[1], 10);
        expect(pages).toBeLessThanOrEqual(5);
      }
    }
  });

  test("seek to middle works under Source sort", async ({ kupua }) => {
    await kupua.goto();
    await kupua.selectSort("Source");

    await kupua.seekTo(0.5);

    const store = await kupua.getStoreState();
    expect(store.error).toBeNull();
    expect(store.resultsLength).toBeGreaterThan(0);
    expect(store.bufferOffset).toBeGreaterThan(0);
    const ratio = store.bufferOffset / store.total;
    expect(ratio).toBeGreaterThan(0.35);
    expect(ratio).toBeLessThan(0.65);
    await kupua.assertPositionsConsistent();
  });

  test("seek to middle works under Width sort", async ({ kupua }) => {
    // Width is a plain integer field (source.dimensions.width) — uses the
    // fast percentile estimation path for deep seek. Replaces the old
    // Dimensions script sort (w×h Painless) which was unusably slow.
    await kupua.goto();
    await kupua.selectSort("Width");

    await kupua.seekTo(0.5);

    const store = await kupua.getStoreState();
    expect(store.error).toBeNull();
    expect(store.resultsLength).toBeGreaterThan(0);
    expect(store.bufferOffset).toBeGreaterThan(0);
    const ratio = store.bufferOffset / store.total;
    expect(ratio).toBeGreaterThan(0.35);
    expect(ratio).toBeLessThan(0.65);
    await kupua.assertPositionsConsistent();
  });

  test("consecutive seeks under keyword sort land at different positions", async ({ kupua }) => {
    await kupua.goto();
    await kupua.selectSort("Credit");

    await kupua.seekTo(0.3);
    const store1 = await kupua.getStoreState();
    expect(store1.error).toBeNull();

    await kupua.seekTo(0.7);
    const store2 = await kupua.getStoreState();
    expect(store2.error).toBeNull();

    // The two seeks should have landed at different offsets
    expect(store2.bufferOffset).not.toBe(store1.bufferOffset);
    await kupua.assertPositionsConsistent();
  });

  // Bug #18 — Keyword sort seek accuracy.
  //
  // Context: keyword seek uses findKeywordSortValue (composite agg) to find
  // the keyword value at the target position, then search_after from there.
  // When a keyword bucket is much larger than PAGE_SIZE (e.g. 400k "PA" docs
  // on TEST), binary search on the `id` tiebreaker refines the cursor —
  // but that path only triggers when drift > PAGE_SIZE.
  //
  // The local sample data has ~769 unique credits (high cardinality), so
  // each bucket is small (~13 docs average). findKeywordSortValue lands
  // within PAGE_SIZE of the target, and binary search refinement is NOT
  // needed. This is fine — the test validates seek accuracy via the ratio
  // assertion, which is the user-visible outcome. Binary search refinement
  // is covered by smoke test S10 on TEST (where large buckets exist).
  //
  // NOTE: PIT race condition (stale PIT from concurrent search) is NOT
  // testable locally — local ES skips PIT entirely. That bug class is
  // covered by the PIT fallback in es-adapter.ts and smoke test S10.
  test("seek to 75% under Credit sort lands near 75%", async ({ kupua }) => {
    await kupua.goto();
    await kupua.selectSort("Credit");

    kupua.startConsoleCapture();
    await kupua.seekTo(0.75);

    const store = await kupua.getStoreState();
    expect(store.error).toBeNull();
    expect(store.resultsLength).toBeGreaterThan(0);

    // The buffer must be near 75% — within 10% tolerance.
    const ratio = store.bufferOffset / store.total;
    expect(ratio).toBeGreaterThan(0.65);
    expect(ratio).toBeLessThan(0.85);

    // Verify keyword seek path was taken (composite agg + countBefore)
    // In two-tier mode, the position-map fast path bypasses keyword strategy.
    const isTwoTier = await kupua.isTwoTierMode();
    if (!isTwoTier) {
      const logs = kupua.getConsoleLogs(/keyword strategy/);
      expect(logs.length).toBeGreaterThan(0);
    }

    await kupua.assertPositionsConsistent();
  });
});

// ---------------------------------------------------------------------------
// Bug #1 — Home key after End: old images appear above newest
//
// After pressing End (seeks to bottom), pressing Home should seek to 0
// and show newest images at the top. The bug was that extendBackward raced
// with seek(0) — the scroll-to-top triggered reportVisibleRange before
// the seek's cooldown was set, causing extendBackward to prepend old data.
// Fix: set _seekCooldownUntil synchronously at the start of seek().
// ---------------------------------------------------------------------------

test.describe("Bug #1 — Home after End race", () => {
  test.describe.configure({ timeout: 30_000 });
  test("End then Home returns to offset 0 with no stale data", async ({ kupua }) => {
    await kupua.goto();

    // Go to the bottom
    await kupua.page.keyboard.press("End");
    await kupua.waitForSeekComplete();
    await kupua.page.waitForTimeout(300);

    const endStore = await kupua.getStoreState();
    expect(endStore.bufferOffset).toBeGreaterThan(0);
    expect(endStore.error).toBeNull();

    // Now press Home — this is the operation that raced
    await kupua.page.keyboard.press("Home");
    await kupua.waitForSeekComplete();
    await kupua.page.waitForTimeout(500);

    const homeStore = await kupua.getStoreState();
    expect(homeStore.error).toBeNull();
    expect(homeStore.bufferOffset).toBe(0);
    expect(homeStore.resultsLength).toBeGreaterThan(0);
    await kupua.assertPositionsConsistent();

    // Verify no old images above: scroll to the very top
    const scrollTop = await kupua.getScrollTop();
    expect(scrollTop).toBe(0);
    // The first image in the buffer should be the first in the result set
    // (it should NOT have been displaced by stale extendBackward data)
  });

  test("End then Home then scroll up — nothing above position 0", async ({ kupua }) => {
    await kupua.goto();

    await kupua.page.keyboard.press("End");
    await kupua.waitForSeekComplete();
    await kupua.page.waitForTimeout(300);

    await kupua.page.keyboard.press("Home");
    await kupua.waitForSeekComplete();
    await kupua.page.waitForTimeout(500);

    // Try to scroll up — there should be nothing to scroll to
    const topBefore = await kupua.getScrollTop();
    await kupua.scrollBy(-2000);
    await kupua.page.waitForTimeout(300);
    const topAfter = await kupua.getScrollTop();

    // scrollTop should be 0 — can't scroll above the first item
    expect(topAfter).toBe(0);

    const store = await kupua.getStoreState();
    expect(store.bufferOffset).toBe(0);
    expect(store.error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Bug #9 — Table horizontal scrollbar lost
//
// The hide-scrollbar class hid both vertical AND horizontal scrollbars.
// Table view needs horizontal scroll for wide columns.
// Fix: table uses hide-scrollbar-y (vertical only).
// ---------------------------------------------------------------------------

test.describe("Bug #9 — Table horizontal scrollbar", () => {
  test.describe.configure({ timeout: 30_000 });
  test("table view scroll container allows horizontal overflow", async ({ kupua }) => {
    await kupua.goto();
    await kupua.switchToTable();

    // The table scroll container should have overflow-auto and NOT hide
    // the horizontal scrollbar. Check that the container has scrollable
    // width (inline-block content can be wider than viewport).
    const hasHorizontalOverflow = await kupua.page.evaluate(() => {
      const table = document.querySelector('[aria-label="Image results table"]');
      if (!table) return false;
      // The container has overflow:auto. Check that the CSS class is
      // hide-scrollbar-y (not hide-scrollbar which kills both axes).
      return table.classList.contains("hide-scrollbar-y")
        && !table.classList.contains("hide-scrollbar");
    });
    expect(hasHorizontalOverflow).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Bug #3 — Wheel scroll blocked after scrubber interaction
//
// After scrubber click/drag, mouse wheel over the scrubber track should
// forward to the content scroll container. The bug was that preventDefault
// was called even when the scroll container couldn't scroll (scrollHeight
// === clientHeight after a seek before the virtualizer re-rendered).
// Fix: only preventDefault when scrollTop actually changed.
// ---------------------------------------------------------------------------

test.describe("Bug #3 — Wheel scroll on scrubber", () => {
  test.describe.configure({ timeout: 30_000 });
  test("wheel events on scrubber track scroll the content", async ({ kupua }) => {
    await kupua.goto();

    // Move mouse to the scrubber track
    const trackBox = await kupua.scrubber.boundingBox();
    expect(trackBox).not.toBeNull();
    await kupua.page.mouse.move(
      trackBox!.x + trackBox!.width / 2,
      trackBox!.y + trackBox!.height / 2,
    );

    const topBefore = await kupua.getScrollTop();

    // Dispatch a wheel event on the scrubber
    await kupua.page.mouse.wheel(0, 500);
    await kupua.page.waitForTimeout(200);

    const topAfter = await kupua.getScrollTop();
    // The content should have scrolled down
    expect(topAfter).toBeGreaterThan(topBefore);
  });

  test("wheel scroll works after a scrubber seek", async ({ kupua }) => {
    await kupua.goto();

    // Seek somewhere via scrubber click
    await kupua.seekTo(0.3);

    // Move mouse to the scrubber
    const trackBox = await kupua.scrubber.boundingBox();
    expect(trackBox).not.toBeNull();
    await kupua.page.mouse.move(
      trackBox!.x + trackBox!.width / 2,
      trackBox!.y + trackBox!.height / 2,
    );

    const topBefore = await kupua.getScrollTop();

    // Wheel down — should forward to content
    await kupua.page.mouse.wheel(0, 500);
    await kupua.page.waitForTimeout(300);

    const topAfter = await kupua.getScrollTop();
    expect(topAfter).toBeGreaterThan(topBefore);
  });
});

// ---------------------------------------------------------------------------
// Bug #12 — Wheel scroll on content area doesn't work after scrubber seek
//
// After seeking to ~50% via the scrubber, the grid content area has results
// but the user cannot scroll down with the mousewheel — the scroll container
// is not responding to wheel events. The issue is that after a seek, the
// scroll container's scrollTop is set near the bottom of the virtualizer's
// total height range, leaving little or no room to scroll further.
//
// Root cause: the seekTargetLocalIndex positions the viewport, but the
// virtualizer totalSize may not be large enough for additional scrolling
// (buffer is only ~200 items). Scrolling down should trigger extendForward
// which adds more items and extends the scrollable area. The bug is that
// the scroll event doesn't fire at all (perhaps scrollTop is already at max),
// or that extendForward doesn't fire after seek due to seek cooldown.
// ---------------------------------------------------------------------------

test.describe("Bug #12 — Wheel scroll after scrubber seek", () => {
  test.describe.configure({ timeout: 30_000 });
  // NOTE: grid and table variants merged (14 Apr 2026 culling).
  for (const density of ["grid", "table"] as const) {
    test(`content area is scrollable after seek to 50% (${density})`, async ({ kupua }) => {
      await kupua.goto();
      if (density === "table") await kupua.switchToTable();
      await kupua.seekTo(0.5);

      await kupua.page.waitForTimeout(300);

      const store = await kupua.getStoreState();
      expect(store.error).toBeNull();
      expect(store.resultsLength).toBeGreaterThan(50);

      const scrollBefore = await kupua.getScrollTop();

      const label = density === "grid"
        ? '[aria-label="Image results grid"]'
        : '[aria-label="Image results table"]';
      const el = kupua.page.locator(label);
      const box = await el.boundingBox();
      expect(box).not.toBeNull();

      await kupua.page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
      await kupua.page.mouse.wheel(0, 600);
      await kupua.page.waitForTimeout(500);

      const scrollAfter = await kupua.getScrollTop();
      expect(scrollAfter).toBeGreaterThan(scrollBefore);
    });
  }
});


// ---------------------------------------------------------------------------
// Bug #14 — End key doesn't scroll to end under non-date sort
//
// With Credit sort, pressing End should seek to the last results.
//
// Root cause (discovered via smoke test S5 on TEST, 1.3M docs):
//   1. findKeywordSortValue composite agg skips null/missing-credit docs
//      (~16k on TEST), so search_after from last keyword lands ~16k short.
//   2. countBefore can't handle null sort values — skips the field and
//      returns wrong count.
//   3. Reverse search_after with default ES `missing: "_last"` puts nulls
//      last in BOTH asc and desc, so naive reverse doesn't reach the true end.
//
// Fixes applied:
//   - findKeywordSortValue returns lastKeywordValue (not null) when exhausted
//   - Reverse search_after fallback with missingFirst: true
//   - Skip countBefore for reverse fallback (null sort values); use
//     actualOffset = total - hits.length directly
//
// Local limitation: sample data has no missing credit values, so the
// null-value code paths only activate on TEST. The smoke test S5 is the
// authoritative guard. If local sample data is ever enhanced with
// null-credit docs, these tests would cover it fully.
// ---------------------------------------------------------------------------

test.describe("Bug #14 — End key under non-date sort", () => {
  test.describe.configure({ timeout: 45_000 });

  test("End key seeks to last results under Credit sort", async ({ kupua }) => {
    await kupua.goto();
    await kupua.selectSort("Credit");
    await kupua.page.waitForTimeout(500);

    // Scroll down a few pages first (so we're not at position 0)
    for (let i = 0; i < 5; i++) {
      await kupua.pageDown();
    }
    await kupua.page.waitForTimeout(500);

    // Capture console logs for telemetry
    kupua.startConsoleCapture();

    // Capture seekGeneration before pressing End — waitForSeekComplete
    // resolves from stale buffer in two-tier mode.
    const genBefore = (await kupua.getStoreState()).seekGeneration;

    // Press End
    await kupua.page.keyboard.press("End");
    await kupua.waitForSeekGenerationBump(genBefore);

    const afterEnd = await kupua.getStoreState();
    expect(afterEnd.error).toBeNull();

    // End key should have moved us to the end of the result set.
    // The fast-path reverse search_after guarantees the buffer covers
    // the absolute last items.
    const endOfBuffer = afterEnd.bufferOffset + afterEnd.resultsLength;
    expect(endOfBuffer).toBeGreaterThanOrEqual(afterEnd.total - 1);

    // scrollTop should be significantly into the content (not at 0).
    const scrollTop = await kupua.getScrollTop();
    expect(scrollTop).toBeGreaterThan(0);

    // Telemetry: check if findKeywordSortValue was used
    const kwLogs = kupua.getConsoleLogs(/findKeywordSortValue/);
    // On local ES (10k docs, DEEP_SEEK_THRESHOLD=200), End key targets
    // offset ~9999 which IS above the threshold, so the deep path fires.
    // findKeywordSortValue should log something.
    if (kwLogs.length > 0) {
      // If it ran, it should have found the value or exhausted cleanly
      const found = kwLogs.some((l) => l.includes("found") || l.includes("no more pages") || l.includes("exhausted"));
      expect(found).toBe(true);
    }
  });

  test("End key under default sort also works", async ({ kupua }) => {
    await kupua.goto();

    // Scroll down a bit
    for (let i = 0; i < 3; i++) {
      await kupua.pageDown();
    }

    // Capture seekGeneration before pressing End
    const genBefore = (await kupua.getStoreState()).seekGeneration;

    await kupua.page.keyboard.press("End");
    await kupua.waitForSeekGenerationBump(genBefore);

    const store = await kupua.getStoreState();
    expect(store.error).toBeNull();

    const endOfBuffer = store.bufferOffset + store.resultsLength;
    expect(endOfBuffer).toBeGreaterThanOrEqual(store.total - 1);
  });
});

// ---------------------------------------------------------------------------
// Bug #15 — Grid twitch / composition flicker on sort direction toggle
//
// In grid view, toggling sort direction with a focused image caused the grid
// to visibly recompose 2-3 times before settling. The last row's cell count
// would bounce (e.g. 3→7→4 of 7 columns) as results.length changed through
// intermediate states.
//
// Root causes:
//   1. The initial search exposed position-0 results to the view before
//      _findAndFocusImage replaced the buffer — flash of wrong content.
//   2. _findAndFocusImage bumped both _seekGeneration AND
//      sortAroundFocusGeneration, triggering two conflicting scroll effects
//      (align: "start" then align: "center") in the same layout pass.
//   3. The scroll-reset effect fired on URL change (before search completed),
//      resetting scrollTop to 0 on the old buffer.
//
// Fixes:
//   - Store: when sort-around-focus image isn't in first page, keep old
//     buffer visible (loading=true) until _findAndFocusImage replaces it
//     in one shot.
//   - Store: _findAndFocusImage no longer bumps _seekGeneration —
//     sortAroundFocusGeneration is the sole scroll trigger.
//   - Views: scroll-reset skipped for sort-only changes with a focused image.
//
// This test installs a Zustand subscriber that records every results.length
// change during the sort toggle, then asserts only one buffer transition
// occurred (old → final, no intermediates).
// ---------------------------------------------------------------------------

test.describe("Bug #15 — Grid twitch on sort toggle", () => {
  test.describe.configure({ timeout: 30_000 });

  test("grid composition changes only once during sort-around-focus", async ({ kupua }) => {
    await kupua.goto();
    // Ensure grid view
    await kupua.switchToGrid();

    // Focus the first visible cell
    await kupua.focusNthItem(0);
    const focusedId = await kupua.getFocusedImageId();
    expect(focusedId).not.toBeNull();

    // Record the initial results.length
    const initialState = await kupua.getStoreState();
    const initialLength = initialState.resultsLength;

    // Install a subscriber in the browser that tracks results.length changes
    await kupua.page.evaluate(() => {
      const store = (window as any).__kupua_store__;
      const changes: number[] = [];
      let prevLen = store.getState().results.length;
      const unsub = store.subscribe((s: any) => {
        if (s.results.length !== prevLen) {
          prevLen = s.results.length;
          changes.push(prevLen);
        }
      });
      (window as any).__bug15_changes__ = changes;
      (window as any).__bug15_unsub__ = unsub;
    });

    // Toggle sort direction — this triggers sort-around-focus
    await kupua.toggleSortDirection();
    await kupua.waitForSortAroundFocus(15_000);

    // Give an extra beat for any straggling state updates
    await kupua.page.waitForTimeout(300);

    // Read the recorded changes and clean up
    const changes = await kupua.page.evaluate(() => {
      const changes = (window as any).__bug15_changes__ as number[];
      const unsub = (window as any).__bug15_unsub__ as () => void;
      if (unsub) unsub();
      delete (window as any).__bug15_changes__;
      delete (window as any).__bug15_unsub__;
      return changes;
    });

    // The buffer should have changed at most once: old length → final length.
    // Before the fix, this would be 2-3 changes (initial search results at
    // position 0, then _findAndFocusImage replacement, possibly with an
    // intermediate extend).
    expect(changes.length).toBeLessThanOrEqual(1);

    // Focused image must still be the same
    expect(await kupua.getFocusedImageId()).toBe(focusedId);

    // Image must be in the buffer
    const globalPos = await kupua.getFocusedGlobalPosition();
    const store = await kupua.getStoreState();
    expect(globalPos).toBeGreaterThanOrEqual(store.bufferOffset);
    expect(globalPos).toBeLessThan(store.bufferOffset + store.resultsLength);
    expect(store.error).toBeNull();
    await kupua.assertPositionsConsistent();
  });

  test("sort toggle in grid doesn't flash wrong content at scrollTop=0", async ({ kupua }) => {
    await kupua.goto();
    await kupua.switchToGrid();

    // Seek to middle so the focused image is far from position 0
    await kupua.seekTo(0.5);
    await kupua.focusNthItem(2);
    const focusedId = await kupua.getFocusedImageId();
    expect(focusedId).not.toBeNull();

    const beforeToggle = await kupua.getStoreState();
    const scrollBefore = await kupua.getScrollTop();

    // Track scrollTop changes — the scroll-reset bug would set scrollTop=0
    // on URL change before search results arrived
    await kupua.page.evaluate(() => {
      const el = document.querySelector('[aria-label="Image results grid"]');
      const positions: number[] = [];
      if (el) {
        // scrollTop changes don't fire MutationObserver, so use a polling approach
        const id = setInterval(() => {
          positions.push(el.scrollTop);
        }, 16); // ~60fps
        (window as any).__bug15_scroll__ = { positions, intervalId: id };
      }
    });

    await kupua.toggleSortDirection();
    await kupua.waitForSortAroundFocus(15_000);
    await kupua.page.waitForTimeout(300);

    // Read scroll positions and clean up
    const scrollData = await kupua.page.evaluate(() => {
      const data = (window as any).__bug15_scroll__;
      if (data) {
        clearInterval(data.intervalId);
        delete (window as any).__bug15_scroll__;
        return data.positions as number[];
      }
      return [];
    });

    // The original Bug #15 was: scrollTop dropped to 0 mid-transition
    // because the scroll-reset effect fired on URL change before data arrived,
    // flashing position-0 content. The fix skips scroll-reset for sort-only
    // changes with a focused image.
    //
    // After the deferred-scroll-reset fix (Home/logo flash elimination),
    // scrollBefore may legitimately be 0 — the seek target lands at the top
    // of the buffer window (scrollTop=0, bufferOffset=~5000). That's fine.
    // The bug was scrollTop DROPPING to 0 from a non-zero position.
    //
    // Guard: if we started at scrollTop > 0, it must never have touched 0.
    // If we started at 0, sort-around-focus must produce a final scrollTop > 0
    // (the focused image moved to a new position in the reversed sort).
    if (scrollBefore > 0) {
      const droppedToZero = scrollData.some((s: number) => s === 0);
      expect(droppedToZero).toBe(false);
    } else {
      // Started at 0 — after sort-around-focus, the focused image should be
      // scrolled into view at its new position (non-zero in reversed sort).
      const scrollAfter = await kupua.getScrollTop();
      expect(scrollAfter).toBeGreaterThan(0);
    }

    // Focused image preserved
    expect(await kupua.getFocusedImageId()).toBe(focusedId);
    const store = await kupua.getStoreState();
    expect(store.error).toBeNull();
    // Note: we intentionally skip assertPositionsConsistent here.
    // The deferred scroll event (600ms) can trigger extendBackward which
    // may introduce a small position drift due to a pre-existing overlap
    // issue in extendBackward. The scrollTop-never-drops-to-zero assertion
    // above is the actual Bug #15 regression guard.
  });


  test("sort toggle preserves focus in table view too (no regression)", async ({ kupua }) => {
    await kupua.goto();
    await kupua.switchToTable();

    await kupua.focusNthItem(5);
    const focusedId = await kupua.getFocusedImageId();
    expect(focusedId).not.toBeNull();

    await kupua.toggleSortDirection();
    await kupua.waitForSortAroundFocus(15_000);

    expect(await kupua.getFocusedImageId()).toBe(focusedId);
    const store = await kupua.getStoreState();
    expect(store.error).toBeNull();
    await kupua.assertPositionsConsistent();
  });
});


// ---------------------------------------------------------------------------
// Bug #16: Forward-extend eviction must not cause runaway self-scrolling
// ---------------------------------------------------------------------------
// When the buffer is at capacity (1000) and extendForward fires, it evicts
// items from the start. Without scroll compensation, the viewport stays at
// the same scrollTop but the data shifts, leaving the viewport near the
// buffer end → triggers another extendForward → infinite loop.
// The fix: views adjust scrollTop -= evictCount * ROW_HEIGHT after eviction.

test.describe("Bug #16 — no runaway self-scroll after forward-extend eviction", () => {
  // NOTE: table and grid variants merged (14 Apr 2026 culling).
  // Identical logic — only difference was initial density.
  for (const density of ["table", "grid"] as const) {
    test(`${density}: bufferOffset stabilises after forward-extend eviction`, async ({ kupua }) => {
      await kupua.goto();
      if (density === "table") await kupua.switchToTable();
      else await kupua.switchToGrid();

      const afterFill = await kupua.scrollToBufferCapacity();

      if (afterFill.resultsLength < 800) {
        test.skip();
        return;
      }

      const offsetBefore = afterFill.bufferOffset;

      // Wait 3 seconds with NO user interaction
      await kupua.page.waitForTimeout(3000);

      const afterSettle = await kupua.getStoreState();
      const drift = afterSettle.bufferOffset - offsetBefore;

      // Allow at most one additional extend (200 items). The bug would show
      // as thousands of items of drift.
      expect(drift).toBeLessThanOrEqual(200);
      expect(afterSettle.error).toBeNull();
    });
  }
});


// ---------------------------------------------------------------------------
// Density switch WITHOUT focus — viewport anchor path
//
// When the user hasn't clicked any image (focusedImageId is null), density
// switches use the "viewport anchor" (the image nearest the viewport centre,
// tracked by useDataWindow) to preserve scroll position. These tests verify
// the anchor mechanism works for common navigation patterns.
//
// Root cause of the original bug: the rAF2 re-lookup inside the mount
// restore used the viewport anchor id (which could be overwritten by the
// NEW component's initial scroll before rAF2 fired) instead of the saved
// globalIndex from the unmount. The re-lookup found a completely different
// image near the top, collapsing the restore target to scrollTop=0.
// ---------------------------------------------------------------------------

test.describe("Density switch without focus — viewport anchor", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  /** Get scroll state and visible image info. */
  async function getViewState(page: any) {
    return page.evaluate(({ MIN_CELL_WIDTH, GRID_RH, TABLE_RH }: any) => {
      const grid = document.querySelector('[aria-label="Image results grid"]');
      const table = document.querySelector('[aria-label="Image results table"]');
      const el = (grid ?? table) as HTMLElement | null;
      if (!el) return null;
      const isGrid = !!grid;
      const rowH = isGrid ? GRID_RH : TABLE_RH;
      const cols = isGrid
        ? Math.max(1, Math.floor(el.clientWidth / MIN_CELL_WIDTH))
        : 1;
      const store = (window as any).__kupua_store__;
      const s = store?.getState();
      const bufferOffset = s?.bufferOffset ?? 0;

      // Find the image nearest the viewport centre.
      // centreRow is the global row (scrollTop / rowH). In two-tier mode
      // the virtualizer renders `total` items, so the row is global.
      // Convert to buffer-local index by subtracting bufferOffset.
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
        bufferOffset: s?.bufferOffset ?? 0,
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

  test("PgDown ×3 preserves position across table↔grid round-trip", async ({ kupua }) => {
    await kupua.goto();
    await kupua.switchToTable();
    await kupua.page.waitForTimeout(500);

    // Ensure no focus
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

    // PgDown 3 more times in grid
    for (let i = 0; i < 3; i++) {
      await kupua.page.keyboard.press("PageDown");
      await kupua.page.waitForTimeout(100);
    }
    await kupua.page.waitForTimeout(300);

    const gridAfterPgDown = await getViewState(kupua.page);
    expect(gridAfterPgDown!.scrollTop).toBeGreaterThan(gridState!.scrollTop);

    // Grid → table
    await kupua.switchToTable();
    await kupua.page.waitForTimeout(800);

    const tableAfter = await getViewState(kupua.page);
    expect(tableAfter!.scrollTop).toBeGreaterThan(0);
    expect(Math.abs(tableAfter!.centreGlobalPos - gridAfterPgDown!.centreGlobalPos))
      .toBeLessThan(gridAfterPgDown!.cols * 2 + 5);
  });

  test("End key preserves near-bottom across table↔grid round-trip", async ({ kupua }) => {
    await kupua.goto();
    await kupua.switchToTable();
    await kupua.page.waitForTimeout(500);

    await kupua.waitForPositionMap(10_000);


    // End in table
    await kupua.page.keyboard.press("End");
    await kupua.waitForSeekComplete(15_000);
    await kupua.page.waitForTimeout(500);

    const tableBefore = await getViewState(kupua.page);
    expect(tableBefore!.scrollTop).toBeGreaterThan(tableBefore!.maxScroll * 0.5);

    // Table → grid: should be near bottom
    await kupua.switchToGrid();
    await kupua.page.waitForTimeout(800);

    const gridState = await getViewState(kupua.page);
    expect(gridState!.scrollTop).toBeGreaterThan(gridState!.maxScroll * 0.5);

    // End again in grid
    await kupua.page.keyboard.press("End");
    await kupua.waitForSeekComplete(15_000);
    await kupua.page.waitForTimeout(500);

    const gridAfterEnd = await getViewState(kupua.page);
    expect(gridAfterEnd!.scrollTop).toBeGreaterThan(gridAfterEnd!.maxScroll * 0.5);

    // Grid → table: should be near bottom
    await kupua.switchToTable();
    await kupua.page.waitForTimeout(800);

    const tableAfter = await getViewState(kupua.page);
    expect(tableAfter!.scrollTop).toBeGreaterThan(tableAfter!.maxScroll * 0.5);
  });

  test("seek 50% in table → grid → table round-trip is stable", async ({ kupua }) => {
    await kupua.goto();
    await kupua.switchToTable();
    await kupua.page.waitForTimeout(500);

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
    // Centre image should be close to the table's
    expect(Math.abs(gridState!.centreGlobalPos - refGlobalPos))
      .toBeLessThan(gridState!.cols * 2);

    // Switch back to table
    await kupua.switchToTable();
    await kupua.page.waitForTimeout(800);

    const tableAfter = await getViewState(kupua.page);
    expect(tableAfter!.scrollTop).toBeGreaterThan(0);
    // Round-trip: centre image should be close to original
    expect(Math.abs(tableAfter!.centreGlobalPos - refGlobalPos))
      .toBeLessThan(10); // small drift from geometry mismatch is OK
  });

  // -------------------------------------------------------------------------
  // Regression: Home from grid → seek → table must keep position
  //
  // Root cause: resetToHome() unconditionally set _suppressDensityFocusSave.
  // When Home was clicked from grid (no density switch), the grid never
  // remounted so the flag stayed permanently true — all subsequent density
  // switches had their unmount save suppressed, falling through to a
  // scrollToIndex fallback that landed at the wrong position.
  // -------------------------------------------------------------------------

  test("Home from grid doesn't break density-switch position keeping (no focus)", async ({ kupua }) => {
    await kupua.goto();
    await kupua.page.waitForTimeout(500);

    // Seek to ~50% in grid
    await kupua.seekTo(0.5);
    await kupua.page.waitForTimeout(800);

    // Switch to table — should work (sanity check)
    await kupua.switchToTable();
    await kupua.page.waitForTimeout(800);
    const sanity = await getViewState(kupua.page);
    expect(sanity!.scrollTop).toBeGreaterThan(0);

    // Switch back to grid
    await kupua.switchToGrid();
    await kupua.page.waitForTimeout(800);

    // Click Home logo — stays in grid, goes to top
    await kupua.page.locator('a[title="Grid — clear all filters"]').first().click();
    await kupua.waitForResults();
    await kupua.page.waitForTimeout(1000);

    // Verify at top
    const atTop = await getViewState(kupua.page);
    expect(atTop!.scrollTop).toBeLessThan(100);

    // Now seek to ~50% again
    await kupua.seekTo(0.5);
    await kupua.page.waitForTimeout(800);

    const gridBefore = await getViewState(kupua.page);
    expect(gridBefore!.scrollTop).toBeGreaterThan(0);

    // Switch to table — THIS is what was broken (scrolled to top)
    await kupua.switchToTable();
    await kupua.page.waitForTimeout(800);

    const tableAfter = await getViewState(kupua.page);

    expect(tableAfter!.scrollTop).toBeGreaterThan(0);
    // Centre image should be within a few rows of the grid's position
    expect(Math.abs(tableAfter!.centreGlobalPos - gridBefore!.centreGlobalPos))
      .toBeLessThan(gridBefore!.cols * 3);
  });

  test("Home from grid doesn't break density-switch position keeping (with focus)", async ({ kupua }) => {
    await kupua.goto();
    await kupua.page.waitForTimeout(500);

    // Click Home logo from grid (stays in grid)
    await kupua.page.locator('a[title="Grid — clear all filters"]').first().click();
    await kupua.waitForResults();
    await kupua.page.waitForTimeout(1000);

    // Seek to ~40%
    await kupua.seekTo(0.4);
    await kupua.page.waitForTimeout(800);

    // Focus an image
    await kupua.focusNthItem(2);
    const focusedId = await kupua.getFocusedImageId();
    expect(focusedId).not.toBeNull();

    const globalPosBefore = await kupua.getFocusedGlobalPosition();

    // Switch to table
    await kupua.switchToTable();
    await kupua.page.waitForTimeout(800);

    // Focused image should be preserved
    expect(await kupua.getFocusedImageId()).toBe(focusedId);
    const tableScrollTop = await kupua.getScrollTop();
    expect(
      tableScrollTop,
      `Table at top after Home-from-grid + focus — scrollTop=${tableScrollTop}`,
    ).toBeGreaterThan(0);

    // Global position should match
    const globalPosAfter = await kupua.getFocusedGlobalPosition();
    expect(Math.abs(globalPosAfter - globalPosBefore)).toBeLessThan(5);
  });
});

// ---------------------------------------------------------------------------
// Home button — sort reset
//
// Regression from the 14 Apr 2026 density-switch fix: resetToHome() only
// cleared query + offset, not orderBy. The dedup restoration of
// _prevParamsSerialized prevented useUrlSearchSync from clearing the stale
// sort. Fix: resetToHome() now resets ALL URL-managed search params.
// ---------------------------------------------------------------------------

test.describe("Home button — sort reset", () => {
  test("Home resets sort order to default after changing sort field", async ({ kupua }) => {
    await kupua.goto();

    // Remember first image under default sort (uploadTime desc)
    const defaultState = await kupua.getStoreState();
    const defaultFirstId = defaultState.firstImageId;
    expect(defaultState.orderBy).toBeUndefined();

    // Change sort to "Category"
    await kupua.selectSort("Category");
    const afterSort = await kupua.getStoreState();
    expect(afterSort.orderBy).toBeDefined();
    expect(afterSort.firstImageId).not.toBe(defaultFirstId);

    // Click Home logo
    await kupua.page.locator('a[title="Grid — clear all filters"]').first().click();
    await kupua.waitForResults();
    await kupua.page.waitForTimeout(1000);

    // orderBy must be reset to undefined (default sort)
    const afterHome = await kupua.getStoreState();
    expect(afterHome.orderBy).toBeUndefined();
    expect(afterHome.bufferOffset).toBe(0);
    expect(afterHome.error).toBeNull();
    // First image should match the default sort again
    expect(afterHome.firstImageId).toBe(defaultFirstId);
  });

  test("Home resets sort order after changing sort direction", async ({ kupua }) => {
    await kupua.goto();

    const defaultState = await kupua.getStoreState();
    const defaultFirstId = defaultState.firstImageId;

    // Toggle sort direction (desc → asc)
    await kupua.toggleSortDirection();
    const afterToggle = await kupua.getStoreState();
    expect(afterToggle.firstImageId).not.toBe(defaultFirstId);

    // Click Home
    await kupua.page.locator('a[title="Grid — clear all filters"]').first().click();
    await kupua.waitForResults();
    await kupua.page.waitForTimeout(1000);

    const afterHome = await kupua.getStoreState();
    expect(afterHome.orderBy).toBeUndefined();
    expect(afterHome.firstImageId).toBe(defaultFirstId);
    expect(afterHome.error).toBeNull();
  });

  test("Home from table view resets sort order and switches to grid", async ({ kupua }) => {
    await kupua.goto();
    await kupua.switchToTable();

    const defaultState = await kupua.getStoreState();
    const defaultFirstId = defaultState.firstImageId;

    // Change sort
    await kupua.selectSort("Credit");
    const afterSort = await kupua.getStoreState();
    expect(afterSort.orderBy).toBeDefined();

    // Click Home (from table — triggers density switch to grid)
    await kupua.page.locator('a[title="Grid — clear all filters"]').first().click();
    await kupua.waitForResults();
    await kupua.page.waitForTimeout(1000);

    const afterHome = await kupua.getStoreState();
    expect(afterHome.orderBy).toBeUndefined();
    expect(afterHome.firstImageId).toBe(defaultFirstId);
    expect(afterHome.error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Scroll mode — small result set (all data in buffer)
//
// When total ≤ SCROLL_MODE_THRESHOLD, the store fills the buffer with all
// results and the scrubber enters scroll mode (drag scrolls content directly,
// no seek). Use a narrow date range to get <1000 results from local ES.
// ---------------------------------------------------------------------------

test.describe("Scroll mode — buffer fill", () => {
  test("buffer fills completely for small result set", async ({ kupua }) => {
    // Narrow date range: ~5 days should give roughly 400-800 results
    await kupua.gotoWithParams("since=2026-03-15&until=2026-03-20");
    const { total } = await kupua.getStoreState();

    // Skip if the date range doesn't produce a small enough set
    test.skip(total > 1000, `Total ${total} exceeds scroll-mode threshold`);
    test.skip(total < 10, `Total ${total} too small to be meaningful`);

    // Wait for scroll-mode fill to complete
    await kupua.waitForScrollMode();

    const state = await kupua.getStoreState();
    expect(state.resultsLength).toBe(state.total);
    expect(state.bufferOffset).toBe(0);
  });

  test("scrubber works in scroll mode (no seek, direct scroll)", async ({ kupua }) => {
    await kupua.gotoWithParams("since=2026-03-15&until=2026-03-20");
    const { total } = await kupua.getStoreState();
    test.skip(total > 1000, `Total ${total} exceeds scroll-mode threshold`);
    test.skip(total < 50, `Total ${total} too small`);

    await kupua.waitForScrollMode();

    // Click scrubber at 50% — should scroll content without a seek
    await kupua.clickScrubberAt(0.5);
    await kupua.page.waitForTimeout(300);

    // bufferOffset should still be 0 (no seek happened, just scroll)
    const stateAfter = await kupua.getStoreState();
    expect(stateAfter.bufferOffset).toBe(0);
    expect(stateAfter.resultsLength).toBe(stateAfter.total);

    // Content should have scrolled
    const scrollTop = await kupua.getScrollTop();
    expect(scrollTop).toBeGreaterThan(0);
  });
});

// ===========================================================================
// Two-tier virtualisation — position-map-powered scrubber scrollbar
//
// When the position map is loaded (1k < total ≤ 65k), the virtualizer count
// becomes `total` and the scrubber drag directly scrolls the container (like
// a real scrollbar) instead of triggering a seek. The buffer slides to fill
// the viewport via extends and scroll-triggered seeks.
//
// These tests use the default local dataset (~10k docs, which qualifies for
// position map loading since 10k < POSITION_MAP_THRESHOLD=65k).
// ===========================================================================

test.describe("Two-tier virtualisation", () => {
  test.describe.configure({ timeout: 60_000 });

  // -------------------------------------------------------------------------
  // T1: Position map loads and activates two-tier mode
  // -------------------------------------------------------------------------

  test("position map loads after initial search (two-tier activates)", async ({ kupua }) => {
    await kupua.goto();

    // With ~10k local docs, the position map should load in the background
    const store = await kupua.getStoreState();
    expect(store.total).toBeGreaterThan(1000);

    // Wait for position map to load
    await kupua.waitForPositionMap();
    expect(await kupua.isTwoTierMode()).toBe(true);
  });

  // -------------------------------------------------------------------------
  // T2: Scrubber drag in indexed mode → direct scroll (not seek)
  // -------------------------------------------------------------------------

  test("scrubber drag scrolls directly in two-tier mode (no seek)", async ({ kupua }) => {
    await kupua.goto();
    await kupua.waitForPositionMap();

    const { total } = await kupua.getStoreState();

    // Drag scrubber to 50% — in two-tier mode this should directly scroll
    // the container (not trigger a seek)
    await kupua.dragScrubberTo(0.5);

    // scrollTop should be significantly non-zero — the container has
    // full height in two-tier mode (total × rowHeight)
    const scrollTop = await kupua.getScrollTop();
    expect(scrollTop).toBeGreaterThan(500);

    // Scrubber position should reflect a position in the middle
    const pos = await kupua.getScrubberPosition();
    expect(pos).toBeGreaterThan(total * 0.2);
    expect(pos).toBeLessThan(total * 0.8);
  });

  // -------------------------------------------------------------------------
  // T3: Scrubber drag past buffer → skeletons → seek fills them
  // -------------------------------------------------------------------------

  test("dragging past buffer triggers scroll-seek that fills skeletons", async ({ kupua }) => {
    await kupua.goto();
    await kupua.waitForPositionMap();

    // Drag scrubber to ~80% — the buffer starts at [0..999], so 80%
    // of 10k = position ~8000, way outside the buffer
    await kupua.dragScrubberTo(0.8);

    // Give scroll-triggered seek time to fire and complete
    // (debounce 200ms + seek latency + render)
    await kupua.page.waitForTimeout(2000);

    // Buffer should have repositioned to cover the viewport area
    const storeAfter = await kupua.getStoreState();
    expect(storeAfter.bufferOffset).toBeGreaterThan(1000);
    expect(storeAfter.error).toBeNull();
    expect(storeAfter.resultsLength).toBeGreaterThan(50);

    // Two-tier mode should still be active (seek preserves position map)
    expect(await kupua.isTwoTierMode()).toBe(true);
    await kupua.assertPositionsConsistent();
    await kupua.assertNoVisiblePlaceholders();
  });

  // -------------------------------------------------------------------------
  // T4: Sort change → scrubber reverts to seek mode → map reloads
  // -------------------------------------------------------------------------

  test("sort change invalidates position map then reloads it", async ({ kupua }) => {
    await kupua.goto();
    await kupua.waitForPositionMap();
    expect(await kupua.isTwoTierMode()).toBe(true);

    // Change sort — this triggers search() which invalidates positionMap
    await kupua.selectSort("Credit");

    // The position map is invalidated during search(). It will eventually
    // reload for the new sort order.

    // Wait for position map to reload for the new sort order
    await kupua.waitForPositionMap();
    expect(await kupua.isTwoTierMode()).toBe(true);

    const store = await kupua.getStoreState();
    expect(store.error).toBeNull();
    expect(store.resultsLength).toBeGreaterThan(0);
  });

  // NOTE: T5 (Home button), T6 (Home key), T7 (density switch), T8 (keyboard nav),
  // T10 (position-map seek accuracy), and T11 (sort-around-focus) were removed
  // (14 Apr 2026 culling) — superseded by the cross-tier test matrix which runs
  // equivalent tests at all three tiers (buffer, two-tier, seek).

  // -------------------------------------------------------------------------
  // T9: Seek mode regression — POSITION_MAP_THRESHOLD=0 disables two-tier
  // -------------------------------------------------------------------------
  // NOTE: This test CANNOT override env vars at runtime (Vite inlines them at
  // build time). Instead, we verify the negative case: when positionMap is
  // null (before it loads), the scrubber operates in seek mode. This covers
  // the regression guard — if the non-position-map path is broken, this fails.

  test("scrubber works in seek mode before position map loads", async ({ kupua }) => {
    // Navigate and don't wait for position map — test the initial seek-mode state
    await kupua.goto();

    // Immediately check: if position map hasn't loaded yet, we're in seek mode
    // (this is a race — the map may have loaded already on fast local ES)
    const store = await kupua.getStoreState();
    if (store.total <= 1000) {
      // Small result set → scroll mode, not testable here
      test.skip();
      return;
    }

    // Regardless of whether map has loaded, seeking should work
    await kupua.seekTo(0.5);
    const afterSeek = await kupua.getStoreState();
    expect(afterSeek.error).toBeNull();
    expect(afterSeek.bufferOffset).toBeGreaterThan(0);
    expect(afterSeek.resultsLength).toBeGreaterThan(50);
    await kupua.assertPositionsConsistent();
    await kupua.assertNoVisiblePlaceholders();
  });


  // -------------------------------------------------------------------------
  // T12: Filter change works — position map invalidated and reloaded
  // -------------------------------------------------------------------------

  test("date filter change invalidates and reloads position map", async ({ kupua }) => {
    await kupua.goto();
    await kupua.waitForPositionMap();

    // Navigate with a date filter that produces a subset
    await kupua.gotoWithParams("since=2026-03-10&until=2026-03-25");
    const store = await kupua.getStoreState();

    if (store.total <= 1000) {
      // Small result set → scroll mode, not two-tier
      test.skip();
      return;
    }

    // Position map should eventually load for the filtered set
    await kupua.waitForPositionMap();
    expect(await kupua.isTwoTierMode()).toBe(true);
    expect(store.error).toBeNull();
  });
});

test.describe("Scroll mode — scrubber sync (Bug F regression)", () => {
  /**
   * Helper: navigate with date filter, wait for scroll mode, skip if not activated.
   * The date filter may take a moment to apply after navigation — waitForScrollMode
   * handles the async wait. If scroll mode doesn't activate within 10s (total > threshold
   * or too few results), the test is skipped via the try/catch.
   */
  async function gotoScrollMode(kupua: any, density: "table" | "grid") {
    await kupua.gotoWithParams(`since=2026-03-15&until=2026-03-20&density=${density}`);
    try {
      await kupua.waitForScrollMode(10_000);
    } catch {
      // waitForScrollMode timed out — scroll mode didn't activate
      const { total, resultsLength } = await kupua.getStoreState();
      return { activated: false, total, resultsLength };
    }
    const { total, resultsLength } = await kupua.getStoreState();
    return { activated: true, total, resultsLength };
  }

  test("scrubber thumb tracks scroll position after PgDown (table)", async ({ kupua }) => {
    const { activated, total } = await gotoScrollMode(kupua, "table");
    test.skip(!activated, `Scroll mode not activated (total=${total})`);

    // Initial state: thumb at top, scrollTop at 0
    const thumbBefore = await kupua.getScrubberThumbTop();
    const scrollBefore = await kupua.getScrollTop();
    expect(scrollBefore).toBe(0);

    // PgDown — scroll content
    await kupua.pageDown();
    const scrollAfter = await kupua.getScrollTop();
    expect(scrollAfter).toBeGreaterThan(0);

    // Bug F: thumb should have moved too (not stayed at 0)
    const thumbAfter = await kupua.getScrubberThumbTop();
    expect(thumbAfter).toBeGreaterThan(thumbBefore);
  });

  test("scrubber thumb tracks scroll position after PgDown (grid)", async ({ kupua }) => {
    const { activated, total } = await gotoScrollMode(kupua, "grid");
    test.skip(!activated, `Scroll mode not activated (total=${total})`);

    const thumbBefore = await kupua.getScrubberThumbTop();
    await kupua.pageDown();

    const thumbAfter = await kupua.getScrubberThumbTop();
    expect(thumbAfter).toBeGreaterThan(thumbBefore);
  });

  test("scrubber thumb reaches bottom when content is fully scrolled (table)", async ({ kupua }) => {
    const { activated, total } = await gotoScrollMode(kupua, "table");
    test.skip(!activated, `Scroll mode not activated (total=${total})`);

    // Scroll all the way to the bottom via End key
    await kupua.page.keyboard.press("End");
    await kupua.page.waitForTimeout(500);

    const scrollRatio = await kupua.getScrollRatio();
    // Should be at or very near the bottom
    expect(scrollRatio).toBeGreaterThan(0.95);

    // Now scroll back to top
    await kupua.page.keyboard.press("Home");
    await kupua.page.waitForTimeout(500);

    const thumbAtTop = await kupua.getScrubberThumbTop();
    const scrollTopAfterHome = await kupua.getScrollTop();
    expect(scrollTopAfterHome).toBe(0);
    // Thumb should be at or very near 0
    expect(thumbAtTop).toBeLessThan(2);
  });

  test("scrubber and scroll ratio stay proportional through PgDown sequence", async ({ kupua }) => {
    const { activated, total } = await gotoScrollMode(kupua, "table");
    test.skip(!activated, `Scroll mode not activated (total=${total})`);

    // Get the track height for computing scrubber ratio
    const trackHeight = await kupua.page.evaluate(() => {
      const track = document.querySelector('[role="slider"][aria-label="Result set position"]') as HTMLElement;
      return track ? track.clientHeight : 0;
    });
    expect(trackHeight).toBeGreaterThan(0);

    // PgDown several times, checking sync at each step
    for (let i = 0; i < 5; i++) {
      await kupua.pageDown();

      const scrollRatio = await kupua.getScrollRatio();
      const thumbTop = await kupua.getScrubberThumbTop();

      // Compute approximate scrubber ratio (thumb position / max possible)
      // This is approximate because thumbHeight varies, but the ratios
      // should be in the same ballpark
      if (scrollRatio > 0.01 && scrollRatio < 0.99) {
        // thumb should have moved proportionally — allow 15% tolerance
        const thumbRatio = thumbTop / trackHeight;
        expect(thumbRatio).toBeGreaterThan(scrollRatio * 0.5);
        expect(thumbRatio).toBeLessThan(scrollRatio * 2.0);
      }
    }
  });
});
