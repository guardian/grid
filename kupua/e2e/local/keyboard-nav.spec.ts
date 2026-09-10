/**
 * Keyboard navigation tests.
 *
 * Verifies the two-mode keyboard navigation system:
 * - **No focus:** Arrow Up/Down, PageUp/Down, Home/End scroll results only —
 *   never set focus.
 * - **Has focus:** Same keys move focus, with Home/End also focusing first/last
 *   image.
 * - ArrowLeft/Right are trapped inside the search box.
 * - Row-aligned snapping for scroll operations.
 *
 * Run:
 *   npx playwright test e2e/local/keyboard-nav.spec.ts
 *   npx playwright test e2e/local/keyboard-nav.spec.ts --headed
 */

import { test, expect } from "../shared/helpers";
import { GRID_ROW_HEIGHT, TABLE_ROW_HEIGHT } from "@/constants/layout";

// Pin to explicit focus mode — keyboard nav tests validate focus-ring movement
// (ArrowDown moves focus, Home/End focus first/last) which is explicit-only.
test.beforeEach(async ({ kupua }) => {
  await kupua.ensureExplicitMode();
});

// ===========================================================================
// No-focus mode — scrolling only, never focusing
// ===========================================================================

test.describe("No-focus mode — scroll only", () => {
  test("ArrowDown scrolls by one row without setting focus (grid)", async ({ kupua }) => {
    await kupua.goto();

    // Ensure no focus is set
    const before = await kupua.getFocusedImageId();
    expect(before).toBeNull();

    const scrollBefore = await kupua.getScrollTop();

    await kupua.page.keyboard.press("ArrowDown");

    const scrollAfter = await kupua.getScrollTop();
    const focusAfter = await kupua.getFocusedImageId();

    // Should have scrolled by one grid row
    expect(scrollAfter - scrollBefore).toBe(GRID_ROW_HEIGHT);
    // Should NOT have set focus
    expect(focusAfter).toBeNull();
  });


  test("PageDown scrolls by one page without setting focus (grid)", async ({ kupua }) => {
    await kupua.goto();

    const scrollBefore = await kupua.getScrollTop();
    expect(scrollBefore).toBe(0);

    await kupua.pageDown();

    const scrollAfter = await kupua.getScrollTop();
    const focusAfter = await kupua.getFocusedImageId();

    // Should have scrolled by multiple rows (at least one page)
    expect(scrollAfter).toBeGreaterThan(0);
    // Should be row-aligned
    expect(scrollAfter % GRID_ROW_HEIGHT).toBe(0);
    // Should NOT have set focus
    expect(focusAfter).toBeNull();
  });

  test("Home scrolls to top without setting focus", async ({ kupua }) => {
    await kupua.goto();

    // Scroll down first
    await kupua.pageDown();
    await kupua.pageDown();
    expect(await kupua.getScrollTop()).toBeGreaterThan(0);

    await kupua.page.keyboard.press("Home");
  await expect.poll(() => kupua.getScrollTop()).toBe(0);
    expect(await kupua.getFocusedImageId()).toBeNull();
  });

  test("End scrolls to bottom without setting focus", async ({ kupua }) => {
    await kupua.goto();

    const genBefore = (await kupua.getStoreState()).seekGeneration;
    await kupua.page.keyboard.press("End");
    await kupua.waitForSeekGenerationBump(genBefore);

    const store = await kupua.getStoreState();
    expect(store.error).toBeNull();
    expect(store.bufferOffset + store.resultsLength).toBeGreaterThanOrEqual(store.total - 1);
    const scrollTop = await kupua.getScrollTop();
    expect(scrollTop).toBeGreaterThan(0);
    expect(await kupua.getFocusedImageId()).toBeNull();
  });

});

// ===========================================================================
// No-focus mode — table view
// ===========================================================================

test.describe("No-focus mode — table view", () => {
  test("ArrowDown scrolls by one row without setting focus (table)", async ({ kupua }) => {
    await kupua.goto();
    await kupua.switchToTable();

    // Ensure no focus
    expect(await kupua.getFocusedImageId()).toBeNull();

    const scrollBefore = await kupua.getScrollTop();
    await kupua.page.keyboard.press("ArrowDown");

    const scrollAfter = await kupua.getScrollTop();
    expect(scrollAfter - scrollBefore).toBe(TABLE_ROW_HEIGHT);
    expect(await kupua.getFocusedImageId()).toBeNull();
  });
});

// ===========================================================================
// Focus mode — arrow keys move focus
// ===========================================================================

test.describe("Focus mode — arrow keys", () => {
  test("ArrowDown then ArrowUp restores the exact focused image (grid)", async ({ kupua }) => {
    await kupua.goto();

    await kupua.focusNthItem(0);
    const firstFocused = await kupua.getFocusedImageId();
    expect(firstFocused).not.toBeNull();

    await kupua.page.keyboard.press("ArrowDown");

    const secondFocused = await kupua.getFocusedImageId();
    expect(secondFocused).not.toBeNull();
    expect(secondFocused).not.toBe(firstFocused);

    await kupua.page.keyboard.press("ArrowUp");

    expect(await kupua.getFocusedImageId()).toBe(firstFocused);
  });

  test("ArrowLeft/Right move focus within row (grid)", async ({ kupua }) => {
    await kupua.goto();

    // Focus first item
    await kupua.focusNthItem(0);
    const firstFocused = await kupua.getFocusedImageId();

    // ArrowRight should move to next cell
    await kupua.page.keyboard.press("ArrowRight");

    const afterRight = await kupua.getFocusedImageId();
    expect(afterRight).not.toBeNull();
    expect(afterRight).not.toBe(firstFocused);

    // ArrowLeft should move back
    await kupua.page.keyboard.press("ArrowLeft");

    const afterLeft = await kupua.getFocusedImageId();
    expect(afterLeft).toBe(firstFocused);
  });
});

// ===========================================================================
// Focus mode — Home/End focus first/last image
// ===========================================================================

test.describe("Focus mode — Home/End", () => {
  test("Home scrolls to top AND focuses first image when focus exists", async ({ kupua }) => {
    await kupua.goto();

    // Scroll down and set focus
    await kupua.pageDown();
    await kupua.focusNthItem(2);
    expect(await kupua.getFocusedImageId()).not.toBeNull();

    await kupua.page.keyboard.press("Home");
  await expect.poll(() => kupua.getScrollTop()).toBe(0);
    // Should focus the first image
    const focusedId = await kupua.getFocusedImageId();
    expect(focusedId).not.toBeNull();
    // Verify it's the first image in the buffer
    const firstImageId = await kupua.page.evaluate(() => {
      const store = (window as any).__kupua_store__;
      return store?.getState().results[0]?.id ?? null;
    });
    expect(focusedId).toBe(firstImageId);
  });

  test("Home after deep seek focuses first image (seek path)", async ({ kupua }) => {
    await kupua.goto();

    // Seek deep so buffer is windowed
    await kupua.seekTo(0.5);

    // Set focus via the store directly — in two-tier mode, the viewport
    // may show skeletons at the seek position while the virtualizer catches
    // up, so DOM-clicking cursor-pointer elements can time out. Setting
    // focus via the store is reliable and tests the same Home key logic.
    const focusedId = await kupua.page.evaluate(() => {
      const store = (window as any).__kupua_store__;
      if (!store) return null;
      const s = store.getState();
      // Pick a real image from the buffer
      const img = s.results[0];
      if (img) {
        s.setFocusedImageId(img.id);
        return img.id;
      }
      return null;
    });
    expect(focusedId).not.toBeNull();

    // Press Home — triggers seek(0) because bufferOffset > 0
    // Capture seekGeneration for two-tier-aware wait
    const genBefore = (await kupua.getStoreState()).seekGeneration;
    await kupua.page.keyboard.press("Home");
    await kupua.waitForSeekGenerationBump(genBefore);

    // After seek completes, buffer should be at start
    const store = await kupua.getStoreState();
    expect(store.bufferOffset).toBe(0);
    expect(store.error).toBeNull();
    await expect.poll(() => kupua.getScrollTop()).toBe(0);

    // Focus should be on the first image in the new buffer
    const firstImageId = await kupua.page.evaluate(() => {
      const s = (window as any).__kupua_store__.getState();
      return s.results[0]?.id ?? null;
    });
    await expect.poll(() => kupua.getFocusedImageId()).toBe(firstImageId);
  });

  test("End scrolls to bottom AND focuses last image when focus exists", async ({ kupua }) => {
    await kupua.goto();

    // Set focus
    await kupua.focusNthItem(0);
    expect(await kupua.getFocusedImageId()).not.toBeNull();

    // Capture seekGeneration before End (two-tier-aware wait)
    const genBefore = (await kupua.getStoreState()).seekGeneration;
    await kupua.page.keyboard.press("End");

    // Wait for seek to complete (two-tier aware).
    await kupua.waitForSeekGenerationBump(genBefore);
    const store = await kupua.getStoreState();
    expect(store.error).toBeNull();
    // The buffer should now be near the end of the dataset
    expect(store.bufferOffset + store.resultsLength).toBeGreaterThanOrEqual(store.total - 10);

    // Post-seek focus: the focused image should be the last image in the buffer
    const lastImageId = await kupua.page.evaluate(() => {
      const s = (window as any).__kupua_store__.getState();
      return s.results[s.results.length - 1]?.id ?? null;
    });
    await expect.poll(() => kupua.getFocusedImageId()).toBe(lastImageId);
    await expect.poll(() => kupua.getScrollTop()).toBeGreaterThan(0);
  });
});

// ===========================================================================
// Search box key trapping
// ===========================================================================

test.describe("Search box key trapping", () => {
  test("ArrowLeft/Right are trapped in search box — don't move grid focus", async ({ kupua }) => {
    await kupua.goto();

    // The search box has autofocus. Press ArrowRight — should NOT focus
    // any image (it should stay in the search box for cursor movement).
    await kupua.page.keyboard.press("ArrowRight");
    expect(await kupua.getFocusedImageId()).toBeNull();

    await kupua.page.keyboard.press("ArrowLeft");
    expect(await kupua.getFocusedImageId()).toBeNull();
  });

});

// ===========================================================================
// Row alignment — snapping
// ===========================================================================

test.describe("Row alignment", () => {
  test("PageDown from non-aligned position snaps to row boundary (grid)", async ({ kupua }) => {
    await kupua.goto();

    // Scroll by a non-row-aligned amount manually
    await kupua.scrollBy(150); // 150px, not a multiple of GRID_ROW_HEIGHT (303)
    const scrollBefore = await kupua.getScrollTop();
    expect(scrollBefore % GRID_ROW_HEIGHT).not.toBe(0);

    await kupua.pageDown();

    const scrollAfter = await kupua.getScrollTop();
    // After PageDown, should be row-aligned
    expect(scrollAfter % GRID_ROW_HEIGHT).toBe(0);
    expect(scrollAfter).toBeGreaterThan(scrollBefore);
  });

});




