import type { CDPSession, Page } from "@playwright/test";

export type Density = "grid" | "justified" | "table";

/** Only D8 constrains transport; no bootstrap, navigation or paired-source setup runs inside. */
export async function withDensityScrollNetwork<T>(cdp: CDPSession, workload: string, observe: () => Promise<T>): Promise<T> {
  try {
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: workload === "scroll-cold" || workload === "scroll-constrained" });
    if (workload === "scroll-constrained") {
      await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 80,
        downloadThroughput: 4 * 1024 * 1024 / 8, uploadThroughput: 1024 * 1024 / 8 });
    }
    return await observe();
  } finally {
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: false });
  }
}

export async function waitForDensityMaintenanceCooldown(page: Page) {
  const cooldown = await page.evaluate(async () => {
    const path = "/src/constants/tuning.ts";
    return (await import(path)).SEARCH_FETCH_COOLDOWN_MS as number;
  });
  await page.waitForTimeout(cooldown + 50);
  await waitForWindowIdle(page);
}

export async function waitForWindowIdle(page: Page) {
  await page.waitForFunction(() => {
    const s = (window as any).__kupua_store__?.getState();
    return s && !s.loading && !s._browseNavigation && !s._extendForwardInFlight && !s._extendBackwardInFlight;
  });
  if (await page.evaluate(() => Boolean((window as any).__kupua_store__.getState().error))) {
    throw new Error("Density setup data operation failed (details withheld)");
  }
}

/** Drag from the actual thumb; a track click on a restored thumb is intentionally a no-op. */
export async function scrubDensityTo(page: Page, density: Density, ratio: number, settle = true) {
  const track = page.getByTestId("scrubber-track");
  const thumb = page.locator("[data-scrubber-thumb]");
  const trackBox = await track.boundingBox();
  const thumbBox = await thumb.boundingBox();
  if (!trackBox || !thumbBox) throw new Error("Scrubber geometry unavailable");
  const regime = await page.locator("[data-scrubber-mode]").first().getAttribute("data-scrubber-mode");
  const generation = await page.evaluate(() => (window as any).__kupua_store__.getState()._seekGeneration);
  const x = thumbBox.x + thumbBox.width / 2;
  await page.mouse.move(x, thumbBox.y + thumbBox.height / 2);
  await page.mouse.down();
  try {
    const y = trackBox.y + ratio * (trackBox.height - thumbBox.height) + thumbBox.height / 2;
    // Ensure a genuine pointermove even if setup starts at the requested fraction.
    await page.mouse.move(x, y - 1);
    await page.mouse.move(x, y);
  } finally { await page.mouse.up(); }
  if (regime === "seek") {
    await page.waitForFunction(generation => {
      const s = (window as any).__kupua_store__.getState();
      return s._seekGeneration > generation || Boolean(s.error);
    }, generation);
  }
  await waitForWindowIdle(page);
  if (settle) await waitForPlacement(page, density, false);
}

/** Elect once per paired workload, then restore this identity instead of repeating approximate seeks. */
export async function establishDensitySource(page: Page) {
  await selectDensity(page, "table");
  await waitForWindowIdle(page);
  await scrubDensityTo(page, "table", 0.4);
  const point = await electAnchor(page, "table");
  await page.mouse.click(point.x, point.y);
  await page.waitForFunction(() => (window as any).__kupua_store__.getState().focusedImageId === (window as any).__densityAnchor);
  await page.evaluate(() => {
    const state = (window as any).__kupua_store__.getState();
    const id = (window as any).__densityAnchor;
    (window as any).__densitySource = { id, total: state.total, offset: state.imagePositions.get(id),
      params: JSON.stringify(state.params) };
  });
  return restoreDensitySource(page);
}

export async function restoreDensitySource(page: Page) {
  await selectDensity(page, "table");
  await waitForWindowIdle(page);
  await page.evaluate(async () => {
    const store = (window as any).__kupua_store__;
    const source = (window as any).__densitySource;
    const state = store.getState();
    if (!source || source.total !== state.total || source.params !== JSON.stringify(state.params)) {
      throw new Error("Paired source query/corpus changed");
    }
    (window as any).__densityAnchor = source.id;
    state.setFocusedImageId(source.id);
    if (!state.imagePositions.has(source.id)) {
      store.setState({ _focusedImageKnownOffset: source.offset });
      await store.getState().seekToFocused();
    }
  });
  await waitForWindowIdle(page);
  await page.evaluate(async () => {
    const path = "/src/lib/orchestration/search.ts";
    (await import(path)).scrollFocusedIntoView();
  });
  await waitForPlacement(page, "table", true);
  return page.evaluate(() => ({ total: (window as any).__kupua_store__.getState().total as number }));
}

export async function prepareDensityMaintenance(page: Page, density: Density) {
  await waitForWindowIdle(page);
  // Density disposal intentionally blocks maintenance. Waiting here is setup, never measured.
  await waitForDensityMaintenanceCooldown(page);
  await page.evaluate(async () => {
    const path = "/src/constants/tuning.ts";
    const { BUFFER_CAPACITY, PAGE_SIZE } = await import(path);
    const geometryPath = "/src/lib/scroll-geometry-ref.ts";
    const geometry = (await import(geometryPath)).getLayoutGeometry();
    // Fixed grids evict complete rows, so a full window can be up to columns−1 below the cap.
    const minimumFullWindow = BUFFER_CAPACITY - ("layout" in geometry ? 0 : geometry.columns - 1);
    const store = (window as any).__kupua_store__;
    const maxReads = Math.ceil(BUFFER_CAPACITY / PAGE_SIZE) + 1;
    for (let reads = 0; reads < maxReads; reads++) {
      const before = store.getState();
      if (before.results.length >= minimumFullWindow) return;
      if (before._extendForwardInFlight || before._extendBackwardInFlight) {
        throw new Error("Maintenance setup overlaps an existing read");
      }
      await before.extendForward();
      const after = store.getState();
      if (after.error || (after.results.length <= before.results.length && after.bufferOffset === before.bufferOffset)) {
        throw new Error("Maintenance setup made no admitted progress");
      }
    }
    if (store.getState().results.length < minimumFullWindow) throw new Error("Maintenance setup did not reach aligned configured capacity");
  });
  await waitForWindowIdle(page);
  await waitForPlacement(page, density, false);
}

/** This jump can admit a read immediately, so it belongs inside D7's observation window. */
export async function scrollToDensityTail(page: Page, density: Density) {
  await page.evaluate(async density => {
    const path = "/src/lib/scroll-geometry-ref.ts";
    const geometry = (await import(path)).getLayoutGeometry();
    const state = (window as any).__kupua_store__.getState();
    const tuningPath = "/src/constants/tuning.ts";
    const { EXTEND_THRESHOLD } = await import(tuningPath);
    const indexed = document.querySelector('[data-scrubber-mode]')?.getAttribute("data-scrubber-mode") === "indexed";
    // Enter the minimum admission band; viewport size and velocity lookahead are not guarantees.
    const index = Math.max(0, state.results.length - Math.max(1, Math.floor(EXTEND_THRESHOLD / 2))) + (indexed ? state.bufferOffset : 0);
    const top = "layout" in geometry ? geometry.layout.getItemRow(index).top : Math.floor(index / geometry.columns) * geometry.rowHeight;
    document.querySelector(`[aria-label="Image results ${density}"]`)!.scrollTop = top;
  }, density);
}

export async function waitForDensityEviction(page: Page, density: Density, previous: number) {
  try {
    await page.waitForFunction(before => (window as any).__kupua_store__.getState()._forwardEvictGeneration > before,
      previous, { timeout: 12000 });
  } catch {
    const diagnostic = await page.evaluate(density => {
      const s = (window as any).__kupua_store__.getState();
      const el = document.querySelector(`[aria-label="Image results ${density}"]`)!;
      const bounds = el.getBoundingClientRect();
      const indices = [...el.querySelectorAll<HTMLElement>("[data-image-id]")].filter(cell => {
        const r = cell.getBoundingClientRect();
        return r.bottom > bounds.top && r.top < bounds.bottom;
      }).map(cell => s.imagePositions.get(cell.dataset.imageId) - s.bufferOffset).filter(Number.isFinite);
      return { density, regime: document.querySelector('[data-scrubber-mode]')?.getAttribute("data-scrubber-mode"),
        bufferLength: s.results.length, offset: s.bufferOffset, total: s.total,
        lastVisibleLocal: indices.length ? Math.max(...indices) : null,
        scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, viewportHeight: el.clientHeight,
        loading: s.loading, forwardInFlight: s._extendForwardInFlight, backwardInFlight: s._extendBackwardInFlight,
        hasEndCursor: Boolean(s.endCursor), error: Boolean(s.error), eviction: s._forwardEvictGeneration };
    }, density);
    throw new Error(`D7 did not observe forward eviction: ${JSON.stringify(diagnostic)}`);
  }
}

export async function selectDensity(page: Page, density: Density) {
  const button = page.getByRole("button", { name: `${density[0].toUpperCase()}${density.slice(1)} view`, exact: true });
  if (await button.getAttribute("aria-pressed") !== "true") await button.click();
  await page.waitForFunction(density => {
    const regions = document.querySelectorAll('[role="region"][aria-label^="Image results "]');
    return regions.length === 1 && regions[0].getAttribute("aria-label") === `Image results ${density}`;
  }, density);
}

/** Browser-local identity stays out of metric records and diagnostics. */
export async function electAnchor(page: Page, density: Density, retainExisting = false) {
  return page.evaluate(({ density, retainExisting }) => {
    const container = document.querySelector(`[aria-label="Image results ${density}"]`)!;
    const viewport = container.getBoundingClientRect();
    const cells = [...container.querySelectorAll<HTMLElement>("[data-image-id]")];
    const candidates = cells.filter(cell => {
      const r = cell.getBoundingClientRect();
      return r.top > viewport.top + 60 && r.bottom < viewport.bottom && r.width > 40 &&
        (!retainExisting || cell.dataset.imageId === (window as any).__densityAnchor);
    });
    candidates.sort((a, b) => Math.abs(a.getBoundingClientRect().top - viewport.top - viewport.height / 2) -
      Math.abs(b.getBoundingClientRect().top - viewport.top - viewport.height / 2));
    const cell = candidates[0];
    if (!cell?.dataset.imageId) throw new Error("No fully visible anchor for density fixture");
    (window as any).__densityAnchor = cell.dataset.imageId;
    const r = cell.getBoundingClientRect();
    return { x: r.left + Math.min(48, r.width / 2), y: r.top + Math.min(40, r.height / 2) };
  }, { density, retainExisting });
}

/** This is placement readiness, not a paint or media readiness claim. */
export async function waitForPlacement(page: Page, density: Density, requireAnchor: boolean, startedAt?: number, timeoutMs = 30000) {
  return page.evaluate(async ({ density, requireAnchor, startedAt, timeoutMs }) => {
    const start = startedAt ?? performance.now();
    const deadline = performance.now() + timeoutMs;
    let last: { id: string; top: number; left: number; width: number; height: number } | null = null;
    let stable = 0;
    while (performance.now() < deadline) {
      await new Promise(requestAnimationFrame);
      const state = (window as any).__kupua_store__?.getState();
      const container = document.querySelector(`[aria-label="Image results ${density}"]`);
      if (!container || !state || state.loading || state._browseNavigation || state._pendingFocusDelta != null ||
          new URL(location.href).searchParams.has("image")) { last = null; stable = 0; continue; }
      const bounds = container.getBoundingClientRect();
      const cell = [...container.querySelectorAll<HTMLElement>("[data-image-id]")].find(cell => {
        const r = cell.getBoundingClientRect();
        return (!requireAnchor || cell.dataset.imageId === (window as any).__densityAnchor) &&
          r.bottom > bounds.top + (density === "table" ? 36 : 0) && r.top < bounds.bottom && r.width > 0;
      });
      if (!cell) { last = null; stable = 0; continue; }
      const r = cell.getBoundingClientRect();
      const current = { id: cell.dataset.imageId!, top: r.top - bounds.top, left: r.left - bounds.left, width: r.width, height: r.height };
      stable = last && current.id === last.id && ["top", "left", "width", "height"].every(key =>
        Math.abs(current[key as "top"] - last![key as "top"]) < 1) ? stable + 1 : 0;
      last = current;
      if (stable >= 2) return performance.now() - start;
    }
    throw new Error("Density placement did not settle on the required identity before deadline");
  }, { density, requireAnchor, startedAt, timeoutMs });
}

export async function visibleMediaReadiness(page: Page, density: Density, startedAt: number, timeoutMs = 10000) {
  return page.evaluate(async ({ density, startedAt, timeoutMs }) => {
    const deadline = performance.now() + timeoutMs;
    const decoded = new WeakMap<HTMLImageElement, string>();
    const pending = new WeakMap<HTMLImageElement, string>();
    let live = true;
    const generation = (img: HTMLImageElement) => JSON.stringify([
      img.closest<HTMLElement>("[data-image-id]")?.dataset.imageId, img.getAttribute("src"),
      img.getAttribute("srcset"), img.getAttribute("sizes"), img.currentSrc,
    ]);
    const sample = () => {
      const container = document.querySelector(`[aria-label="Image results ${density}"]`);
      if (!container) throw new Error("Requested density disappeared during media readiness");
      const bounds = container.getBoundingClientRect();
      const images = [...container.querySelectorAll<HTMLImageElement>("img")].filter(img => {
        const slot = img.parentElement!.getBoundingClientRect();
        return slot.bottom > bounds.top && slot.top < bounds.bottom && slot.right > bounds.left && slot.left < bounds.right;
      });
      for (const img of images) {
        const src = generation(img);
        if (img.complete && img.naturalWidth > 0 && decoded.get(img) !== src && pending.get(img) !== src) {
          pending.set(img, src);
          void img.decode().then(() => {
            if (live && generation(img) === src) decoded.set(img, src);
          }).catch(() => {}).finally(() => { if (pending.get(img) === src) pending.delete(img); });
        }
      }
      return { visibleMediaCount: images.length,
        decodedMediaCount: images.filter(img => decoded.get(img) === generation(img)).length,
        failedMediaCount: images.filter(img => img.complete && img.naturalWidth === 0).length };
    };
    try {
      let counts = sample();
      while (performance.now() < deadline && counts.visibleMediaCount > 0 && counts.decodedMediaCount !== counts.visibleMediaCount && counts.failedMediaCount === 0) {
        await new Promise(requestAnimationFrame);
        counts = sample();
      }
      const complete = counts.visibleMediaCount > 0 && counts.decodedMediaCount === counts.visibleMediaCount;
      return { ...counts, mediaReadyMs: complete ? performance.now() - startedAt : null,
        mediaCensored: complete ? 0 : 1 };
    } finally { live = false; }
  }, { density, startedAt, timeoutMs });
}

/** Fixed pixels/second, not pixels/frame; browser buffering may limit achieved speed. */
export async function scrollAtSpeed(page: Page, density: Density, speed: number, duration: number) {
  return page.evaluate(async ({ density, speed, duration }) => {
    const region = document.querySelector(`[aria-label="Image results ${density}"]`) as HTMLElement;
    if (!region) throw new Error("Wrong density for controlled scrolling");
    const start = performance.now();
    let last = start;
    let actual = 0;
    let frames = 0;
    while (performance.now() - start < duration) {
      const now = await new Promise<number>(resolve => requestAnimationFrame(resolve));
      if (document.visibilityState !== "visible") throw new Error("Controlled scrolling requires a foreground page");
      const before = region.scrollTop;
      region.scrollTop += speed * (now - last) / 1000;
      actual += region.scrollTop - before;
      frames++;
      last = now;
    }
    return { commandedSpeedPxPerSec: speed, drivenDistancePx: actual, drivenDurationMs: last - start, drivenFrames: frames };
  }, { density, speed, duration });
}
