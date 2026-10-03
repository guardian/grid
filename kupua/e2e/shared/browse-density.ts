import { expect, type KupuaHelpers } from "./helpers";

export async function pendingBrowseAcrossDensity(
  kupua: KupuaHelpers,
  transport: "direct-ES" | "media-api-fixture",
  focusMode: "explicit" | "phantom",
  sourceView: "grid" | "table",
  timing: "pending" | "queued" | "wheel" = "pending",
) {
  const page = kupua.page;
  await kupua.gotoWithParams(sourceView === "table" ? "density=table" : "");
  await page.waitForFunction(() => !(window as any).__kupua_store__.getState().loading);
  const regime = await kupua.scrubber.getAttribute("data-scrubber-mode");
  expect(["indexed", "seek"]).toContain(regime);
  if (regime === "indexed") await kupua.waitForPositionMap();
  await page.evaluate(async focusMode => {
    const configPath = "/src/dal/es-config.ts";
    if (!(await import(configPath)).IS_LOCAL_ES) throw new Error("B17 fixture requires local ES");
    const prefsPath = "/src/stores/ui-prefs-store.ts";
    const preferences = await import(prefsPath);
    preferences.useUiPrefsStore.getState().setFocusMode(focusMode);
    if (preferences.getEffectiveFocusMode() !== focusMode) throw new Error("B17 focus mode mismatch");
  }, focusMode);
  await page.locator(`[aria-label="Image results ${sourceView}"] [data-image-id]`).nth(2)
    .click({ position: { x: 48, y: sourceView === "grid" ? 80 : 16 } });
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
    const targetView = sourceView === "grid" ? "table" : "grid";
    if (timing !== "pending") {
      expect(regime).toBe("indexed");
      await expect(page.getByRole("button", { name: `Switch to ${targetView} view`, exact: true })).toBeVisible();
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
        document.querySelector<HTMLButtonElement>(`button[aria-label="Switch to ${targetView} view"]`)!.click();
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
      await page.getByRole("button", { name: `Switch to ${targetView} view`, exact: true }).click();
    }
    await page.waitForFunction(() => (window as any).__kupua_getDensityRestoreGeneration__() > (window as any).__b17.density);
    await page.waitForFunction(() => (window as any).__b17.ready > 0);
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
    await expect(page.getByRole("button", { name: `Switch to ${sourceView} view`, exact: true })).toBeVisible();
  } finally {
    await page.evaluate(async () => { await (window as any).__b17?.cleanup(); });
  }
}