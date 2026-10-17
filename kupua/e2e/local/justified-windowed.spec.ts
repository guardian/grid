import type { Page } from "@playwright/test";
import { test, expect, type KupuaHelpers } from "../shared/helpers";
import { getDensityChangeButton, type Density } from "../shared/density-selection";
import { unfocusedDensityRoundTrips } from "../shared/browse-density";

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

async function density(page: Page, target: Density) {
  const button = await getDensityChangeButton(page, target);
  if (button) {
    const generation = await page.evaluate(() => (window as any).__kupua_getDensityRestoreGeneration__());
    await button.click();
    await page.waitForFunction(generation => (window as any).__kupua_getDensityRestoreGeneration__() > generation, generation);
  }
  await expect(page.getByRole("region", { name: `Image results ${target}`, exact: true })).toBeVisible();
}

test("windowed unfocused density cycles retain placement until new browsing", async ({ kupua, page }, info) => {
  await start(kupua, page, info.project.name);
  await seek(page, 0.4);
  await unfocusedDensityRoundTrips(kupua);
});

test("technical block seams fill the row and preserve their anchor through reflow and density changes", async ({ kupua, page }, info) => {
  await page.setViewportSize({ width: 914, height: 900 });
  await start(kupua, page, info.project.name);
  const id = await page.evaluate(async () => {
    const path = "/src/dal/es-config.ts";
    if (!(await import(path)).IS_LOCAL_ES) throw new Error("Local-only fixture");
    const store = (window as any).__kupua_store__;
    const results = store.getState().results.map((image: any, index: number) => {
      const dimensions = { width: index % 48 === 42 ? 1000 : index % 48 >= 46 ? 67 : 150, height: 100 };
      return { ...image, source: { ...image.source, dimensions, orientedDimensions: dimensions } };
    });
    store.setState({ results });
    return results[47].id as string;
  });
  await region(page).evaluate(element => { element.scrollTop = 2000; });
  const cell = region(page).locator(`[data-image-id="${id}"]`);
  await expect(cell).toBeAttached();
  await cell.scrollIntoViewIfNeeded();
  const point = await kupua.waitForHitTestedImagePoint({ view: "justified", imageId: id });
  await page.mouse.click(point.x, point.y);
  expect(await kupua.getFocusedImageId()).toBe(id);
  const before = await placement(page, id);
  for (const width of [914, 404, 914]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(id => {
      const container = document.querySelector('[aria-label="Image results justified"]');
      const element = container?.querySelector(`[data-image-id="${CSS.escape(id)}"]`);
      return container && element
        ? Math.abs(element.getBoundingClientRect().right - container.getBoundingClientRect().left - container.clientWidth)
        : Infinity;
    }, id)).toBeLessThan(1);
    await expect.poll(async () => Math.abs((await placement(page, id)).y - before.y)).toBeLessThan(1);
    const ratio = await cell.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return rect.width / rect.height;
    });
    expect(ratio).toBeCloseTo(0.67, 2);
  }
  await density(page, "table");
  await density(page, "justified");
  await expect.poll(async () => Math.abs((await placement(page, id)).y - before.y)).toBeLessThan(1);
  expect(await kupua.getFocusedImageId()).toBe(id);
});

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
  for (const source of ["grid", "justified", "table"] as const) {
    await density(page, source);
    const departure = await placement(page, id);
    expect(departure.y).toBeGreaterThan(0);
    expect(departure.y + departure.height).toBeLessThan(departure.viewport);
    await page.getByRole("button", { name: "Sort descending, click to sort ascending", exact: true }).click();
    await page.waitForFunction(() => {
      const state = (window as any).__kupua_store__.getState();
      return state.params.orderBy === "uploadTime" && !state.loading && state._searchContinuity?.phase === "placed";
    });
    expect(await page.evaluate(key => (window as any).__kupua_inspectSnapshot__(key)?.anchorImageId, key)).toBe(id);
    await density(page, source === "table" ? "justified" : "table");
    await page.goBack();
    await page.waitForFunction(key => {
      const state = (window as any).__kupua_store__.getState();
      return (window as any).__kupua_getKupuaKey__() === key && !state.loading
        && state._searchContinuity?.provenance === "history" && state._searchContinuity.phase === "placed";
    }, key);
    await density(page, source);
    await expect.poll(async () => Math.abs((await placement(page, id)).y - departure.y)).toBeLessThan(1);
    expect(await kupua.getFocusedImageId()).toBe(id);
    expect(await page.evaluate(() => (window as any).__kupua_selection_store__.getState().selectedIds.size)).toBe(0);
  }
  await density(page, "justified");
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

test("append repacks a visible temporary tail while preserving the elected viewport image", async ({ kupua, page }, info) => {
  await page.setViewportSize({ width: 914, height: 200 });
  await kupua.startSearch();
  await settled(page);
  await page.evaluate(async () => {
    const path = "/src/dal/es-config.ts";
    if (!(await import(path)).IS_LOCAL_ES) throw new Error("Local-only fixture");
    const source = (window as any).__kupua_store__.getState().dataSource;
    const original = source.searchAfter;
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const probe = { calls: 0, appendedIds: [] as string[], release,
      cleanup: () => { release(); source.searchAfter = original; delete (window as any).__justifiedTail; } };
    source.searchAfter = async function (...args: any[]) {
      const result = await original.apply(this, args);
      const hits = (args[1] === null ? result.hits.slice(0, 92) : result.hits).map((image: any) => {
        const dimensions = { width: 150, height: 100 };
        return { ...image, source: { ...image.source, dimensions, orientedDimensions: dimensions } };
      });
      if (args[1] !== null && args[4] !== true) {
        probe.calls++;
        probe.appendedIds = hits.map((image: any) => image.id);
        await gate;
      }
      return { ...result, hits, sortValues: result.sortValues.slice(0, hits.length) };
    };
    (window as any).__justifiedTail = probe;
  });
  try {
    // Publish the partial fixture before justified can retain any of its missing dimensions.
    await page.evaluate(() => (window as any).__kupua_store__.getState().search());
    await settled(page);
    expect(await page.evaluate(() => (window as any).__kupua_store__.getState().results.length)).toBe(92);
    await density(page, "justified");
    await expect(kupua.scrubber).toHaveAttribute("data-scrubber-mode", info.project.name.endsWith("indexed") ? "indexed" : "seek");
    // Density disposal blocks maintenance longer than the ordinary search cooldown.
    const cooldown = await page.evaluate(async () => {
      const path = "/src/constants/tuning.ts";
      return (await import(path)).SEARCH_FETCH_COOLDOWN_MS as number;
    });
    await page.waitForTimeout(cooldown + 50);
    await page.evaluate(() => {
      (window as any).__justifiedTail.work = (window as any).__kupua_store__.getState().extendForward();
    });
    await page.waitForFunction(() => (window as any).__justifiedTail.calls === 1);
    const id = await page.evaluate(async () => {
      const state = (window as any).__kupua_store__.getState();
      const path = "/src/lib/scroll-geometry-ref.ts";
      const row = (await import(path)).getLayoutGeometry().layout.getItemRow(91);
      const container = document.querySelector('[aria-label="Image results justified"]')!;
      container.scrollTop = row.top + row.height / 2 - container.clientHeight / 2;
      return state.results[91].id as string;
    });
    await page.waitForFunction(id => (window as any).__kupua_getViewportAnchorId__() === id, id);
    expect(await kupua.getFocusedImageId()).toBeNull();
    expect(await page.evaluate(() => (window as any).__kupua_store__.getState().results.length)).toBe(92);
    const before = await placement(page, id);
    const beforeScroll = await region(page).evaluate(element => element.scrollTop);
    expect(before.y).toBeLessThan(before.viewport);
    expect(before.y + before.height).toBeGreaterThan(0);
    await page.evaluate(() => (window as any).__justifiedTail.release());
    await page.evaluate(() => (window as any).__justifiedTail.work);
    await settled(page);
    expect(await page.evaluate(() => {
      const state = (window as any).__kupua_store__.getState();
      const probe = (window as any).__justifiedTail;
      return { calls: probe.calls, offset: state.bufferOffset, appended: probe.appendedIds.length,
        exactAppend: state.results.length === 92 + probe.appendedIds.length &&
          probe.appendedIds.every((id: string, index: number) => state.results[92 + index]?.id === id),
        unique: new Set(state.results.map((image: any) => image.id)).size === state.results.length };
    })).toMatchObject({ calls: 1, offset: 0, appended: 200, exactAppend: true, unique: true });
    await expect.poll(async () => {
      const after = await placement(page, id);
      const scroll = await region(page).evaluate(element => element.scrollTop);
      return Math.abs(after.y + scroll - before.y - beforeScroll);
    }).toBeGreaterThan(1);
    await expect.poll(async () => Math.abs((await placement(page, id)).y - before.y)).toBeLessThan(1);
    const after = await placement(page, id);
    const afterScroll = await region(page).evaluate(element => element.scrollTop);
    const contentDelta = after.y + afterScroll - before.y - beforeScroll;
    expect(Math.abs(afterScroll - beforeScroll - contentDelta)).toBeLessThan(1);
    const drift = await page.evaluate(async ({ id, y }) => {
      const container = document.querySelector('[aria-label="Image results justified"]')!;
      let maximum = 0;
      for (let frame = 0; frame < 12; frame++) {
        await new Promise(requestAnimationFrame);
        const cell = container.querySelector(`[data-image-id="${CSS.escape(id)}"]`)!;
        maximum = Math.max(maximum, Math.abs(cell.getBoundingClientRect().top - container.getBoundingClientRect().top - y));
      }
      return maximum;
    }, { id, y: before.y });
    expect(drift).toBeLessThan(1);
    expect(await kupua.getFocusedImageId()).toBeNull();
  } finally { await page.evaluate(() => (window as any).__justifiedTail?.cleanup()); }
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
