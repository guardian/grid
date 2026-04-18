/**
 * Browser back/forward navigation tests.
 *
 * Verifies that:
 * 1. User-initiated search changes (filter toggle, query) push history entries.
 * 2. Browser back restores the previous search context.
 * 3. Browser forward re-applies the search context.
 * 4. Focus is NOT carried across search context changes on back/forward
 *    (popstate skips focus-preservation to avoid landing at a random position).
 * 5. Closing image detail via browser back preserves the focused image
 *    (only display-only keys changed — search context is the same).
 *
 * Run:
 *   npx playwright test e2e/local/browser-history.spec.ts
 *   npx playwright test e2e/local/browser-history.spec.ts --headed
 */

import { test, expect } from "../shared/helpers";

/**
 * Navigate via TanStack Router (user-initiated, NOT popstate).
 * This creates a history entry (push) because the router uses pushState.
 */
async function spaNavigate(page: import("@playwright/test").Page, path: string) {
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

/** Wait for search results to load after a navigation. */
async function waitForSearchSettled(page: import("@playwright/test").Page) {
  await page.waitForFunction(
    () => {
      const store = (window as any).__kupua_store__;
      if (!store) return false;
      const s = store.getState();
      return s.sortAroundFocusStatus === null && !s.loading && s.results.length > 0;
    },
    { timeout: 15_000 },
  );
}

/** Get the current query param from the URL. */
async function getUrlQuery(page: import("@playwright/test").Page): Promise<string | null> {
  return page.evaluate(() => new URL(window.location.href).searchParams.get("query"));
}

/** Get the current orderBy param from the URL. */
async function getUrlOrderBy(page: import("@playwright/test").Page): Promise<string | null> {
  return page.evaluate(() => new URL(window.location.href).searchParams.get("orderBy"));
}

test.describe("Browser back/forward — search context changes", () => {
  test("back restores previous search after sort change", async ({ kupua }) => {
    await kupua.goto();

    // Initial state: default sort (no orderBy in URL or -uploadTime)
    expect(await getUrlOrderBy(kupua.page)).toBeNull();

    // Change sort via SPA navigation (pushes history entry)
    await spaNavigate(kupua.page, "/search?nonFree=true&orderBy=oldest");
    await waitForSearchSettled(kupua.page);

    expect(await getUrlOrderBy(kupua.page)).toBe("oldest");

    // Press browser back
    await kupua.page.goBack();
    await waitForSearchSettled(kupua.page);

    // Should be back to default sort
    expect(await getUrlOrderBy(kupua.page)).toBeNull();

    // Buffer should be at offset 0 (reset to top)
    const state = await kupua.getStoreState();
    expect(state.bufferOffset).toBe(0);
    expect(state.resultsLength).toBeGreaterThan(0);
  });

  test("back restores previous search after query change", async ({ kupua }) => {
    await kupua.goto();

    const initialFirstImage = await kupua.getFirstVisibleImageId();
    expect(initialFirstImage).not.toBeNull();

    // Navigate to a query that narrows results
    await spaNavigate(
      kupua.page,
      `/search?nonFree=true&query=${encodeURIComponent("credit:PA")}`,
    );
    await waitForSearchSettled(kupua.page);

    expect(await getUrlQuery(kupua.page)).toBe("credit:PA");

    // Press browser back
    await kupua.page.goBack();
    await waitForSearchSettled(kupua.page);

    // Should be back to no query
    expect(await getUrlQuery(kupua.page)).toBeNull();

    // Buffer should be at offset 0 (reset to top, not carried over)
    const state = await kupua.getStoreState();
    expect(state.bufferOffset).toBe(0);
    expect(state.resultsLength).toBeGreaterThan(0);
  });

  test("forward re-applies search after back", async ({ kupua }) => {
    await kupua.goto();

    // Navigate to a sort change
    await spaNavigate(kupua.page, "/search?nonFree=true&orderBy=oldest");
    await waitForSearchSettled(kupua.page);
    expect(await getUrlOrderBy(kupua.page)).toBe("oldest");

    // Back
    await kupua.page.goBack();
    await waitForSearchSettled(kupua.page);
    expect(await getUrlOrderBy(kupua.page)).toBeNull();

    // Forward
    await kupua.page.goForward();
    await waitForSearchSettled(kupua.page);
    expect(await getUrlOrderBy(kupua.page)).toBe("oldest");
  });

  test("focus is NOT carried into old search context on back", async ({ kupua }) => {
    await kupua.goto();

    // Focus the 3rd image
    await kupua.focusNthItem(2);
    const focusedId = await kupua.getFocusedImageId();
    expect(focusedId).not.toBeNull();

    // Navigate to a different sort (pushes history entry)
    await spaNavigate(kupua.page, "/search?nonFree=true&orderBy=oldest");
    await waitForSearchSettled(kupua.page);

    // Press back — should NOT carry the focused image into old results
    await kupua.page.goBack();
    await waitForSearchSettled(kupua.page);

    // Scroll position should be at the top (bufferOffset = 0)
    const state = await kupua.getStoreState();
    expect(state.bufferOffset).toBe(0);
  });
});

test.describe("Browser back/forward — image detail", () => {
  test("back from image detail preserves focused image", async ({ kupua }) => {
    await kupua.goto();

    // Focus the 3rd image and open it in detail view
    await kupua.focusNthItem(2);
    const focusedId = await kupua.getFocusedImageId();
    expect(focusedId).not.toBeNull();

    // Double-click to open detail (this pushes a history entry — no replace)
    if (await kupua.isGridView()) {
      const cells = kupua.page.locator(
        '[aria-label="Image results grid"] [class*="cursor-pointer"]'
      );
      await cells.nth(2).dblclick();
    } else {
      const rows = kupua.page.locator(
        '[aria-label="Image results table"] [role="row"][class*="cursor-pointer"]'
      );
      await rows.nth(2).dblclick();
    }

    // Wait for image detail to appear
    await kupua.page.waitForFunction(
      () => new URL(window.location.href).searchParams.has("image"),
      { timeout: 5000 },
    );

    // Press browser back — should close detail, NOT navigate away
    await kupua.page.goBack();
    await kupua.page.waitForFunction(
      () => !new URL(window.location.href).searchParams.has("image"),
      { timeout: 5000 },
    );

    // Focus should be preserved (same image that was focused before detail)
    const focusAfterBack = await kupua.getFocusedImageId();
    expect(focusAfterBack).toBe(focusedId);
  });
});
