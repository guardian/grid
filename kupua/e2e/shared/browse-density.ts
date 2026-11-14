import { expect, type KupuaHelpers } from "./helpers";
import { getDensityChangeButton } from "./density-selection";
import type { Page } from "@playwright/test";

function watchPlacement(page: Page, mode: string, id: string) {
  return page.evaluateHandle(({ mode, id }) => {
    const samples: (number | null)[] = [];
    const errors: string[] = [];
    const onError = (event: ErrorEvent) => errors.push(event.message);
    window.addEventListener("error", onError);
    let frame = 0;
    const sample = () => {
      const container = document.querySelector(`[aria-label="Image results ${mode}"]`);
      if (container) {
        const cell = container.querySelector(`[data-image-id="${CSS.escape(id)}"]`);
        samples.push(cell ? cell.getBoundingClientRect().top - container.getBoundingClientRect().top : null);
      }
      frame = requestAnimationFrame(sample);
    };
    frame = requestAnimationFrame(sample);
    return { samples, errors, stop: () => { cancelAnimationFrame(frame); window.removeEventListener("error", onError); } };
  }, { mode, id });
}

export async function measuredDensityJourney(kupua: KupuaHelpers) {
  const page = kupua.page;
  await kupua.startSearch();
  await page.evaluate(() => (window as any).__kupua_measured__.enable());
  const region = page.getByRole("region", { name: "Image results measured", exact: true });
  await expect(region).toBeVisible();
  await page.waitForFunction(() => {
    const state = (window as any).__kupua_store__.getState();
    return !state.loading && !state._browseNavigation;
  });
  await region.evaluate(element => { element.scrollTop = 1800; element.dispatchEvent(new Event("scroll")); });
  const baseline = await region.evaluate(async element => {
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const bounds = element.getBoundingClientRect();
    const cell = Array.from(element.querySelectorAll<HTMLElement>("[data-image-id]"))
      .find(cell => { const rect = cell.getBoundingClientRect(); return rect.top > bounds.top + 30 && rect.bottom < bounds.bottom; });
    if (!cell) throw new Error("Measured witness needs a fully visible interior cell");
    (window as any).__kupua_store__.getState().setFocusedImageId(cell.dataset.imageId);
    return { id: cell.dataset.imageId!, top: cell.getBoundingClientRect().top - bounds.top };
  });
  const cell = region.locator(`[data-image-id="${baseline.id}"]`);
  await cell.getByRole("textbox", { name: "Prototype note" }).fill("Retained prototype draft");
  for (let repeat = 0; repeat < 3; repeat++) {
    for (const density of ["table", "grid", "justified"] as const) {
      const generation = await page.evaluate(() => (window as any).__kupua_getDensityRestoreGeneration__());
      const probe = await watchPlacement(page, density === "justified" ? "measured" : density, baseline.id);
      try {
        await (await getDensityChangeButton(page, density))!.click();
        await page.waitForFunction(generation => (window as any).__kupua_getDensityRestoreGeneration__() > generation, generation);
        const finalTop = await page.locator(`[aria-label^="Image results "] [data-image-id="${baseline.id}"]`)
          .evaluate(element => element.getBoundingClientRect().top - element.closest('[role="region"]')!.getBoundingClientRect().top);
        const samples = await probe.evaluate(probe => probe.samples);
        expect(samples.length).toBeGreaterThan(0);
        expect(samples.every(top => top === finalTop), `${density}: ${JSON.stringify(samples)}`).toBe(true);
      } finally {
        await probe.evaluate(probe => probe.stop());
        await probe.dispose();
      }
    }
    await expect(cell.getByRole("textbox", { name: "Prototype note" })).toHaveValue("Retained prototype draft");
    expect(await cell.evaluate(element => element.getBoundingClientRect().top -
      element.closest('[role="region"]')!.getBoundingClientRect().top)).toBe(baseline.top);
  }
  const stableFrames = async (action: () => Promise<unknown>) => {
    const probe = await watchPlacement(page, "measured", baseline.id);
    try {
      await action();
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      const positions = await probe.evaluate(probe => probe.samples);
      expect(positions.length).toBeGreaterThan(0);
      expect(positions.every(top => top === baseline.top), JSON.stringify(positions)).toBe(true);
      expect(await probe.evaluate(probe => probe.errors)).toEqual([]);
    } finally {
      await probe.evaluate(probe => probe.stop());
      await probe.dispose();
    }
  };
  await stableFrames(() => region.evaluate(element => {
    const top = element.getBoundingClientRect().top;
    const above = Array.from(element.querySelectorAll<HTMLElement>("[data-measured-cell]"))
      .find(cell => cell.getBoundingClientRect().bottom < top);
    if (!above) throw new Error("Above-viewport correction witness needs a mounted overscan cell");
    (window as any).__kupua_measured__.draft(above.dataset.imageId, "Growing above the viewport. ".repeat(80));
  }));
  for (const visible of [false, true]) {
    await stableFrames(() => page.evaluate(visible => (window as any).__kupua_measured__.field("extra", visible), visible));
  }
  const initialWidth = page.viewportSize()!.width;
  for (const width of [initialWidth - 180, initialWidth]) {
    await stableFrames(() => page.setViewportSize({ width, height: page.viewportSize()!.height }));
  }
  for (const name of ["Show Details panel", "Hide Details panel"]) {
    await stableFrames(() => page.getByRole("button", { name, exact: true }).click());
  }
  const growth = "A naturally growing note. ".repeat(150);
  await stableFrames(() => cell.getByRole("textbox", { name: "Prototype note" }).fill(growth));
  expect(await cell.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThan(await region.evaluate(element => element.clientHeight));
  await stableFrames(() => cell.getByRole("textbox", { name: "Prototype note" }).fill("Retained prototype draft"));
  const nextField = cell.locator('[data-measured-field="extra"]');
  const fieldTop = await nextField.evaluate(element => element.getBoundingClientRect().top);
  await page.evaluate(() => (window as any).__kupua_measured__.field("note", false));
  await expect(cell.getByRole("textbox", { name: "Prototype note" })).toHaveCount(0);
  expect(await nextField.evaluate(element => element.getBoundingClientRect().top)).toBe(fieldTop);
  await page.evaluate(() => (window as any).__kupua_measured__.field("note", true));
  await expect(cell.getByRole("textbox", { name: "Prototype note" })).toHaveValue("Retained prototype draft");
  const globalIndex = await page.evaluate(id => (window as any).__kupua_store__.getState().imagePositions.get(id), baseline.id);
  const total = await page.evaluate(() => (window as any).__kupua_store__.getState().total);
  if (total > 1000) {
    const track = kupua.scrubber;
    const bounds = (await track.boundingBox())!;
    await track.click({ position: { x: bounds.width / 2, y: bounds.height * 0.65 } });
    await page.waitForFunction(id => {
      const state = (window as any).__kupua_store__.getState();
      return !state.loading && !state._browseNavigation && !state.imagePositions.has(id);
    }, baseline.id);
    const landing = await page.evaluate(() => {
      const state = (window as any).__kupua_store__.getState();
      const index = state._seekTargetGlobalIndex >= 0 ? state._seekTargetGlobalIndex - state.bufferOffset : state._seekTargetLocalIndex;
      const id = state.results[index]?.id;
      const container = document.querySelector('[aria-label="Image results measured"]')!;
      const cell = id && container.querySelector(`[data-image-id="${CSS.escape(id)}"]`);
      const bounds = container.getBoundingClientRect();
      const rect = cell?.getBoundingClientRect();
      return { id, visible: !!rect && rect.bottom > bounds.top && rect.top < bounds.bottom };
    });
    expect(landing.id).toBeTruthy();
    expect(landing.visible).toBe(true);
    await page.evaluate(async index => { await (window as any).__kupua_store__.getState().seek(index); }, globalIndex);
  } else {
    await region.evaluate(element => { element.scrollTop = element.scrollHeight; element.dispatchEvent(new Event("scroll")); });
    await expect(cell).toHaveCount(0);
    await region.evaluate(element => { element.scrollTop = 1800; element.dispatchEvent(new Event("scroll")); });
  }
  await expect(cell.getByRole("textbox", { name: "Prototype note" })).toHaveValue("Retained prototype draft");
}

export async function unfocusedDensityRoundTrips(kupua: KupuaHelpers) {
  const page = kupua.page;
  const region = page.getByRole("region", { name: "Image results justified", exact: true });
  for (let journey = 0; journey < 2; journey++) {
    await page.waitForFunction(() => {
      const state = (window as any).__kupua_store__.getState();
      return !state.loading && !state._browseNavigation && !state._extendForwardInFlight && !state._extendBackwardInFlight;
    });
    const baseline = await page.evaluate(async () => {
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const id = (window as any).__kupua_getViewportAnchorId__() as string;
      const container = document.querySelector('[aria-label="Image results justified"]')!;
      const cell = container.querySelector(`[data-image-id="${CSS.escape(id)}"]`)!;
      return { id, top: cell.getBoundingClientRect().top - container.getBoundingClientRect().top };
    });
    expect(await kupua.getFocusedImageId()).toBeNull();
    for (let cycle = 0; cycle < 5; cycle++) {
      for (const mode of ["table", "grid", "justified"] as const) {
        const generation = await page.evaluate(() => (window as any).__kupua_getDensityRestoreGeneration__());
        const button = (await getDensityChangeButton(page, mode))!;
        const paintedPositions = await watchPlacement(page, mode, baseline.id);
        try {
          if (cycle % 2 === 0) await button.click();
          else await button.press("Space");
          await page.waitForFunction(generation => (window as any).__kupua_getDensityRestoreGeneration__() > generation, generation);
          await expect.poll(() => page.evaluate(id => {
            const container = document.querySelector('[aria-label^="Image results "]');
            const cell = container?.querySelector(`[data-image-id="${CSS.escape(id)}"]`);
            const bounds = container?.getBoundingClientRect();
            const rect = cell?.getBoundingClientRect();
            const header = container?.querySelector("[data-table-header]")?.getBoundingClientRect();
            return {
              visible: Boolean(bounds && rect && rect.top >= Math.max(bounds.top, header?.bottom ?? bounds.top) - 1 &&
                rect.bottom <= bounds.bottom + 1),
              focused: (window as any).__kupua_store__.getState().focusedImageId !== null,
              selected: (window as any).__kupua_selection_store__.getState().selectedIds.size,
            };
          }, baseline.id), { message: `Retained image remains usable in ${mode}` })
            .toEqual({ visible: true, focused: false, selected: 0 });
          const finalTop = await page.evaluate(id => {
            const container = document.querySelector('[aria-label^="Image results "]')!;
            return container.querySelector(`[data-image-id="${CSS.escape(id)}"]`)!.getBoundingClientRect().top -
              container.getBoundingClientRect().top;
          }, baseline.id);
          const samples = await paintedPositions.evaluate(probe => probe.samples);
          expect(samples.length).toBeGreaterThan(0);
          for (const top of samples) {
            expect(top, `${mode} must contain the retained image from its first frame`).not.toBeNull();
            expect(Math.abs(top! - finalTop), `${mode} must not paint an intermediate position`).toBeLessThan(1);
          }
        } finally {
          await paintedPositions.evaluate(probe => probe.stop());
          await paintedPositions.dispose();
        }
      }
      await expect.poll(() => page.evaluate(({ id, top }) => {
        const container = document.querySelector('[aria-label="Image results justified"]')!;
        const cell = container.querySelector(`[data-image-id="${CSS.escape(id)}"]`);
        return cell ? Math.abs(cell.getBoundingClientRect().top - container.getBoundingClientRect().top - top) : Infinity;
      }, baseline)).toBeLessThan(1);
      expect(await kupua.getFocusedImageId()).toBeNull();
      expect(await page.evaluate(() => (window as any).__kupua_selection_store__.getState().selectedIds.size)).toBe(0);
    }
    if (journey === 0) {
      const before = await region.evaluate(element => element.scrollTop);
      const bounds = (await region.boundingBox())!;
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      await page.mouse.wheel(0, 600);
      await expect.poll(() => region.evaluate(element => element.scrollTop)).toBeGreaterThan(before + 200);
      await page.waitForFunction(id => (window as any).__kupua_getViewportAnchorId__() !== id, baseline.id);
    }
  }
}

export async function pendingBrowseAcrossDensity(
  kupua: KupuaHelpers,
  transport: "direct-ES" | "media-api-fixture",
  focusMode: "explicit" | "phantom",
  sourceView: "grid" | "table",
  timing: "pending" | "queued" | "wheel" = "pending",
  changeDensity = true,
) {
  const page = kupua.page;
  await kupua.startSearch("", sourceView);
  await page.waitForFunction(() => !(window as any).__kupua_store__.getState().loading);
  const regime = await kupua.scrubber.getAttribute("data-scrubber-mode");
  expect(["indexed", "seek"]).toContain(regime);
  if (regime === "indexed") await kupua.waitForPositionMap();
  if (regime === "seek") {
    const generation = await page.evaluate(() => (window as any).__kupua_store__.getState()._seekGeneration);
    const bounds = (await kupua.scrubber.boundingBox())!;
    await kupua.scrubber.click({ position: { x: bounds.width / 2, y: bounds.height * 0.5 } });
    await page.waitForFunction(generation => {
      const state = (window as any).__kupua_store__.getState();
      return state._seekGeneration > generation && !state.loading && state._browseNavigation === null;
    }, generation);
  }
  await page.evaluate(async focusMode => {
    const configPath = "/src/dal/es-config.ts";
    if (!(await import(configPath)).IS_LOCAL_ES) throw new Error("B17 fixture requires local ES");
    const prefsPath = "/src/stores/ui-prefs-store.ts";
    const preferences = await import(prefsPath);
    preferences.useUiPrefsStore.getState().setFocusMode(focusMode);
    if (preferences.getEffectiveFocusMode() !== focusMode) throw new Error("B17 focus mode mismatch");
  }, focusMode);
  const bookmark = await kupua.waitForHitTestedImagePoint({ view: sourceView });
  await page.mouse.click(bookmark.x, bookmark.y);
  if (focusMode === "phantom") {
    await expect(page.locator("[data-detail-image-id]")).toBeVisible();
    await kupua.closeDetailViaBackspace();
  }
  await page.waitForFunction(() => (window as any).__kupua_store__.getState().focusedImageId !== null);
  if (timing !== "pending") await page.evaluate(() => { (window as any).__kupua_store__.getState().setFocusedImageId(null); });

  await page.evaluate(async transport => {
    const store = (window as any).__kupua_store__;
    const originalSource = store.getState().dataSource;
    const originalSeek = store.getState().seek;
    const originalFetch = window.fetch;
    const apiPath = "/src/dal/api-data-source.ts";
    const source = transport === "media-api-fixture" ? new (await import(apiPath)).ApiDataSource() : originalSource;
    if (transport === "media-api-fixture") {
      for (const method of ["estimateSortValue", "countBefore", "getSortDistribution", "getNullZoneDistribution"]) {
        if (typeof originalSource[method] === "function") source[method] = originalSource[method].bind(originalSource);
      }
      window.fetch = async (input, init) => {
        const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.origin);
        if (!url.pathname.endsWith("/api/images/search-after")) return originalFetch(input, init);
        const body = JSON.parse(init?.body as string);
        const result = await originalSource.searchAfter({ query: body.q, orderBy: body.orderBy,
          nonFree: body.free ? undefined : "true", offset: body.offset, length: body.length, trackTotalHits: body.countAll },
        body.sortValues ?? null, null, init?.signal, body.reverse, body.seekToEnd);
        return Response.json({ data: result.hits.map((data: unknown) => ({ data })), total: result.total, sortValues: result.sortValues });
      };
    }
    const originalPage = source.searchAfter;
    const ownPage = Object.getOwnPropertyDescriptor(source, "searchAfter");
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const probe = { ready: 0, released: false, signals: [] as AbortSignal[], work: [] as Promise<void>[],
      bookmark: store.getState().focusedImageId, target: 0, expectedId: null as string | null,
      generation: store.getState()._seekGeneration, density: (window as any).__kupua_getDensityRestoreGeneration__(),
      departure: store.getState().results, departureId: null as string | null,
      frame: 0, samples: 0, missingDeparture: 0, rolledBack: 0, thumbTop: 0,
      release: () => { probe.released = true; release(); }, cleanup: async () => {} };
    source.searchAfter = async function (...args: any[]) {
      const result = await originalPage.apply(this, args);
      if (!args[0].trackTotalHits && !args[0].ids && (args[1] || args[0].offset > 0)) {
        probe.signals.push(args[3]);
        probe.ready += 1;
        await held;
      }
      return result;
    };
    store.setState({ dataSource: source, seek: (...args: any[]) => {
      const work = originalSeek(...args);
      probe.work.push(work);
      return work;
    } });
    probe.cleanup = async () => {
      cancelAnimationFrame(probe.frame);
      probe.release();
      await Promise.all(probe.work.map(work => work.catch(() => {})));
      if (ownPage) Object.defineProperty(source, "searchAfter", ownPage);
      else delete source.searchAfter;
      window.fetch = originalFetch;
      store.setState({ dataSource: originalSource, seek: originalSeek });
      delete (window as any).__b17;
    };
    (window as any).__b17 = probe;
  }, transport);

  try {
    const targetView = changeDensity ? sourceView === "grid" ? "table" : "grid" : sourceView;
    if (regime === "seek") await page.evaluate(() => {
      const probe = (window as any).__b17;
      const container = document.querySelector<HTMLElement>('[aria-label="Image results grid"], [aria-label="Image results table"]')!;
      const bounds = container.getBoundingClientRect();
      const top = container.querySelector('[data-table-header]')?.getBoundingClientRect().bottom ?? bounds.top;
      const centre = (top + bounds.bottom) / 2;
      probe.departureId = Array.from(container.querySelectorAll<HTMLElement>('[data-image-id]'))
        .filter(cell => { const rect = cell.getBoundingClientRect(); return rect.bottom > top && rect.top < bounds.bottom; })
        .sort((first, second) => Math.abs((first.getBoundingClientRect().top + first.getBoundingClientRect().bottom) / 2 - centre)
          - Math.abs((second.getBoundingClientRect().top + second.getBoundingClientRect().bottom) / 2 - centre))[0]?.dataset.imageId;
      if (!probe.departureId) throw new Error("B18 departure anchor absent");
    });
    if (timing !== "pending") {
      expect(regime).toBe("indexed");
      await expect(page.getByRole("button", { name: `${targetView[0].toUpperCase()}${targetView.slice(1)} view`, exact: true })).toBeVisible();
      await page.evaluate(({ targetView, timing }) => {
        const slider = document.querySelector<HTMLElement>('[data-testid="scrubber-track"]')!;
        const bounds = slider.getBoundingClientRect();
        if (timing === "wheel") {
          const container = document.querySelector<HTMLElement>('[aria-label="Image results grid"], [aria-label="Image results table"]')!;
          slider.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true,
            deltaY: (container.scrollHeight - container.clientHeight) * 0.65 }));
        } else {
          slider.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: bounds.x + bounds.width / 2,
            clientY: bounds.y + bounds.height * 0.65 }));
        }
        const state = (window as any).__kupua_store__.getState();
        if (state._browseNavigation?.phase !== "queued") throw new Error("B17 missed pre-dispatch window");
        const probe = (window as any).__b17;
        probe.target = state._browseNavigation.targetOffset;
        probe.expectedId = state.positionMap.ids[probe.target];
        document.querySelector<HTMLButtonElement>(`button[aria-label="${targetView[0].toUpperCase()}${targetView.slice(1)} view"]`)!.click();
      }, { targetView, timing });
    } else {
      const bounds = await kupua.scrubber.boundingBox();
      expect(bounds).not.toBeNull();
      await kupua.scrubber.click({ position: { x: bounds!.width / 2, y: bounds!.height * 0.65 } });
      await page.waitForFunction(() => (window as any).__b17.ready > 0 && (window as any).__kupua_store__.getState().loading);
      await page.evaluate(() => {
        const state = (window as any).__kupua_store__.getState();
        const probe = (window as any).__b17;
        probe.target = state._browseNavigation.targetOffset;
        probe.expectedId = state.positionMap?.ids[probe.target] ?? null;
      });
      if (regime === "seek") await page.evaluate(() => {
        const probe = (window as any).__b17;
        const readThumbTop = () => {
          const thumb = document.querySelector<HTMLElement>('[data-scrubber-thumb]')!;
          return parseFloat(thumb.style.transform.match(/^translateY\((.+)\)$/)?.[1] ?? thumb.style.top);
        };
        probe.thumbTop = readThumbTop();
        const sample = () => {
          if (!probe.released) {
            const state = (window as any).__kupua_store__.getState();
            const container = document.querySelector<HTMLElement>('[aria-label="Image results grid"], [aria-label="Image results table"]');
            if (document.visibilityState !== "visible") throw new Error("B18 sample is backgrounded");
            if (container && state.results === probe.departure) {
              const bounds = container.getBoundingClientRect();
              const top = container.querySelector('[data-table-header]')?.getBoundingClientRect().bottom ?? bounds.top;
              const cell = container.querySelector<HTMLElement>(`[data-image-id="${CSS.escape(probe.departureId)}"]`);
              const rect = cell?.getBoundingClientRect();
              probe.samples += 1;
              if (!rect || rect.bottom <= top || rect.top >= bounds.bottom) probe.missingDeparture += 1;
              const thumb = readThumbTop();
              if (Math.abs(thumb - probe.thumbTop) > 1) probe.rolledBack += 1;
            }
            probe.frame = requestAnimationFrame(sample);
          }
        };
        probe.frame = requestAnimationFrame(sample);
      });
      if (changeDensity) await page.getByRole("button", { name: `${targetView[0].toUpperCase()}${targetView.slice(1)} view`, exact: true }).click();
    }
    if (changeDensity) await page.waitForFunction(() => (window as any).__kupua_getDensityRestoreGeneration__() > (window as any).__b17.density);
    await page.waitForFunction(() => (window as any).__b17.ready > 0);
    if (regime === "seek") {
      await page.waitForFunction(() => (window as any).__b17.samples >= 12);
      expect(await page.evaluate(() => {
        const probe = (window as any).__b17;
        return { missingDeparture: probe.missingDeparture, rolledBack: probe.rolledBack };
      })).toEqual({ missingDeparture: 0, rolledBack: 0 });
    }
    expect(await page.evaluate(() => (window as any).__b17.signals.every((signal: AbortSignal) => !signal.aborted))).toBe(true);
    await page.evaluate(() => { (window as any).__b17.release(); });
    await page.waitForFunction(() => {
      const state = (window as any).__kupua_store__.getState();
      return state._seekGeneration > (window as any).__b17.generation && !state.loading && state._browseNavigation === null;
    });
    await expect.poll(() => page.evaluate(() => {
      const state = (window as any).__kupua_store__.getState();
      const probe = (window as any).__b17;
      const identity = probe.expectedId ?? state.results[state._seekTargetLocalIndex]?.id;
      const container = document.querySelector<HTMLElement>('[aria-label="Image results grid"], [aria-label="Image results table"]');
      const cell = container?.querySelector<HTMLElement>(`[data-image-id="${CSS.escape(identity ?? "")}"]`);
      if (!container || !cell) return false;
      const bounds = container.getBoundingClientRect();
      const rect = cell.getBoundingClientRect();
      const header = container.querySelector("[data-table-header]")?.getBoundingClientRect();
      return rect.bottom > Math.max(bounds.top, header?.bottom ?? bounds.top) && rect.top < bounds.bottom;
    })).toBe(true);
    const final = await page.evaluate(() => {
      const state = (window as any).__kupua_store__.getState();
      const probe = (window as any).__b17;
      return { nearDestination: Math.abs(state.bufferOffset - probe.target) < Math.max(400, state.total * 0.02),
        bookmarkRetained: state.focusedImageId === probe.bookmark, loading: state.loading, error: state.error,
        loadingNotice: Array.from(document.querySelectorAll('[role="status"]')).some(element => element.textContent?.includes("Loading more")) };
    });
    expect(final).toEqual({ nearDestination: true, bookmarkRetained: true, loading: false, error: null, loadingNotice: false });
    await kupua.assertPositionsConsistent();
    await expect(page.getByRole("button", { name: `${targetView[0].toUpperCase()}${targetView.slice(1)} view`, exact: true })).toHaveAttribute("aria-pressed", "true");
  } finally {
    await page.evaluate(async () => { await (window as any).__b17?.cleanup(); });
  }
}