/**
 * Diagnostic tests for Home logo regressions.
 *
 * Bug 1: Scrubber thumb stays at old position after Home logo click
 *         (no search query — default ?nonFree=true on TEST).
 * Bug 2: Grid position wrong after Home from image detail (without query).
 *
 * Run with: cd kupua && npx playwright test --config playwright.smoke.config.ts e2e/smoke/home-logo-diag.spec.ts
 * Requires start.sh --use-TEST running.
 */

import { test, expect } from "../shared/helpers";

// ---------------------------------------------------------------------------
// Bug 1: Scrubber thumb stays at old position after Home logo click
// ---------------------------------------------------------------------------

test.describe("Bug 1 — scrubber thumb after Home logo", () => {

  test("grid: thumb resets after Home from deep seek (no query)", async ({ kupua }) => {
    await kupua.page.goto("/search?nonFree=true");
    await kupua.waitForResults();

    // Seek to ~50%
    await kupua.seekTo(0.5);
    const deepThumb = await kupua.getScrubberThumbTop();
    const deepScroll = await kupua.getScrollTop();
    const deepState = await kupua.getStoreState();
    console.log(`[DIAG] After seek: thumbTop=${deepThumb}, scrollTop=${deepScroll}, bufferOffset=${deepState.bufferOffset}`);
    expect(deepThumb, "sanity: thumb should be deep").toBeGreaterThan(50);

    // Click Home logo
    await kupua.page.locator('a[title="Grid — clear all filters"]').first().click();
    await kupua.waitForResults();
    await kupua.page.waitForTimeout(2000); // generous settle

    const afterScroll = await kupua.getScrollTop();
    const afterState = await kupua.getStoreState();
    const afterThumb = await kupua.getScrubberThumbTop();
    console.log(`[DIAG] After Home: thumbTop=${afterThumb}, scrollTop=${afterScroll}, bufferOffset=${afterState.bufferOffset}`);

    expect(afterState.bufferOffset, "bufferOffset should be 0").toBe(0);
    expect(afterScroll, "scrollTop should be near 0").toBeLessThan(50);
    expect(afterThumb, "REGRESSION: scrubber thumb should be near top").toBeLessThan(10);
  });

  test("table: thumb resets after Home from deep seek (no query)", async ({ kupua }) => {
    await kupua.page.goto("/search?nonFree=true&density=table");
    await kupua.waitForResults();

    await kupua.seekTo(0.5);
    const deepThumb = await kupua.getScrubberThumbTop();
    console.log(`[DIAG] After seek: thumbTop=${deepThumb}`);
    expect(deepThumb, "sanity: thumb should be deep").toBeGreaterThan(50);

    // Home logo (switches to grid, but scrubber should reset)
    await kupua.page.locator('a[title="Grid — clear all filters"]').first().click();
    await kupua.waitForResults();
    await kupua.page.waitForTimeout(2000);

    const afterScroll = await kupua.getScrollTop();
    const afterState = await kupua.getStoreState();
    const afterThumb = await kupua.getScrubberThumbTop();
    console.log(`[DIAG] After Home: thumbTop=${afterThumb}, scrollTop=${afterScroll}, bufferOffset=${afterState.bufferOffset}`);

    expect(afterState.bufferOffset, "bufferOffset should be 0").toBe(0);
    expect(afterScroll, "scrollTop should be near 0").toBeLessThan(50);
    expect(afterThumb, "REGRESSION: scrubber thumb should be near top").toBeLessThan(10);
  });
});

// ---------------------------------------------------------------------------
// Bug 2: Grid position wrong after Home from image detail
// ---------------------------------------------------------------------------

test.describe("Bug 2 — Home from image detail", () => {

  test("grid: Home from detail after deep seek returns to top (no query)", async ({ kupua }) => {
    await kupua.page.goto("/search?nonFree=true");
    await kupua.waitForResults();
    const initial = await kupua.getStoreState();
    const firstImageBefore = initial.firstImageId;

    // Seek deep
    await kupua.seekTo(0.5);
    const deepState = await kupua.getStoreState();
    console.log(`[DIAG] After seek: bufferOffset=${deepState.bufferOffset}`);

    // Open detail via REAL double-click (not programmatic navigation)
    // — this is how the user actually enters detail view
    await kupua.page.waitForTimeout(1000); // let seek settle
    const cells = kupua.page.locator('[aria-label="Image results grid"] [class*="cursor-pointer"]');
    const cellCount = await cells.count();
    expect(cellCount).toBeGreaterThan(2);
    await cells.nth(2).dblclick();
    await kupua.page.waitForFunction(
      () => new URL(window.location.href).searchParams.has("image"),
      { timeout: 5000 },
    );
    await kupua.page.waitForTimeout(500);

    // Capture state during detail view
    const duringState = await kupua.getStoreState();
    const duringScroll = await kupua.getScrollTop();
    console.log(`[DIAG] During detail: scrollTop=${duringScroll}, bufferOffset=${duringState.bufferOffset}, focused=${duringState.focusedImageId}`);

    // Click Home logo from detail — then poll scrollTop to SEE the scroll-back
    const logos = kupua.page.locator('a[title="Grid — clear all filters"]');

    // Start polling scrollTop + store state every 100ms for 5 seconds
    const pollHandle = await kupua.page.evaluateHandle(() => {
      const log: string[] = [];
      const el = document.querySelector('[aria-label="Image results grid"]')?.parentElement;
      const iv = setInterval(() => {
        const s = (window as any).__kupua_store__?.getState();
        const scroll = el?.scrollTop ?? -1;
        const focused = s?.focusedImageId ?? "null";
        const bo = s?.bufferOffset ?? -1;
        const safGen = s?.sortAroundFocusGeneration ?? -1;
        const phantom = s?._phantomFocusImageId ?? "null";
        const loading = s?.loading ?? false;
        const safStatus = s?.sortAroundFocusStatus ?? "null";
        const resLen = s?.results?.length ?? -1;
        const url = window.location.search;
        log.push(`t=${log.length * 100}ms scroll=${Math.round(scroll)} bo=${bo} focused=${focused} phantom=${phantom} safGen=${safGen} loading=${loading} safStatus=${safStatus} resLen=${resLen} url=${url}`);
      }, 100);
      (window as any).__scrollPoll = { log, iv };
      return (window as any).__scrollPoll;
    });

    await logos.last().click();
    await kupua.waitForResults();
    await kupua.waitForDetailClosed();
    await kupua.page.waitForTimeout(4000);

    // Stop polling and collect
    const pollLog = await kupua.page.evaluate(() => {
      const poll = (window as any).__scrollPoll;
      if (poll) clearInterval(poll.iv);
      return poll?.log ?? [];
    });
    console.log(`[DIAG] === Scroll poll after Home click (${pollLog.length} samples) ===`);
    for (const line of pollLog) {
      console.log(`[DIAG]   ${line}`);
    }

    const afterState = await kupua.getStoreState();
    const afterScroll = await kupua.getScrollTop();
    const afterThumb = await kupua.getScrubberThumbTop();
    console.log(`[DIAG] After Home from detail: scrollTop=${afterScroll}, bufferOffset=${afterState.bufferOffset}, thumb=${afterThumb}, firstImage=${afterState.firstImageId}, focused=${afterState.focusedImageId}`);

    expect(afterState.bufferOffset, "bufferOffset should be 0").toBe(0);
    expect(afterScroll, "REGRESSION: scrollTop should be near 0").toBeLessThan(50);
    expect(afterThumb, "scrubber thumb should be near top").toBeLessThan(10);
    expect(afterState.firstImageId, "first image should match original").toBe(firstImageBefore);
  });

  test("grid: Home from shallow detail returns to top (no query)", async ({ kupua }) => {
    await kupua.page.goto("/search?nonFree=true");
    await kupua.waitForResults();
    const initial = await kupua.getStoreState();
    const firstImageBefore = initial.firstImageId;

    // Scroll a bit (no seek), then open detail
    await kupua.scrollBy(1500);
    await kupua.page.waitForTimeout(500);
    const scrollBefore = await kupua.getScrollTop();
    console.log(`[DIAG] Before detail: scrollTop=${scrollBefore}`);

    // Open detail for a visible item
    const imageId = await kupua.openDetailForNthItem(3);
    console.log(`[DIAG] Opened detail for: ${imageId}`);
    await kupua.page.waitForTimeout(500);

    // Click Home logo from detail
    const logos = kupua.page.locator('a[title="Grid — clear all filters"]');
    await logos.last().click();
    await kupua.waitForResults();
    await kupua.waitForDetailClosed();
    await kupua.page.waitForTimeout(2000);

    const afterState = await kupua.getStoreState();
    const afterScroll = await kupua.getScrollTop();
    const afterThumb = await kupua.getScrubberThumbTop();
    console.log(`[DIAG] After Home from detail: scrollTop=${afterScroll}, bufferOffset=${afterState.bufferOffset}, thumb=${afterThumb}, focused=${afterState.focusedImageId}`);

    expect(afterState.bufferOffset, "bufferOffset should be 0").toBe(0);
    expect(afterScroll, "REGRESSION: scrollTop should be near 0").toBeLessThan(50);
    expect(afterThumb, "scrubber thumb should be near top").toBeLessThan(10);
  });
});
