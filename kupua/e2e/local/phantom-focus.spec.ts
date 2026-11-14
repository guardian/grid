/**
 * Phantom focus mode — E2E tests.
 *
 * Validates that phantom mode (click-to-open, no focus ring, arrows scroll)
 * works correctly, and that switching modes works at runtime.
 */

import { test, expect } from "../shared/helpers";

// ---------------------------------------------------------------------------
// Helper: set focus mode via localStorage before navigating
// ---------------------------------------------------------------------------

async function setPhantomMode(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      "kupua-ui-prefs",
      JSON.stringify({ state: { focusMode: "phantom" }, version: 0 }),
    );
  });
}

// ---------------------------------------------------------------------------
// Phantom mode: click behaviour
// ---------------------------------------------------------------------------

test.describe("Phantom focus mode — click behaviour", () => {
  test("single-click opens image detail in grid", async ({ kupua }) => {
    await setPhantomMode(kupua.page);
    await kupua.page.goto("/search?nonFree=true");
    await kupua.waitForResults();

    // Click the first grid cell
    const cells = kupua.page.locator(
      '[aria-label="Image results grid"] [data-grid-cell]',
    );
    await cells.first().click();

    // Should navigate to detail (image param in URL)
    await kupua.page.waitForFunction(
      () => new URL(window.location.href).searchParams.has("image"),
      { timeout: 5000 },
    );
    const url = new URL(await kupua.page.url());
    expect(url.searchParams.get("image")).toBeTruthy();
  });

  test("single-click opens image detail in table", async ({ kupua }) => {
    await setPhantomMode(kupua.page);
    await kupua.startSearch("", "table");

    // Click the first data row
    const rows = kupua.page.locator(
      '[aria-label="Image results table"] [role="row"][class*="cursor-pointer"]',
    );
    await rows.first().click();

    await kupua.page.waitForFunction(
      () => new URL(window.location.href).searchParams.has("image"),
      { timeout: 5000 },
    );
    const url = new URL(await kupua.page.url());
    expect(url.searchParams.get("image")).toBeTruthy();
  });

  test("no focus ring appears in phantom mode", async ({ kupua }) => {
    await setPhantomMode(kupua.page);
    await kupua.page.goto("/search?nonFree=true");
    await kupua.waitForResults();

    // Verify no focus ring on any grid cell
    const rings = kupua.page.locator('[data-grid-cell][class*="ring-2"]');
    await expect(rings).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// Phantom mode: keyboard behaviour
// ---------------------------------------------------------------------------

test.describe("Phantom focus mode — keyboard behaviour", () => {
  test("arrow keys scroll rows, no focus ring", async ({ kupua }) => {
    await setPhantomMode(kupua.page);
    await kupua.page.goto("/search?nonFree=true");
    await kupua.waitForResults();

    const scrollBefore = await kupua.getScrollTop();

    // Press ArrowDown — should scroll, not set focus
    await kupua.page.keyboard.press("ArrowDown");
    await expect.poll(() => kupua.getScrollTop()).toBeGreaterThan(scrollBefore);

    // No focus should be set
    const focusedId = await kupua.getFocusedImageId();
    expect(focusedId).toBeNull();

    // No focus ring visible on any grid cell
    const rings = kupua.page.locator('[data-grid-cell][class*="ring-2"]');
    await expect(rings).toHaveCount(0);
  });

  test("Enter does nothing in phantom mode", async ({ kupua }) => {
    await setPhantomMode(kupua.page);
    await kupua.page.goto("/search?nonFree=true");
    await kupua.waitForResults();

    // Press Enter — should not navigate
    await kupua.page.keyboard.press("Enter");
    await kupua.page.waitForTimeout(300);

    const url = new URL(await kupua.page.url());
    expect(url.searchParams.has("image")).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
// Return from detail in phantom mode
// ---------------------------------------------------------------------------

test.describe("Phantom focus mode — return from detail", () => {
  test("return from detail preserves scroll position", async ({ kupua }) => {
    await setPhantomMode(kupua.page);
    await kupua.page.goto("/search?nonFree=true");
    await kupua.waitForResults();

    // Scroll down a bit
    const scrollBefore = await kupua.getScrollTop();
    await kupua.page.keyboard.press("ArrowDown");
    await kupua.page.keyboard.press("ArrowDown");
    await expect.poll(() => kupua.getScrollTop()).toBeGreaterThan(scrollBefore);

    // Find a cell that's visible and click it to enter detail
    const cells = kupua.page.locator(
      '[aria-label="Image results grid"] [data-grid-cell]',
    );
    // Use nth(4) to pick a cell well within the viewport after scrolling
    const target = cells.nth(4);
    await target.scrollIntoViewIfNeeded();
    const targetId = await target.getAttribute("data-image-id");
    expect(targetId).not.toBeNull();
    await target.click();
    await kupua.page.waitForFunction(
      () => new URL(window.location.href).searchParams.has("image"),
      { timeout: 5000 },
    );

    // Press Backspace to return
    await kupua.page.keyboard.press("Backspace");
    await kupua.waitForDetailClosed();

    // No focus ring should be visible after return
    const rings = kupua.page.locator('[data-grid-cell][class*="ring-2"]');
    await expect(rings).toHaveCount(0);

    // The exact opened image should be painted inside the results viewport.
    await kupua.page.waitForFunction((expectedId) => {
      if (!expectedId) return false;
      const container = document.querySelector('[aria-label="Image results grid"]');
      const cell = document.querySelector(`[data-image-id="${CSS.escape(expectedId)}"]`);
      if (!container || !cell) return false;
      const containerRect = container.getBoundingClientRect();
      const cellRect = cell.getBoundingClientRect();
      return cellRect.bottom > containerRect.top && cellRect.top < containerRect.bottom;
    }, targetId, { timeout: 10_000 });
  });
});

for (const change of ["density", "panel", "zoom"] as const) {
  test(`Click-to-open ${change} preserves the browsed image instead of offscreen hidden focus`, async ({ kupua, page }) => {
    await setPhantomMode(page);
    await kupua.startSearch("", "grid");
    await page.evaluate(async () => {
      const configPath = "/src/dal/es-config.ts";
      if (!(await import(configPath)).IS_LOCAL_ES) throw new Error("Layout anchor fixture requires local ES");
      const sourcePath = "/src/dal/mock-data-source.ts";
      const { MockDataSource } = await import(sourcePath);
      const store = (window as any).__kupua_store__;
      store.setState({ dataSource: new MockDataSource(343) });
      await store.getState().search();
    });
    await page.waitForFunction(() => {
      const state = (window as any).__kupua_store__.getState();
      return state.results.length === 343 && !state.loading && !state._extendForwardInFlight;
    });
    const point = await kupua.waitForHitTestedImagePoint({ view: "grid" });
    await page.mouse.click(point.x, point.y);
    await expect(page.locator("[data-detail-image-id]")).toBeVisible();
    await kupua.closeDetailViaBackspace();
    const remembered = await kupua.getFocusedImageId();
    expect(remembered).toBeTruthy();
    const region = page.getByRole("region", { name: "Image results grid", exact: true });
    await region.evaluate(element => { element.scrollTop = 2400; });
    await expect.poll(() => region.evaluate(element => element.scrollTop)).toBe(2400);
    const before = await page.evaluate(async id => {
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const container = document.querySelector<HTMLElement>('[aria-label="Image results grid"]')!;
      const bounds = container.getBoundingClientRect();
      const focus = container.querySelector<HTMLElement>(`[data-image-id="${CSS.escape(id!)}"]`);
      if (focus && focus.getBoundingClientRect().bottom > bounds.top && focus.getBoundingClientRect().top < bounds.bottom) {
        throw new Error("Remembered image must be offscreen");
      }
      const anchorId = (window as any).__kupua_getViewportAnchorId__() as string;
      const cell = container.querySelector<HTMLElement>(`[data-image-id="${CSS.escape(anchorId)}"]`)!;
      return { id: anchorId, top: cell.getBoundingClientRect().top - bounds.top, width: container.clientWidth };
    }, remembered);
    if (change === "density") {
      await page.getByRole("button", { name: "Table view", exact: true }).click();
    } else if (change === "panel") {
      await page.getByRole("button", { name: "Show Browse panel", exact: true }).click();
      await expect.poll(() => region.evaluate(element => element.clientWidth)).toBeLessThan(before.width);
    } else {
      await page.evaluate(async () => {
        const path = "/src/stores/zoom-store.ts";
        (await import(path)).useZoomStore.getState().step("grid", 1);
      });
    }
    await expect.poll(() => page.evaluate(before => {
      const container = document.querySelector<HTMLElement>('[aria-label^="Image results "]')!;
      const cell = container.querySelector<HTMLElement>(`[data-image-id="${CSS.escape(before.id)}"]`);
      if (!cell) return Infinity;
      const bounds = container.getBoundingClientRect();
      const rect = cell.getBoundingClientRect();
      const header = container.querySelector("[data-table-header]")?.getBoundingClientRect();
      const usableTop = header ? header.bottom - bounds.top : 0;
      const desired = Math.max(usableTop, Math.min(before.top, container.clientHeight - rect.height));
      return Math.abs(rect.top - bounds.top - desired);
    }, before)).toBeLessThan(2);
    expect(await kupua.getFocusedImageId()).toBe(remembered);
  });
}

// ---------------------------------------------------------------------------
// Explicit mode: existing behaviour unchanged
// ---------------------------------------------------------------------------

test.describe("Explicit focus mode (default) — unchanged", () => {
  test("single-click sets focus ring, does not open detail", async ({ kupua }) => {
    // Default mode = explicit (fresh localStorage)
    await kupua.page.goto("/search?nonFree=true");
    await kupua.waitForResults();

    const cells = kupua.page.locator(
      '[aria-label="Image results grid"] [data-grid-cell]',
    );
    await cells.first().click();

    // A focus ring marks the explicit-mode click branch as committed.
    const rings = kupua.page.locator('[data-grid-cell][class*="ring-2"]');
    await expect(rings).toHaveCount(1);

    // Should NOT navigate to detail
    const url = new URL(await kupua.page.url());
    expect(url.searchParams.has("image")).toBeFalsy();

    // Focus ring should appear on exactly one grid cell

    // focusedImageId should be set
    const focusedId = await kupua.getFocusedImageId();
    expect(focusedId).toBeTruthy();
  });

});
