import type { Page } from "@playwright/test";
import { test, expect, type KupuaHelpers } from "../shared/helpers";

const region = (page: Page) => page.getByRole("region", { name: "Image results justified", exact: true });

async function settled(page: Page) {
  await page.waitForFunction(() => {
    const state = (window as any).__kupua_store__.getState();
    return !state.loading && !state._browseNavigation && !state._extendForwardInFlight && !state._extendBackwardInFlight;
  });
}

async function start(kupua: KupuaHelpers, page: Page, project: string) {
  await kupua.startSearch();
  await settled(page);
  expect(await page.evaluate(() => (window as any).__kupua_store__.getState().dataSource.constructor.name)).toBe("ElasticsearchDataSource");
  await density(page, "justified");
  await expect(region(page)).toBeVisible();
  await expect(kupua.scrubber).toHaveAttribute("data-scrubber-mode", project.endsWith("indexed") ? "indexed" : "seek");
  await page.waitForFunction(() => (window as any).__kupua_store__.getState().results.length > 96);
}

async function seek(page: Page, ratio: number) {
  const generation = await page.evaluate(() => (window as any).__kupua_store__.getState()._seekGeneration);
  const track = page.getByTestId("scrubber-track");
  const rect = (await track.boundingBox())!;
  await track.click({ position: { x: rect.width / 2, y: rect.height * ratio } });
  await page.waitForFunction(generation => (window as any).__kupua_store__.getState()._seekGeneration > generation, generation);
  await settled(page);
  await page.waitForFunction(() => {
    const container = document.querySelector('[aria-label="Image results justified"]')!;
    const bounds = container.getBoundingClientRect();
    return Array.from(container.querySelectorAll('[data-image-id]')).some(cell => {
      const rect = cell.getBoundingClientRect();
      return rect.top > bounds.top && rect.bottom < bounds.bottom;
    });
  });
}

async function placement(page: Page, id: string) {
  return page.evaluate(id => {
    const container = document.querySelector('[aria-label^="Image results "]')!;
    const cell = container.querySelector(`[data-image-id="${CSS.escape(id)}"]`);
    const rect = cell?.getBoundingClientRect();
    const bounds = container.getBoundingClientRect();
    return rect ? { y: rect.top - bounds.top, x: rect.left - bounds.left, height: rect.height, viewport: container.clientHeight }
      : { y: Infinity, x: Infinity, height: 0, viewport: container.clientHeight };
  }, id);
}

async function focus(kupua: KupuaHelpers, page: Page) {
  const point = await kupua.waitForHitTestedImagePoint({ view: "justified", topInset: 100 });
  await page.mouse.click(point.x, point.y);
  const id = await kupua.getFocusedImageId();
  expect(id).toBeTruthy();
  return id!;
}

async function density(page: Page, target: "grid" | "table" | "justified") {
  const button = page.getByRole("button", { name: `${target[0].toUpperCase()}${target.slice(1)} view`, exact: true });
  if (await button.getAttribute("aria-pressed") !== "true") {
    const generation = await page.evaluate(() => (window as any).__kupua_getDensityRestoreGeneration__());
    await button.click();
    await page.waitForFunction(generation => (window as any).__kupua_getDensityRestoreGeneration__() > generation, generation);
  }
  await expect(page.getByRole("region", { name: `Image results ${target}`, exact: true })).toBeVisible();
}

test("off-buffer vertical navigation recovers focus and uses the destination's next row", async ({ kupua, page }, info) => {
  await start(kupua, page, info.project.name);
  await seek(page, 0.3);
  const original = await focus(kupua, page);
  await seek(page, 0.8);
  expect(await page.evaluate(id => (window as any).__kupua_store__.getState().imagePositions.has(id), original)).toBe(false);
  const intent = await page.evaluate(() => (window as any).__kupua_store__.getState()._focusIntent);
  await page.keyboard.press("ArrowDown");
  await page.waitForFunction(({ original, intent }) => {
    const state = (window as any).__kupua_store__.getState();
    return state._focusIntent > intent && !state.loading && state._pendingFocusDelta === null &&
      state.focusedImageId !== original && state.imagePositions.has(original);
  }, { original, intent });
  await settled(page);
  await expect.poll(async () => page.evaluate(original => {
    const container = document.querySelector('[aria-label="Image results justified"]')!;
    const cells = Array.from(container.querySelectorAll<HTMLElement>("[data-grid-cell]"));
    const anchor = cells.find(cell => cell.dataset.imageId === original);
    if (!anchor) return false;
    const box = anchor.getBoundingClientRect();
    const below = cells.map(cell => ({ id: cell.dataset.imageId, box: cell.getBoundingClientRect() }))
      .filter(cell => cell.box.top > box.top + 1);
    if (!below.length) return false;
    const nextTop = Math.min(...below.map(cell => cell.box.top));
    const row = below.filter(cell => Math.abs(cell.box.top - nextTop) < 1);
    row.sort((a, b) => Math.abs(a.box.left + a.box.width / 2 - box.left - box.width / 2) -
      Math.abs(b.box.left + b.box.width / 2 - box.left - box.width / 2));
    return row[0].id === (window as any).__kupua_store__.getState().focusedImageId;
  }, original)).toBe(true);
});

test("windowed density, panel, history and traversed detail preserve identity and placement", async ({ kupua, page }, info) => {
  await start(kupua, page, info.project.name);
  const generation = await page.evaluate(() => (window as any).__kupua_getDensityRestoreGeneration__());
  await density(page, "justified");
  expect(await page.evaluate(() => (window as any).__kupua_getDensityRestoreGeneration__())).toBe(generation);
  await seek(page, 0.4);
  const id = await focus(kupua, page);
  const before = (await placement(page, id))!;
  for (let cycle = 0; cycle < 2; cycle++) {
    await density(page, "table");
    await density(page, "grid");
    await density(page, "justified");
    await expect.poll(async () => Math.abs((await placement(page, id))!.y - before.y)).toBeLessThan(1);
  }
  await page.getByRole("button", { name: "Show Details panel", exact: true }).click();
  await expect.poll(async () => Math.abs((await placement(page, id))!.y - before.y)).toBeLessThan(1);
  await page.getByRole("button", { name: "Hide Details panel", exact: true }).click();
  await expect.poll(async () => Math.abs((await placement(page, id))!.y - before.y)).toBeLessThan(1);
  const key = await page.evaluate(() => (window as any).__kupua_getKupuaKey__());
  await page.getByRole("button", { name: "Sort descending, click to sort ascending", exact: true }).click();
  await page.waitForFunction(() => {
    const state = (window as any).__kupua_store__.getState();
    return state.params.orderBy === "uploadTime" && state._searchContinuity?.phase === "placed" && !state.loading;
  });
  await page.goBack();
  await page.waitForFunction(key => (window as any).__kupua_getKupuaKey__() === key &&
    (window as any).__kupua_store__.getState()._searchContinuity?.phase === "placed", key);
  await expect.poll(async () => Math.abs((await placement(page, id))!.y - before.y)).toBeLessThan(1);
  const point = await kupua.waitForHitTestedImagePoint({ view: "justified", imageId: id });
  await page.mouse.dblclick(point.x, point.y);
  await expect(page.locator("[data-detail-image-id]")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(id => new URL(location.href).searchParams.get("image") !== id, id);
  const traversed = await page.evaluate(() => new URL(location.href).searchParams.get("image")!);
  await kupua.closeDetailViaBackspace();
  await expect.poll(async () => {
    const rect = await placement(page, traversed);
    return rect ? Math.abs(rect.y + rect.height / 2 - rect.viewport / 2) : Infinity;
  }).toBeLessThan(5);
  await page.keyboard.press("f");
  await page.waitForFunction(() => document.fullscreenElement !== null && document.querySelector('[data-fullscreen-preview="active"]'));
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(id => (window as any).__kupua_store__.getState().focusedImageId !== id, traversed);
  const fullTarget = await kupua.getFocusedImageId();
  await page.keyboard.press("Backspace");
  await page.waitForFunction(() => document.fullscreenElement === null && !document.querySelector('[data-fullscreen-preview="active"]'));
  await expect.poll(async () => {
    const rect = await placement(page, fullTarget!);
    return Math.abs(rect.y + rect.height / 2 - rect.viewport / 2);
  }).toBeLessThan(5);
});

test("delayed window maintenance retains the visible image without double compensation", async ({ kupua, page }, info) => {
  await start(kupua, page, info.project.name);
  await seek(page, 0.4);
  await page.evaluate(async () => {
    const store = (window as any).__kupua_store__;
    for (let page = 0; page < 4; page++) await store.getState().extendForward();
    const s = store.getState();
    if (s.results.length !== 1000) throw new Error("Fixture did not reach buffer capacity");
    const path = "/src/lib/scroll-geometry-ref.ts";
    const g = (await import(path)).getLayoutGeometry();
    const index = g.layout.indexed ? s.bufferOffset + 500 : 500;
    document.querySelector('[aria-label="Image results justified"]')!.scrollTop = g.layout.getItemRow(index).top - 200;
  });
  // Arrangement can trigger automatic maintenance; hold the next request, not an already-started one.
  await settled(page);
  await kupua.waitForExtendReady();
  const id = await focus(kupua, page);
  await page.evaluate(async () => {
    const path = "/src/dal/es-config.ts";
    if (!(await import(path)).IS_LOCAL_ES) throw new Error("Local-only fixture");
    const source = (window as any).__kupua_store__.getState().dataSource;
    const original = source.searchAfter;
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const probe = { calls: 0, release, cleanup: () => { release(); source.searchAfter = original; delete (window as any).__justifiedHold; } };
    source.searchAfter = async function (...args: any[]) {
      const result = await original.apply(this, args);
      if (args[4] === true) {
        probe.calls++;
        await gate;
      }
      return result;
    };
    (window as any).__justifiedHold = probe;
    (window as any).__justifiedWork = (window as any).__kupua_store__.getState().extendBackward();
  });
  try {
    await page.waitForFunction(() => (window as any).__justifiedHold.calls > 0);
    const before = (await placement(page, id))!;
    await page.evaluate(() => (window as any).__justifiedHold.release());
    await page.evaluate(() => (window as any).__justifiedWork);
    await settled(page);
    await expect.poll(async () => Math.abs((await placement(page, id))!.y - before.y)).toBeLessThan(1);
    await expect.poll(async () => Math.abs((await placement(page, id))!.x - before.x)).toBeLessThan(1);
    expect(await page.evaluate(() => (window as any).__justifiedHold.calls)).toBe(1);
    const eviction = await page.evaluate(() => (window as any).__kupua_store__.getState()._forwardEvictGeneration);
    await page.evaluate(() => (window as any).__kupua_store__.getState().extendForward());
    await settled(page);
    expect(await page.evaluate(() => (window as any).__kupua_store__.getState()._forwardEvictGeneration)).toBe(eviction + 1);
    await expect.poll(async () => Math.abs((await placement(page, id)).y - before.y)).toBeLessThan(1);
    await expect.poll(async () => Math.abs((await placement(page, id)).x - before.x)).toBeLessThan(1);
    const state = await page.evaluate(() => {
      const state = (window as any).__kupua_store__.getState();
      return { length: state.results.length, unique: new Set(state.results.map((image: any) => image.id)).size,
        positions: state.results.every((image: any, index: number) => state.imagePositions.get(image.id) === state.bufferOffset + index) };
    });
    expect(state.length).toBeLessThanOrEqual(1000);
    expect(state.unique).toBe(state.length);
    expect(state.positions).toBe(true);
  } finally {
    await page.evaluate(() => { (window as any).__justifiedHold?.cleanup(); delete (window as any).__justifiedWork; });
  }
});

test("pending native seek survives density switches and uses destination identity", async ({ kupua, page }, info) => {
  await start(kupua, page, info.project.name);
  await seek(page, 0.2);
  await page.evaluate(async () => {
    const path = "/src/dal/es-config.ts";
    if (!(await import(path)).IS_LOCAL_ES) throw new Error("Local-only fixture");
    const source = (window as any).__kupua_store__.getState().dataSource;
    const original = source.searchAfter;
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const probe = { calls: 0, release, cleanup: () => { release(); source.searchAfter = original; delete (window as any).__justifiedHold; } };
    source.searchAfter = async function (...args: any[]) { const result = await original.apply(this, args); probe.calls++; await gate; return result; };
    (window as any).__justifiedHold = probe;
  });
  try {
    const track = page.getByTestId("scrubber-track");
    const rect = (await track.boundingBox())!;
    await track.click({ position: { x: rect.width / 2, y: rect.height * 0.75 } });
    await page.waitForFunction(() => (window as any).__justifiedHold.calls > 0);
    await page.getByRole("button", { name: "Table view", exact: true }).click();
    await page.getByRole("button", { name: "Justified view", exact: true }).click();
    await page.evaluate(() => (window as any).__justifiedHold.release());
    await settled(page);
    const state = await page.evaluate(() => {
      const state = (window as any).__kupua_store__.getState();
      return { offset: state.bufferOffset, total: state.total, focus: state.focusedImageId };
    });
    expect(state.offset / state.total).toBeGreaterThan(0.65);
    expect(state.focus).toBeNull();
    await expect(region(page).locator("[data-image-id]").first()).toBeAttached();
  } finally { await page.evaluate(() => (window as any).__justifiedHold?.cleanup()); }
});

test("selection, narrow reflow, phantom paging and empty queries remain usable", async ({ kupua, page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await start(kupua, page, info.project.name);
  await seek(page, 0.4);
  const id = await focus(kupua, page);
  const cell = region(page).locator(`[data-image-id="${id}"]`);
  await cell.hover();
  await cell.getByRole("button", { name: "Select image", exact: true }).click();
  await page.keyboard.press("PageDown");
  expect(await kupua.getFocusedImageId()).toBe(id);
  expect(await page.evaluate(() => (window as any).__kupua_selection_store__.getState().selectedIds.size)).toBe(1);
  await page.keyboard.press("PageUp");
  await expect.poll(async () => { const p = await placement(page, id); return p.y >= 0 && p.y < p.viewport; }).toBe(true);
  await page.setViewportSize({ width: 390, height: 852 });
  await expect.poll(() => region(page).evaluate(element => element.scrollWidth - element.clientWidth)).toBe(0);
  await expect.poll(async () => {
    const p = await placement(page, id);
    return p.y >= 0 && p.y < p.viewport;
  }).toBe(true);
  await page.getByRole("button", { name: "Clear selection", exact: true }).click();
  await page.evaluate(async () => {
    const path = "/src/stores/ui-prefs-store.ts";
    (await import(path)).useUiPrefsStore.getState().setFocusMode("phantom");
    (window as any).__kupua_store__.getState().setFocusedImageId(null);
  });
  const before = await region(page).evaluate(element => element.scrollTop);
  await page.keyboard.press("PageDown");
  await expect.poll(() => region(page).evaluate(element => element.scrollTop)).toBeGreaterThan(before);
  expect(await kupua.getFocusedImageId()).toBeNull();
  await page.goto("/search?nonFree=true&query=kupua-no-match-window-proof-7fa914d");
  await page.waitForFunction(() => {
    const s = (window as any).__kupua_store__?.getState();
    return s && !s.loading && s.total === 0 && s.results.length === 0;
  });
  await expect(region(page)).toBeVisible();
  expect(errors).toEqual([]);
});

test("Home and End distinguish real result edges from window boundaries", async ({ kupua, page }, info) => {
  await start(kupua, page, info.project.name);
  await seek(page, 0.4);
  await focus(kupua, page);
  await page.keyboard.press("End");
  await page.waitForFunction(() => {
    const s = (window as any).__kupua_store__.getState();
    return s.bufferOffset + s.results.length === s.total && s._pendingFocusAfterSeek === null && !s.loading;
  });
  expect(await page.evaluate(() => {
    const s = (window as any).__kupua_store__.getState();
    return s.focusedImageId === s.results.at(-1).id;
  })).toBe(true);
  await page.keyboard.press("Home");
  await page.waitForFunction(() => {
    const s = (window as any).__kupua_store__.getState();
    return s.bufferOffset === 0 && s._pendingFocusAfterSeek === null && !s.loading;
  });
  expect(await page.evaluate(() => {
    const s = (window as any).__kupua_store__.getState();
    return s.focusedImageId === s.results[0].id;
  })).toBe(true);
});
