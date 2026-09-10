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

// Pin to explicit focus mode — these tests validate focus-ring behaviour,
// sort-around-focus, and neighbour fallback which are explicit-mode features.
test.beforeEach(async ({ kupua }) => {
  await kupua.ensureExplicitMode();
});

/**
 * Navigate within the SPA without a full page reload.
 * Uses TanStack Router's navigate() via the exposed router instance.
 * This simulates a user-initiated navigation (pushState) — NOT a
 * browser back/forward (popstate). The distinction matters because
 * useUrlSearchSync skips focus-preservation on popstate navigations.
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

test.describe("Neighbour fallback", () => {
  test("focuses nearest neighbour when focused image drops out of results", async ({
    kupua,
  }) => {
    await kupua.goto();

    // Focus the 3rd image
    await kupua.focusNthItem(2);
    const focusedId = await kupua.getFocusedImageId();
    expect(focusedId).not.toBeNull();

    // Find the focused image's credit and a different credit from a neighbour.
    // We'll search for the neighbour's credit — this excludes the focused
    // image (different credit) but includes the neighbour in results.
    const creditInfo = await kupua.page.evaluate(() => {
      const store = (window as any).__kupua_store__;
      const s = store.getState();
      const idx = s.imagePositions.get(s.focusedImageId);
      if (idx == null) return null;
      const focusedImg = s.results[idx - s.bufferOffset];
      const focusedCredit = focusedImg?.metadata?.credit ?? null;
      if (!focusedCredit) return null;

      // Scan neighbours for one with a DIFFERENT credit
      for (let d = 1; d <= 20; d++) {
        for (const offset of [d, -d]) {
          const localIdx = (idx - s.bufferOffset) + offset;
          if (localIdx < 0 || localIdx >= s.results.length) continue;
          const img = s.results[localIdx];
          const c = img?.metadata?.credit;
          if (c && c !== focusedCredit) {
            return { focusedCredit, altCredit: c, neighbourId: img.id };
          }
        }
      }
      return null;
    });
    expect(creditInfo).not.toBeNull();
    expect(creditInfo!.altCredit).not.toBe(creditInfo!.focusedCredit);

    // Search for the alternate credit — the focused image (different credit)
    // drops out, but the neighbour (same credit) survives in new results.
    await spaNavigate(
      kupua.page,
      `/search?nonFree=true&query=${encodeURIComponent(`credit:"${creditInfo!.altCredit}"`)}`,
    );

    // Wait for focus-preservation + neighbour fallback to complete
    await kupua.waitForSortAroundFocus();

    const focusAfter = await kupua.getFocusedImageId();
    expect(focusAfter).toBe(creditInfo!.neighbourId);

    const placement = await kupua.page.evaluate((expectedId) => {
      const state = (window as any).__kupua_store__?.getState();
      const container = document.querySelector(
        '[aria-label="Image results grid"], [aria-label="Image results table"]',
      );
      const cell = document.querySelector(`[data-image-id="${CSS.escape(expectedId)}"]`);
      if (!state || !container || !cell) return null;
      const containerRect = container.getBoundingClientRect();
      const cellRect = cell.getBoundingClientRect();
      return {
        inBuffer: state.results.some((image: any) => image?.id === expectedId),
        visible: cellRect.bottom > containerRect.top
          && cellRect.top < containerRect.bottom
          && cellRect.right > containerRect.left
          && cellRect.left < containerRect.right,
      };
    }, creditInfo!.neighbourId);
    expect(placement).toEqual({ inBuffer: true, visible: true });
  });
});

// ---------------------------------------------------------------------------
// Arrow snap-back after distant seek
// ---------------------------------------------------------------------------

test.describe("Arrow snap-back after seek", () => {
  test("arrow key snaps back to focused image and moves focus", async ({
    kupua,
  }) => {
    await kupua.goto();

    // Focus the 5th image (gives some room for delta)
    await kupua.focusNthItem(4);
    const focusedId = await kupua.getFocusedImageId();
    expect(focusedId).not.toBeNull();

    // Verify the focused image is in the buffer
    const inBufferBefore = await kupua.page.evaluate((id) => {
      const store = (window as any).__kupua_store__;
      return store.getState().imagePositions.has(id);
    }, focusedId);
    expect(inBufferBefore).toBe(true);

    // Seek far away via scrubber — focused image should leave the buffer
    await kupua.dragScrubberTo(0.9);

    const inBufferAfterSeek = await kupua.page.evaluate((id) => {
      const store = (window as any).__kupua_store__;
      return store.getState().imagePositions.has(id);
    }, focusedId);
    expect(inBufferAfterSeek).toBe(false);

    // Focus should still be set (durable)
    expect(await kupua.getFocusedImageId()).toBe(focusedId);

    // Press ArrowDown — should snap back to focused image + move focus
    await kupua.page.keyboard.press("ArrowDown");

    // Wait for snap-back seek to complete
    await kupua.waitForSortAroundFocus();

    // The original focused image should now be back in the buffer
    const inBufferAfterSnap = await kupua.page.evaluate((id) => {
      const store = (window as any).__kupua_store__;
      return store.getState().imagePositions.has(id);
    }, focusedId);
    expect(inBufferAfterSnap).toBe(true);

    // Focus should have moved to a DIFFERENT image (the delta was applied)
    const focusAfterSnap = await kupua.getFocusedImageId();
    expect(focusAfterSnap).not.toBeNull();
    expect(focusAfterSnap).not.toBe(focusedId);

    // The new focused image should be in the buffer
    const newFocusInBuffer = await kupua.page.evaluate((id) => {
      const store = (window as any).__kupua_store__;
      return store.getState().imagePositions.has(id);
    }, focusAfterSnap);
    expect(newFocusInBuffer).toBe(true);
  });

  test("snap-back works then normal arrow navigation continues", async ({
    kupua,
  }) => {
    await kupua.goto();

    // Focus the 5th image
    await kupua.focusNthItem(4);
    const focusedId = await kupua.getFocusedImageId();
    expect(focusedId).not.toBeNull();

    // Seek far away
    await kupua.dragScrubberTo(0.9);
    expect(await kupua.getFocusedImageId()).toBe(focusedId);

    // Snap back with ArrowDown
    await kupua.page.keyboard.press("ArrowDown");
    await kupua.waitForSortAroundFocus();

    const focusAfterFirst = await kupua.getFocusedImageId();
    expect(focusAfterFirst).not.toBe(focusedId);

    // Now press ArrowDown again — should move focus normally (no seek)
    await kupua.page.keyboard.press("ArrowDown");
    await kupua.page.waitForTimeout(200);

    const focusAfterSecond = await kupua.getFocusedImageId();
    expect(focusAfterSecond).not.toBeNull();
    expect(focusAfterSecond).not.toBe(focusAfterFirst);
  });
});

// ---------------------------------------------------------------------------
// Phantom focus promotion (Session 4)
// ---------------------------------------------------------------------------

test.describe("Phantom focus promotion", () => {
  test("viewport anchor is the rendered image nearest the usable table centre", async ({
    kupua,
  }) => {
    await kupua.goto();
    await kupua.switchToTable();
    await kupua.page.evaluate(() => {
      const container = document.querySelector<HTMLElement>('[aria-label="Image results table"]');
      if (!container) throw new Error("Table scroll container not found");
      container.scrollTop = 347.5;
      container.dispatchEvent(new Event("scroll"));
    });
    await kupua.page.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }));

    const measurement = await kupua.page.evaluate(() => {
      const container = document.querySelector<HTMLElement>('[aria-label="Image results table"]');
      const header = container?.querySelector<HTMLElement>('[data-table-header]');
      if (!container || !header) return null;
      const containerRect = container.getBoundingClientRect();
      const headerRect = header.getBoundingClientRect();
      const usableTop = Math.max(containerRect.top, headerRect.bottom);
      const usableCentre = usableTop + (containerRect.bottom - usableTop) / 2;
      const candidates = Array.from(container.querySelectorAll<HTMLElement>('[data-image-id]'))
        .map((element, order) => {
          const rect = element.getBoundingClientRect();
          return {
            id: element.dataset.imageId ?? "",
            order,
            distance: Math.abs((rect.top + rect.bottom) / 2 - usableCentre),
            intersects: rect.bottom > usableTop && rect.top < containerRect.bottom,
          };
        })
        .filter(({ id, intersects }) => id && intersects)
        .sort((a, b) => a.distance - b.distance || a.order - b.order);
      const getter = (window as any).__kupua_getViewportAnchorId__ as (() => string | null) | undefined;
      return {
        expectedId: candidates[0]?.id ?? null,
        expectedSignedDistance: candidates[0]
          ? candidates[0].distance / (containerRect.bottom - usableTop)
          : null,
        actualId: getter?.() ?? null,
      };
    });

    expect(measurement).not.toBeNull();
    expect(measurement!.expectedId).not.toBeNull();
    expect(measurement!.expectedSignedDistance).toBeLessThan(0.1);
    expect(measurement!.actualId).toBe(measurement!.expectedId);
  });

  test("viewport anchor preserves position without focus ring", async ({
    kupua,
  }) => {
    await kupua.goto();

    // No click — no explicit focus. Scroll down to build a viewport anchor.
    await kupua.scrollBy(1500);
    await kupua.page.waitForTimeout(300);

    // Confirm no explicit focus yet
    expect(await kupua.getFocusedImageId()).toBeNull();

    // Query for the app-elected anchor's own credit so the target is known to
    // survive while still exercising phantom position preservation.
    const anchor = await kupua.page.evaluate(() => {
      const store = (window as any).__kupua_store__;
      const s = store.getState();
      const getAnchor = (window as any).__kupua_getViewportAnchorId__;
      const anchorId = typeof getAnchor === "function" ? getAnchor() : null;
      const image = s.results.find((candidate: any) => candidate?.id === anchorId);
      return anchorId && image?.metadata?.credit
        ? { id: anchorId, credit: image.metadata.credit }
        : null;
    });
    expect(anchor).not.toBeNull();

    // Change query — the viewport anchor should be used for position
    // preservation but NOT promoted to explicit focus
    await spaNavigate(
      kupua.page,
      `/search?nonFree=true&query=${encodeURIComponent(`credit:"${anchor!.credit}"`)}`,
    );

    // Wait for search to complete
    await kupua.page.waitForFunction(
      () => {
        const store = (window as any).__kupua_store__;
        if (!store) return false;
        const s = store.getState();
        return s.sortAroundFocusStatus === null && !s.loading;
      },
      { timeout: 10_000 },
    );

    // focusedImageId must remain null — no focus ring should appear
    expect(await kupua.getFocusedImageId()).toBeNull();

    const placement = await kupua.page.evaluate(async (anchorId) => {
      const container = document.querySelector(
        '[aria-label="Image results grid"], [aria-label="Image results table"]',
      );
      const cell = document.querySelector(`[data-image-id="${CSS.escape(anchorId)}"]`);
      if (!container || !cell) return null;
      const first = cell.getBoundingClientRect();
      const viewport = container.getBoundingClientRect();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const second = cell.getBoundingClientRect();
      return {
        visible: second.bottom > viewport.top
          && second.top < viewport.bottom
          && second.right > viewport.left
          && second.left < viewport.right,
        stable: Math.abs(first.top - second.top) <= 1
          && Math.abs(first.left - second.left) <= 1,
      };
    }, anchor!.id);
    expect(placement).toEqual({ visible: true, stable: true });
  });

  test("position NOT preserved across sort-only change without explicit focus", async ({
    kupua,
  }) => {
    await kupua.goto();

    // Scroll down — build a viewport anchor
    await kupua.scrollBy(1500);
    await kupua.page.waitForTimeout(300);

    // Confirm no explicit focus
    expect(await kupua.getFocusedImageId()).toBeNull();

    // Record scrollTop before sort change
    const scrollBefore = await kupua.getScrollTop();
    expect(scrollBefore).toBeGreaterThan(0);

    // Change only sort order — this should reset to top (relaxation)
    await spaNavigate(kupua.page, `/search?nonFree=true&orderBy=uploadTime`);

    // Wait for search to complete
    await kupua.page.waitForFunction(
      () => {
        const store = (window as any).__kupua_store__;
        if (!store) return false;
        const s = store.getState();
        return s.sortAroundFocusStatus === null && !s.loading;
      },
      { timeout: 10_000 },
    );
    await kupua.page.waitForTimeout(200);

    // Buffer offset should be 0 (reset to top)
    const offset = await kupua.page.evaluate(() => {
      const store = (window as any).__kupua_store__;
      return store.getState().bufferOffset;
    });
    expect(offset).toBe(0);

    // Focus should still be null
    expect(await kupua.getFocusedImageId()).toBeNull();
  });

  test("explicit focus still takes precedence over phantom for sort change", async ({
    kupua,
  }) => {
    await kupua.goto();

    // Set explicit focus
    await kupua.focusNthItem(2);
    const focusedId = await kupua.getFocusedImageId();
    expect(focusedId).not.toBeNull();

    // Change sort order — explicit focus should be preserved (no relaxation)
    await spaNavigate(kupua.page, `/search?nonFree=true&orderBy=uploadTime`);
    await kupua.waitForSortAroundFocus();

    // Focus should be preserved on the same image
    expect(await kupua.getFocusedImageId()).toBe(focusedId);
  });
});
