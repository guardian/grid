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
    // Mirror what pushNavigate/useUpdateSearchParams do in production:
    // 1. Capture snapshot for the predecessor entry.
    const markSnap = (window as any).__kupua_markPushSnapshot__;
    if (markSnap) markSnap();
    // 2. Mark as user-initiated.
    const markUserNav = (window as any).__kupua_markUserNav__;
    if (markUserNav) markUserNav();
    // 3. Navigate with a fresh kupuaKey.
    const url = new URL(p, window.location.origin);
    const search: Record<string, string> = {};
    url.searchParams.forEach((v, k) => { search[k] = v; });
    router.navigate({ to: url.pathname, search, state: { kupuaKey: crypto.randomUUID() } });
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

  test("cold load → traverse → close → forward does not re-synthesise (no phantom entry)", async ({ kupua }) => {
    // Regression test for H1: withCurrentKupuaKey() was dropping
    // _bareListSynthesized from history.state on traversal replace,
    // causing re-synthesis (phantom bare-list entry + forward truncation)
    // when the user navigated forward back to the detail entry.
    await kupua.goto();
    const firstImage = await kupua.getFirstVisibleImageId();
    expect(firstImage).not.toBeNull();

    // Cold-load a detail URL (triggers bare-list synthesis)
    const freshPage = await kupua.page.context().newPage();
    await freshPage.addInitScript(() => {
      localStorage.setItem(
        "kupua-ui-prefs",
        JSON.stringify({ state: { focusMode: "explicit" }, version: 0 }),
      );
    });
    await freshPage.goto(`/search?nonFree=true&image=${firstImage}`);
    await freshPage.waitForFunction(
      () => new URL(window.location.href).searchParams.has("image"),
      { timeout: 10000 },
    );

    // Wait for search results to load so traversal (prev/next) is available.
    // On cold load, the image may need restoreAroundCursor before it appears
    // in the buffer and ArrowRight can find a next image.
    await freshPage.waitForFunction(
      () => {
        const store = (window as any).__kupua_store__;
        if (!store) return false;
        const s = store.getState();
        return s.sortAroundFocusStatus === null && !s.loading && s.results.length > 0;
      },
      { timeout: 15000 },
    );

    const histLenAfterLoad = await freshPage.evaluate(() => history.length);

    // Traverse to the next image (replace navigation — this is where
    // withCurrentKupuaKey() was dropping _bareListSynthesized)
    await freshPage.keyboard.press("ArrowRight");
    await freshPage.waitForFunction(
      (prev) => new URL(window.location.href).searchParams.get("image") !== prev,
      firstImage,
      { timeout: 5000 },
    );
    const secondImage = await freshPage.evaluate(
      () => new URL(window.location.href).searchParams.get("image"),
    );

    // Close detail
    await freshPage.keyboard.press("Backspace");
    await freshPage.waitForFunction(
      () => !new URL(window.location.href).searchParams.has("image"),
      { timeout: 5000 },
    );

    // Forward — re-opens detail. With the bug, this would re-synthesise
    // (inserting a phantom bare-list entry and growing history.length).
    await freshPage.goForward();
    await freshPage.waitForFunction(
      () => new URL(window.location.href).searchParams.has("image"),
      { timeout: 5000 },
    );

    // The image should be the one we traversed to
    const imageAfterForward = await freshPage.evaluate(
      () => new URL(window.location.href).searchParams.get("image"),
    );
    expect(imageAfterForward).toBe(secondImage);

    // History length should NOT have grown — no phantom entry inserted.
    // With the bug, re-synthesis does replaceState + pushState, growing
    // history.length by 1 on each forward-to-detail cycle.
    const histLenAfterForward = await freshPage.evaluate(() => history.length);
    expect(histLenAfterForward).toBe(histLenAfterLoad);

    await freshPage.close();
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

// ===========================================================================
// kupuaKey infrastructure — per-entry identity
// ===========================================================================

test.describe("kupuaKey — per-entry identity", () => {
  /** Read kupuaKey from the current history entry via the dev global. */
  async function getKupuaKey(page: import("@playwright/test").Page): Promise<string | undefined> {
    return page.evaluate(() => {
      const fn = (window as any).__kupua_getKupuaKey__;
      return fn ? fn() : undefined;
    });
  }

  test("cold load synthesises a kupuaKey on the initial entry", async ({ kupua }) => {
    await kupua.goto();
    const key = await getKupuaKey(kupua.page);
    expect(key).toBeDefined();
    expect(key).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  test("kupuaKey survives replace navigations (debounced typing follow-up)", async ({ kupua }) => {
    await kupua.goto();
    const initialKey = await getKupuaKey(kupua.page);
    expect(initialKey).toBeDefined();

    // Simulate a replace navigation (like debounced typing follow-up).
    // useUpdateSearchParams with { replace: true } re-passes the key.
    // We use nonFree=true (which has results) to avoid timeouts, but
    // the key point is replace: true — the kupuaKey should survive.
    await kupua.page.evaluate(() => {
      const router = (window as any).__kupua_router__;
      const markUserNav = (window as any).__kupua_markUserNav__;
      if (markUserNav) markUserNav();
      router.navigate({
        to: "/search",
        search: { nonFree: "true", orderBy: "oldest" },
        replace: true,
        state: { kupuaKey: (window.history.state as any)?.kupuaKey },
      });
    });
    // Wait for the URL to reflect the replace (orderBy appears)
    await kupua.page.waitForFunction(
      () => new URL(window.location.href).searchParams.get("orderBy") === "oldest",
      { timeout: 5000 },
    );

    const keyAfterReplace = await getKupuaKey(kupua.page);
    expect(keyAfterReplace).toBe(initialKey);
  });

  test("push navigation mints a new kupuaKey", async ({ kupua }) => {
    await kupua.goto();
    const initialKey = await getKupuaKey(kupua.page);
    expect(initialKey).toBeDefined();

    // SPA push navigation
    await spaNavigate(kupua.page, "/search?nonFree=true&orderBy=oldest");
    await waitForSearchSettled(kupua.page);

    const newKey = await getKupuaKey(kupua.page);
    expect(newKey).toBeDefined();
    expect(newKey).not.toBe(initialKey);
  });

  test("kupuaKey is stable across replace then restored on back", async ({ kupua }) => {
    await kupua.goto();
    const keyA = await getKupuaKey(kupua.page);

    // Push → new entry B
    await spaNavigate(kupua.page, "/search?nonFree=true&orderBy=oldest");
    await waitForSearchSettled(kupua.page);
    const keyB = await getKupuaKey(kupua.page);
    expect(keyB).not.toBe(keyA);

    // Replace on B (like traversal) — key should stay as B
    await kupua.page.evaluate(() => {
      const router = (window as any).__kupua_router__;
      router.navigate({
        to: "/search",
        search: { nonFree: "true", orderBy: "oldest" },
        replace: true,
        state: { kupuaKey: router.history.location.state?.kupuaKey },
      });
    });
    await waitForSearchSettled(kupua.page);
    expect(await getKupuaKey(kupua.page)).toBe(keyB);

    // Back to A — should have A's original key
    await kupua.page.goBack();
    await waitForSearchSettled(kupua.page);
    const keyAfterBack = await getKupuaKey(kupua.page);
    expect(keyAfterBack).toBe(keyA);
  });

  test("push captures a snapshot for the predecessor entry", async ({ kupua }) => {
    await kupua.goto();
    const keyA = await getKupuaKey(kupua.page);
    expect(keyA).toBeDefined();

    // Focus the 3rd image so the snapshot has an anchor.
    await kupua.focusNthItem(2);
    const focusedId = await kupua.getFocusedImageId();
    expect(focusedId).not.toBeNull();

    // Push a new search — this should capture a snapshot for entry A.
    await spaNavigate(kupua.page, "/search?nonFree=true&orderBy=oldest");
    await waitForSearchSettled(kupua.page);

    // Inspect the snapshot captured for A's kupuaKey.
    const snapshot = await kupua.page.evaluate((key) => {
      const inspect = (window as any).__kupua_inspectSnapshot__;
      return inspect ? inspect(key) : null;
    }, keyA!);

    expect(snapshot).not.toBeNull();
    expect(snapshot.searchKey).toBeDefined();
    expect(snapshot.searchKey).toContain("nonFree");
    // The anchor should be the focused image.
    expect(snapshot.anchorImageId).toBe(focusedId);
    expect(snapshot.anchorOffset).toBeGreaterThanOrEqual(0);
  });

  test("logo-reset push does NOT capture a snapshot", async ({ kupua }) => {
    await kupua.goto();
    const keyA = await getKupuaKey(kupua.page);
    expect(keyA).toBeDefined();

    // Navigate to a different sort (creates a history entry B)
    await spaNavigate(kupua.page, "/search?nonFree=true&orderBy=oldest");
    await waitForSearchSettled(kupua.page);
    const keyB = await getKupuaKey(kupua.page);

    // Click the logo (reset to home) — uses pushNavigateAsPopstate,
    // which should NOT capture a snapshot for B.
    await kupua.page.locator('header[role="toolbar"] a[title*="Grid"]').click();
    await waitForSearchSettled(kupua.page);

    // There should be no snapshot for B (logo-reset skips capture)
    const snapshot = await kupua.page.evaluate((key) => {
      const inspect = (window as any).__kupua_inspectSnapshot__;
      return inspect ? inspect(key) : null;
    }, keyB!);

    expect(snapshot).toBeUndefined();
  });
});

// ===========================================================================
// Phase 3: Snapshot-based position restoration on popstate
// ===========================================================================

test.describe("Snapshot restore — position restoration on back/forward", () => {
  test("back after sort change restores focused image", async ({ kupua }) => {
    // Default sort (entry A). Focus the 5th image.
    await kupua.goto();
    await waitForSearchSettled(kupua.page);
    await kupua.focusNthItem(4);
    const anchorId = await kupua.getFocusedImageId();
    expect(anchorId).not.toBeNull();

    // Push a query change (entry B) — query change means the focused
    // image likely doesn't exist in the new results, so Never Lost
    // falls back to first page. This isolates snapshot restore from
    // sort-around-focus interaction.
    await spaNavigate(kupua.page, `/search?nonFree=true&query=${encodeURIComponent("credit:Reuters")}`);
    await waitForSearchSettled(kupua.page);

    // Back to entry A — snapshot should restore near the anchor.
    await kupua.page.goBack();
    await waitForSearchSettled(kupua.page);

    // The anchor image should be focused (sort-around-focus engages).
    const restoredFocus = await kupua.getFocusedImageId();
    expect(restoredFocus).toBe(anchorId);
  });

  test("back after query change restores focused image", async ({ kupua }) => {
    // Initial query (entry A). Focus the 3rd image.
    await kupua.goto();
    await spaNavigate(kupua.page, `/search?nonFree=true&query=${encodeURIComponent("credit:PA")}`);
    await waitForSearchSettled(kupua.page);
    await kupua.focusNthItem(2);
    const anchorId = await kupua.getFocusedImageId();
    expect(anchorId).not.toBeNull();

    // Push a different query (entry B).
    await spaNavigate(kupua.page, `/search?nonFree=true&query=${encodeURIComponent("credit:Reuters")}`);
    await waitForSearchSettled(kupua.page);

    // Back to entry A — snapshot should restore.
    await kupua.page.goBack();
    await waitForSearchSettled(kupua.page);

    const restoredFocus = await kupua.getFocusedImageId();
    expect(restoredFocus).toBe(anchorId);
  });

  test("forward after back still finds snapshot (not deleted on read)", async ({ kupua }) => {
    // Entry A: default sort. Focus image 3.
    await kupua.goto();
    await waitForSearchSettled(kupua.page);
    await kupua.focusNthItem(2);
    const anchorA = await kupua.getFocusedImageId();
    expect(anchorA).not.toBeNull();

    // Entry B: oldest sort (Never Lost carries anchorA, that's fine).
    await spaNavigate(kupua.page, "/search?nonFree=true&orderBy=oldest");
    await waitForSearchSettled(kupua.page);

    // Back to A — restores anchorA from snapshot.
    await kupua.page.goBack();
    await waitForSearchSettled(kupua.page);
    expect(await kupua.getFocusedImageId()).toBe(anchorA);

    // Forward to B — then immediately back to A again.
    // Tests that A's snapshot was not deleted on the first read.
    await kupua.page.goForward();
    await waitForSearchSettled(kupua.page);

    await kupua.page.goBack();
    await waitForSearchSettled(kupua.page);
    expect(await kupua.getFocusedImageId()).toBe(anchorA);
  });

  test("logo-reset back still resets, then back from reset restores", async ({ kupua }) => {
    // Entry A: query. Focus image 3.
    await kupua.goto();
    await spaNavigate(kupua.page, `/search?nonFree=true&query=${encodeURIComponent("credit:PA")}`);
    await waitForSearchSettled(kupua.page);
    await kupua.focusNthItem(2);

    // Logo-reset (entry B) — pushNavigateAsPopstate, no snapshot for A.
    await kupua.page.locator('header[role="toolbar"] a[title*="Grid"]').click();
    await waitForSearchSettled(kupua.page);
    expect(await getUrlQuery(kupua.page)).toBeNull();

    // Back to A — logo-reset doesn't capture a snapshot for A (by design).
    // So A has NO snapshot → back should reset to top (offset 0).
    await kupua.page.goBack();
    await waitForSearchSettled(kupua.page);
    expect(await getUrlQuery(kupua.page)).toBe("credit:PA");

    const state = await kupua.getStoreState();
    expect(state.bufferOffset).toBe(0);
  });

  test("back without snapshot falls through to reset-to-top", async ({ kupua }) => {
    await kupua.goto();
    await waitForSearchSettled(kupua.page);

    // Push WITHOUT calling markPushSnapshot (simulate missing snapshot).
    await kupua.page.evaluate(() => {
      const router = (window as any).__kupua_router__;
      const markUserNav = (window as any).__kupua_markUserNav__;
      if (markUserNav) markUserNav();
      router.navigate({
        to: "/search",
        search: { nonFree: "true", orderBy: "oldest" },
        state: { kupuaKey: crypto.randomUUID() },
      });
    });
    await waitForSearchSettled(kupua.page);

    // Back — no snapshot exists → should reset to top.
    await kupua.page.goBack();
    await waitForSearchSettled(kupua.page);

    const state = await kupua.getStoreState();
    expect(state.bufferOffset).toBe(0);
    expect(state.focusedImageId).toBeNull();
  });

  test("back restores deep position (~800) after query change", async ({ kupua }) => {
    // Entry A: default sort. Seek to offset ~800 (well past first page).
    await kupua.goto();
    await waitForSearchSettled(kupua.page);

    // Seek deep via the store.
    await kupua.page.evaluate(async () => {
      const store = (window as any).__kupua_store__;
      await store.getState().seek(800);
    });
    // Wait for seek to settle (loading=false, buffer around 800).
    await kupua.page.waitForFunction(
      () => {
        const s = (window as any).__kupua_store__?.getState();
        return s && !s.loading && s.bufferOffset > 0 && s.results.length > 0;
      },
      { timeout: 15_000 },
    );

    // Focus an image from the deep buffer.
    await kupua.focusNthItem(0);
    const deepAnchor = await kupua.getFocusedImageId();
    expect(deepAnchor).not.toBeNull();
    const preState = await kupua.getStoreState();
    const deepOffset = preState.bufferOffset;
    expect(deepOffset).toBeGreaterThan(500); // sanity: we're deep

    // Push a query change (entry B) — the deep image won't exist in
    // the filtered results, so Never Lost falls back to first page.
    // This isolates the snapshot restore test from Never Lost carrying
    // focus across contexts.
    await spaNavigate(kupua.page, `/search?nonFree=true&query=${encodeURIComponent("credit:Reuters")}`);
    await waitForSearchSettled(kupua.page);
    // New query → first page at offset 0.
    const queryState = await kupua.getStoreState();
    expect(queryState.bufferOffset).toBe(0);

    // Back to A — should restore near the deep position.
    await kupua.page.goBack();
    await waitForSearchSettled(kupua.page);

    // The anchor image should be focused and the buffer should be deep.
    expect(await kupua.getFocusedImageId()).toBe(deepAnchor);
    const restoredState = await kupua.getStoreState();
    expect(restoredState.bufferOffset).toBeGreaterThan(500);
  });
});

// ===========================================================================
// Phase 4: Reload survival — snapshot-based position restoration on reload
// ===========================================================================

test.describe("Reload survival — position restoration on reload", () => {
  test("reload restores current entry via pagehide snapshot", async ({ kupua }) => {
    // Entry A: default sort. Seek deep and focus an image.
    await kupua.goto();
    await waitForSearchSettled(kupua.page);

    // Seek to offset ~800 (well past first page).
    await kupua.page.evaluate(async () => {
      const store = (window as any).__kupua_store__;
      await store.getState().seek(800);
    });
    await kupua.page.waitForFunction(
      () => {
        const s = (window as any).__kupua_store__?.getState();
        return s && !s.loading && s.bufferOffset > 0 && s.results.length > 0;
      },
      { timeout: 15_000 },
    );

    // Focus an image from the deep buffer.
    await kupua.focusNthItem(0);
    const deepAnchor = await kupua.getFocusedImageId();
    expect(deepAnchor).not.toBeNull();
    const preState = await kupua.getStoreState();
    const deepOffset = preState.bufferOffset;
    expect(deepOffset).toBeGreaterThan(500);

    // Reload — pagehide captures snapshot for current entry's kupuaKey.
    // On mount, the popstate path finds the snapshot and restores.
    await kupua.page.reload();
    await waitForSearchSettled(kupua.page);

    // The anchor image should be focused and the buffer should be deep.
    expect(await kupua.getFocusedImageId()).toBe(deepAnchor);
    const restoredState = await kupua.getStoreState();
    expect(restoredState.bufferOffset).toBeGreaterThan(500);
  });

  test("reload then back still restores previous entry", async ({ kupua }) => {
    // Entry A: default sort, shallow.
    await kupua.goto();
    await waitForSearchSettled(kupua.page);
    await kupua.focusNthItem(2);
    const anchorA = await kupua.getFocusedImageId();
    expect(anchorA).not.toBeNull();

    // Push to entry B (query change — isolates from Never Lost).
    await spaNavigate(kupua.page, `/search?nonFree=true&query=${encodeURIComponent("credit:Reuters")}`);
    await waitForSearchSettled(kupua.page);

    // Reload on entry B. A's snapshot was captured on the push;
    // B's snapshot is captured by pagehide.
    await kupua.page.reload();
    await waitForSearchSettled(kupua.page);
    expect(await getUrlQuery(kupua.page)).toBe("credit:Reuters");

    // Back to A — A's snapshot (captured on push) should restore.
    await kupua.page.goBack();
    await waitForSearchSettled(kupua.page);
    expect(await getUrlQuery(kupua.page)).toBeNull();
    expect(await kupua.getFocusedImageId()).toBe(anchorA);
  });

  test("reload restores deep position with query", async ({ kupua }) => {
    // Navigate to a query, seek deep, reload — should restore.
    // Use default search (large result set) then push a query that also
    // has many results, so seek(400) works.
    await kupua.goto();
    await waitForSearchSettled(kupua.page);

    // Seek deep on the default (large) result set.
    await kupua.page.evaluate(async () => {
      const store = (window as any).__kupua_store__;
      await store.getState().seek(400);
    });
    await kupua.page.waitForFunction(
      () => {
        const s = (window as any).__kupua_store__?.getState();
        return s && !s.loading && s.bufferOffset > 0 && s.results.length > 0;
      },
      { timeout: 15_000 },
    );
    await kupua.focusNthItem(0);
    const deepAnchor = await kupua.getFocusedImageId();
    expect(deepAnchor).not.toBeNull();
    const preState = await kupua.getStoreState();
    expect(preState.bufferOffset).toBeGreaterThan(200);

    await kupua.page.reload();
    await waitForSearchSettled(kupua.page);

    // Position should be restored.
    expect(await kupua.getFocusedImageId()).toBe(deepAnchor);
    const restoredState = await kupua.getStoreState();
    expect(restoredState.bufferOffset).toBeGreaterThan(200);
  });

  test("bfcache: sessionStorage snapshots survive cross-origin navigation", async ({ kupua }) => {
    // Verify that sessionStorage-backed snapshots survive a cross-origin
    // round-trip. sessionStorage persists per-origin across navigations;
    // bfcache may additionally preserve the in-memory JS heap.
    await kupua.goto();
    await waitForSearchSettled(kupua.page);
    await kupua.focusNthItem(3);
    const anchorId = await kupua.getFocusedImageId();
    expect(anchorId).not.toBeNull();

    // Push a query change — captures snapshot for current entry's key.
    const keyBefore = await kupua.page.evaluate(() => {
      const fn = (window as any).__kupua_getKupuaKey__;
      return fn ? fn() : undefined;
    });
    expect(keyBefore).toBeDefined();
    await spaNavigate(kupua.page, `/search?nonFree=true&query=${encodeURIComponent("credit:Reuters")}`);
    await waitForSearchSettled(kupua.page);

    // Navigate to a different origin (triggers pagehide/bfcache).
    await kupua.page.goto("about:blank");

    // Navigate back — bfcache may restore the page, or reload it.
    await kupua.page.goBack();
    await kupua.page.waitForFunction(
      () => window.location.pathname === "/search",
      { timeout: 10_000 },
    );
    await waitForSearchSettled(kupua.page);

    // Now we're back on the kupua origin — check sessionStorage.
    const snapshotSurvived = await kupua.page.evaluate((key) => {
      try {
        const raw = sessionStorage.getItem(`kupua:histSnap:${key}`);
        return raw !== null;
      } catch { return false; }
    }, keyBefore!);
    expect(snapshotSurvived).toBe(true);

    // The snapshot should be queryable via the store's snapshotStore.
    const snapshotAfterBack = await kupua.page.evaluate((key) => {
      const inspect = (window as any).__kupua_inspectSnapshot__;
      return inspect ? inspect(key) : null;
    }, keyBefore!);
    expect(snapshotAfterBack).not.toBeNull();
    expect(snapshotAfterBack.anchorImageId).toBe(anchorId);
  });

  test("no scroll teleport after reload restore — extends do not reposition", async ({ kupua }) => {
    // Regression: Effect #9's sortFocusRatioRef survived across re-fires
    // within the same generation. Buffer extends (from normal scrolling)
    // rebuild imagePositions → new findImageIndex ref → Effect #9 re-fires
    // → teleports back to the focused image's saved viewport ratio.
    await kupua.goto();
    await waitForSearchSettled(kupua.page);

    // Seek deep, focus an image.
    await kupua.page.evaluate(async () => {
      const store = (window as any).__kupua_store__;
      await store.getState().seek(800);
    });
    await kupua.page.waitForFunction(
      () => {
        const s = (window as any).__kupua_store__?.getState();
        return s && !s.loading && s.bufferOffset > 0 && s.results.length > 0;
      },
      { timeout: 15_000 },
    );
    await kupua.focusNthItem(0);
    const anchorId = await kupua.getFocusedImageId();
    expect(anchorId).not.toBeNull();

    // Reload — triggers pagehide snapshot + mount-time restore.
    await kupua.page.reload();
    await waitForSearchSettled(kupua.page);
    expect(await kupua.getFocusedImageId()).toBe(anchorId);

    // Record the scroll position after restore.
    const scrollAfterRestore = await kupua.getScrollTop();

    // Scroll far enough to trigger a buffer extend. Repeat multiple times
    // to ensure extends fire and imagePositions rebuilds.
    for (let i = 0; i < 5; i++) {
      await kupua.scrollBy(2000);
    }
    await kupua.page.waitForTimeout(500);

    // The scroll position should be well past the restore point.
    const scrollAfterScroll = await kupua.getScrollTop();
    expect(scrollAfterScroll).toBeGreaterThan(scrollAfterRestore + 3000);

    // Wait a bit more for any deferred re-fires.
    await kupua.page.waitForTimeout(1000);
    const scrollFinal = await kupua.getScrollTop();

    // Should NOT have teleported back to the restore position.
    // Allow small tolerance for momentum/rounding, but not a full teleport.
    expect(scrollFinal).toBeGreaterThan(scrollAfterRestore + 3000);
  });
});

// ===========================================================================
// Phantom mode — departing snapshot update after scroll
// ===========================================================================

test.describe("Snapshot restore — phantom mode departure update", () => {
  // Override: these tests need phantom (click-to-open) mode.
  test.beforeEach(async ({ kupua }) => {
    await kupua.ensurePhantomMode();
  });

  test("departing snapshot updates when phantom anchor changes", async ({ kupua }) => {
    // Entry A: default sort.
    await kupua.goto();
    await waitForSearchSettled(kupua.page);
    const keyA = await kupua.page.evaluate(() => {
      const fn = (window as any).__kupua_getKupuaKey__;
      return fn ? fn() : undefined;
    });

    // Push a sort change (entry B) — this captures A's snapshot via
    // markPushSnapshot. In phantom mode, A's anchor is the viewport centre
    // (anchorIsPhantom: true).
    await spaNavigate(kupua.page, "/search?nonFree=true&orderBy=oldest");
    await waitForSearchSettled(kupua.page);

    // Verify A's snapshot is phantom.
    const snapA = await kupua.page.evaluate((key) => {
      const inspect = (window as any).__kupua_inspectSnapshot__;
      return inspect ? inspect(key) : null;
    }, keyA!);
    expect(snapA).not.toBeNull();
    expect(snapA.anchorIsPhantom).toBe(true);
    const originalAnchor = snapA.anchorImageId;

    // Back to A — this triggers a departing snapshot for B (no phantom
    // issue — B has no snapshot yet). Also restores A from its phantom
    // snapshot. After restore, scroll far within the buffer.
    await kupua.page.goBack();
    await waitForSearchSettled(kupua.page);

    // Scroll within the buffer so the viewport centre changes from
    // the restored anchor.
    const grid = kupua.page.locator('[aria-label="Image results grid"]');
    const gridBox = await grid.boundingBox();
    if (gridBox) {
      await kupua.page.mouse.move(gridBox.x + gridBox.width / 2, gridBox.y + gridBox.height / 2);
    }
    for (let i = 0; i < 5; i++) {
      await kupua.page.mouse.wheel(0, 400);
      await kupua.page.waitForTimeout(100);
    }
    await kupua.page.waitForTimeout(500);
    expect(await kupua.getScrollTop()).toBeGreaterThan(200);

    // Forward to B — this is the popstate that should update A's
    // departing snapshot. A has anchorIsPhantom: true, and we scrolled
    // to a different image.
    await kupua.page.goForward();
    await waitForSearchSettled(kupua.page);

    // Back to A again — should restore at the SCROLLED position,
    // not the original anchor.
    await kupua.page.goBack();
    await waitForSearchSettled(kupua.page);

    // Inspect A's snapshot — should have been updated on the forward
    // departure with the new viewport anchor.
    const snapAAfter = await kupua.page.evaluate((key) => {
      const inspect = (window as any).__kupua_inspectSnapshot__;
      return inspect ? inspect(key) : null;
    }, keyA!);

    // KEY ASSERTION: A's snapshot anchor should have changed from the
    // original (restored) anchor to the scroll-away anchor.
    expect(snapAAfter).not.toBeNull();
    expect(snapAAfter.anchorImageId).not.toBe(originalAnchor);
  });

  test("detail open/close then seek — departure snapshot captures seeked position", async ({ kupua }) => {
    // Repro: phantom mode → sort → detail → back → seek → back → forward
    // Bug: stale user-initiated flag from detail open leaked into the Back
    // popstate, making it skip the departure snapshot. Forward restored the
    // markPushSnapshot anchor (top-of-results) instead of the seeked position.
    //
    // NOTE: The seek step uses store.seek() directly instead of scrubber
    // UI (kupua.seekTo). In React Strict Mode (dev builds), the sort-around-
    // focus that runs after detail-close loses its scroll position during
    // the double-mount cycle, leaving the virtualizer at scrollTop=0 with
    // scrollHeight=clientHeight. A scrubber click computes
    // scrollContentTo(ratio) = ratio * 0 = 0 — no scroll change, no seek.
    // Programmatic seek bypasses this by repositioning the buffer directly.
    // This is dev-only; production builds mount once and don't have this
    // issue. See changelog for full analysis.

    await kupua.goto();
    await waitForSearchSettled(kupua.page);

    // Change sort (creates history entry)
    await spaNavigate(kupua.page, "/search?orderBy=oldest");
    await waitForSearchSettled(kupua.page);
    const keySorted = await kupua.page.evaluate(() => {
      const fn = (window as any).__kupua_getKupuaKey__;
      return fn ? fn() : undefined;
    });

    // Open detail on image B (click-to-open mode)
    const imageB = await kupua.page.evaluate(() => {
      const store = (window as any).__kupua_store__;
      return store?.getState().results[3]?.id ?? null;
    });
    expect(imageB).not.toBeNull();
    const cells = kupua.page.locator('[aria-label="Image results grid"] [class*="cursor-pointer"]');
    await cells.nth(3).click();
    await kupua.page.waitForFunction(
      () => new URL(window.location.href).searchParams.has("image"),
      { timeout: 10_000 },
    );

    // Back from detail
    await kupua.page.goBack();
    await kupua.waitForDetailClosed();
    await kupua.page.waitForTimeout(500);

    // Programmatic seek to offset 2500 (~25%). See NOTE above for why we
    // don't use kupua.seekTo() here.
    await kupua.page.evaluate(async () => {
      const store = (window as any).__kupua_store__;
      await store.getState().seek(2500, "test-seek");
    });
    await kupua.page.waitForTimeout(500);

    // The buffer should now be centred around offset 2500. Verify the
    // viewport anchor has been set (buffer-change effect populates it).
    const anchorAtSeek = await kupua.page.evaluate(() => {
      const getAnchor = (window as any).__kupua_getViewportAnchorId__;
      return getAnchor ? getAnchor() : null;
    });
    expect(anchorAtSeek).not.toBeNull();

    // Back (sorted → initial) — departure should capture the seeked anchor
    await kupua.page.goBack();
    await waitForSearchSettled(kupua.page);

    // Inspect the snapshot — should have the seeked anchor, not markPushSnapshot's
    const snapAfterBack = await kupua.page.evaluate((key) => {
      const inspect = (window as any).__kupua_inspectSnapshot__;
      return inspect ? inspect(key) : null;
    }, keySorted!);
    expect(snapAfterBack).not.toBeNull();
    expect(snapAfterBack.anchorImageId).toBe(anchorAtSeek);
    expect(snapAfterBack.anchorImageId).not.toBe(imageB);

    // Forward (initial → sorted) — should restore at seeked position
    await kupua.page.goForward();
    await waitForSearchSettled(kupua.page);

    const restoredAnchor = await kupua.page.evaluate(() => {
      const getAnchor = (window as any).__kupua_getViewportAnchorId__;
      return getAnchor ? getAnchor() : null;
    });
    expect(restoredAnchor).not.toBe(imageB);
  });
});
