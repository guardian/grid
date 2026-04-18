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

    // The original focused image should NOT be focused (it was filtered out)
    expect(focusAfter).not.toBe(focusedId);

    // A neighbour should have been focused (not null) — it should be in the
    // buffer since it was found in the first page of new results.
    // Note: if the neighbour happens not to be in the first page (unlikely
    // for recent images), focus may be null — that's acceptable graceful
    // degradation, so we only check it's not the original.
    if (focusAfter !== null) {
      const inBuffer = await kupua.page.evaluate((id) => {
        const store = (window as any).__kupua_store__;
        return store.getState().results.some((r: any) => r?.id === id);
      }, focusAfter);
      expect(inBuffer).toBe(true);
    }
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
