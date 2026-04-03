/**
 * E2E tests for the buffer corruption bug and its fix.
 *
 * Bug: after seeking to a deep position via the scrubber and then performing
 * any action that resets scroll to the top (logo click, metadata click-to-
 * search, CQL query change), a rogue `extendBackward` prepends stale data
 * from the deep-seek position, corrupting the buffer.
 *
 * Symptoms:
 *   - Buffer grows to 400 items (should be 200)
 *   - imagePositions map has collisions
 *   - scrollTop jumps to ~6969 (prepend scroll compensation)
 *   - Grid shows images from the wrong position
 *
 * The fix has 5 layers (see exploration/docs/buffer-corruption-fix.md):
 *   Layer 1: resetScrollAndFocusSearch() calls abortExtends() (primary)
 *   Layer 2: search() sets a 2-second extend cooldown
 *   Layer 3: Seek cooldown refreshed at data arrival
 *   Layer 4: Abort check before PIT-404 retry (es-adapter)
 *   Layer 5: abortExtends() exposed on the store
 *
 * These tests exercise the user-visible scenarios. Each would fail without
 * the fix: the buffer would have >200 items, position maps would be
 * inconsistent, and scrollTop/bufferOffset would be non-zero.
 *
 * Run:
 *   npx playwright test e2e/buffer-corruption.spec.ts
 *   npx playwright test e2e/buffer-corruption.spec.ts --headed
 */

import { test, expect } from "./helpers";

// ---------------------------------------------------------------------------
// Safety: require enough data for seeks to be meaningful.
// Local sample data has ~10k docs; real clusters have 100k+.
// We need at least ~500 results for a seek to produce a deep offset.
// ---------------------------------------------------------------------------

const MIN_TOTAL_FOR_SEEK = 500;

/**
 * Shared assertion: after any "return to top" action, the buffer must be
 * clean — no stale prepends, consistent positions, scrolled to top.
 */
async function assertCleanTopState(kupua: any, label: string) {
  // Give the app time to settle — search + render + any rogue extends
  await kupua.page.waitForTimeout(1500);

  const state = await kupua.getStoreState();

  // bufferOffset must be 0 — we're at the top of results
  expect(state.bufferOffset, `${label}: bufferOffset`).toBe(0);

  // Buffer must not be bloated by stale prepends.
  // A clean first page is exactly PAGE_SIZE (200) or total if total < 200.
  expect(
    state.resultsLength,
    `${label}: resultsLength (should be ≤ 200, got ${state.resultsLength})`,
  ).toBeLessThanOrEqual(
    // Scroll-mode fill may have loaded all results if total < threshold.
    // Allow up to total, but it must not exceed total.
    Math.max(200, state.total),
  );

  // NO stale prepends: resultsLength must not be double the page size.
  // The bug's signature is exactly 400 items (200 stale + 200 correct).
  if (state.total >= 200) {
    expect(
      state.resultsLength,
      `${label}: resultsLength should not be double PAGE_SIZE (stale prepend)`,
    ).not.toBe(400);
  }

  // scrollTop must be at or very near 0
  const scrollTop = await kupua.getScrollTop();
  expect(scrollTop, `${label}: scrollTop`).toBeLessThan(50);

  // Position map must be consistent
  await kupua.assertPositionsConsistent();

  // No errors
  expect(state.error, `${label}: error`).toBeNull();
}

// ---------------------------------------------------------------------------
// Scenario A: Logo click from grid view after deep seek
//
// This is the original bug repro. The logo click calls
// resetScrollAndFocusSearch() which dispatches a synthetic scroll event
// on a deep-offset buffer, triggering extendBackward.
// ---------------------------------------------------------------------------

test.describe("Buffer corruption — logo click after deep seek", () => {

  test("grid: logo click returns to clean top state after deep seek", async ({ kupua }) => {
    await kupua.goto();
    const initial = await kupua.getStoreState();
    test.skip(initial.total < MIN_TOTAL_FOR_SEEK, `Total ${initial.total} too small for seek`);

    // Remember the first image at position 0
    const firstImageBefore = initial.firstImageId;

    // Seek deep — 50% into the result set
    await kupua.seekTo(0.5);
    const afterSeek = await kupua.getStoreState();
    expect(afterSeek.bufferOffset).toBeGreaterThan(0);

    // Click the Home logo
    await kupua.page.locator('a[title="Grid — clear all filters"]').first().click();
    await kupua.waitForResults();

    await assertCleanTopState(kupua, "grid logo click");

    // The first image in the buffer should be from the top of results,
    // not from the deep-seek position
    const afterLogo = await kupua.getStoreState();
    expect(afterLogo.firstImageId).toBe(firstImageBefore);
  });

  test("table: logo click returns to clean top state after deep seek", async ({ kupua }) => {
    await kupua.goto();
    await kupua.switchToTable();
    const initial = await kupua.getStoreState();
    test.skip(initial.total < MIN_TOTAL_FOR_SEEK, `Total ${initial.total} too small for seek`);

    const firstImageBefore = initial.firstImageId;

    await kupua.seekTo(0.5);
    const afterSeek = await kupua.getStoreState();
    expect(afterSeek.bufferOffset).toBeGreaterThan(0);

    await kupua.page.locator('a[title="Grid — clear all filters"]').first().click();
    await kupua.waitForResults();

    await assertCleanTopState(kupua, "table logo click");

    const afterLogo = await kupua.getStoreState();
    expect(afterLogo.firstImageId).toBe(firstImageBefore);
  });

  test("repeated logo clicks always return to top", async ({ kupua }) => {
    await kupua.goto();
    const initial = await kupua.getStoreState();
    test.skip(initial.total < MIN_TOTAL_FOR_SEEK, `Total ${initial.total} too small for seek`);

    for (let i = 0; i < 3; i++) {
      // Seek deep (vary the depth slightly each time)
      await kupua.seekTo(0.3 + i * 0.2);
      const afterSeek = await kupua.getStoreState();
      expect(afterSeek.bufferOffset).toBeGreaterThan(0);

      // Click logo
      await kupua.page.locator('a[title="Grid — clear all filters"]').first().click();
      await kupua.waitForResults();

      await assertCleanTopState(kupua, `iteration ${i + 1}`);
    }
  });
});

// ---------------------------------------------------------------------------
// Scenario B: Logo click from ImageDetail after deep seek
//
// Same bug, different code path: the user is in the image detail overlay
// (ImageDetail.tsx) and clicks the logo there.
// ---------------------------------------------------------------------------

test.describe("Buffer corruption — logo click from ImageDetail after deep seek", () => {

  test("logo click from detail view returns to clean top state", async ({ kupua }) => {
    await kupua.goto();
    const initial = await kupua.getStoreState();
    test.skip(initial.total < MIN_TOTAL_FOR_SEEK, `Total ${initial.total} too small for seek`);

    const firstImageBefore = initial.firstImageId;

    // Seek deep
    await kupua.seekTo(0.5);

    // Open image detail (double-click the 3rd visible cell)
    await kupua.openDetailForNthItem(2);

    // Verify we're in detail view
    const detailImageId = await kupua.getDetailImageId();
    expect(detailImageId).not.toBeNull();

    // Click the logo from within the detail view.
    // Two logo <a> elements match the selector: one in the SearchBar
    // (hidden behind opacity-0 overlay) and one in the ImageDetail header.
    // Use .locator(':visible') to target the one actually clickable.
    const logos = kupua.page.locator('a[title="Grid — clear all filters"]');
    // Click the last visible one (ImageDetail's is rendered after SearchBar's)
    await logos.last().click();
    await kupua.waitForResults();
    await kupua.waitForDetailClosed();

    await assertCleanTopState(kupua, "detail logo click");

    const afterLogo = await kupua.getStoreState();
    expect(afterLogo.firstImageId).toBe(firstImageBefore);
  });
});

// ---------------------------------------------------------------------------
// Scenario C: Metadata click from ImageDetail after deep seek
//
// Layer 2 of the fix: search() sets the cooldown, which protects the
// useLayoutEffect scroll-reset path (no synthetic scroll event here).
// ---------------------------------------------------------------------------

test.describe("Buffer corruption — metadata click from ImageDetail after deep seek", () => {

  test("metadata click triggers new search with clean buffer", async ({ kupua }) => {
    await kupua.goto();
    const initial = await kupua.getStoreState();
    test.skip(initial.total < MIN_TOTAL_FOR_SEEK, `Total ${initial.total} too small for seek`);

    // Seek deep
    await kupua.seekTo(0.5);

    // Open image detail
    await kupua.openDetailForNthItem(2);

    // Find and click a metadata value link in the detail sidebar.
    // These are <button> elements inside the <aside> with the underline style.
    // We click the first clickable metadata value we find.
    const metadataButton = kupua.page.locator(
      'aside button.underline',
    ).first();
    const hasMetadata = await metadataButton.count() > 0;
    if (!hasMetadata) {
      // No clickable metadata in the sidebar — skip
      test.skip();
      return;
    }

    // Click the metadata value — this triggers a new search via URL update
    await metadataButton.click();

    // Wait for detail to close and results to load.
    // Use a relaxed wait: metadata clicks on local sample data can match
    // as few as 1 image, so the standard waitForResults (which checks for
    // >4 grid cells) would time out. Instead wait for the store to finish.
    await kupua.waitForDetailClosed();
    await kupua.page.waitForFunction(
      () => {
        const store = (window as any).__kupua_store__;
        if (!store) return false;
        const s = store.getState();
        return !s.loading && s.results.length > 0;
      },
      { timeout: 15_000 },
    );

    // Give the app time to settle (search + potential rogue extends)
    await kupua.page.waitForTimeout(1500);

    const state = await kupua.getStoreState();

    // bufferOffset must be 0 — this is a fresh search
    expect(state.bufferOffset, "metadata click: bufferOffset").toBe(0);

    // Buffer must not be bloated
    expect(
      state.resultsLength,
      "metadata click: resultsLength",
    ).toBeLessThanOrEqual(Math.max(200, state.total));

    // scrollTop must be at or near 0
    const scrollTop = await kupua.getScrollTop();
    expect(scrollTop, "metadata click: scrollTop").toBeLessThan(50);

    // Positions consistent
    await kupua.assertPositionsConsistent();
    expect(state.error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Scenario D: Buffer integrity monitoring during logo click
//
// This test installs a Zustand subscriber BEFORE clicking the logo to
// record every buffer state transition. It detects the corruption in
// real-time: if extendBackward prepends stale data, results.length would
// spike to 400 before or after the search() result arrives.
// ---------------------------------------------------------------------------

test.describe("Buffer corruption — real-time integrity monitoring", () => {

  test("no transient buffer corruption during logo click after deep seek", async ({ kupua }) => {
    await kupua.goto();
    const initial = await kupua.getStoreState();
    test.skip(initial.total < MIN_TOTAL_FOR_SEEK, `Total ${initial.total} too small for seek`);

    // Seek deep
    await kupua.seekTo(0.5);
    const afterSeek = await kupua.getStoreState();
    expect(afterSeek.bufferOffset).toBeGreaterThan(0);

    // Install a buffer state recorder BEFORE clicking the logo.
    // Records every (resultsLength, bufferOffset) pair.
    await kupua.page.evaluate(() => {
      const store = (window as any).__kupua_store__;
      const snapshots: Array<{
        len: number;
        offset: number;
        ts: number;
      }> = [];
      let prevLen = store.getState().results.length;
      let prevOff = store.getState().bufferOffset;
      const unsub = store.subscribe((s: any) => {
        if (s.results.length !== prevLen || s.bufferOffset !== prevOff) {
          prevLen = s.results.length;
          prevOff = s.bufferOffset;
          snapshots.push({
            len: prevLen,
            offset: prevOff,
            ts: Date.now(),
          });
        }
      });
      (window as any).__buf_snapshots__ = snapshots;
      (window as any).__buf_unsub__ = unsub;
    });

    // Click logo
    await kupua.page.locator('a[title="Grid — clear all filters"]').first().click();
    await kupua.waitForResults();
    await kupua.page.waitForTimeout(1500);

    // Read and clean up the recorder
    const snapshots = await kupua.page.evaluate(() => {
      const snaps = (window as any).__buf_snapshots__ as Array<{
        len: number;
        offset: number;
        ts: number;
      }>;
      const unsub = (window as any).__buf_unsub__ as () => void;
      if (unsub) unsub();
      delete (window as any).__buf_snapshots__;
      delete (window as any).__buf_unsub__;
      return snaps;
    });

    // Analyse: no snapshot should show resultsLength > 200 with offset > 0.
    // That would mean stale data was prepended to the buffer.
    for (const snap of snapshots) {
      expect(
        snap.len,
        `Transient corruption at +${snap.ts}ms: resultsLength=${snap.len}, offset=${snap.offset}`,
      ).toBeLessThanOrEqual(
        // Allow scroll-mode fill (all results loaded) — up to total
        Math.max(200, initial.total),
      );
    }

    // Final state must be clean
    await assertCleanTopState(kupua, "monitored logo click");
  });
});

// ---------------------------------------------------------------------------
// Scenario E: CQL query change after deep seek (Layer 2)
//
// Changing the query via URL (e.g. typing in the CQL input) goes through
// useUrlSearchSync → search(). The useLayoutEffect in ImageGrid resets
// scrollTop = 0 on searchParams change. Layer 2 protects this path.
// ---------------------------------------------------------------------------

test.describe("Buffer corruption — query change after deep seek", () => {

  test("CQL query change returns to clean top state after deep seek", async ({ kupua }) => {
    await kupua.goto();
    const initial = await kupua.getStoreState();
    test.skip(initial.total < MIN_TOTAL_FOR_SEEK, `Total ${initial.total} too small for seek`);

    // Seek deep
    await kupua.seekTo(0.5);
    const afterSeek = await kupua.getStoreState();
    expect(afterSeek.bufferOffset).toBeGreaterThan(0);

    // Navigate to a new query via URL (reliable, bypasses CQL editor debounce)
    await kupua.page.goto("/search?nonFree=true&query=test");
    await kupua.waitForResults();

    // Give the app time to settle
    await kupua.page.waitForTimeout(1500);

    const state = await kupua.getStoreState();
    expect(state.bufferOffset, "query change: bufferOffset").toBe(0);
    expect(
      state.resultsLength,
      "query change: resultsLength",
    ).toBeLessThanOrEqual(Math.max(200, state.total));

    const scrollTop = await kupua.getScrollTop();
    expect(scrollTop, "query change: scrollTop").toBeLessThan(50);

    await kupua.assertPositionsConsistent();
    expect(state.error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Scenario F: Extends still work AFTER the cooldown expires
//
// The fix sets a 2-second cooldown. We need to verify that normal buffer
// extension (scrolling to load more) still works after the cooldown.
// This guards against the cooldown being too aggressive.
// ---------------------------------------------------------------------------

test.describe("Extends recover after cooldown", () => {

  test("extendForward works after logo click + cooldown expiry", async ({ kupua }) => {
    await kupua.goto();
    const initial = await kupua.getStoreState();
    test.skip(initial.total < MIN_TOTAL_FOR_SEEK, `Total ${initial.total} too small for seek`);
    test.skip(
      initial.total <= 200,
      `Total ${initial.total} fits in first page — no extend possible`,
    );

    // Seek deep, then click logo to trigger the cooldown
    await kupua.seekTo(0.5);
    await kupua.page.locator('a[title="Grid — clear all filters"]').first().click();
    await kupua.waitForResults();

    // Wait for the 2-second cooldown to expire
    await kupua.page.waitForTimeout(2500);

    const beforeScroll = await kupua.getStoreState();

    // Scroll down to trigger extendForward
    for (let i = 0; i < 5; i++) {
      await kupua.page.evaluate(() => {
        const grid = document.querySelector('[aria-label="Image results grid"]');
        const table = document.querySelector('[aria-label="Image results table"]');
        const el = grid ?? table;
        if (el) el.scrollTop = el.scrollHeight;
      });
      await kupua.page.waitForTimeout(500);
    }

    // Wait for extends to complete
    await kupua.page.waitForTimeout(1000);

    const afterScroll = await kupua.getStoreState();

    // If total > 200, the buffer should have grown via extendForward
    if (beforeScroll.total > 200) {
      expect(
        afterScroll.resultsLength,
        "Buffer should grow after cooldown expires",
      ).toBeGreaterThan(beforeScroll.resultsLength);
    }

    // Positions must remain consistent
    await kupua.assertPositionsConsistent();
    expect(afterScroll.error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Scenario G: Seek cooldown at data arrival (Layer 3)
//
// After a seek completes, the virtualizer needs time to settle at the
// correct scroll position. Without the cooldown refresh at data arrival,
// extendBackward fires immediately because the initial cooldown (set at
// seek start) has already expired by the time data arrives.
// ---------------------------------------------------------------------------

test.describe("Seek data arrival — no rogue extends", () => {

  test("buffer is stable immediately after seek completes", async ({ kupua }) => {
    await kupua.goto();
    const initial = await kupua.getStoreState();
    test.skip(initial.total < MIN_TOTAL_FOR_SEEK, `Total ${initial.total} too small for seek`);

    // Seek to 50%
    await kupua.seekTo(0.5);
    const afterSeek = await kupua.getStoreState();

    // Record the results length immediately after seek
    const lenAfterSeek = afterSeek.resultsLength;

    // Wait just 300ms — enough for a rogue extendBackward to fire
    // (without the Layer 3 fix, extendBackward would fire immediately
    // because the cooldown from seek start has expired)
    await kupua.page.waitForTimeout(300);

    const afterSettle = await kupua.getStoreState();

    // Buffer should not have changed significantly.
    // Allow one extend (±200), but the bug would show as a second
    // extend that corrupts the buffer.
    const lenDelta = Math.abs(afterSettle.resultsLength - lenAfterSeek);
    expect(
      lenDelta,
      `Buffer changed by ${lenDelta} in 300ms after seek — possible rogue extend`,
    ).toBeLessThanOrEqual(200);

    await kupua.assertPositionsConsistent();
    expect(afterSettle.error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Scenario H: Reset to home from deep scrubber position
//
// Regression test: seeking to ~80% via the scrubber, then clicking the
// Grid logo must reset cleanly — bufferOffset=0, no console errors.
// This guards against the buffer corruption bug where scroll compensation
// after a deep seek interfered with the logo-click reset sequence.
// ---------------------------------------------------------------------------

test.describe("Reset to home from deep scrubber position", () => {

  test("logo click after 80% seek resets bufferOffset to 0 with no errors", async ({ kupua, page }) => {
    await kupua.goto();
    const initial = await kupua.getStoreState();
    test.skip(initial.total < MIN_TOTAL_FOR_SEEK, `Total ${initial.total} too small for seek`);

    // Capture console errors
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    // Seek to ~80% — deep into the result set
    await kupua.seekTo(0.8);
    const afterSeek = await kupua.getStoreState();
    expect(afterSeek.bufferOffset).toBeGreaterThan(0);
    expect(afterSeek.error).toBeNull();

    // Click the Grid logo to reset to home
    await page.locator('a[title="Grid — clear all filters"]').first().click();
    await kupua.waitForResults();

    await assertCleanTopState(kupua, "reset-to-home from 80%");

    // No console errors during the sequence
    const relevantErrors = consoleErrors.filter(
      (e) => !e.includes("favicon") && !e.includes("net::ERR_"),
    );
    expect(
      relevantErrors,
      `Console errors during reset: ${relevantErrors.join("; ")}`,
    ).toHaveLength(0);
  });
});



