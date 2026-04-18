/**
 * Focus preservation across search context changes.
 *
 * Verifies the "Never Lost" principle: when the user changes query/filters
 * while an image is focused, the focused image survives in the new results
 * (if it exists there) and the view scrolls to it.
 *
 * Run:
 *   npx playwright test e2e/local/focus-preservation.spec.ts
 *   npx playwright test e2e/local/focus-preservation.spec.ts --headed
 */

import { test, expect } from "../shared/helpers";

/**
 * Navigate within the SPA without a full page reload.
 * Uses history.pushState + popstate to trigger TanStack Router,
 * preserving Zustand state (including focusedImageId).
 */
async function spaNavigate(page: import("@playwright/test").Page, path: string) {
  await page.evaluate((p) => {
    window.history.pushState({}, "", p);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, path);
}

test.describe("Focus survives search context change", () => {
  test("focus preserved when query changes and image is in new results", async ({
    kupua,
  }) => {
    await kupua.goto();

    // Focus the 3rd image
    await kupua.focusNthItem(2);
    const focusedId = await kupua.getFocusedImageId();
    expect(focusedId).not.toBeNull();

    // Read the focused image's credit from the store so we can search for it
    const credit = await kupua.page.evaluate(() => {
      const store = (window as any).__kupua_store__;
      const s = store.getState();
      const idx = s.imagePositions.get(s.focusedImageId);
      if (idx == null) return null;
      const img = s.results[idx - s.bufferOffset];
      return img?.metadata?.credit ?? null;
    });
    expect(credit).not.toBeNull();

    // Change the query via SPA navigation — no full page reload
    await spaNavigate(
      kupua.page,
      `/search?nonFree=true&query=${encodeURIComponent(`credit:"${credit}"`)}`,
    );

    // Wait for sort-around-focus / focus-preservation to complete
    await kupua.waitForSortAroundFocus();

    // Focus should be preserved on the same image
    const focusAfter = await kupua.getFocusedImageId();
    expect(focusAfter).toBe(focusedId);

    // The image should be in the buffer
    const inBuffer = await kupua.page.evaluate((id) => {
      const store = (window as any).__kupua_store__;
      return store.getState().results.some((r: any) => r?.id === id);
    }, focusedId);
    expect(inBuffer).toBe(true);
  });

  test("focus cleared when query changes and image is NOT in new results", async ({
    kupua,
  }) => {
    await kupua.goto();

    // Focus the 3rd image
    await kupua.focusNthItem(2);
    const focusedId = await kupua.getFocusedImageId();
    expect(focusedId).not.toBeNull();

    // Search for a query that almost certainly excludes this image
    await spaNavigate(
      kupua.page,
      `/search?nonFree=true&query=${encodeURIComponent("xyzzy_no_match_42")}`,
    );

    // Wait for search to complete — the find-and-focus will fail, then
    // fallback first-page results are shown (which may be empty for
    // a nonsense query, or it falls back to showing what it can).
    await kupua.page.waitForFunction(
      () => {
        const store = (window as any).__kupua_store__;
        if (!store) return false;
        const s = store.getState();
        return s.sortAroundFocusStatus === null && !s.loading;
      },
      { timeout: 10_000 },
    );

    // Focus should be cleared
    const focusAfter = await kupua.getFocusedImageId();
    expect(focusAfter).toBeNull();
  });
});
