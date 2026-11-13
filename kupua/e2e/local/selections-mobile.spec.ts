/**
 * Selections Mobile spec (Phase S5).
 *
 * Tests selection gestures, metadata wrapping and detail-panel swipes on
 * coarse-pointer (touch) devices. Uses Pixel 5 device emulation which sets:
 *  - pointer: coarse  (triggers _pointerCoarse in ui-prefs-store)
 *  - hasTouch: true
 *  - viewport: 393 x 852
 *
 * Touch simulation: uses page.evaluate() to dispatch PointerEvents directly.
 * This is more reliable than Playwright's touchscreen API because:
 *  - Our code listens to PointerEvents, not touch events
 *  - Element hit-testing in the hooks uses elementFromPoint (DOM-level)
 *  - Fake timers cannot be used in the E2E browser context
 *
 * Long-press timing: LONG_PRESS_MS = 500ms. Tests use page.waitForTimeout(600)
 * to ensure the threshold fires with margin.
 *
 * NOTE: iOS Safari real-device testing is REQUIRED for setPointerCapture quirks
 * (agent cannot run this). This spec covers Chromium mobile emulation only.
 *
 * Run:
 *   npm --prefix kupua run test:e2e -- selections-mobile.spec.ts
 *   npm --prefix kupua run test:e2e -- selections-mobile.spec.ts --headed
 */

import { test, expect, devices, type Page, type Locator } from "@playwright/test";

// ---------------------------------------------------------------------------
// Device emulation -- Pixel 5 sets pointer:coarse via hasTouch
// ---------------------------------------------------------------------------

test.use({ ...devices["Pixel 5"] });

// Block Grid API calls — same rationale as the kupua fixture in helpers.ts.
test.beforeEach(async ({ page }) => {
  await page.route("/api/**", (route) => route.fulfill({ status: 503, body: "" }));
  await page.route("**/src/lib/image-urls.ts*", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\ngetFullImageUrl = getThumbnailUrl = image => '/__detail_media/' + image.id + '.svg';\n` });
  });
  await page.route("**/__detail_media/*", route => {
    const imageId = new URL(route.request().url()).pathname.split("/").at(-1)!.slice(0, -4);
    const hue = parseInt(imageId.slice(-6), 16) % 360;
    return route.fulfill({ contentType: "image/svg+xml", body: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="hsl(${hue} 55% 40%)"/><path d="M0 0L400 300M400 0L0 300" stroke="white" stroke-width="8"/></svg>` });
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getSelectionCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const store = (window as any).__kupua_selection_store__;
    if (!store) return 0;
    return store.getState().selectedIds.size;
  });
}

async function getSelectionIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const store = (window as any).__kupua_selection_store__;
    if (!store) return [];
    return Array.from(store.getState().selectedIds as Set<string>);
  });
}

async function clearSelection(page: Page): Promise<void> {
  await page.evaluate(() => {
    const store = (window as any).__kupua_selection_store__;
    store?.getState().clear();
  });
}

/**
 * Dispatch a PointerEvent (pointerType=touch) on the element at (x, y).
 * Returns the clientX/clientY of the dispatched event target.
 */
async function dispatchPointer(
  page: Page,
  type: string,
  x: number,
  y: number,
  pointerId = 1,
): Promise<void> {
  await page.evaluate(
    ({ type, x, y, pointerId }) => {
      const target = document.elementFromPoint(x, y) ?? document.body;
      target.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId,
          pointerType: "touch",
          clientX: x,
          clientY: y,
          isPrimary: true,
        }),
      );
    },
    { type, x, y, pointerId },
  );
}

/**
 * Simulate a long-press at (x, y) by dispatching pointerdown and waiting
 * LONG_PRESS_MS + margin before dispatching pointerup.
 * Does NOT dispatch pointerup -- callers add their own cleanup or drag.
 */
async function beginLongPress(
  page: Page,
  x: number,
  y: number,
): Promise<void> {
  await dispatchPointer(page, "pointerdown", x, y);
  // Wait for threshold to fire (500ms + 150ms margin)
  await page.waitForTimeout(650);
}

/** Complete a long-press with pointerup (no drag -- becomes a tap). */
async function endPress(
  page: Page,
  x: number,
  y: number,
): Promise<void> {
  await dispatchPointer(page, "pointerup", x, y);
}

/**
 * Get the bounding rect of the nth visible grid cell.
 */
async function getCellRect(
  page: Page,
  n: number,
): Promise<{ x: number; y: number; width: number; height: number } | null> {
  return page.evaluate((n) => {
    const cells = document.querySelectorAll("[data-grid-cell]");
    const cell = cells[n] as HTMLElement | undefined;
    if (!cell) return null;
    const r = cell.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, width: r.width, height: r.height };
  }, n);
}

async function getFirstTouchableCellRect(
  page: Page,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const rect = await page.locator("[data-grid-cell]").evaluateAll((cells) => {
    for (const cell of cells) {
      const bounds = cell.getBoundingClientRect();
      const x = bounds.x + bounds.width / 2;
      const y = bounds.y + bounds.height / 2;
      if (document.elementFromPoint(x, y)?.closest("[data-grid-cell]") === cell) {
        return { x, y, width: bounds.width, height: bounds.height };
      }
    }
    return null;
  });
  if (!rect) throw new Error("No touchable grid cell found");
  return rect;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

test.beforeEach(async ({ page }) => {
  // Navigate; don't call kupua.goto() to avoid the desktop pointer assumption.
  await page.goto("/search?nonFree=true");
  await page.waitForFunction(() => {
    // Touch devices default to justified.
    const grid = document.querySelector('[aria-label="Image results justified"]');
    return grid && grid.querySelectorAll("[data-grid-cell]").length > 3;
  }, { timeout: 15_000 });
  // Ensure clean slate
  await clearSelection(page);
});

test("desktop touch keeps checkboxes and long-press selection together", async ({ page }) => {
  await page.setViewportSize({ width: 1122, height: 856 });
  await expect(page.locator("html")).toHaveAttribute("data-shell", "wide");
  const checkbox = page.locator("[data-grid-cell]").first().locator("[data-tickbox]");
  await expect(checkbox).toBeVisible();
  await checkbox.tap();
  expect(await getSelectionCount(page)).toBe(1);
  await expect(page.getByRole("button", { name: "Deselect", exact: true })).toBeVisible();
  await clearSelection(page);
  const point = await getFirstTouchableCellRect(page);
  await beginLongPress(page, point.x, point.y);
  await endPress(page, point.x, point.y);
  expect(await getSelectionCount(page)).toBe(1);
  await expect(page.getByRole("button", { name: /selected.*actions/ })).toHaveCount(0);
});

test("phone typing does not accumulate partial Refine filters", async ({ page }) => {
  await expect(page.locator("html")).toHaveAttribute("data-shell", "compact");
  const editor = page.locator("cql-input [contenteditable=true]").first();
  await editor.click();
  await editor.pressSequentially("+has:crops", { delay: 450 });
  await expect.poll(() => new URL(page.url()).searchParams.get("query")).toMatch(/^\+?has:crops$/);
  await editor.press("Backspace");
  await expect.poll(() => new URL(page.url()).searchParams.get("query")).toMatch(/^\+?has:crop$/);
  await editor.pressSequentially("s");
  await page.getByRole("button", { name: "Filters and sort" }).tap();
  const refine = page.getByRole("dialog", { name: "Refine search" });
  await expect(refine).toBeVisible();
  await expect(refine.getByRole("button", { name: /^Remove / })).toHaveCount(1);
  await expect(refine.getByRole("button", { name: "Remove has:crops", exact: true })).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.get("query")).toMatch(/^\+?has:crops$/);
});

test("phone preserves existing Refine filters when replacing or clearing its draft", async ({ page }) => {
  await page.goto("/search?nonFree=true&query=credit%3AGetty");
  const editor = page.locator("cql-input [contenteditable=true]").first();
  await editor.fill("tennis has:c");
  await expect.poll(() => new URL(page.url()).searchParams.get("query")).toBe("credit:Getty has:c tennis");
  await editor.fill("football has:crops");
  await expect.poll(() => new URL(page.url()).searchParams.get("query")).toBe("credit:Getty has:crops football");
  await editor.fill("");
  await expect.poll(() => new URL(page.url()).searchParams.get("query")).toBe("credit:Getty");
  await editor.fill("has:crops");
  await expect.poll(() => new URL(page.url()).searchParams.get("query")).toBe("credit:Getty has:crops");
  await page.getByRole("button", { name: "Clear search", exact: true }).tap();
  await expect.poll(() => new URL(page.url()).searchParams.get("query")).toBe("credit:Getty");
  await editor.click();
  await editor.pressSequentially("+has:crops");
  await page.getByRole("button", { name: "Filters and sort" }).tap();
  const refine = page.getByRole("dialog", { name: "Refine search" });
  await expect(refine.getByRole("button", { name: /^Remove / })).toHaveCount(2);
  await expect(refine.getByRole("button", { name: "Remove credit:Getty", exact: true })).toBeVisible();
  await expect(refine.getByRole("button", { name: "Remove has:crops", exact: true })).toBeVisible();
});

test("phone keeps an unfinished field available after leaving the searchbox", async ({ page }) => {
  const editor = page.locator("cql-input [contenteditable=true]").first();
  await editor.click();
  await editor.pressSequentially("+credit:");
  await page.getByRole("button", { name: "Settings", exact: true }).tap();
  await expect(editor).toContainText("credit");
  expect(new URL(page.url()).searchParams.get("query")).toBeNull();
  await page.getByRole("button", { name: "Settings", exact: true }).tap();
  await editor.click();
  await editor.press("End");
  await editor.pressSequentially("Getty");
  await expect.poll(() => new URL(page.url()).searchParams.get("query")).toBe("credit:Getty");
});

test("phone discards an unfinished draft's filter baseline after Home", async ({ page }) => {
  await page.goto("/search?nonFree=true&query=credit%3AGetty");
  const editor = page.locator("cql-input [contenteditable=true]").first();
  await editor.click();
  await editor.pressSequentially("+by:");
  await page.getByRole("link", { name: "Grid", exact: true }).tap();
  await expect.poll(() => new URL(page.url()).searchParams.get("query")).toBeNull();
  await editor.fill("football");
  await expect.poll(() => new URL(page.url()).searchParams.get("query")).toBe("football");
});

test("phone does not retain removed Refine filters in an unfinished draft", async ({ page }) => {
  const editor = page.locator("cql-input [contenteditable=true]").first();
  await editor.fill("has:crops by:");
  await expect.poll(() => new URL(page.url()).searchParams.get("query")).toBe("has:crops");
  await page.getByRole("button", { name: "Filters and sort" }).tap();
  const refine = page.getByRole("dialog", { name: "Refine search" });
  await refine.getByRole("button", { name: "Remove has:crops", exact: true }).tap();
  await expect.poll(() => new URL(page.url()).searchParams.get("query")).toBeNull();
  await expect(editor).not.toContainText("crops");
  await page.keyboard.press("Escape");
  await editor.fill("by:Getty");
  await expect.poll(() => new URL(page.url()).searchParams.get("query")).toBe("by:Getty");
});

test("phone keeps Refine and overlay suggestions available after rotating to landscape", async ({ page }) => {
  await page.setViewportSize({ width: 852, height: 393 });
  await expect(page.locator("html")).toHaveAttribute("data-shell", "compact");
  const toolbar = page.getByRole("toolbar", { name: "Search and filter controls" });
  await expect(toolbar.getByRole("button", { name: "Filters and sort" })).toBeVisible();
  await expect(toolbar.getByRole("checkbox")).toBeHidden();
  await expect(page.locator("cql-input .Cql__TypeaheadPopoverContainer")).toHaveCSS("position", "fixed");
  const session = await page.context().newCDPSession(page);
  let active = false;
  try {
    for (const control of [toolbar.getByRole("link", { name: "Grid", exact: true }),
      toolbar.getByRole("button", { name: "Filters and sort" }), toolbar.getByRole("button", { name: "Settings", exact: true })]) {
      const background = () => control.evaluate(element => getComputedStyle(element).backgroundColor);
      const before = await background();
      const bounds = (await control.boundingBox())!;
      await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [
        { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2, id: 0 },
      ] });
      active = true;
      await expect.poll(background).not.toBe(before);
      await session.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
      active = false;
      await expect.poll(background).toBe(before);
    }
  } finally {
    if (active) await session.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
    await session.detach();
  }
  await page.goto("/search?nonFree=true&query=tennis%20city%3ALondon&orderBy=credit");
  await toolbar.getByRole("button", { name: "Filters and sort" }).tap();
  const refine = page.getByRole("dialog", { name: "Refine search" });
  await expect(refine).toBeVisible();
  await refine.getByRole("button", { name: "Reset", exact: true }).tap();
  await expect.poll(() => {
    const params = new URL(page.url()).searchParams;
    return { query: params.get("query"), orderBy: params.get("orderBy") };
  }).toEqual({ query: "tennis", orderBy: null });
  await refine.getByRole("button", { name: "Add filter", exact: true }).tap();
  await refine.getByRole("button", { name: "usages@status", exact: true }).tap();
  const input = refine.getByRole("combobox", { name: "Filter value" });
  const followingControl = refine.getByRole("checkbox").first();
  const beforeSuggestions = (await followingControl.boundingBox())!;
  await input.fill("p");
  const suggestions = refine.getByRole("listbox", { name: "Suggestions for usages@status" });
  await expect(suggestions).toBeVisible();
  await expect(suggestions.getByRole("option")).toHaveCount(2);
  await expect(suggestions).toHaveCSS("position", "absolute");
  expect((await followingControl.boundingBox())!.y).toBeCloseTo(beforeSuggestions.y, 1);
  const popup = (await suggestions.boundingBox())!;
  expect(popup.y).toBeGreaterThanOrEqual(0);
  expect(popup.y + popup.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
  await suggestions.getByRole("option", { name: "pending", exact: true }).tap();
  await expect.poll(() => new URL(page.url()).searchParams.get("query")).toContain("usages@status:pending");
});

test("holding the reveal button does not select or open a protected thumbnail", async ({ page }) => {
  await page.route("**/src/lib/image-urls.ts*", route => route.fulfill({ contentType: "application/javascript", body: `
    export const thumbnailsEnabled = true;
    export const getThumbnailUrl = image => '/__detail_media/' + image.id + '.svg';
    export const getFullImageUrl = getThumbnailUrl;
    export const getZoomImageUrl = getThumbnailUrl;
  ` }));
  await page.reload();
  await expect.poll(() => page.locator("[data-grid-cell]").count()).toBeGreaterThan(3);
  await page.evaluate(() => {
    const store = (window as any).__kupua_store__;
    store.setState({ results: store.getState().results.map((image: any, index: number) => index < 2
      ? { ...image, aliases: { ...image.aliases, adultContentWarning: true } } : image) });
  });
  const cell = page.locator("[data-grid-cell]").first();
  const image = cell.locator("img").first();
  const button = cell.getByRole("button", { name: "Hold to reveal image" });
  await expect(button).toBeVisible();
  await expect(cell.getByText("Hold to reveal", { exact: true })).toBeVisible();
  await expect(image).toHaveCSS("filter", /blur/);
  await button.locator("..").screenshot({ path: test.info().outputPath("reveal-warning.png") });
  const bounds = (await button.boundingBox())!;
  const session = await page.context().newCDPSession(page);
  let active = false;
  try {
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [
      { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2, id: 0 },
    ] });
    active = true;
    await expect(image).toHaveCSS("filter", "none");
    await page.waitForTimeout(650);
    expect(await getSelectionCount(page)).toBe(0);
    await expect(page.locator("[data-detail-image-id]")).toHaveCount(0);
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    active = false;
    await expect(image).toHaveCSS("filter", /blur/);
  } finally {
    if (active) await session.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
    await session.detach();
  }
  await page.evaluate(async () => {
    const modulePath = "/src/stores/zoom-store.ts";
    const { useZoomStore } = await import(modulePath);
    const prefsPath = "/src/stores/ui-prefs-store.ts";
    const { useUiPrefsStore } = await import(prefsPath);
    const density = useUiPrefsStore.getState().density;
    const state = useZoomStore.getState();
    state.setOffset(density, state.ranges[density][0]);
  });
  await expect.poll(async () => (await cell.boundingBox())!.width).toBeLessThan(160);
  await expect(cell.getByText("Hold to reveal", { exact: true })).toHaveCount(0);
  await expect(button).toBeVisible();
  await button.locator("..").screenshot({ path: test.info().outputPath("reveal-icon-only.png") });
});

test("installed phone moves controls above a full-width search without changing browser layout", async ({ page }) => {
  const toolbar = page.getByRole("toolbar", { name: "Search and filter controls" });
  const search = toolbar.getByRole("search");
  const browserBox = await search.boundingBox();
  expect(browserBox).not.toBeNull();
  expect(browserBox!.y).toBeLessThan(44);
  await page.addInitScript(() => {
    const matchMedia = window.matchMedia.bind(window);
    window.matchMedia = query => {
      const result = matchMedia(query);
      if (query.includes("display-mode:")) Object.defineProperty(result, "matches", { value: true });
      return result;
    };
  });
  await page.reload();
  await expect(search).toBeVisible();
  const installedBox = (await search.boundingBox())!;
  expect(installedBox.x).toBeCloseTo(12, 0);
  expect(installedBox.width).toBeCloseTo(page.viewportSize()!.width - 24, 0);
  for (const control of [toolbar.getByRole("link", { name: "Grid" }),
    toolbar.getByRole("button", { name: "Filters and sort" }), toolbar.getByRole("button", { name: "Settings", exact: true })]) {
    const box = (await control.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(installedBox.y);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await toolbar.getByRole("button", { name: "Settings", exact: true }).tap();
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  const suggestionTop = await page.locator("cql-input .Cql__TypeaheadPopoverContainer").evaluate(element => parseFloat(getComputedStyle(element).top));
  expect(suggestionTop).toBeGreaterThanOrEqual(installedBox.y + installedBox.height);
  await toolbar.getByRole("button", { name: "Filters and sort" }).tap();
  await expect(page.getByRole("dialog", { name: "Refine search" })).toBeVisible();
  await page.getByRole("button", { name: "Close filters" }).tap();
  const homeBox = await toolbar.getByRole("link", { name: "Grid" }).boundingBox();
  const settingsBox = await toolbar.getByRole("button", { name: "Settings", exact: true }).boundingBox();
  await expect.poll(() => page.locator("[data-grid-cell]").count()).toBeGreaterThan(3);
  const point = await getFirstTouchableCellRect(page);
  await page.touchscreen.tap(point.x, point.y);
  const detailToolbar = page.locator(".detail-toolbar");
  await expect(detailToolbar).toBeVisible();
  expect(await detailToolbar.getByRole("link", { name: "Grid" }).boundingBox()).toEqual(homeBox);
  expect(await detailToolbar.getByRole("button", { name: "Settings", exact: true }).boundingBox()).toEqual(settingsBox);
  const detailBackBox = (await detailToolbar.getByRole("button", { name: "Back to search", exact: true }).boundingBox())!;
  const counterBox = (await detailToolbar.locator(".detail-position").boundingBox())!;
  expect(counterBox.x).toBe(detailBackBox.x + detailBackBox.width);
  expect(counterBox.x + counterBox.width / 2).toBeLessThan(page.viewportSize()!.width / 2);
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute("content", /viewport-fit=cover/);
  await detailToolbar.getByRole("button", { name: "Crop image", exact: true }).tap();
  const crop = page.getByRole("dialog", { name: "Crop image", exact: true });
  await expect(crop).toBeVisible();
  expect(await crop.getByRole("link", { name: "Grid" }).boundingBox()).toEqual(homeBox);
  expect(await crop.getByRole("button", { name: "Settings", exact: true }).boundingBox()).toEqual(settingsBox);
  const zoom = crop.getByRole("button", { name: "Zoom in", exact: true });
  await expect(zoom).toBeVisible();
  const backBox = (await crop.getByRole("button", { name: "Back to image", exact: true }).boundingBox())!;
  const zoomBox = (await zoom.boundingBox())!;
  expect(zoomBox.x).toBe(backBox.x + backBox.width);
  expect(zoomBox.y).toBe(backBox.y);
  const action = crop.getByRole("button", { name: "Crop", exact: true });
  await expect(action).toBeEnabled();
  const actionBox = (await action.boundingBox())!;
  expect(actionBox.x + actionBox.width).toBe(settingsBox!.x);
  expect(actionBox.y).toBe(settingsBox!.y);
  await zoom.tap();
  const fit = crop.getByRole("button", { name: "Fit image", exact: true });
  const pan = crop.getByRole("button", { name: "Pan view", exact: true });
  await expect(fit).toBeVisible();
  await expect(pan).toBeVisible();
  const fitBox = (await fit.boundingBox())!;
  const panBox = (await pan.boundingBox())!;
  expect(panBox.x).toBe(fitBox.x + fitBox.width);
  expect(panBox.y).toBe(fitBox.y);
  expect(panBox.x + panBox.width).toBeLessThanOrEqual(actionBox.x);
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute("content", /viewport-fit=cover/);
});

for (const density of ["grid", "justified"] as const) {
  test(`phone ${density} pinch pins the touched image instead of the selection anchor`, async ({ page }) => {
    await page.route("**/src/lib/image-urls.ts*", route => route.fulfill({ contentType: "application/javascript", body: `
      export const thumbnailsEnabled = true;
      export const getThumbnailUrl = image => '/__detail_media/' + image.id + '.svg';
      export const getFullImageUrl = getThumbnailUrl;
      export const getZoomImageUrl = getThumbnailUrl;
    ` }));
    await page.reload();
    await page.evaluate(async density => {
      const prefsPath = "/src/stores/ui-prefs-store.ts";
      const zoomPath = "/src/stores/zoom-store.ts";
      const { useUiPrefsStore } = await import(prefsPath);
      const { useZoomStore } = await import(zoomPath);
      useUiPrefsStore.setState({ blurGraphicImages: false });
      useUiPrefsStore.getState().setDensity(density);
      if (density === "grid") useZoomStore.getState().setOffset("grid", -2);
    }, density);
    const region = page.getByRole("region", { name: `Image results ${density}`, exact: true });
    await expect(region).toBeVisible();
    await region.evaluate(element => { element.scrollTop = 1500; });
    const readCandidates = () => region.evaluate(element => {
      const container = element.getBoundingClientRect();
      return [...element.querySelectorAll("[data-grid-cell]")].filter(cell => {
        const bounds = cell.getBoundingClientRect();
        return bounds.top > container.top + 40 && bounds.bottom < container.bottom - 40;
      }).map(cell => cell.getAttribute("data-image-id")!);
    });
    await expect.poll(async () => (await readCandidates()).length).toBeGreaterThan(1);
    const candidates = await readCandidates();
    const id = candidates[0];
    const selectedId = candidates.at(-1)!;
    await page.evaluate(selectedId => {
      const store = (window as any).__kupua_selection_store__.getState();
      store.add([selectedId]);
      store.setAnchor(selectedId);
    }, selectedId);
    const cell = region.locator(`[data-image-id="${id}"]`);
    const readPoint = () => cell.evaluate(element => {
      const image = element.querySelector(":scope > div")!;
      const bounds = image.getBoundingClientRect();
      return { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height * 0.35,
        spread: Math.min(20, bounds.width * 0.15) };
    });
    const before = await readPoint();
    const readFocus = () => page.evaluate(async () => {
      const path = "/src/stores/search-store.ts";
      return (await import(path)).useSearchStore.getState().focusedImageId;
    });
    const focusedId = await readFocus();
    await expect.poll(() => region.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      return [...element.querySelectorAll("img")].filter(image => {
        const rect = image.getBoundingClientRect();
        return rect.bottom > bounds.top && rect.top < bounds.bottom;
      }).every(image => image.complete && image.naturalWidth > 0);
    })).toBe(true);
    const key = `kupua-${density}-zoom`;
    const offset = await page.evaluate(key => Number(sessionStorage.getItem(key) ?? 0), key);
    const cdp = await page.context().newCDPSession(page);
    let contactsActive = false;
    const touch = async (type: "touchStart" | "touchMove" | "touchEnd" | "touchCancel", factor = 1, point = before) => {
      await cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" || type === "touchCancel" ? [] : [
        { id: 1, x: point.x - point.spread * factor, y: point.y },
        { id: 2, x: point.x + point.spread * factor, y: point.y },
      ] });
      contactsActive = type === "touchStart" || type === "touchMove";
    };
    try {
      await touch("touchStart");
      await touch("touchMove", 1.3);
      if (density === "justified") {
        const renderer = page.locator("[data-zoom-morph-renderer=dom]");
        await expect(renderer).toBeVisible();
        await expect(renderer.locator(`img[src$="/${id}.svg"]`)).toHaveCount(1);
      }
      await touch("touchEnd");
      await expect.poll(() => page.evaluate(key => Number(sessionStorage.getItem(key) ?? 0), key)).toBe(offset + 1);
      await expect(page.locator("[data-justified-zoom-preview]")).toHaveCount(0);
      await expect.poll(() => cell.evaluate(element => {
        const bounds = element.querySelector(":scope > div")!.getBoundingClientRect();
        return bounds.top + bounds.height * 0.35;
      })).toBeCloseTo(before.y, 0);
      const cancelPoint = await readPoint();
      await touch("touchStart", 1, cancelPoint);
      await touch("touchMove", 0.8, cancelPoint);
      if (density === "justified") await expect(page.locator("[data-zoom-morph-renderer=dom]")).toBeVisible();
      await touch("touchCancel");
      await expect(page.locator("[data-justified-zoom-preview]")).toHaveCount(0);
      expect(await page.evaluate(key => Number(sessionStorage.getItem(key)), key)).toBe(offset + 1);
      await expect.poll(async () => (await readPoint()).y).toBeCloseTo(before.y, 0);
      const selectedCell = region.locator(`[data-image-id="${selectedId}"]`);
      await selectedCell.scrollIntoViewIfNeeded();
      await expect(selectedCell).toBeInViewport();
      const selectedTop = await selectedCell.evaluate(element => element.getBoundingClientRect().top);
      await page.evaluate(async density => {
        const path = "/src/stores/zoom-store.ts";
        (await import(path)).useZoomStore.getState().step(density, -1);
      }, density);
      await expect(page.locator("[data-justified-zoom-preview]")).toHaveCount(0);
      await expect.poll(() => selectedCell.evaluate(element => element.getBoundingClientRect().top)).toBeCloseTo(selectedTop, 0);
      expect(await getSelectionIds(page)).toEqual([selectedId]);
      expect(await readFocus()).toBe(focusedId);
    } finally {
      try {
        if (contactsActive) await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
      } finally {
        await cdp.detach();
      }
    }
  });
}

test("detail toolbar labels collapse without crowding navigation or the locator", async ({ page }) => {
  await page.evaluate(() => { document.documentElement.requestFullscreen = () => Promise.reject(new Error("Fullscreen unavailable")); });
  const point = await getFirstTouchableCellRect(page);
  await page.touchscreen.tap(point.x, point.y);
  const toolbar = page.locator("[data-detail-image-id] > header");
  const back = toolbar.getByRole("button", { name: "Back to search", exact: true });
  const crop = toolbar.getByRole("button", { name: "Crop image", exact: true });
  const position = toolbar.locator(":scope > span").first();
  for (const [width, backText, cropText] of [[320, "", ""], [412, "", "Crop"], [900, "Back to search", "Crop image"]] as const) {
    await page.setViewportSize({ width, height: 852 });
    await expect(back).toBeVisible();
    await expect(crop).toBeVisible();
    await expect.poll(() => back.innerText()).toBe(backText);
    await expect.poll(() => crop.innerText()).toBe(cropText);
    await expect(position).toHaveCSS("font-variant-numeric", "tabular-nums");
    await expect(position).toHaveCSS("flex-direction", width < 664 ? "column" : "row");
    await expect.poll(() => position.evaluate((element, desktop) => {
      const [current, total] = [...element.children].map(child => getComputedStyle(child));
      return (desktop ? current.fontSize === total.fontSize : parseFloat(current.fontSize) > parseFloat(total.fontSize))
        && Number(current.fontWeight) > Number(total.fontWeight) && current.color !== total.color;
    }, width === 900)).toBe(true);
    expect(await toolbar.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      return element.scrollWidth <= element.clientWidth && [...element.children].every(child => {
        const rect = child.getBoundingClientRect();
        return rect.left >= bounds.left && rect.right <= bounds.right
          && rect.top >= bounds.top - 1 && rect.bottom <= bounds.bottom + 1;
      });
    })).toBe(true);
    expect((await back.boundingBox())!.width).toBeGreaterThanOrEqual(width < 640 ? 32 : 44);
    expect((await crop.boundingBox())!.width).toBeGreaterThanOrEqual(44);
  }
  await page.setViewportSize({ width: 412, height: 852 });
  const actionRightGuide = (await toolbar.getByRole("button", { name: "Settings", exact: true }).boundingBox())!.x;
  await crop.click();
  const cropBack = page.getByRole("dialog", { name: "Crop image" }).getByRole("button", { name: "Back to image", exact: true });
  await expect(cropBack).toBeVisible();
  const blueFace = (await page.getByRole("dialog", { name: "Crop image" }).getByRole("button", { name: "Crop", exact: true }).locator(":scope > span").boundingBox())!;
  expect(Math.abs(blueFace.x + blueFace.width - actionRightGuide)).toBeLessThanOrEqual(1);
  expect(await cropBack.innerText()).toBe("");
  await cropBack.click();
  await expect(back).toBeVisible();
});

test("detail metadata wraps long values without horizontal panel scrolling", async ({ page }) => {
  await page.evaluate(() => { document.documentElement.requestFullscreen = () => Promise.reject(new Error("Fullscreen unavailable")); });
  const longValue = "VERYLONGWORDWITHOUTANYSPACES".repeat(8);
  await page.evaluate(longValue => {
    const store = (window as any).__kupua_store__;
    store.setState({ results: store.getState().results.map((image: any) => ({
      ...image,
      metadata: { ...image.metadata, title: longValue, credit: longValue },
      usageRights: { ...image.usageRights, restrictions: longValue },
    })) });
  }, longValue);
  const point = await getFirstTouchableCellRect(page);
  await page.touchscreen.tap(point.x, point.y);
  const panel = page.getByRole("region", { name: "Image details", exact: true });
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "Expand Image details", exact: true }).click();
  const credit = panel.locator('button[data-cql-key="credit"]').filter({ hasText: longValue });
  await expect(credit).toHaveCSS("user-select", "text");
  await expect(credit).toBeVisible();
  expect(await credit.evaluate(element => element.getBoundingClientRect().width <= element.parentElement!.getBoundingClientRect().width)).toBe(true);
  expect(await panel.evaluate(element => Array.from(element.querySelectorAll("dd")).every(value => value.scrollWidth <= value.clientWidth))).toBe(true);
  const restriction = panel.getByText("Restricted use:", { exact: true }).locator("..");
  expect(await restriction.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  const body = panel.locator(":scope > div").last();
  expect(await body.evaluate(element => element.scrollWidth)).toBe(await body.evaluate(element => element.clientWidth));
  await expect(body).toHaveCSS("overflow-x", "hidden");
  await credit.scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath("metadata-mobile.png") });

  await page.setViewportSize({ width: 1024, height: 852 });
  const sidebar = page.locator("aside").filter({ has: page.locator('button[data-cql-key="credit"]').filter({ hasText: longValue }) });
  await expect(sidebar).toBeVisible();
  expect(await sidebar.evaluate(element => Array.from(element.querySelectorAll("dd")).every(value => value.scrollWidth <= value.clientWidth))).toBe(true);
  expect(await sidebar.getByText("Restricted use:", { exact: true }).locator("..").evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await sidebar.locator('button[data-cql-key="credit"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath("metadata-desktop.png") });
});

test("installed phone retains black image-only detail when rotated", async ({ page }) => {
  await page.addInitScript(() => {
    const matchMedia = window.matchMedia.bind(window);
    window.matchMedia = query => {
      const result = matchMedia(query);
      if (query.includes("display-mode:")) Object.defineProperty(result, "matches", { value: true });
      return result;
    };
  });
  await page.reload();
  await expect.poll(() => page.locator('[data-grid-cell]').count()).toBeGreaterThan(3);
  const point = await getFirstTouchableCellRect(page);
  await page.touchscreen.tap(point.x, point.y);
  const detail = page.locator("[data-detail-image-id]");
  const image = page.getByTestId("detail-image-container").locator('img[fetchpriority="high"]');
  const imageId = await detail.getAttribute("data-detail-image-id");
  await image.tap();
  await expect(detail.locator(":scope > header")).toBeHidden();
  await page.setViewportSize({ width: 852, height: 393 });
  await expect(page.locator("html")).toHaveAttribute("data-shell", "compact");
  await expect(detail).toHaveAttribute("data-detail-image-id", imageId!);
  await expect(detail.locator(":scope > header")).toBeHidden();
  await expect(detail.locator("aside")).toHaveCount(0);
  await expect(page.getByTestId("detail-image-container")).toHaveCSS("background-color", "rgb(0, 0, 0)");
  const imageBox = (await image.boundingBox())!;
  const surfaceBox = (await page.getByTestId("detail-image-container").boundingBox())!;
  await expect(image).toHaveCSS("object-fit", "contain");
  expect(imageBox.width).toBeCloseTo(surfaceBox.width, 0);
  expect(imageBox.height).toBeCloseTo(surfaceBox.height, 0);
  expect(imageBox.x).toBeGreaterThanOrEqual(surfaceBox.x);
  expect(imageBox.y).toBeGreaterThanOrEqual(surfaceBox.y);
  expect(imageBox.x + imageBox.width).toBeLessThanOrEqual(surfaceBox.x + surfaceBox.width);
  expect(imageBox.y + imageBox.height).toBeLessThanOrEqual(surfaceBox.y + surfaceBox.height);
  await image.tap();
  await expect(detail.locator(":scope > header")).toBeVisible();
  await expect(page.getByRole("region", { name: "Image details", exact: true })).toBeVisible();
  await image.tap();
  await expect(detail.locator(":scope > header")).toBeHidden();
  await page.setViewportSize({ width: 393, height: 852 });
  await expect(detail).toHaveAttribute("data-detail-image-id", imageId!);
  await expect(detail.locator(":scope > header")).toBeHidden();
});

test("installed mobile detail does not request native fullscreen", async ({ page }) => {
  await page.addInitScript(() => {
    const matchMedia = window.matchMedia.bind(window);
    window.matchMedia = query => {
      const result = matchMedia(query);
      if (query.includes("display-mode:")) Object.defineProperty(result, "matches", { value: true });
      return result;
    };
    const request = Element.prototype.requestFullscreen;
    Element.prototype.requestFullscreen = function(...args) {
      (window as any).__fullscreenRequests = ((window as any).__fullscreenRequests ?? 0) + 1;
      return request.apply(this, args);
    };
  });
  await page.reload();
  await expect.poll(() => page.locator('[data-grid-cell]').count()).toBeGreaterThan(3);
  const point = await getFirstTouchableCellRect(page);
  await page.touchscreen.tap(point.x, point.y);
  await expect(page.getByRole("region", { name: "Image details", exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__fullscreenRequests ?? 0)).toBe(0);
  expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
});

test("mobile detail remains usable when browser fullscreen is rejected", async ({ page }) => {
  await page.addInitScript(() => {
    Element.prototype.requestFullscreen = () => Promise.reject(new Error("Fullscreen unavailable"));
  });
  await page.reload();
  await expect.poll(() => page.locator('[data-grid-cell]').count()).toBeGreaterThan(3);
  const point = await getFirstTouchableCellRect(page);
  await page.touchscreen.tap(point.x, point.y);
  const detail = page.locator("[data-detail-image-id]");
  await expect(page.getByRole("region", { name: "Image details", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
  await detail.locator('img[fetchpriority="high"]').tap();
  await expect(page.getByRole("region", { name: "Image details", exact: true })).toHaveCount(0);
  await expect(detail).toBeVisible();
});

async function swipe(page: Page, target: Locator, dx: number, dy = 0, duringDrag?: () => Promise<void>, cancel = false, startYFraction?: number) {
    await target.scrollIntoViewIfNeeded();
    const bounds = await target.boundingBox();
    if (!bounds) throw new Error("Swipe target is not visible");
    const x = bounds.x + bounds.width * (dx < 0 ? 0.8 : dx > 0 ? 0.2 : 0.5);
    const y = Math.min(bounds.y + bounds.height * (startYFraction ?? (dy < 0 ? 0.8 : 0.2)), page.viewportSize()!.height - 30);
    const session = await page.context().newCDPSession(page);
    let active = false;
    try {
      await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
      active = true;
      for (let step = 1; step <= 6; step++) {
        await session.send("Input.dispatchTouchEvent", {
          type: "touchMove", touchPoints: [{ x: x + dx * step / 6, y: y + dy * step / 6 }],
        });
      }
      await duringDrag?.();
      await session.send("Input.dispatchTouchEvent", { type: cancel ? "touchCancel" : "touchEnd", touchPoints: [] });
      active = false;
    } finally {
      try {
        if (active) await session.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
      } finally {
        await session.detach();
      }
    }
}

test.describe("detail metadata gestures", () => {
  test.beforeEach(async ({ page }) => {
    await page.evaluate(() => {
      const store = (window as any).__kupua_store__;
      store.setState({ results: store.getState().results.map((image: any, index: number) => ({
        ...image, metadata: { ...image.metadata, title: `Swipe image ${index}`, credit: `Swipe credit ${index}` },
      })) });
    });
    const point = await getFirstTouchableCellRect(page);
    await page.touchscreen.tap(point.x, point.y);
    await expect(page.getByRole("region", { name: "Image details", exact: true })).toBeVisible();
  });

  test("integrated Actions distinguish native taps from card drags", async ({ page }) => {
    const card = page.getByRole("region", { name: "Image details", exact: true });
    const title = card.getByRole("button", { name: "Expand Image details", exact: true });
    const trigger = card.getByRole("button", { name: "Image actions", exact: true });
    const options = page.getByRole("group", { name: "Image action options", exact: true });
    const initial = (await card.boundingBox())!;
    const control = (await trigger.boundingBox())!;
    expect(control.y).toBeGreaterThanOrEqual(initial.y);
    expect(control.y + control.height).toBeLessThanOrEqual(initial.y + 64);
    expect(page.viewportSize()!.height - control.y - control.height).toBeCloseTo(8, 0);
    const titleBounds = (await title.boundingBox())!;
    expect(titleBounds.y + titleBounds.height / 2).toBeCloseTo(control.y + control.height / 2, 0);
    await expect(title).toHaveText("Swipe image 0");
    await swipe(page, trigger, 0, 3, async () => {
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
      expect((await card.boundingBox())!.y).toBeCloseTo(initial.y, 0);
    });
    await expect(options).toBeVisible();
    await options.evaluate(async element => { await Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => {}))); });
    expect((await options.boundingBox())!.width).toBe(136);
    await expect(card.locator(".selection-fab-glass")).toHaveCSS("background-color", "rgba(98, 98, 98, 0.85)");
    await expect(card.locator(".selection-fab-glass")).toHaveCSS("background-image", "none");
    await expect(card.locator(".selection-fab-glass")).toHaveCSS("backdrop-filter", "none");
    await expect(options.getByRole("button", { name: "Details", exact: true })).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath("detail-header-actions-peek.png"), animations: "disabled" });
    await swipe(page, trigger, 0, -280, async () => {
      await expect(options).toHaveCount(0);
      expect((await card.boundingBox())!.y).toBeLessThan(initial.y - 200);
    });
    await expect(card.getByRole("button", { name: "Collapse Image details", exact: true })).toBeVisible();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await trigger.tap();
    await expect(options).toBeVisible();
    await expect(options.getByRole("button", { name: "Close details", exact: true })).toHaveCount(0);
    const triggerBox = (await trigger.boundingBox())!;
    expect((await options.boundingBox())!.y).toBeGreaterThanOrEqual(triggerBox.y + triggerBox.height - 1);
    await page.screenshot({ path: test.info().outputPath("detail-header-actions-expanded.png"), animations: "disabled" });
    await options.getByRole("button", { name: "Share with URL", exact: true }).tap();
    await expect(options).toHaveCount(0);
    await expect(page.getByText("Not sent - Share with URL", { exact: true })).toHaveCount(1);
    await expect(card.getByRole("button", { name: "Collapse Image details", exact: true })).toBeVisible();
    await card.getByRole("button", { name: "Collapse Image details", exact: true }).tap();
    await expect(title).toBeVisible();
  });

  test("browser detail enters fullscreen and native exit returns to results", async ({ page }) => {
    const detail = page.locator("[data-detail-image-id]");
    await expect.poll(() => page.evaluate(() => document.fullscreenElement === document.documentElement)).toBe(true);
    await page.evaluate(() => document.exitFullscreen());
    await expect(detail).toHaveCount(0);
    expect(new URL(page.url()).searchParams.has("image")).toBe(false);
    await expect(page.getByRole("region", { name: "Image results justified" })).toBeVisible();
  });

  test("browser fullscreen keeps image-only detail on phone rotation", async ({ page }) => {
    const detail = page.locator("[data-detail-image-id]");
    const imageId = await detail.getAttribute("data-detail-image-id");
    const image = page.getByTestId("detail-image-container").locator('img[fetchpriority="high"]');
    await expect.poll(() => page.evaluate(() => document.fullscreenElement === document.documentElement)).toBe(true);
    await image.tap();
    await expect(detail.locator(":scope > header")).toBeHidden();
    const session = await page.context().newCDPSession(page);
    try {
      await session.send("Emulation.setDeviceMetricsOverride", {
        width: 852, height: 393, deviceScaleFactor: 2.75, mobile: true,
        screenOrientation: { type: "landscapePrimary", angle: 90 },
      });
      await expect.poll(() => page.evaluate(() => innerWidth)).toBe(852);
      await expect(page.locator("html")).toHaveAttribute("data-shell", "compact");
      await expect(detail).toHaveAttribute("data-detail-image-id", imageId!);
      await expect(detail.locator(":scope > header")).toBeHidden();
      await expect(detail.locator("aside")).toHaveCount(0);
      await expect.poll(() => page.evaluate(() => document.fullscreenElement === document.documentElement)).toBe(true);
    } finally {
      await session.send("Emulation.clearDeviceMetricsOverride");
      await session.detach();
    }
  });

  test("browser history Back leaves fullscreen detail without an extra navigation", async ({ page }) => {
    const detail = page.locator("[data-detail-image-id]");
    await expect.poll(() => page.evaluate(() => document.fullscreenElement === document.documentElement)).toBe(true);
    await page.goBack();
    await expect(detail).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Image results justified" })).toBeVisible();
    expect(new URL(page.url()).searchParams.has("image")).toBe(false);
    expect(new URL(page.url()).pathname).toBe("/search");
  });

  test("mobile Crop zooms and pans the view without changing the crop", async ({ page }) => {
    await page.getByRole("button", { name: "Crop image", exact: true }).click();
    const editor = page.getByRole("dialog", { name: "Crop image", exact: true });
    await expect(editor.getByRole("button", { name: "Crop", exact: true })).toBeEnabled();
    await expect(editor.getByRole("button", { name: "Fit image" })).toHaveCount(0);
    await expect(editor.getByRole("button", { name: "Pan view" })).toHaveCount(0);
    await editor.getByRole("radio", { name: "freeform", exact: true }).click();
    await editor.getByRole("button", { name: "Edit crop coordinates" }).click();
    for (const field of ["width", "height"]) {
      const input = editor.getByRole("spinbutton", { name: `Crop ${field}` });
      await input.fill(String(Math.floor(Number(await input.inputValue()) / 2)));
      await input.blur();
    }
    await editor.getByRole("button", { name: "Done editing coordinates" }).click();
    const canvas = editor.locator("cropper-canvas");
    const rectangle = () => canvas.evaluate(element => {
      const selection = element.querySelector("cropper-selection") as import("cropperjs").CropperSelection;
      const image = element.querySelector("cropper-image") as import("cropperjs").CropperImage;
      const media = image.$getShadowRoot().querySelector("img")!;
      const [scaleX, , , scaleY, offsetX, offsetY] = image.$getTransform();
      return [(selection.x - offsetX) / scaleX / media.naturalWidth, (selection.y - offsetY) / scaleY / media.naturalHeight,
        selection.width / scaleX / media.naturalWidth, selection.height / scaleY / media.naturalHeight];
    });
    const ready = () => canvas.evaluate(element => {
      const image = element.querySelector("cropper-image") as import("cropperjs").CropperImage;
      const media = image.$getShadowRoot().querySelector("img")!;
      return media.complete && media.naturalWidth > 0;
    });
    await expect.poll(ready).toBe(true);
    const before = await rectangle();
    const sameCrop = async () => (await rectangle()).every((value, index) => Number.isFinite(value) && Math.abs(value - before[index]) < 0.000001);
    const bounds = (await canvas.boundingBox())!;
    const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    const session = await page.context().newCDPSession(page);
    let active = false;
    try {
      await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [
        { id: 1, x: center.x - 30, y: center.y }, { id: 2, x: center.x + 30, y: center.y },
      ] });
      active = true;
      for (let step = 1; step <= 6; step++) {
        await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [
          { id: 1, x: center.x - 30 - step * 5 + step * 4, y: center.y + step * 2 },
          { id: 2, x: center.x + 30 + step * 5 + step * 4, y: center.y + step * 2 },
        ] });
      }
      await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      active = false;
      await expect.poll(ready).toBe(true);
      await expect.poll(sameCrop).toBe(true);
      expect((await editor.locator("cropper-image").boundingBox())!.width).toBeGreaterThan(bounds.width * 1.5);
      await expect(editor.getByText("Two-finger pan", { exact: true })).toBeVisible();
      await expect(editor.locator('[data-category="success"] svg[data-icon="hand"]')).toHaveCount(1);
      await expect(editor.locator("header").getByRole("button", { name: "Fit image" })).toBeVisible();
      const pan = editor.getByRole("button", { name: "Pan view", exact: true });
      await expect(pan).toHaveCSS("height", "44px");
      await expect(pan.locator(":scope > span")).toHaveCSS("height", "32px");
      const panFace = (await pan.locator(":scope > span").boundingBox())!;
      const cropFace = (await editor.getByRole("button", { name: "Crop", exact: true }).locator(":scope > span").boundingBox())!;
      expect(panFace.y).toBeCloseTo(cropFace.y, 0);
      expect(panFace.height).toBe(cropFace.height);
      await pan.click();
      await expect(editor.getByText("Two-finger pan", { exact: true })).toHaveCount(0);
      await swipe(page, canvas, 40, 0);
      await expect.poll(sameCrop).toBe(true);
      await editor.getByRole("button", { name: "Fit image" }).click();
      await expect(editor.getByRole("button", { name: "Pan view", exact: true })).toHaveCount(0);
      await expect(editor.getByRole("button", { name: "Crop", exact: true })).toBeFocused();
      await expect(editor.getByRole("button", { name: "Fit image" })).toHaveCount(0);
      await expect.poll(sameCrop).toBe(true);
      await swipe(page, editor.locator('cropper-handle[action="move"]').first(), 40, 0);
      await expect.poll(sameCrop).toBe(false);
      const imageBounds = (await editor.locator("cropper-image").boundingBox())!;
      const grip = (await editor.locator('cropper-handle[action="sw-resize"]').boundingBox())!;
      const start = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 };
      const edge = { x: Math.max(1, imageBounds.x - 4), y: start.y + (imageBounds.y + imageBounds.height - start.y) * 0.3 };
      const selection = editor.locator("cropper-selection");
      await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ id: 1, ...start }] });
      active = true;
      for (let step = 1; step <= 6; step++) {
        await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ id: 1,
          x: start.x + (edge.x - start.x) * step / 6, y: start.y + (edge.y - start.y) * step / 6,
        }] });
      }
      await expect.poll(async () => (await selection.boundingBox())!.x).toBeCloseTo(imageBounds.x, 0);
      const pinned = (await selection.boundingBox())!;
      for (let step = 1; step <= 6; step++) {
        await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ id: 1,
          x: edge.x, y: edge.y + (imageBounds.y + imageBounds.height + 4 - edge.y) * step / 6,
        }] });
      }
      await expect.poll(async () => { const frame = (await selection.boundingBox())!; return frame.y + frame.height; })
        .toBeCloseTo(imageBounds.y + imageBounds.height, 0);
      const reached = (await selection.boundingBox())!;
      expect(reached.y + reached.height).toBeGreaterThan(pinned.y + pinned.height + 10);
      expect(reached.x).toBeCloseTo(imageBounds.x, 0);
      expect(reached.x + reached.width).toBeCloseTo(pinned.x + pinned.width, 0);
      await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      active = false;
    } finally {
      if (active) await session.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
      await session.detach();
    }
  });

  test("mobile Crop separates its controls and preserves geometry through precision and Settings", async ({ page }) => {
    const detail = page.locator("[data-detail-image-id]");
    await detail.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(detail.getByRole("menu")).toBeVisible();
    await page.keyboard.press("Escape");
    await detail.getByRole("button", { name: "Crop image", exact: true }).click();
    const editor = page.getByRole("dialog", { name: "Crop image", exact: true });
    await expect(editor.getByRole("button", { name: "Crop", exact: true })).toBeEnabled();
    expect((await editor.locator("header").boundingBox())!.height).toBeLessThanOrEqual(45);
    expect(await editor.getByRole("button", { name: "Crop", exact: true }).evaluate(button => {
      const face = button.firstElementChild!.getBoundingClientRect();
      const header = button.closest("header")!.getBoundingClientRect();
      return button.getBoundingClientRect().height >= 44 && face.top > header.top && face.bottom < header.bottom;
    })).toBe(true);
    await expect(editor.getByRole("spinbutton")).toHaveCount(0);
    const canvas = editor.locator("cropper-canvas");
    const ratios = editor.getByRole("radiogroup", { name: "Crop ratio" });
    expect((await ratios.boundingBox())!.y).toBeGreaterThan((await canvas.boundingBox())!.y);
    expect(await editor.locator("footer button").evaluateAll(buttons => buttons.every(button => {
      const bounds = button.getBoundingClientRect();
      return bounds.width >= 44 && bounds.height >= 44;
    }))).toBe(true);
    const precision = editor.getByRole("button", { name: "Edit crop coordinates" });
    await precision.click();
    const coordinates = () => Promise.all(["x", "y", "width", "height"].map(field =>
      editor.getByRole("spinbutton", { name: `Crop ${field}` }).inputValue()));
    const width = editor.getByRole("spinbutton", { name: "Crop width" });
    await width.fill(String(Math.floor(Number(await width.inputValue()) / 2)));
    await width.blur();
    const edited = await coordinates();
    await editor.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(editor.getByRole("menu")).toBeVisible();
    await editor.locator('cropper-selection cropper-handle[action="move"]').tap();
    await expect(editor.getByRole("menu")).toHaveCount(0);
    await expect(editor).toBeVisible();
    await editor.getByRole("button", { name: "Settings", exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(editor).toBeVisible();
    await expect(precision).toHaveAttribute("aria-expanded", "true");
    await page.screenshot({ path: test.info().outputPath("crop-mobile-precision.png") });
    const panel = editor.getByTestId("crop-coordinate-panel");
    const panelBeforeDrag = (await panel.boundingBox())!;
    await expect(panel).toHaveCSS("border-top-width", "1px");
    await expect(editor.locator("footer")).toHaveCSS("border-top-width", "0px");
    await swipe(page, editor.getByTestId("crop-coordinate-handle"), 0, 100, async () => {
      await expect.poll(async () => (await panel.boundingBox())!.y - panelBeforeDrag.y).toBeCloseTo(100, 0);
      await expect(panel).toHaveCSS("border-top-width", "1px");
      await expect(editor.locator("footer")).toHaveCSS("border-top-width", "0px");
    });
    await expect(precision).toBeFocused();
    await precision.click();
    expect(await coordinates()).toEqual(edited);
    await editor.getByRole("button", { name: "Done editing coordinates" }).click();
    await editor.getByRole("radio", { name: "square (1:1)" }).click();
    const mask = editor.getByRole("checkbox", { name: "Apply mask", exact: true });
    await expect(mask).toBeVisible();
    expect(await mask.evaluate(input => !!input.closest("footer"))).toBe(true);
    const maskBounds = (await mask.locator("..").boundingBox())!;
    const dimensions = (await editor.locator("footer").getByText(/ × .* px$/).boundingBox())!;
    expect(maskBounds.height).toBeGreaterThanOrEqual(44);
    expect(maskBounds.x).toBeGreaterThanOrEqual(dimensions.x + dimensions.width);
    expect(await editor.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath("crop-mobile-layout.png") });
    await Promise.all([
      page.waitForEvent("dialog").then(async dialog => {
        expect(dialog.message()).toBe("Abandon the adjusted crop? Leaving this editor will discard it.");
        await dialog.accept();
      }),
      editor.getByRole("button", { name: "Back to image", exact: true }).click(),
    ]);
    await expect(editor).toHaveCount(0);
    await expect(detail.getByRole("button", { name: "Settings", exact: true })).toBeVisible();
  });

  test("mobile Crop keeps fields above a reduced viewport and rejects invalid swipe dismissal", async ({ page }) => {
    await page.getByRole("button", { name: "Crop image", exact: true }).click();
    const editor = page.getByRole("dialog", { name: "Crop image", exact: true });
    const crop = editor.getByRole("button", { name: "Crop", exact: true });
    await expect(crop).toBeEnabled();
    const precision = editor.getByRole("button", { name: "Edit crop coordinates" });
    await precision.click();
    const width = editor.getByRole("spinbutton", { name: "Crop width" });
    const originalWidth = await width.inputValue();
    const restoreViewport = await page.evaluateHandle(() => {
      const viewport = window.visualViewport!;
      const height = Object.getOwnPropertyDescriptor(viewport, "height");
      const top = Object.getOwnPropertyDescriptor(viewport, "offsetTop");
      Object.defineProperty(viewport, "height", { configurable: true, value: 280 });
      Object.defineProperty(viewport, "offsetTop", { configurable: true, value: 12 });
      viewport.dispatchEvent(new Event("resize"));
      return () => {
        if (height) Object.defineProperty(viewport, "height", height); else Reflect.deleteProperty(viewport, "height");
        if (top) Object.defineProperty(viewport, "offsetTop", top); else Reflect.deleteProperty(viewport, "offsetTop");
        viewport.dispatchEvent(new Event("resize"));
      };
    });
    try {
      await expect(editor).toHaveCSS("height", "280px");
      await expect(editor).toHaveCSS("top", "12px");
      expect(await page.getByTestId("crop-backdrop").evaluate(backdrop => {
        const bounds = backdrop.getBoundingClientRect();
        const hit = document.elementFromPoint(innerWidth / 2, 320);
        return bounds.top === 0 && bounds.bottom === innerHeight
          && getComputedStyle(backdrop).backgroundColor === "rgb(51, 51, 51)"
          && !!hit && backdrop.contains(hit);
      })).toBe(true);
      await expect(editor.getByRole("radiogroup", { name: "Crop ratio" })).toHaveCount(0);
      const height = editor.getByRole("spinbutton", { name: "Crop height" });
      await height.focus();
      expect(await height.evaluate(input => {
        const bounds = input.getBoundingClientRect();
        const panel = input.closest("section")!.getBoundingClientRect();
        const header = input.closest("section")!.firstElementChild!.getBoundingClientRect();
        return bounds.top >= header.bottom && bounds.bottom <= panel.bottom;
      })).toBe(true);
      await width.fill(String(Number(await width.getAttribute("max")) + 1));
      await expect(width).toHaveAttribute("aria-invalid", "true");
      await expect(width).toHaveCSS("border-color", "rgb(237, 89, 53)");
      await expect(crop).toBeDisabled();
      await swipe(page, editor.getByTestId("crop-coordinate-handle"), 0, 100);
      await expect(editor.getByRole("button", { name: "Done editing coordinates" })).toBeVisible();
      await expect(width).toHaveAttribute("aria-invalid", "true");
      await width.fill(originalWidth);
      await expect(crop).toBeEnabled();
      await editor.getByRole("button", { name: "Done editing coordinates" }).click();
      await expect(precision).toHaveAttribute("aria-expanded", "false");
      await expect(precision).toBeFocused();
    } finally {
      await restoreViewport.evaluate(restore => restore());
      await restoreViewport.dispose();
    }
    await expect(editor.getByRole("radiogroup", { name: "Crop ratio" })).toBeVisible();
  });

  test("mobile detail keeps image geometry and coordinates zoom, chrome and swipes", async ({ page }) => {
    const detail = page.locator("[data-detail-image-id]");
    const surface = page.getByTestId("detail-image-container");
    const image = surface.locator('img[fetchpriority="high"]');
    const drawer = page.getByRole("region", { name: "Image details", exact: true });
    const toolbar = detail.locator(":scope > header");
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
    const before = await image.boundingBox();
    await image.tap();
    await expect(drawer).toHaveCount(0);
    await expect(toolbar).toBeHidden();
    expect(await image.boundingBox()).toEqual(before);

    const first = await detail.getAttribute("data-detail-image-id");
    await swipe(page, surface, -200);
    await expect(detail).not.toHaveAttribute("data-detail-image-id", first!);
    const second = await detail.getAttribute("data-detail-image-id");
    await page.waitForTimeout(450);
    await image.tap();
    await expect(drawer).toBeVisible();
    await swipe(page, drawer, 200);
    await expect(detail).toHaveAttribute("data-detail-image-id", first!);

    await page.waitForTimeout(450);
    await image.tap();
    await image.tap();
    await expect.poll(() => image.evaluate(element => element.style.transform)).toContain("scale3d");
    await expect(drawer).toHaveCount(0);
    await swipe(page, surface, 0, -200);
    await swipe(page, surface, -200);
    await swipe(page, surface, 0, 200);
    await expect(detail).toHaveAttribute("data-detail-image-id", first!);
    await expect(drawer).toHaveCount(0);

    await image.tap();
    await image.tap();
    await expect.poll(() => image.evaluate(element => element.style.transform)).toBe("");
    await expect(toolbar).toBeHidden();
    await swipe(page, surface, 0, -200);
    await expect(drawer.getByRole("button", { name: "Collapse Image details" })).toBeVisible();
    expect(second).not.toBe(first);
  });

  test("double-tapping drawer content does not zoom the image", async ({ page }) => {
    const drawer = page.getByRole("region", { name: "Image details", exact: true });
    await drawer.getByRole("button", { name: "Expand Image details" }).tap();
    const body = drawer.locator(":scope > div").last();
    await expect.poll(async () => (await body.boundingBox())!.y).toBeLessThan(page.viewportSize()!.height / 2);
    const bounds = (await body.boundingBox())!;
    const point = { x: bounds.x + 5, y: bounds.y + 80 };
    const session = await page.context().newCDPSession(page);
    let active = false;
    try {
      for (let tap = 0; tap < 2; tap++) {
        await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
        active = true;
        await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        active = false;
      }
      await expect(drawer).toBeVisible();
      await expect(page.getByTestId("detail-image-container").locator('img[fetchpriority="high"]')).not.toHaveCSS("transform", /matrix/);
    } finally {
      if (active) await session.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
      await session.detach();
    }
  });

  test("a second finger cancels a pending downward dismissal before zoom", async ({ page }) => {
    const detail = page.locator("[data-detail-image-id]");
    const image = page.getByTestId("detail-image-container").locator('img[fetchpriority="high"]');
    const first = await detail.getAttribute("data-detail-image-id");
    const bounds = (await image.boundingBox())!;
    const start = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    const session = await page.context().newCDPSession(page);
    let active = false;
    try {
      await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ id: 1, ...start }] });
      active = true;
      await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ id: 1, x: start.x, y: start.y + 160 }] });
      await expect.poll(() => detail.evaluate(element => element.style.transform)).toContain("translateY");
      await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [
        { id: 1, x: start.x, y: start.y + 160 }, { id: 2, x: start.x + 35, y: start.y + 160 },
      ] });
      await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [
        { id: 1, x: start.x - 40, y: start.y + 160 }, { id: 2, x: start.x + 100, y: start.y + 160 },
      ] });
      await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      active = false;
      await expect(detail).toHaveAttribute("data-detail-image-id", first!);
      await expect.poll(() => image.evaluate(element => element.style.transform)).toContain("scale3d");
      expect(await detail.evaluate(element => element.style.transform)).toBe("");
    } finally {
      if (active) await session.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
      await session.detach();
    }
  });

  test("a second finger cancels a pending image swipe before zoom", async ({ page }) => {
    const detail = page.locator("[data-detail-image-id]");
    const image = page.getByTestId("detail-image-container").locator('img[fetchpriority="high"]');
    const first = await detail.getAttribute("data-detail-image-id");
    const bounds = (await image.boundingBox())!;
    const start = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    const strip = detail.locator('[data-detail-page="current"]').locator("..");
    const session = await page.context().newCDPSession(page);
    let active = false;
    try {
      await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ id: 1, ...start }] });
      active = true;
      await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ id: 1, x: start.x - 90, y: start.y }] });
      await expect.poll(() => strip.evaluate(element => element.style.transform)).toContain("translateX");
      await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [
        { id: 1, x: start.x - 90, y: start.y }, { id: 2, x: start.x - 55, y: start.y },
      ] });
      await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [
        { id: 1, x: start.x - 130, y: start.y }, { id: 2, x: start.x + 10, y: start.y },
      ] });
      await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      active = false;
      await expect(detail).toHaveAttribute("data-detail-image-id", first!);
      await expect.poll(() => image.evaluate(element => element.style.transform)).toContain("scale3d");
      expect(await strip.evaluate(element => element.style.transform)).toBe("");
    } finally {
      if (active) await session.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
      await session.detach();
    }
  });

  test("pinching back to fit restores image swipes without restoring chrome", async ({ page }) => {
    const detail = page.locator("[data-detail-image-id]");
    const surface = page.getByTestId("detail-image-container");
    const image = surface.locator('img[fetchpriority="high"]');
    const drawer = page.getByRole("region", { name: "Image details", exact: true });
    const first = await detail.getAttribute("data-detail-image-id");
    const bounds = (await image.boundingBox())!;
    const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    const session = await page.context().newCDPSession(page);
    let active = false;
    const pinch = async (start: number, end: number) => {
      const points = (distance: number) => [
        { id: 1, x: center.x - distance, y: center.y },
        { id: 2, x: center.x + distance, y: center.y },
      ];
      await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: points(start) });
      active = true;
      for (let step = 1; step <= 6; step++) await session.send("Input.dispatchTouchEvent", {
        type: "touchMove", touchPoints: points(start + (end - start) * step / 6),
      });
      await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      active = false;
    };
    try {
      await pinch(30, 90);
      await expect.poll(() => image.evaluate(element => element.style.transform)).toContain("scale3d");
      await expect(drawer).toHaveCount(0);
      await swipe(page, surface, 0, -180);
      await expect(drawer).toHaveCount(0);
      await expect(detail).toHaveAttribute("data-detail-image-id", first!);
      await pinch(90, 25);
      await expect.poll(() => image.evaluate(element => element.style.transform)).toBe("");
      await expect(detail.locator(":scope > header")).toBeHidden();
      await swipe(page, surface, 0, -180);
      await expect(drawer.getByRole("button", { name: "Collapse Image details" })).toBeVisible();
    } finally {
      if (active) await session.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
      await session.detach();
    }
  });

  test("peek swipes move image and details together while the top bar stays fixed", async ({ page }) => {
    const detail = page.locator("[data-detail-image-id]");
    const first = await detail.getAttribute("data-detail-image-id");
    const panel = page.getByRole("region", { name: "Image details", exact: true });
    const header = panel.getByRole("button", { name: "Expand Image details", exact: true });
    await header.focus();
    const imagePage = detail.locator('[data-detail-page="current"]');
    await expect.poll(() => imagePage.locator('img[fetchpriority="high"]').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    await expect.poll(() => detail.locator('[data-detail-page="next"] img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    const initialImage = (await imagePage.boundingBox())!;
    const initialCard = (await panel.boundingBox())!;
    const initialBar = (await detail.locator("header").boundingBox())!;
    const nextTitle = await page.evaluate(() => {
      const state = (window as any).__kupua_store__.getState();
      const current = document.querySelector<HTMLElement>("[data-detail-image-id]")!.dataset.detailImageId;
      const index = state.results.findIndex((image: any) => image.id === current);
      return state.results[index + 1].metadata.title;
    });
    await page.evaluate(() => {
      const titles = new Map((window as any).__kupua_store__.getState().results.map((image: any) => [image.id, image.metadata.title]));
      const probe = { frames: 0, mismatches: [] as string[], frame: 0 };
      const sample = () => {
        probe.frames++;
        for (const page of document.querySelectorAll<HTMLElement>("[data-detail-page]")) {
          const bounds = page.getBoundingClientRect();
          if (Math.min(bounds.right, innerWidth) - Math.max(bounds.left, 0) < 32) continue;
          const image = page.querySelector<HTMLImageElement>("img");
          const title = page.querySelector('button[aria-label="Expand Image details"], button[aria-label="Collapse Image details"]');
          if (probe.mismatches.length < 10 && image && new URL(image.currentSrc || image.src).pathname !== `/__detail_media/${page.dataset.detailPageId}.svg`) probe.mismatches.push("image identity");
          if (probe.mismatches.length < 10 && title?.textContent !== titles.get(page.dataset.detailPageId)) probe.mismatches.push("metadata identity");
        }
        probe.frame = requestAnimationFrame(sample);
      };
      (window as any).__pairedSwipeProbe = probe;
      probe.frame = requestAnimationFrame(sample);
    });
    let observations = { frames: 0, mismatches: [] as string[] };
    try {
      await swipe(page, header, -200, 12, async () => {
        await expect.poll(async () => (await imagePage.boundingBox())!.x - initialImage.x).toBeCloseTo(-200, 0);
        const movedImage = (await imagePage.boundingBox())!;
        const movedCard = (await panel.boundingBox())!;
        expect(movedImage.x - initialImage.x).toBeCloseTo(-200, 0);
        expect(movedCard.x - initialCard.x).toBeCloseTo(movedImage.x - initialImage.x, 0);
        expect(await detail.locator("header").boundingBox()).toEqual(initialBar);
        await page.screenshot({ path: test.info().outputPath("detail-pages-during-swipe.png") });
      });
      await expect(detail).not.toHaveAttribute("data-detail-image-id", first!);
    } finally {
      observations = await page.evaluate(() => {
        const probe = (window as any).__pairedSwipeProbe;
        cancelAnimationFrame(probe.frame);
        delete (window as any).__pairedSwipeProbe;
        return { frames: probe.frames, mismatches: probe.mismatches };
      });
    }
    expect(observations.frames).toBeGreaterThan(1);
    expect(observations.mismatches).toEqual([]);
    await expect(header).toHaveAttribute("aria-expanded", "false");
    await expect(header).toHaveText(nextTitle);
    await expect(header).toBeFocused();
    await swipe(page, header, 200, -12);
    await expect(detail).toHaveAttribute("data-detail-image-id", first!);
    await expect(header).toHaveAttribute("aria-expanded", "false");
    await expect(header).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(panel.getByRole("button", { name: "Collapse Image details", exact: true })).toBeVisible();
  });

  test("expanded values swipe without searching and retain vertical scrolling and taps", async ({ page }) => {
    const detail = page.locator("[data-detail-image-id]");
    const first = await detail.getAttribute("data-detail-image-id");
    const query = new URL(page.url()).searchParams.get("query");
    const panel = page.getByRole("region", { name: "Image details", exact: true });
    await panel.getByRole("button", { name: "Expand Image details", exact: true }).click();
    await expect.poll(async () => Math.round((await panel.boundingBox())!.y)).toBe(Math.round(page.viewportSize()!.height / 4));
    const body = panel.locator(":scope > div").last();
    await swipe(page, body, 0, 360);
    await expect(panel.getByRole("button", { name: "Expand Image details", exact: true })).toBeVisible();
    await panel.getByRole("button", { name: "Expand Image details", exact: true }).tap();
    await expect.poll(async () => Math.round((await panel.boundingBox())!.y)).toBe(Math.round(page.viewportSize()!.height / 4));
    const credit = panel.locator('button[data-cql-key="credit"]').first();
    const initialCard = (await panel.boundingBox())!;
    const imagePage = detail.locator('[data-detail-page="current"]');
    const initialImage = (await imagePage.boundingBox())!;
    await swipe(page, credit, -160, 18, async () => {
      await expect.poll(async () => (await panel.boundingBox())!.x - initialCard.x).toBeCloseTo(-160, 0);
      expect((await imagePage.boundingBox())!.x - initialImage.x).toBeCloseTo(-160, 0);
      await page.screenshot({ path: test.info().outputPath("detail-pages-expanded-swipe.png") });
    });
    await expect(detail).not.toHaveAttribute("data-detail-image-id", first!);
    expect(new URL(page.url()).searchParams.get("query")).toBe(query);
    await expect(panel.getByRole("button", { name: "Collapse Image details", exact: true })).toBeVisible();
    expect(await panel.locator(":scope > div").last().evaluate(element => element.scrollTop)).toBe(0);
    await swipe(page, credit, 160, -18);
    await expect(detail).toHaveAttribute("data-detail-image-id", first!);

    await body.evaluate(element => { element.scrollTop = 0; });
    await swipe(page, body, 0, -150, undefined, false, 0.5);
    await expect.poll(() => body.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    await expect(detail).toHaveAttribute("data-detail-image-id", first!);

    await credit.tap();
    await expect(detail).toHaveCount(0);
    expect(new URL(page.url()).searchParams.get("query")).not.toBe(query);
  });

  test("cancelled image swipes restore the whole page and traversal retains fullscreen", async ({ page }) => {
    const detail = page.locator("[data-detail-image-id]");
    const panel = page.getByRole("region", { name: "Image details", exact: true });
    const imageSurface = page.getByTestId("detail-image-container");
    const first = await detail.getAttribute("data-detail-image-id");
    const initialCard = (await panel.boundingBox())!;
    await swipe(page, imageSurface, -150, 0, async () => {
      expect((await panel.boundingBox())!.x - initialCard.x).toBeCloseTo(-150, 0);
    }, true);
    await expect(detail).toHaveAttribute("data-detail-image-id", first!);
    expect(await panel.boundingBox()).toEqual(initialCard);
    await swipe(page, imageSurface, -200);
    await expect(detail).not.toHaveAttribute("data-detail-image-id", first!);
    const fullscreenEntry = await detail.getAttribute("data-detail-image-id");
    await expect.poll(() => page.evaluate(() => document.fullscreenElement === document.documentElement)).toBe(true);
    await swipe(page, imageSurface, -200);
    await expect(detail).not.toHaveAttribute("data-detail-image-id", fullscreenEntry!);
    await expect.poll(() => page.evaluate(() => document.fullscreenElement === document.documentElement)).toBe(true);
    await swipe(page, imageSurface, 200);
    await expect(detail).toHaveAttribute("data-detail-image-id", fullscreenEntry!);
    await expect(detail.getByRole("button", { name: "Settings", exact: true })).toBeVisible();
    await expect(panel).toBeVisible();
  });

  test("image swipe down collapses expanded details before closing the image", async ({ page }) => {
    const detail = page.locator("[data-detail-image-id]");
    const imageId = await detail.getAttribute("data-detail-image-id");
    const panel = page.getByRole("region", { name: "Image details", exact: true });
    const surface = page.getByTestId("detail-image-container");
    await panel.getByRole("button", { name: "Expand Image details" }).tap();
    await expect(panel.getByRole("button", { name: "Collapse Image details" })).toBeVisible();
    await expect.poll(async () => (await panel.boundingBox())!.y).toBeCloseTo(await page.evaluate(() => innerHeight / 4), 0);
    const initialTop = (await panel.boundingBox())!.y;
    await swipe(page, surface, 0, 100, undefined, true, 0.5);
    await expect(panel.getByRole("button", { name: "Collapse Image details" })).toBeVisible();
    await expect.poll(async () => (await panel.boundingBox())!.y).toBeCloseTo(initialTop, 0);
    await expect(detail).toHaveAttribute("data-detail-image-id", imageId!);
    await swipe(page, surface, 0, 160, async () => {
      await expect.poll(async () => (await panel.boundingBox())!.y).toBeGreaterThan(initialTop + 100);
      await expect(detail).toHaveAttribute("data-detail-image-id", imageId!);
    }, false, 0.5);
    await expect(panel.getByRole("button", { name: "Expand Image details" })).toBeVisible();
    await expect(detail).toHaveAttribute("data-detail-image-id", imageId!);
    await swipe(page, surface, 0, 180);
    await expect(detail).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Image results justified" })).toBeVisible();
  });

  test("image swipe-up still tracks only the card before expanding", async ({ page }) => {
    const detail = page.locator("[data-detail-image-id]");
    const panel = page.getByRole("region", { name: "Image details", exact: true });
    const imageSurface = page.getByTestId("detail-image-container");
    const image = imageSurface.locator('img[fetchpriority="high"]');
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
    const initialImage = (await image.boundingBox())!;
    const initialCard = (await panel.boundingBox())!;
    const initialBar = (await detail.locator("header").boundingBox())!;
    await swipe(page, imageSurface, 0, -360, async () => {
      expect((await panel.boundingBox())!.y).toBeLessThan(initialCard.y - 100);
      expect(await image.boundingBox()).toEqual(initialImage);
      expect(await detail.locator("header").boundingBox()).toEqual(initialBar);
    });
    await expect(panel.getByRole("button", { name: "Collapse Image details", exact: true })).toBeVisible();
  });
});

// ===========================================================================
// Long-press enters Selection Mode
// ===========================================================================

test("long-press on grid cell enters selection mode and selects that cell", async ({ page }) => {
  const rect = await getFirstTouchableCellRect(page);

  await beginLongPress(page, rect.x, rect.y);

  // Selection should have entered mode
  const count = await getSelectionCount(page);
  expect(count).toBe(1);

  await endPress(page, rect.x, rect.y);
});

test("StatusBar remains at top (not repositioned) when in selection mode on coarse pointer", async ({ page }) => {
  const rect = await getFirstTouchableCellRect(page);

  await beginLongPress(page, rect.x, rect.y);
  await endPress(page, rect.x, rect.y);

  // Confirm we are in selection mode
  const count = await getSelectionCount(page);
  expect(count).toBeGreaterThan(0);

  // The StatusBar has both data-coarse-pointer and data-selection-mode.
  // (The grid also has data-selection-mode -- use both attributes to target only StatusBar.)
  const statusBar = page.locator("[data-coarse-pointer='true'][data-selection-mode='true']");
  await expect(statusBar).toBeVisible({ timeout: 3000 });

  // StatusBar must remain at the TOP of the viewport, not repositioned to bottom.
  const barBox = await statusBar.boundingBox();
  expect(barBox).not.toBeNull();
  expect(barBox!.y).toBeGreaterThanOrEqual(0);
  expect(barBox!.y + barBox!.height).toBeLessThan(100);
});

// ===========================================================================
// Long-press-tap (quick release = no drag)
// ===========================================================================

test("long-press-tap selects the exact visible range", async ({ page }) => {
  const grid = page.locator('[aria-label="Image results justified"]');
  const scrollBefore = await grid.evaluate((element) => element.scrollTop);
  await grid.evaluate((element) => {
    element.scrollBy({ top: 150 });
  });
  await expect.poll(() => grid.evaluate((element) => element.scrollTop)).toBeGreaterThan(scrollBefore);

  const range = await page.locator("[data-grid-cell]").evaluateAll((cells) => {
    const touchable = cells.flatMap((cell, index) => {
      const rect = cell.getBoundingClientRect();
      const x = rect.x + rect.width / 2;
      const y = rect.y + rect.height / 2;
      const hitCell = document.elementFromPoint(x, y)?.closest("[data-grid-cell]");
      const id = cell.getAttribute("data-image-id");
      return id && hitCell === cell ? [{ index, id }] : [];
    });
    if (touchable.length < 3) return null;
    const start = touchable[0];
    const end = touchable[2];
    return {
      startIndex: start.index,
      endIndex: end.index,
      endId: end.id,
      expectedIds: cells
        .slice(start.index, end.index + 1)
        .map((cell) => cell.getAttribute("data-image-id"))
        .filter((id): id is string => id !== null),
    };
  });
  if (!range) {
    throw new Error("Not enough touchable cells for a multi-cell range");
  }

  const rect0 = await getCellRect(page, range.startIndex);
  if (!rect0) throw new Error("Range anchor is not rendered");

  // First long-press-tap enters mode and sets the anchor.
  await beginLongPress(page, rect0.x, rect0.y);
  await endPress(page, rect0.x, rect0.y);

  // Should have 1 selected
  const count1 = await getSelectionCount(page);
  expect(count1).toBe(1);

  // Reacquire the endpoint by identity after selection mode updates the layout.
  const endpoint = page.locator(`[data-grid-cell][data-image-id="${range.endId}"]`);
  const rect1 = await endpoint.boundingBox();
  if (!rect1) throw new Error("Range endpoint is not touchable after mode entry");
  const endpointX = rect1.x + rect1.width / 2;
  const endpointY = rect1.y + rect1.height / 2;
  await beginLongPress(page, endpointX, endpointY);
  await endPress(page, endpointX, endpointY);

  await expect.poll(async () => (await getSelectionIds(page)).sort()).toEqual(
    range.expectedIds.sort(),
  );
});

// ===========================================================================
// Tickbox tap still works in selection mode (coarse pointer)
// ===========================================================================

test("tickbox tap toggles selection without triggering long-press", async ({ page }) => {
  // First enter selection mode via long-press
  const rect0 = await getFirstTouchableCellRect(page);
  await beginLongPress(page, rect0.x, rect0.y);
  await endPress(page, rect0.x, rect0.y);

  const count1 = await getSelectionCount(page);
  expect(count1).toBe(1);

  // Now tap the tickbox on cell 1 (tickbox is visible in selection mode)
  const tickbox = page.locator("[data-grid-cell]").nth(1).locator("[data-tickbox]");
  await expect(tickbox).toBeVisible({ timeout: 3000 });
  await tickbox.click();

  const count2 = await getSelectionCount(page);
  expect(count2).toBe(2);
});

// ===========================================================================
// SelectionFab (floating action button)
// ===========================================================================

test("SelectionFab appears at bottom-right and clears selection on tap", async ({ page }) => {
  const rect = await getFirstTouchableCellRect(page);

  await beginLongPress(page, rect.x, rect.y);
  await endPress(page, rect.x, rect.y);

  expect(await getSelectionCount(page)).toBe(1);

  const fab = page.getByRole("button", { name: "Clear selection (1 selected)" });
  await expect(fab).toBeVisible({ timeout: 3000 });
  const fabBox = await fab.boundingBox();
  const viewport = page.viewportSize();
  expect(fabBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(fabBox!.x + fabBox!.width).toBeGreaterThan(viewport!.width * 0.75);
  expect(fabBox!.y + fabBox!.height).toBeGreaterThan(viewport!.height * 0.75);
  await fab.click();

  await expect.poll(() => getSelectionCount(page)).toBe(0);
  await expect(fab).not.toBeVisible();
});

test("integrated selection Actions preserve their hit areas and leave the page interactive", async ({ page }) => {
  const rect = await getFirstTouchableCellRect(page);
  await beginLongPress(page, rect.x, rect.y);
  await endPress(page, rect.x, rect.y);

  await expect(page.getByRole("button", { name: "Expand Details" })).toBeVisible();
  const card = page.locator('[data-bottom-sheet][aria-label="Details"]');
  const fab = page.locator(".selection-fab");
  await card.evaluate(async card => { await Promise.all(card.getAnimations().map(animation => animation.finished.catch(() => {}))); });
  const collapsedCard = (await card.boundingBox())!;
  const collapsedFab = (await fab.boundingBox())!;
  expect(collapsedFab.width).toBe(112);
  expect(page.viewportSize()!.height - collapsedFab.y - collapsedFab.height).toBeCloseTo(8, 0);
  expect(collapsedFab.y).toBeGreaterThanOrEqual(collapsedCard.y);
  expect(collapsedFab.y + collapsedFab.height).toBeLessThanOrEqual(collapsedCard.y + 64);
  const clear = page.getByRole("button", { name: "Clear selection (1 selected)", exact: true });
  const collapsedClear = (await clear.boundingBox())!;
  await expect(clear).toHaveText("Deselect");
  expect(collapsedClear.width).toBeGreaterThanOrEqual(44);
  await page.getByRole("button", { name: "1 selected — actions" }).click();
  await fab.evaluate(async element => { await Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {}))); });
  expect((await page.getByRole("group", { name: "Selection actions" }).boundingBox())!.width).toBe(136);
  const expandedClear = (await clear.boundingBox())!;
  expect(expandedClear.x).toBeCloseTo(collapsedClear.x, 0);
  expect(expandedClear.width).toBeCloseTo(collapsedClear.width, 0);
  expect(await clear.evaluate(button => {
    const bounds = button.getBoundingClientRect();
    return [...button.children].every(child => {
      const content = child.getBoundingClientRect();
      return content.left >= bounds.left && content.right <= bounds.right;
    });
  })).toBe(true);
  await page.setViewportSize({ width: 320, height: 852 });
  await expect(page.getByRole("button", { name: "Expand Details" })).toHaveText("1 selected");
  expect(await fab.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("selection-header-actions-peek.png"), animations: "disabled" });
  await page.setViewportSize({ width: 393, height: 852 });
  await page.getByRole("button", { name: "Expand Details", exact: true }).click();
  await expect(page.getByRole("group", { name: "Selection actions" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Collapse Details" })).toBeVisible();
  await expect(card).toHaveAttribute("role", "region");
  await expect(card).not.toHaveAttribute("aria-modal", "true");
  await expect(page.getByTestId("card-scrim")).toHaveCount(0);
  expect(await page.locator("[data-grid-cell]").first().evaluate(cell => !!cell.closest("[inert]"))).toBe(false);
  await card.evaluate(async card => { await Promise.all(card.getAnimations().map(animation => animation.finished.catch(() => {}))); });
  const expandedCard = (await card.boundingBox())!;
  const expandedFab = (await fab.boundingBox())!;
  expect(expandedFab.y - expandedCard.y).toBeCloseTo(collapsedFab.y - collapsedCard.y, 0);
  expect(expandedFab.y).toBeLessThan(collapsedFab.y - 100);
  await page.setViewportSize({ width: 852, height: 393 });
  await page.getByRole("button", { name: "1 selected — actions" }).click();
  const actions = page.getByRole("group", { name: "Selection actions" });
  const actionsBox = (await actions.boundingBox())!;
  expect(actionsBox.y).toBeGreaterThanOrEqual(0);
  expect(actionsBox.y + actionsBox.height).toBeLessThanOrEqual(393);
  await page.screenshot({ path: test.info().outputPath("selection-header-actions-landscape.png"), animations: "disabled" });
  await page.getByRole("button", { name: "Collapse Details", exact: true }).press("Enter");
  await expect(actions).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Expand Details" })).toBeVisible();
  await expect(card).toHaveAttribute("role", "region");
  await page.setViewportSize({ width: 393, height: 852 });
  await page.getByRole("button", { name: "Expand Details" }).click();
  await expect(page.getByRole("button", { name: "Collapse Details" })).toBeVisible();
  await card.evaluate(async element => { await Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => {}))); });
  await page.getByRole("button", { name: "1 selected — actions" }).click();
  await page.getByRole("button", { name: "Deselect image", exact: true }).click();
  await expect.poll(() => getSelectionCount(page)).toBe(0);
  await expect(card).toHaveCount(0);
  await expect(actions).toHaveCount(0);
});

test("dragging Deselect moves the selection card without clearing images", async ({ page }) => {
  const rect = await getFirstTouchableCellRect(page);
  await beginLongPress(page, rect.x, rect.y);
  await endPress(page, rect.x, rect.y);
  const clear = page.getByRole("button", { name: "Clear selection (1 selected)", exact: true });
  await swipe(page, clear, 0, -280);
  await expect(page.getByRole("button", { name: "Collapse Details", exact: true })).toBeVisible();
  expect(await getSelectionCount(page)).toBe(1);
  await swipe(page, clear, 0, 280);
  await expect(page.getByRole("button", { name: "Expand Details", exact: true })).toBeVisible();
  expect(await getSelectionCount(page)).toBe(1);
  await clear.tap();
  await expect.poll(() => getSelectionCount(page)).toBe(0);
});
