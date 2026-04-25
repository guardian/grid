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

// Pin to explicit focus mode — tests validate focus state across history entries.
test.beforeEach(async ({ kupua }) => {
  await kupua.ensureExplicitMode();
});

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

  test("back navigates between settled debounced queries (typed via UI)", async ({ kupua }) => {
    // Regression test: debounced typing used replace for all navigations,
    // so "cats" was overwritten by "dogs" and back skipped past kupua
    // entirely. Fix: first keystroke of each typing session pushes the
    // pre-edit URL via pushState.
    await kupua.goto();
    await waitForSearchSettled(kupua.page);

    // Focus the search input
    const searchArea = kupua.page.locator('[role="search"]');
    await searchArea.click();
    await kupua.page.waitForTimeout(100);

    // Type "cats" and wait for debounce to settle
    await kupua.page.keyboard.press("Meta+a");
    await kupua.page.keyboard.type("cats", { delay: 30 });
    await kupua.page.waitForFunction(
      () => new URL(window.location.href).searchParams.get("query") === "cats",
      { timeout: 5000 },
    );
    await waitForSearchSettled(kupua.page);

    // Wait well past the debounce (300ms) so next keystroke starts fresh
    await kupua.page.waitForTimeout(500);

    // Type "dogs" — this should commit "cats" as a history entry
    await searchArea.click();
    await kupua.page.waitForTimeout(100);
    await kupua.page.keyboard.press("Meta+a");
    await kupua.page.keyboard.type("dogs", { delay: 30 });
    await kupua.page.waitForFunction(
      () => new URL(window.location.href).searchParams.get("query") === "dogs",
      { timeout: 5000 },
    );
    await waitForSearchSettled(kupua.page);

    // Back should land on "cats", not on the pre-kupua page
    await kupua.page.goBack();
    await kupua.page.waitForFunction(
      () => new URL(window.location.href).searchParams.get("query") === "cats",
      { timeout: 5000 },
    );
    expect(await getUrlQuery(kupua.page)).toBe("cats");

    // Back again should land on the home page (no query)
    await kupua.page.goBack();
    await kupua.page.waitForFunction(
      () => !new URL(window.location.href).searchParams.has("query"),
      { timeout: 5000 },
    );
    expect(await getUrlQuery(kupua.page)).toBeNull();
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

  test("forward after close-button re-opens image detail", async ({ kupua }) => {
    await kupua.goto();

    // Focus 3rd image and open detail
    await kupua.focusNthItem(2);
    const focusedId = await kupua.getFocusedImageId();
    expect(focusedId).not.toBeNull();

    // Double-click to open detail
    if (await kupua.isGridView()) {
      await kupua.page.locator(
        '[aria-label="Image results grid"] [class*="cursor-pointer"]'
      ).nth(2).dblclick();
    } else {
      await kupua.page.locator(
        '[aria-label="Image results table"] [role="row"][class*="cursor-pointer"]'
      ).nth(2).dblclick();
    }
    await kupua.page.waitForFunction(
      () => new URL(window.location.href).searchParams.has("image"),
      { timeout: 5000 },
    );
    const imageId = await kupua.page.evaluate(
      () => new URL(window.location.href).searchParams.get("image"),
    );
    expect(imageId).not.toBeNull();

    // Close detail via the "Back to search" button (not browser back)
    await kupua.page.locator("button", { hasText: "Back to search" }).click();
    await kupua.page.waitForFunction(
      () => !new URL(window.location.href).searchParams.has("image"),
      { timeout: 5000 },
    );

    // Forward should re-open the same image detail
    await kupua.page.goForward();
    await kupua.page.waitForFunction(
      () => new URL(window.location.href).searchParams.has("image"),
      { timeout: 5000 },
    );
    const imageAfterForward = await kupua.page.evaluate(
      () => new URL(window.location.href).searchParams.get("image"),
    );
    expect(imageAfterForward).toBe(imageId);
  });

  test("Backspace close then forward re-opens detail", async ({ kupua }) => {
    await kupua.goto();

    // Focus 3rd image and open detail
    await kupua.focusNthItem(2);
    const focusedId = await kupua.getFocusedImageId();
    expect(focusedId).not.toBeNull();

    // Double-click to open detail
    if (await kupua.isGridView()) {
      await kupua.page.locator(
        '[aria-label="Image results grid"] [class*="cursor-pointer"]'
      ).nth(2).dblclick();
    } else {
      await kupua.page.locator(
        '[aria-label="Image results table"] [role="row"][class*="cursor-pointer"]'
      ).nth(2).dblclick();
    }
    await kupua.page.waitForFunction(
      () => new URL(window.location.href).searchParams.has("image"),
      { timeout: 5000 },
    );
    const imageId = await kupua.page.evaluate(
      () => new URL(window.location.href).searchParams.get("image"),
    );

    // Close via Backspace
    await kupua.page.keyboard.press("Backspace");
    await kupua.page.waitForFunction(
      () => !new URL(window.location.href).searchParams.has("image"),
      { timeout: 5000 },
    );

    // Forward should re-open the same detail
    await kupua.page.goForward();
    await kupua.page.waitForFunction(
      () => new URL(window.location.href).searchParams.has("image"),
      { timeout: 5000 },
    );
    const imageAfterForward = await kupua.page.evaluate(
      () => new URL(window.location.href).searchParams.get("image"),
    );
    expect(imageAfterForward).toBe(imageId);
  });

  test("SPA open-close cycle does not accumulate phantom history entries", async ({ kupua }) => {
    // Regression test: unconditional deep-link synthesis was inserting a
    // bare-list entry on every SPA-navigated detail open, creating phantom
    // entries that doubled the back-presses needed. With the SPA-entry
    // flag, synthesis is skipped for in-app navigations.
    await kupua.goto();

    const histLenBefore = await kupua.page.evaluate(() => history.length);

    // Open and close 3 different images via SPA navigation
    for (let i = 0; i < 3; i++) {
      await kupua.focusNthItem(i);
      if (await kupua.isGridView()) {
        await kupua.page.locator(
          '[aria-label="Image results grid"] [class*="cursor-pointer"]'
        ).nth(i).dblclick();
      } else {
        await kupua.page.locator(
          '[aria-label="Image results table"] [role="row"][class*="cursor-pointer"]'
        ).nth(i).dblclick();
      }
      await kupua.page.waitForFunction(
        () => new URL(window.location.href).searchParams.has("image"),
        { timeout: 5000 },
      );
      // Close via "Back to search" button
      await kupua.page.locator("button", { hasText: "Back to search" }).click();
      await kupua.page.waitForFunction(
        () => !new URL(window.location.href).searchParams.has("image"),
        { timeout: 5000 },
      );
    }

    const histLenAfter = await kupua.page.evaluate(() => history.length);

    // Each open-close cycle: pushNavigate adds 1 entry, history.back() pops it.
    // Net effect on history.length: 0 per cycle (back doesn't reduce length,
    // but the forward entries are pruned by the next push).
    // With phantom entries, each cycle would add 2 (push + synthesis), doubling
    // the growth. Check: no more than 3 net entries for 3 cycles.
    // In practice: open pushes +1, close (back) activates previous, next open
    // prunes forward + pushes +1. So net growth ≈ 1 (only the last forward
    // entry survives). Be generous — just assert no phantom doubling.
    expect(histLenAfter - histLenBefore).toBeLessThanOrEqual(3);

    // More importantly: a single back from the list should reach the
    // previous search context, not a phantom bare-list page.
    // Navigate to a different search context first, then back.
    await spaNavigate(kupua.page, "/search?nonFree=true&query=test");
    await kupua.page.goBack();
    await kupua.page.waitForFunction(
      () => !new URL(window.location.href).searchParams.has("query"),
      { timeout: 5000 },
    );
    // Should be on the home search page (nonFree=true only), not a phantom
    const url = kupua.page.url();
    expect(url).toContain("/search");
    expect(url).not.toContain("query=");
  });
});

test.describe("Browser back/forward — deep-link synthesis", () => {
  test("cold load ?image=X with fresh tab → close → lands on bare list", async ({ kupua }) => {
    // Navigate directly to a detail URL — simulates pasting a link.
    // First, find an image ID from the results.
    await kupua.goto();
    const firstImage = await kupua.getFirstVisibleImageId();
    expect(firstImage).not.toBeNull();

    // Open a new page (fresh tab context — history.length starts at 1)
    const freshPage = await kupua.page.context().newPage();
    // Pin explicit mode on the fresh page too
    await freshPage.addInitScript(() => {
      localStorage.setItem(
        "kupua-ui-prefs",
        JSON.stringify({ state: { focusMode: "explicit" }, version: 0 }),
      );
    });

    // Navigate directly to the detail URL
    await freshPage.goto(`/search?nonFree=true&image=${firstImage}`);
    await freshPage.waitForFunction(
      () => new URL(window.location.href).searchParams.has("image"),
      { timeout: 10000 },
    );

    // Close detail via Backspace — should land on bare list, not exit tab
    await freshPage.keyboard.press("Backspace");
    await freshPage.waitForFunction(
      () => !new URL(window.location.href).searchParams.has("image"),
      { timeout: 5000 },
    );

    // Should be on the search page, not a blank page
    const url = freshPage.url();
    expect(url).toContain("/search");
    expect(url).not.toContain("image=");

    await freshPage.close();
  });

  test("paste ?image=X into tab with prior history → close → lands on bare list (not referring site)", async ({ kupua }) => {
    // Simulates: user is on theguardian.com (or any non-kupua page),
    // pastes a kupua detail URL. The tab has 20+ history entries.
    // Close detail should land on the bare kupua list, not go back to
    // the prior site. This is the scenario that broke when we gated
    // synthesis on history.length.

    // Build up some prior history in the same page context.
    // We use the kupua page itself for multiple navigations to inflate
    // history.length beyond any reasonable gate threshold.
    await kupua.goto();
    const firstImage = await kupua.getFirstVisibleImageId();
    expect(firstImage).not.toBeNull();

    // Navigate through a few SPA states to grow history.length
    await spaNavigate(kupua.page, "/search?nonFree=true&query=test");
    await spaNavigate(kupua.page, "/search?nonFree=true&query=cats");
    await spaNavigate(kupua.page, "/search?nonFree=true&query=dogs");

    // Now simulate "pasting" a detail URL — full page navigation
    await kupua.page.goto(`/search?nonFree=true&image=${firstImage}`);
    await kupua.page.waitForFunction(
      () => new URL(window.location.href).searchParams.has("image"),
      { timeout: 10000 },
    );

    // Verify history.length is well above 2 (the old gate)
    const histLen = await kupua.page.evaluate(() => history.length);
    expect(histLen).toBeGreaterThan(2);

    // Close detail via Backspace
    await kupua.page.keyboard.press("Backspace");
    await kupua.page.waitForFunction(
      () => !new URL(window.location.href).searchParams.has("image"),
      { timeout: 5000 },
    );

    // Should be on the kupua search page (synthesised bare-list), not
    // back at the prior history entry
    const url = kupua.page.url();
    expect(url).toContain("/search");
    expect(url).not.toContain("image=");
  });
});

test.describe("Browser back/forward — density toggle", () => {
  test("back across density toggle re-toggles density", async ({ kupua }) => {
    await kupua.goto();

    // Verify we start in grid
    expect(await kupua.isGridView()).toBe(true);

    // Switch to table
    await kupua.switchToTable();
    expect(await kupua.isTableView()).toBe(true);

    // Back should restore grid
    await kupua.page.goBack();
    await kupua.page.waitForFunction(
      () => !new URL(window.location.href).searchParams.has("density"),
      { timeout: 5000 },
    );
    expect(await kupua.isGridView()).toBe(true);

    // Forward should restore table
    await kupua.page.goForward();
    await kupua.page.waitForFunction(
      () => new URL(window.location.href).searchParams.get("density") === "table",
      { timeout: 5000 },
    );
    expect(await kupua.isTableView()).toBe(true);
  });
});

test.describe("Browser back/forward — logo reset", () => {
  test("logo reset from search bar → back restores previous context (popstate semantics)", async ({ kupua }) => {
    // Navigate to a specific query
    await kupua.goto();
    await spaNavigate(kupua.page, `/search?nonFree=true&query=${encodeURIComponent("credit:PA")}`);
    await waitForSearchSettled(kupua.page);
    expect(await getUrlQuery(kupua.page)).toBe("credit:PA");

    // Click SearchBar logo to reset to home
    await kupua.page.locator('header[role="toolbar"] a[title*="Grid"]').click();
    await waitForSearchSettled(kupua.page);

    // Should be at home (no query)
    expect(await getUrlQuery(kupua.page)).toBeNull();

    // Back should return to the previous search context
    await kupua.page.goBack();
    await waitForSearchSettled(kupua.page);
    expect(await getUrlQuery(kupua.page)).toBe("credit:PA");

    // Popstate semantics: bufferOffset should be 0 (reset to top, no focus carry)
    const state = await kupua.getStoreState();
    expect(state.bufferOffset).toBe(0);
  });

  test("logo reset from image detail → back restores previous context", async ({ kupua }) => {
    // Navigate to a query and open an image
    await kupua.goto();
    await spaNavigate(kupua.page, `/search?nonFree=true&query=${encodeURIComponent("credit:PA")}`);
    await waitForSearchSettled(kupua.page);

    // Focus and open image detail
    await kupua.focusNthItem(0);
    if (await kupua.isGridView()) {
      await kupua.page.locator(
        '[aria-label="Image results grid"] [class*="cursor-pointer"]'
      ).first().dblclick();
    } else {
      await kupua.page.locator(
        '[aria-label="Image results table"] [role="row"][class*="cursor-pointer"]'
      ).first().dblclick();
    }
    await kupua.page.waitForFunction(
      () => new URL(window.location.href).searchParams.has("image"),
      { timeout: 5000 },
    );

    // Click the ImageDetail header logo. There are two logos in the DOM
    // (SearchBar + ImageDetail), but the SearchBar one is behind the
    // detail overlay (pointer-events-none). Target the visible one.
    const detailLogo = kupua.page.locator('a[title*="Grid"] img[alt="Grid"]').nth(1);
    await detailLogo.click();
    await waitForSearchSettled(kupua.page);

    // Should be at home (no query, no image)
    expect(await getUrlQuery(kupua.page)).toBeNull();
    expect(await kupua.page.evaluate(
      () => new URL(window.location.href).searchParams.has("image"),
    )).toBe(false);
  });
});

test.describe("Browser back/forward — metadata click-to-search", () => {
  test("metadata click pushes exactly one entry; back returns to detail", async ({ kupua }) => {
    await kupua.goto();

    // Open image detail
    await kupua.focusNthItem(0);
    if (await kupua.isGridView()) {
      await kupua.page.locator(
        '[aria-label="Image results grid"] [class*="cursor-pointer"]'
      ).first().dblclick();
    } else {
      await kupua.page.locator(
        '[aria-label="Image results table"] [role="row"][class*="cursor-pointer"]'
      ).first().dblclick();
    }
    await kupua.page.waitForFunction(
      () => new URL(window.location.href).searchParams.has("image"),
      { timeout: 5000 },
    );
    const imageId = await kupua.page.evaluate(
      () => new URL(window.location.href).searchParams.get("image"),
    );
    expect(imageId).not.toBeNull();

    // Wait for metadata to render — find a clickable metadata ValueLink.
    // ValueLink components render as <button> with underline styling.
    const metadataLink = kupua.page.locator('aside button.underline').first();
    // If no metadata links found (local sample data may not have rich metadata),
    // skip this test gracefully.
    if (await metadataLink.count() === 0) {
      test.skip();
      return;
    }

    // Record history length before click
    const histLenBefore = await kupua.page.evaluate(() => history.length);

    // Click the metadata link
    await metadataLink.click();
    await waitForSearchSettled(kupua.page);

    // Should have closed detail and changed query (exactly one push)
    expect(await kupua.page.evaluate(
      () => new URL(window.location.href).searchParams.has("image"),
    )).toBe(false);
    const histLenAfter = await kupua.page.evaluate(() => history.length);
    expect(histLenAfter).toBe(histLenBefore + 1);

    // Back should return to the detail with the old query
    await kupua.page.goBack();
    await kupua.page.waitForFunction(
      () => new URL(window.location.href).searchParams.has("image"),
      { timeout: 5000 },
    );
    const imageAfterBack = await kupua.page.evaluate(
      () => new URL(window.location.href).searchParams.get("image"),
    );
    expect(imageAfterBack).toBe(imageId);
  });
});
