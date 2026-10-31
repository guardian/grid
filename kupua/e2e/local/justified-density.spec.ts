import type { Page } from "@playwright/test";
import { test, expect, type KupuaHelpers } from "../shared/helpers";
import { unfocusedDensityRoundTrips } from "../shared/browse-density";
import { waitForDensityRow } from "../shared/density-selection";

type Density = "grid" | "table" | "justified";

async function switchDensity(page: Page, density: Density, imageId?: string) {
  const current = await page.evaluate(() => document.querySelector('[aria-label^="Image results "]')?.getAttribute("aria-label")?.split(" ").at(-1));
  if (current === density) return;
  const generation = await page.evaluate(() => (window as any).__kupua_getDensityRestoreGeneration__());
  const label = `${density[0].toUpperCase()}${density.slice(1)} view`;
  await page.getByRole("button", { name: label, exact: true }).click();
  await expect(page.getByRole("region", { name: `Image results ${density}`, exact: true })).toBeVisible();
  await page.waitForFunction(generation => (window as any).__kupua_getDensityRestoreGeneration__() > generation, generation);
  if (imageId) await waitForDensityRow(page, density, imageId);
}

async function placement(page: Page, id: string) {
  return page.evaluate(id => {
    const container = document.querySelector('[aria-label^="Image results "]')!;
    const cell = container.querySelector(`[data-image-id="${CSS.escape(id)}"]`);
    if (!cell) return null;
    const rect = cell.getBoundingClientRect();
    const viewport = container.getBoundingClientRect();
    return { y: rect.top - viewport.top, height: rect.height, viewportHeight: viewport.height, clientHeight: container.clientHeight,
      visible: rect.bottom > viewport.top && rect.top < viewport.bottom,
      focused: (window as any).__kupua_store__.getState().focusedImageId === id };
  }, id);
}

async function start(kupua: KupuaHelpers, page: Page) {
  await kupua.startSearch();
  await page.waitForFunction(() => {
    const state = (window as any).__kupua_store__.getState();
    return state.dataSource.constructor.name === "MockDataSource" && state.results.length === 96 && !state.loading;
  });
  await switchDensity(page, "justified");
}

async function focusInterior(kupua: KupuaHelpers, page: Page, density: "grid" | "justified" = "justified") {
  await page.getByRole("region", { name: `Image results ${density}`, exact: true }).evaluate((element, density) => {
    element.scrollTop = density === "grid" ? 1668 : 2400;
  }, density);
  const ready = await page.waitForFunction(density => {
    const container = document.querySelector(`[aria-label="Image results ${density}"]`)!;
    const viewport = container.getBoundingClientRect();
    const cell = Array.from(container.querySelectorAll<HTMLElement>("[data-grid-cell]")).find(cell => {
      const rect = cell.getBoundingClientRect();
      return rect.top > viewport.top + 100 && rect.bottom < viewport.bottom - 50 && rect.width > 100;
    });
    return cell?.dataset.imageId ?? false;
  }, density);
  const id = await ready.jsonValue() as string;
  await ready.dispose();
  const point = await kupua.waitForHitTestedImagePoint({ view: density, imageId: id });
  await page.mouse.click(point.x, point.y);
  await expect.poll(async () => (await placement(page, id))?.focused).toBe(true);
  return id;
}

async function settleWidth(page: Page) {
  await page.evaluate(async () => {
    let last = -1;
    let stable = 0;
    for (let frame = 0; frame < 120; frame++) {
      await new Promise(requestAnimationFrame);
      const width = document.querySelector('[aria-label="Image results justified"]')?.clientWidth;
      stable = width === last ? stable + 1 : 0;
      last = width ?? -1;
      if (stable >= 4) return;
    }
    throw new Error("Preview width did not settle");
  });
}

test("resident unfocused density cycles retain placement until new browsing", async ({ kupua, page }) => {
  await start(kupua, page);
  await page.getByRole("region", { name: "Image results justified", exact: true })
    .evaluate(element => { element.scrollTop = 1800; });
  await unfocusedDensityRoundTrips(kupua);
});

test("resident justified density and panel round trips preserve the same interior image", async ({ kupua, page }) => {
  await start(kupua, page);
  const id = await focusInterior(kupua, page);
  const before = (await placement(page, id))!;
  for (let cycle = 0; cycle < 3; cycle++) {
    for (const density of ["table", "grid", "justified"] as const) await switchDensity(page, density, id);
    await expect.poll(async () => Math.abs((await placement(page, id))!.y - before.y)).toBeLessThan(1);
  }
  await page.getByRole("button", { name: "Show Details panel", exact: true }).click();
  await settleWidth(page);
  expect(Math.abs((await placement(page, id))!.y - before.y)).toBeLessThan(1);
  await page.getByRole("button", { name: "Hide Details panel", exact: true }).click();
  await settleWidth(page);
  expect(Math.abs((await placement(page, id))!.y - before.y)).toBeLessThan(1);
  expect((await placement(page, id))!.focused).toBe(true);
});

test("density row readiness waits for the requested identity, density and nonzero geometry", async ({ page }) => {
  await page.setContent(`
    <section role="region" aria-label="Image results grid">
      <div data-image-id="synthetic-density-target" style="height:20px"></div>
    </section>
    <section role="region" aria-label="Image results justified">
      <div data-image-id="synthetic-other-target" style="height:20px"></div>
    </section>
  `);
  let ready = false;
  const waiting = waitForDensityRow(page, "justified", "synthetic-density-target").then(() => { ready = true; });
  await page.evaluate(async () => {
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
  });
  expect(ready).toBe(false);
  await page.getByRole("region", { name: "Image results justified", exact: true }).evaluate(container => {
    const cell = document.createElement("div");
    cell.dataset.imageId = "synthetic-density-target";
    cell.style.height = "0px";
    container.appendChild(cell);
  });
  await page.evaluate(async () => {
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
  });
  expect(ready).toBe(false);
  await page.getByRole("region", { name: "Image results justified", exact: true })
    .locator('[data-image-id="synthetic-density-target"]').evaluate(cell => { (cell as HTMLElement).style.height = "20px"; });
  await waiting;
  expect(ready).toBe(true);
});

for (const sourceDensity of ["grid", "justified"] as const) {
 test(`resident detail and cross-density history preserve the original position (${sourceDensity})`, async ({ kupua, page }) => {
  await start(kupua, page);
  await switchDensity(page, sourceDensity);
  const id = await focusInterior(kupua, page, sourceDensity);
  const before = (await placement(page, id))!;
  const point = await kupua.waitForHitTestedImagePoint({ view: sourceDensity, imageId: id });
  await page.mouse.dblclick(point.x, point.y);
  await expect(page.locator("[data-detail-image-id]")).toBeVisible();
  await kupua.closeDetailViaBackspace();
  await expect.poll(async () => Math.abs((await placement(page, id))!.y - before.y)).toBeLessThan(1);

  const historyKey = await page.evaluate(() => (window as any).__kupua_getKupuaKey__());
  await page.getByRole("button", { name: "Sort descending, click to sort ascending", exact: true }).click();
  await page.waitForFunction(() => {
    const s = (window as any).__kupua_store__.getState();
    return s.params.orderBy === "uploadTime" && !s.loading && s._searchContinuity?.phase === "placed";
  });
  await page.goBack();
  await page.waitForFunction(key => {
    const s = (window as any).__kupua_store__.getState();
    return (window as any).__kupua_getKupuaKey__() === key && !s.loading && s._searchContinuity?.provenance === "history"
      && s._searchContinuity.phase === "placed";
  }, historyKey);
  await expect.poll(async () => Math.abs((await placement(page, id))!.y - before.y)).toBeLessThan(1);
  await page.getByRole("button", { name: "Sort descending, click to sort ascending", exact: true }).click();
  await page.waitForFunction(() => {
    const s = (window as any).__kupua_store__.getState();
    return s.params.orderBy === "uploadTime" && !s.loading && s._searchContinuity?.phase === "placed";
  });
  await switchDensity(page, "table");
  await page.goBack();
  await page.waitForFunction(key => {
    const s = (window as any).__kupua_store__.getState();
    return (window as any).__kupua_getKupuaKey__() === key && !s.loading && s._searchContinuity?.phase === "placed";
  }, historyKey);
  await switchDensity(page, sourceDensity);
  await expect.poll(async () => Math.abs((await placement(page, id))!.y - before.y)).toBeLessThan(1);
  expect((await placement(page, id))!.focused).toBe(true);

  await switchDensity(page, "table");
  const tableBefore = (await placement(page, id))!;
  await page.getByRole("button", { name: "Sort descending, click to sort ascending", exact: true }).click();
  await page.waitForFunction(() => {
    const state = (window as any).__kupua_store__.getState();
    return state.params.orderBy === "uploadTime" && !state.loading && state._searchContinuity?.phase === "placed";
  });
  expect(await page.evaluate(key => (window as any).__kupua_inspectSnapshot__(key)?.anchorImageId, historyKey)).toBe(id);
  await switchDensity(page, sourceDensity);
  await page.goBack();
  await page.waitForFunction(key => {
    const state = (window as any).__kupua_store__.getState();
    return (window as any).__kupua_getKupuaKey__() === key && !state.loading
      && state._searchContinuity?.provenance === "history" && state._searchContinuity.phase === "placed";
  }, historyKey);
  await switchDensity(page, "table");
  await expect.poll(async () => Math.abs((await placement(page, id))!.y - tableBefore.y)).toBeLessThan(1);
  expect((await placement(page, id))!.focused).toBe(true);
  expect(await page.evaluate(() => (window as any).__kupua_selection_store__.getState().selectedIds.size)).toBe(0);
  await switchDensity(page, sourceDensity);

  const again = await kupua.waitForHitTestedImagePoint({ view: sourceDensity, imageId: id });
  await page.mouse.dblclick(again.x, again.y);
  await expect(page.locator("[data-detail-image-id]")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(id => new URL(location.href).searchParams.get("image") !== id, id);
  const traversed = await page.evaluate(() => new URL(location.href).searchParams.get("image")!);
  await kupua.closeDetailViaBackspace();
  await expect.poll(async () => (await placement(page, traversed))?.focused).toBe(true);
  const returned = (await placement(page, traversed))!;
  expect(returned.visible).toBe(true);
  // Row extent includes the 4px gap; the image centre can differ by 2px.
  expect(Math.abs(returned.y + returned.height / 2 - returned.viewportHeight / 2)).toBeLessThan(5);
 });
}

test("spatial arrows, selection and true edges remain usable", async ({ kupua, page }) => {
  await start(kupua, page);
  const id = await focusInterior(kupua, page);
  const expected = await page.evaluate(id => {
    const cell = document.querySelector(`[data-image-id="${CSS.escape(id)}"]`)!;
    const rect = cell.getBoundingClientRect();
    const row = cell.parentElement!;
    const next = row.nextElementSibling!;
    return Array.from(next.querySelectorAll<HTMLElement>("[data-image-id]"))
      .map(element => ({ id: element.dataset.imageId!, rect: element.getBoundingClientRect() }))
      .sort((a, b) => Math.abs(a.rect.left + a.rect.width / 2 - rect.left - rect.width / 2)
        - Math.abs(b.rect.left + b.rect.width / 2 - rect.left - rect.width / 2))[0].id;
  }, id);
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => page.evaluate(() => (window as any).__kupua_store__.getState().focusedImageId)).toBe(expected);
  for (const direction of ["PageDown", "PageUp"] as const) {
    const pageTarget = await page.evaluate(direction => {
      const container = document.querySelector('[aria-label="Image results justified"]')!;
      const id = (window as any).__kupua_store__.getState().focusedImageId;
      const cell = container.querySelector(`[data-image-id="${CSS.escape(id)}"]`)!;
      const rect = cell.getBoundingClientRect();
      const desiredTop = cell.parentElement!.getBoundingClientRect().top
        + (direction === "PageDown" ? container.clientHeight : -container.clientHeight);
      const cells = Array.from(container.querySelectorAll<HTMLElement>("[data-grid-cell]"));
      const tops = [...new Set(cells.map(cell => cell.parentElement!.getBoundingClientRect().top))].sort((a, b) => a - b);
      const rowTop = tops.filter(top => top <= desiredTop).at(-1) ?? tops[0];
      return cells.filter(cell => cell.parentElement!.getBoundingClientRect().top === rowTop)
        .map(cell => ({ id: cell.dataset.imageId!, rect: cell.getBoundingClientRect() }))
        .sort((a, b) => Math.abs(a.rect.left + a.rect.width / 2 - rect.left - rect.width / 2)
          - Math.abs(b.rect.left + b.rect.width / 2 - rect.left - rect.width / 2))[0].id;
    }, direction);
    await page.keyboard.press(direction);
    await expect.poll(() => page.evaluate(() => (window as any).__kupua_store__.getState().focusedImageId)).toBe(pageTarget);
  }
  const selectedId = await page.evaluate(() => (window as any).__kupua_store__.getState().focusedImageId as string);
  const tick = page.locator(`[data-image-id="${selectedId}"]`).getByRole("button", { name: "Select image", exact: true });
  await page.locator(`[data-image-id="${selectedId}"]`).hover();
  await tick.click();
  const selected = await page.evaluate(() => (window as any).__kupua_selection_store__.getState().selectedIds.size);
  expect(selected).toBe(1);
  const scrollBefore = await page.getByRole("region", { name: "Image results justified" }).evaluate(element => element.scrollTop);
  await page.keyboard.press("PageDown");
  await expect.poll(() => page.getByRole("region", { name: "Image results justified" }).evaluate(element => element.scrollTop)).toBeGreaterThan(scrollBefore);
  expect(await page.evaluate(() => (window as any).__kupua_store__.getState().focusedImageId)).toBe(selectedId);
  await switchDensity(page, "grid");
  await switchDensity(page, "justified");
  expect(await page.evaluate(() => (window as any).__kupua_selection_store__.getState().selectedIds.size)).toBe(1);
  await page.getByRole("button", { name: "Clear selection", exact: true }).click();
  await page.keyboard.press("End");
  await expect.poll(() => page.evaluate(() => (window as any).__kupua_store__.getState().focusedImageId)).toBe("img-95");
  await page.keyboard.press("Home");
  await expect.poll(() => page.evaluate(() => (window as any).__kupua_store__.getState().focusedImageId)).toBe("img-0");
});

test("native fullscreen traversal returns through the justified row callback", async ({ kupua, page }) => {
  await start(kupua, page);
  const id = await focusInterior(kupua, page);
  await page.keyboard.press("f");
  await page.waitForFunction(() => document.fullscreenElement !== null
    && document.querySelector('[data-fullscreen-preview="active"]') !== null);
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(id => (window as any).__kupua_store__.getState().focusedImageId !== id, id);
  const target = await page.evaluate(() => (window as any).__kupua_store__.getState().focusedImageId as string);
  await page.keyboard.press("Backspace");
  await page.waitForFunction(() => document.fullscreenElement === null
    && document.querySelector('[data-fullscreen-preview="active"]') === null);
  await expect.poll(async () => (await placement(page, target))?.visible).toBe(true);
  await expect.poll(async () => {
    const returned = (await placement(page, target))!;
    return Math.abs(returned.y + returned.height / 2 - returned.viewportHeight / 2);
  }).toBeLessThan(5);
});

test("detail reload retains the resident preview and returns to its image", async ({ kupua, page }) => {
  await start(kupua, page);
  const id = await focusInterior(kupua, page);
  const point = await kupua.waitForHitTestedImagePoint({ view: "justified", imageId: id });
  await page.mouse.dblclick(point.x, point.y);
  await expect(page.locator("[data-detail-image-id]")).toHaveAttribute("data-detail-image-id", id);
  await page.reload();
  await expect(page.locator("[data-detail-image-id]")).toHaveAttribute("data-detail-image-id", id);
  await page.waitForFunction(() => {
    const state = (window as any).__kupua_store__?.getState();
    return state?.dataSource.constructor.name === "MockDataSource" && !state.loading && state.results.length === 96
      && document.querySelector('[aria-label="Image results justified"]') !== null;
  });
  await kupua.closeDetailViaBackspace();
  await expect.poll(async () => (await placement(page, id))?.visible).toBe(true);
  expect((await placement(page, id))?.focused).toBe(true);
});

for (const width of [390, 1120]) {
  test(`whole-image geometry stays within the viewport at ${width}px`, async ({ kupua, page }) => {
    await start(kupua, page);
    await page.setViewportSize({ width, height: 900 });
    await settleWidth(page);
    const geometry = await page.evaluate(() => {
      const container = document.querySelector('[aria-label="Image results justified"]')!;
      const viewport = container.getBoundingClientRect();
      const state = (window as any).__kupua_store__.getState();
      return Array.from(container.querySelectorAll<HTMLElement>("[data-grid-cell]")).map(cell => {
        const rect = cell.getBoundingClientRect();
        const image = state.results.find((image: any) => image.id === cell.dataset.imageId);
        const dimensions = image.source.orientedDimensions ?? image.source.dimensions;
        return { error: Math.abs(rect.width - rect.height * dimensions.width / dimensions.height),
          within: rect.left >= viewport.left - 1 && rect.right <= viewport.right + 1,
          fit: getComputedStyle(cell.querySelector("img")!).objectFit };
      });
    });
    expect(geometry.length).toBeGreaterThan(0);
    expect(geometry.length).toBeLessThan(96);
    for (const image of geometry) {
      expect(image.error).toBeLessThan(0.15);
      expect(image.within).toBe(true);
      expect(image.fit).toBe("contain");
    }
  });
}
