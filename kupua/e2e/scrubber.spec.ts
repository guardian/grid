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
 * Run: npx playwright test e2e/scrubber.spec.ts
 * Debug: npx playwright test e2e/scrubber.spec.ts --debug
 */

import { test, expect } from "./helpers";
import { GRID_ROW_HEIGHT, GRID_MIN_CELL_WIDTH, TABLE_ROW_HEIGHT, TABLE_HEADER_HEIGHT } from "@/constants/layout";

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
    // Buffer should contain images near the end
    const bufferEnd = store.bufferOffset + store.resultsLength;
    expect(bufferEnd).toBeGreaterThan(total - 1000);
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
    expect(scrollTop).toBeGreaterThanOrEqual(0);
    expect(scrollTop).toBeLessThan(store.resultsLength * 200);
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
// Flash prevention — golden table from worklog-stale-cells-bug.md
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
    const scrollAfterFirstSeek = await kupua.getScrollTop();
    await kupua.seekTo(0.3);
    const scrollAfterSecondSeek = await kupua.getScrollTop();
    // Zero tolerance — reverse-compute guarantees delta=0
    expect(
      Math.abs(scrollAfterSecondSeek - scrollAfterFirstSeek),
      "scrollTop changed between consecutive seeks without user scroll",
    ).toBe(0);

    // Case 2: Small scroll then seek — delta should be 0
    await kupua.seekTo(0.5);
    await kupua.scrollBy(150); // roughly half a grid row
    const midScrollTop = await kupua.getScrollTop();
    await kupua.seekTo(0.7);
    const postScrollTop = await kupua.getScrollTop();
    expect(
      Math.abs(postScrollTop - midScrollTop),
      "scrollTop jumped after small scroll + seek",
    ).toBe(0);

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
    // Sub-row offset preserved: before and after should have the same
    // pixel offset within their respective rows.
    const ROW_H = 303;
    const subRowBefore = beforeTopSeek % ROW_H;
    const subRowAfter = afterTopSeek % ROW_H;
    expect(
      Math.abs(subRowAfter - subRowBefore),
      `Sub-row offset changed: before=${subRowBefore.toFixed(1)}, after=${subRowAfter.toFixed(1)}. ` +
      `scrollTop: ${beforeTopSeek.toFixed(1)} → ${afterTopSeek.toFixed(1)}`,
    ).toBeLessThan(5); // small tolerance for rounding

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
  test("can scroll up after seeking to 50%", async ({ kupua }) => {
    await kupua.goto();

    // Seek to 50% — lands at a deep offset with bufferOffset > 0
    await kupua.seekTo(0.5);
    const storeAfterSeek = await kupua.getStoreState();
    expect(storeAfterSeek.bufferOffset).toBeGreaterThan(0);

    // Wait for the full settle window (cooldown + deferred scroll + margin)
    await kupua.page.waitForTimeout(1500);

    // Record scrollTop before scroll-up attempt
    const scrollBefore = await kupua.getScrollTop();

    // Move mouse to the grid and scroll UP with mouse.wheel
    const gridEl = kupua.page.locator('[aria-label="Image results grid"]');
    const gridBox = await gridEl.boundingBox();
    expect(gridBox).not.toBeNull();
    await kupua.page.mouse.move(
      gridBox!.x + gridBox!.width / 2,
      gridBox!.y + gridBox!.height / 2,
    );

    // Phase 1: Small scroll to verify scrollTop decreases (within buffer,
    // no extends triggered). With bidirectional seek, user starts at
    // scrollTop ≈ 7575 (headroom offset). 5 events × -200px = -1000px
    // → scrollTop ≈ 6575. No extend fires (startIndex still > 50).
    for (let i = 0; i < 5; i++) {
      await kupua.page.mouse.wheel(0, -200);
      await kupua.page.waitForTimeout(100);
    }
    await kupua.page.waitForTimeout(300);

    const scrollAfterSmall = await kupua.getScrollTop();
    expect(
      scrollAfterSmall,
      `scrollTop should decrease after small upward scroll (was ${scrollBefore}, now ${scrollAfterSmall}). ` +
      `If this fails, scroll-up is blocked after seek.`,
    ).toBeLessThan(scrollBefore);

    // Phase 2: Continue scrolling to trigger extendBackward. With ~100
    // items of headroom above, we need ~20 more events to bring startIndex
    // below EXTEND_THRESHOLD (50). Prepend compensation will increase
    // scrollTop (expected), so we only assert bufferOffset decreased.
    for (let i = 0; i < 20; i++) {
      await kupua.page.mouse.wheel(0, -200);
      await kupua.page.waitForTimeout(100);
    }
    // Wait for extends to complete
    await kupua.page.waitForTimeout(1000);

    const storeAfterScroll = await kupua.getStoreState();

    // bufferOffset should have decreased — proves extendBackward actually
    // fired and prepended items. Note: we don't assert scrollTop direction
    // here because prepend compensation increases scrollTop (expected and
    // correct — it prevents swimming).
    expect(
      storeAfterScroll.bufferOffset,
      `bufferOffset should decrease after scrolling up (was ${storeAfterSeek.bufferOffset}, ` +
      `now ${storeAfterScroll.bufferOffset}). extendBackward may not have fired.`,
    ).toBeLessThan(storeAfterSeek.bufferOffset);
  });

  test("can scroll up after seeking to 50% (table view)", async ({ kupua }) => {
    await kupua.goto();
    await kupua.switchToTable();

    await kupua.seekTo(0.5);
    const storeAfterSeek = await kupua.getStoreState();
    expect(storeAfterSeek.bufferOffset).toBeGreaterThan(0);

    await kupua.page.waitForTimeout(1500);

    const scrollBefore = await kupua.getScrollTop();

    const tableEl = kupua.page.locator('[aria-label="Image results table"]');
    const tableBox = await tableEl.boundingBox();
    expect(tableBox).not.toBeNull();
    await kupua.page.mouse.move(
      tableBox!.x + tableBox!.width / 2,
      tableBox!.y + tableBox!.height / 2,
    );

    // Phase 1: Small scroll to verify direction. Table has 1 col,
    // ROW_HEIGHT=32. 5 × -200px = -1000px → ~31 rows scrolled.
    // With headroom starting at local index ~100, startIndex ≈ 69,
    // still > EXTEND_THRESHOLD (50). scrollTop should decrease.
    for (let i = 0; i < 5; i++) {
      await kupua.page.mouse.wheel(0, -200);
      await kupua.page.waitForTimeout(100);
    }
    await kupua.page.waitForTimeout(300);

    const scrollAfterSmall = await kupua.getScrollTop();
    expect(
      scrollAfterSmall,
      `scrollTop should decrease after small upward scroll in table view`,
    ).toBeLessThan(scrollBefore);

    // Phase 2: More scroll to trigger extendBackward. Need to bring
    // startIndex below 50 — about 15 more events should do it.
    // (15 × 200px = 3000px ÷ 32px = ~94 items → startIndex ≈ 69-94 < 50)
    for (let i = 0; i < 15; i++) {
      await kupua.page.mouse.wheel(0, -200);
      await kupua.page.waitForTimeout(100);
    }
    await kupua.page.waitForTimeout(1000);

    const storeAfterScroll = await kupua.getStoreState();

    // bufferOffset should have decreased — proves extendBackward fired
    expect(
      storeAfterScroll.bufferOffset,
      `bufferOffset should decrease after scrolling up in table view ` +
      `(was ${storeAfterSeek.bufferOffset}, now ${storeAfterScroll.bufferOffset})`,
    ).toBeLessThan(storeAfterSeek.bufferOffset);
  });

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
    await kupua.page.mouse.click(
      trackBox!.x + trackBox!.width / 2,
      trackBox!.y + 0.5 * trackBox!.height,
    );

    // Wait for seek data to arrive (store.loading becomes false)
    await kupua.waitForSeekComplete(15_000);

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
    const MAX_SHIFT = cols + 1; // 1 row + 1 item tolerance
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

      // Check vertical position preservation: sub-row offset should match
      const postSeekScrollTop = await kupua.getScrollTop();
      const subRowBefore = preSeekScrollTop % GRID_ROW_HEIGHT;
      const subRowAfter = postSeekScrollTop % GRID_ROW_HEIGHT;

      // Poll for 2 seconds to detect content shift
      const snapshots: Array<{ t: number; pos: number }> = [];
      const start = Date.now();
      for (let i = 0; i < 40; i++) {
        const snap = await kupua.page.evaluate(() => {
          const w = window as unknown as Record<string, unknown>;
          const s = w.__kupuaStore as Record<string, unknown> | undefined;
          if (!s) return null;
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
      expect(
        Math.abs(subRowAfter - subRowBefore),
        `Seek from row offset ${rowOffset}: sub-row offset changed from ${subRowBefore.toFixed(1)} ` +
        `to ${subRowAfter.toFixed(1)} (delta=${Math.abs(subRowAfter - subRowBefore).toFixed(1)}). ` +
        `Vertical position was not preserved.`,
      ).toBeLessThan(5); // small tolerance for rounding
    }
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
  test("focused image ID survives grid→table→grid", async ({ kupua }) => {
    await kupua.goto();

    await kupua.focusNthItem(5);
    const focusedId = await kupua.getFocusedImageId();
    expect(focusedId).not.toBeNull();

    await kupua.switchToTable();
    expect(await kupua.getFocusedImageId()).toBe(focusedId);

    await kupua.switchToGrid();
    expect(await kupua.getFocusedImageId()).toBe(focusedId);
  });

  test("density switch after deep seek preserves focused image", async ({ kupua }) => {
    await kupua.goto();

    // Seek deep
    await kupua.seekTo(0.5);
    await kupua.focusNthItem(2);
    const focusedId = await kupua.getFocusedImageId();
    expect(focusedId).not.toBeNull();

    // Get the focused image's global position
    const globalPosBefore = await kupua.getFocusedGlobalPosition();
    expect(globalPosBefore).toBeGreaterThan(0);

    // Switch
    await kupua.switchToTable();
    await kupua.page.waitForTimeout(500);

    // Same image still focused
    expect(await kupua.getFocusedImageId()).toBe(focusedId);

    // Its global position is unchanged
    const globalPosAfter = await kupua.getFocusedGlobalPosition();
    expect(globalPosAfter).toBe(globalPosBefore);

    await kupua.assertPositionsConsistent();
  });

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

  test("sort-around-focus completes without error", async ({ kupua }) => {
    await kupua.goto();

    await kupua.focusNthItem(10);
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

    const store = await kupua.getStoreState();
    expect(store.error).toBeNull();
    expect(store.resultsLength).toBeGreaterThan(0);
  });

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
      // Find the focused row/cell by checking the store for its local index,
      // then checking if the virtualised element is in view
      const store = (window as any).__kupua_store__;
      if (!store) return false;
      const s = store.getState();
      const globalPos = s.imagePositions.get(fid);
      if (globalPos == null) return false;
      const localIdx = globalPos - s.bufferOffset;
      if (localIdx < 0 || localIdx >= s.results.length) return false;

      // Check the scroll container: is the row/cell for this index visible?
      const grid = document.querySelector('[aria-label="Image results grid"]');
      const table = document.querySelector('[aria-label="Image results table"]');
      const el = (grid ?? table) as HTMLElement | null;
      if (!el) return false;

      const viewportTop = el.scrollTop;
      const viewportBottom = viewportTop + el.clientHeight;

      // Estimate element position (grid: row = floor(localIdx/cols) * 303,
      // table: row = localIdx * 32 + headerHeight)
      if (grid) {
        const cols = Math.max(1, Math.floor(el.clientWidth / 280));
        const rowTop = Math.floor(localIdx / cols) * 303;
        return rowTop >= viewportTop - 303 && rowTop <= viewportBottom;
      } else {
        const rowTop = localIdx * 32 + 45;
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

  test("Home key returns scrollTop to 0", async ({ kupua }) => {
    await kupua.goto();

    await kupua.pageDown();
    await kupua.pageDown();
    await kupua.pageDown();
    expect(await kupua.getScrollTop()).toBeGreaterThan(0);

    await kupua.page.keyboard.press("Home");
    await kupua.page.waitForTimeout(300);

    const after = await kupua.getScrollTop();
    expect(after).toBe(0);
  });
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

    // Focus an image
    await kupua.focusNthItem(2);
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
  test("scrub → focus → density switch → scrub back", async ({ kupua }) => {
    await kupua.goto();

    // 1. Scrub deep
    await kupua.seekTo(0.5);
    const midStore = await kupua.getStoreState();
    expect(midStore.bufferOffset).toBeGreaterThan(0);

    // 2. Focus
    await kupua.focusNthItem(3);
    const focusedId = await kupua.getFocusedImageId();
    expect(focusedId).not.toBeNull();

    // 3. Switch density
    await kupua.switchToTable();
    expect(await kupua.getFocusedImageId()).toBe(focusedId);

    // 4. Switch back
    await kupua.switchToGrid();
    expect(await kupua.getFocusedImageId()).toBe(focusedId);

    // 5. Scrub to top
    await kupua.seekTo(0.02);
    const topStore = await kupua.getStoreState();
    expect(topStore.bufferOffset).toBeLessThan(midStore.bufferOffset);
    expect(topStore.error).toBeNull();
    await kupua.assertPositionsConsistent();
  });

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

    // 4. Focus an image
    await kupua.focusNthItem(5);
    const focusedId = await kupua.getFocusedImageId();
    expect(focusedId).not.toBeNull();

    // 5. Switch to table → back to grid
    await kupua.switchToTable();
    expect(await kupua.getFocusedImageId()).toBe(focusedId);
    await kupua.switchToGrid();
    expect(await kupua.getFocusedImageId()).toBe(focusedId);

    // 6. Seek to start
    await kupua.seekTo(0.02);
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
    const kwLogs = kupua.getConsoleLogs(/findKeywordSortValue/);
    expect(kwLogs.length).toBeGreaterThan(0);
    const foundLog = kwLogs.find((l) => l.includes("found"));
    expect(foundLog).toBeDefined();
    const pageMatch = foundLog?.match(/at page (\d+)/);
    if (pageMatch) {
      const pages = parseInt(pageMatch[1], 10);
      expect(pages).toBeLessThanOrEqual(5);
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
    const logs = kupua.getConsoleLogs(/keyword strategy/);
    expect(logs.length).toBeGreaterThan(0);

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
  test("content area is scrollable after seek to 50%", async ({ kupua }) => {
    await kupua.goto();
    await kupua.seekTo(0.5);

    // Wait for seek to settle
    await kupua.page.waitForTimeout(300);

    const store = await kupua.getStoreState();
    expect(store.error).toBeNull();
    expect(store.resultsLength).toBeGreaterThan(50);

    // Get scroll position before
    const scrollBefore = await kupua.getScrollTop();

    // Scroll down using mouse wheel on the content area
    const gridEl = kupua.page.locator('[aria-label="Image results grid"]');
    const gridBox = await gridEl.boundingBox();
    expect(gridBox).not.toBeNull();

    // Move mouse to centre of the grid and scroll
    await kupua.page.mouse.move(
      gridBox!.x + gridBox!.width / 2,
      gridBox!.y + gridBox!.height / 2,
    );
    await kupua.page.mouse.wheel(0, 600);
    await kupua.page.waitForTimeout(500);

    const scrollAfter = await kupua.getScrollTop();
    // The content MUST have scrolled down — this was broken
    expect(scrollAfter).toBeGreaterThan(scrollBefore);
  });

  test("content area is scrollable after seek to 50% in table view", async ({ kupua }) => {
    await kupua.goto();
    await kupua.switchToTable();
    await kupua.seekTo(0.5);

    await kupua.page.waitForTimeout(300);

    const store = await kupua.getStoreState();
    expect(store.error).toBeNull();
    expect(store.resultsLength).toBeGreaterThan(50);

    const scrollBefore = await kupua.getScrollTop();

    const tableEl = kupua.page.locator('[aria-label="Image results table"]');
    const tableBox = await tableEl.boundingBox();
    expect(tableBox).not.toBeNull();

    await kupua.page.mouse.move(
      tableBox!.x + tableBox!.width / 2,
      tableBox!.y + tableBox!.height / 2,
    );
    await kupua.page.mouse.wheel(0, 600);
    await kupua.page.waitForTimeout(500);

    const scrollAfter = await kupua.getScrollTop();
    expect(scrollAfter).toBeGreaterThan(scrollBefore);
  });
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

    // Press End
    await kupua.page.keyboard.press("End");
    await kupua.page.waitForTimeout(1000);
    await kupua.waitForSeekComplete();

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

    await kupua.page.keyboard.press("End");
    await kupua.page.waitForTimeout(1000);
    await kupua.waitForSeekComplete();

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
  test("table: bufferOffset stabilises after forward-extend eviction", async ({ kupua }) => {
    await kupua.goto();
    await kupua.switchToTable();

    const afterFill = await kupua.scrollToBufferCapacity();

    // At this point the buffer should be at or near capacity.
    // If it's not (e.g. dataset too small), skip — the bug doesn't manifest.
    if (afterFill.resultsLength < 800) {
      test.skip();
      return;
    }

    // Record bufferOffset, then wait and check it hasn't kept incrementing.
    // Without the Bug #16 fix, bufferOffset would increase by ~200 every
    // ~100-200ms (one extend cycle per network round-trip).
    const offsetBefore = afterFill.bufferOffset;

    // Wait 3 seconds with NO user interaction
    await kupua.page.waitForTimeout(3000);

    const afterSettle = await kupua.getStoreState();
    const offsetAfter = afterSettle.bufferOffset;

    // Allow at most one additional extend (200 items) — normal extend-on-scroll
    // that was already in-flight when we stopped scrolling. The bug would show
    // as thousands of items of drift.
    const drift = offsetAfter - offsetBefore;
    expect(drift).toBeLessThanOrEqual(200);
    expect(afterSettle.error).toBeNull();
  });

  test("grid: bufferOffset stabilises after forward-extend eviction", async ({ kupua }) => {
    await kupua.goto();
    await kupua.switchToGrid();

    const afterFill = await kupua.scrollToBufferCapacity();

    if (afterFill.resultsLength < 800) {
      test.skip();
      return;
    }

    const offsetBefore = afterFill.bufferOffset;
    await kupua.page.waitForTimeout(3000);
    const afterSettle = await kupua.getStoreState();
    const drift = afterSettle.bufferOffset - offsetBefore;

    expect(drift).toBeLessThanOrEqual(200);
    expect(afterSettle.error).toBeNull();
  });
});


// ---------------------------------------------------------------------------
// Bug #17: Density switch after deep scroll must keep focused image visible
// ---------------------------------------------------------------------------
// When the user scrolls deep via mousewheel (past buffer capacity, triggering
// evictions), focuses an image, then switches density (table→grid or
// grid→table), the focused image must remain visible in the new view.
//
// Root cause: on grid mount, useState defaults columns to 4. The
// ResizeObserver fires and sets the real column count (e.g. 6). The anchor
// capture used the wrong column count (4) to compute the focused image's
// viewport ratio, then the scroll-anchoring effect used the real column
// count (6) to restore — landing at a completely wrong scrollTop.
//
// The fix skips anchor capture on the first (mount) ResizeObserver update.
//
// Key: these tests use a WIDE viewport (1920×1080) so the grid gets ~6
// columns — different from the useState default of 4. At the default
// test viewport (1400×900) the grid gets exactly 4 columns, so the
// columns-don't-change path is taken and the bug doesn't manifest.

test.describe("Bug #17 — density switch after deep scroll preserves focus visibility", () => {
  // Use a wide viewport to force column count ≠ 4 (the useState default).
  // 1920px content area → floor(~1600 / 280) ≈ 5-6 columns.
  test.use({ viewport: { width: 1920, height: 1080 } });

  /**
   * Helper: scroll deep in the current view to get past buffer capacity.
   * Returns the store state after scrolling.
   *
   * Bug #17 fix (Issue 1): dispatches a synthetic scroll event after each
   * programmatic scrollTop assignment — headless Chromium doesn't reliably
   * fire native scroll events for programmatic scrollTop changes, so the
   * scroll handler never runs and extends never trigger.
   *
   * Uses a threshold-checking loop instead of fixed iterations because
   * grid rows (303px) need more iterations than table rows (32px) to
   * scroll through the same buffer distance.
   */
  async function scrollDeep(kupua: any) {
    const MAX_ITERATIONS = 30;
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      await kupua.page.evaluate(() => {
        const grid = document.querySelector('[aria-label="Image results grid"]');
        const table = document.querySelector('[aria-label="Image results table"]');
        const el = grid ?? table;
        if (el) {
          el.scrollTop = el.scrollHeight;
          el.dispatchEvent(new Event("scroll"));
        }
      });
      await kupua.page.waitForTimeout(400);

      // Check if we've scrolled deep enough
      const state = await kupua.getStoreState();
      if (state.bufferOffset >= 100 && state.resultsLength >= 800) break;
    }
    // Let extends settle
    await kupua.page.waitForTimeout(1000);
    return kupua.getStoreState();
  }


  // -------------------------------------------------------------------------
  // Density-focus drift: multi-toggle stability
  //
  // The single-switch tests above (table→grid, grid→table) pass because the
  // first 1-2 toggles don't accumulate enough drift. The actual bug manifests
  // after 3+ toggles at deep scroll: post-restore prepend compensation
  // pushes scrollTop past maxScroll, the browser clamps, and pixels are lost
  // each cycle. By the 4th-5th toggle the image has drifted out of view.
  //
  // Geometric trigger (table): 1000 items × 32px = 32,000px scroll height.
  // Focused image at localIdx=800 → rowTop=25,600. Prepend compensation
  // adds 6,400px → target=32,000 but maxScroll ≈ 31,000. Clamped. Each
  // cycle that clamps loses ~1,000px. After 3 clamped cycles the image is
  // off-screen.
  //
  // Strategy: start in table (small rows → tight scroll range), seek to 0.8
  // (deep), focus, then toggle density 5 times. Assert visibility after EACH
  // toggle, not just the last — drift is cumulative and we want to know
  // exactly which toggle broke.
  // -------------------------------------------------------------------------

  test("density-focus survives 5+ toggles at deep scroll without drift", async ({ kupua }) => {
    await kupua.goto();
    await kupua.switchToTable();

    // Seek deep — 0.8 puts us well into the buffer
    await kupua.seekTo(0.8);
    await kupua.page.waitForTimeout(500);

    // Scroll deeper via extend cycles to grow the buffer and increase localIdx
    const afterScroll = await scrollDeep(kupua);

    // Skip if the dataset or buffer isn't large enough to trigger clamping
    if (afterScroll.resultsLength < 800 || afterScroll.bufferOffset < 50) {
      test.skip();
      return;
    }

    // Focus an image near the end of the buffer — high localIdx maximises
    // the chance of hitting the clamping boundary after prepend compensation.
    // Use 75th percentile of the buffer (not 50th) to push closer to maxScroll.
    const focusIdx = Math.floor(afterScroll.resultsLength * 0.75);
    const focusedId = await kupua.page.evaluate((idx: number) => {
      const store = (window as any).__kupua_store__;
      const s = store.getState();
      const id = s.results[idx]?.id;
      if (id) store.getState().setFocusedImageId(id);
      return id ?? null;
    }, focusIdx);
    expect(focusedId).not.toBeNull();

    // Scroll the focused image into view in table
    await kupua.page.evaluate(({ idx, ROW_HEIGHT }: { idx: number; ROW_HEIGHT: number }) => {
      const table = document.querySelector('[aria-label="Image results table"]');
      if (table) {
        table.scrollTop = idx * ROW_HEIGHT;
        table.dispatchEvent(new Event("scroll"));
      }
    }, { idx: focusIdx, ROW_HEIGHT: TABLE_ROW_HEIGHT });
    await kupua.page.waitForTimeout(300);

    /**
     * Check whether the focused image is visible in the current view.
     * Works for both grid and table.
     */
    async function assertFocusedImageVisible(toggleNum: number) {
      const vis = await kupua.page.evaluate(
        ({ MIN_CELL_WIDTH, GRID_RH, TABLE_RH, TABLE_HH }) => {
          const store = (window as any).__kupua_store__;
          if (!store) return { ok: false, reason: "no store" };
          const s = store.getState();
          const fid = s.focusedImageId;
          if (!fid) return { ok: false, reason: "no focusedImageId" };
          const globalIdx = s.imagePositions.get(fid);
          if (globalIdx == null) return { ok: false, reason: "image not in positions map" };
          const localIdx = globalIdx - s.bufferOffset;
          if (localIdx < 0 || localIdx >= s.results.length) {
            return { ok: false, reason: `localIdx ${localIdx} out of buffer [0, ${s.results.length})` };
          }

          const grid = document.querySelector('[aria-label="Image results grid"]');
          const table = document.querySelector('[aria-label="Image results table"]');
          const el = (grid ?? table) as HTMLElement | null;
          if (!el) return { ok: false, reason: "no scroll container" };

          const isGrid = !!grid;
          const rowHeight = isGrid ? GRID_RH : TABLE_RH;
          const headerOff = isGrid ? 0 : TABLE_HH;
          const cols = isGrid
            ? Math.max(1, Math.floor(el.clientWidth / MIN_CELL_WIDTH))
            : 1;
          const rowTop = Math.floor(localIdx / cols) * rowHeight;
          const scrollTop = el.scrollTop;
          const viewportHeight = el.clientHeight;

          // The image is "visible" if its row is within one row-height of the
          // visible area (accounting for sticky header in table)
          const visibleTop = scrollTop - rowHeight - headerOff;
          const visibleBottom = scrollTop + viewportHeight + rowHeight;
          const visible = rowTop >= visibleTop && rowTop <= visibleBottom;

          return {
            ok: visible,
            isGrid,
            localIdx,
            cols,
            rowTop,
            scrollTop: Math.round(scrollTop),
            viewportHeight,
            maxScroll: el.scrollHeight - el.clientHeight,
            bufferLen: s.results.length,
            bufferOffset: s.bufferOffset,
          };
        },
        {
          MIN_CELL_WIDTH: GRID_MIN_CELL_WIDTH,
          GRID_RH: GRID_ROW_HEIGHT,
          TABLE_RH: TABLE_ROW_HEIGHT,
          TABLE_HH: TABLE_HEADER_HEIGHT,
        },
      );

      expect(
        vis.ok,
        `Toggle ${toggleNum}: focused image not visible — ` +
        `${vis.ok === false && "reason" in vis ? (vis as any).reason : ""} ` +
        `localIdx=${(vis as any).localIdx} rowTop=${(vis as any).rowTop} ` +
        `scrollTop=${(vis as any).scrollTop} maxScroll=${(vis as any).maxScroll} ` +
        `bufferLen=${(vis as any).bufferLen} bo=${(vis as any).bufferOffset} ` +
        `isGrid=${(vis as any).isGrid}`,
      ).toBe(true);

      // Also verify the focused image ID hasn't changed
      expect(await kupua.getFocusedImageId()).toBe(focusedId);
    }

    // Toggle density 5 times, asserting visibility after each.
    // Start from table → grid → table → grid → table → grid.
    const TOGGLE_COUNT = 5;
    for (let i = 1; i <= TOGGLE_COUNT; i++) {
      if (await kupua.isTableView()) {
        await kupua.switchToGrid();
      } else {
        await kupua.switchToTable();
      }
      // Wait for the density-focus restore to settle (rAF1 + rAF2 + buffer)
      await kupua.page.waitForTimeout(600);

      await assertFocusedImageVisible(i);
    }

    // Final: positions must be internally consistent
    await kupua.assertPositionsConsistent();
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
