import type { CDPSession, Page } from "@playwright/test";
import { getDensityChangeButton, type Density } from "../e2e/shared/density-selection";
import { installThumbnailProbe } from "./thumbnail-probe.mjs";
import type { RequestProbe } from "./network-probe.mjs";
import { refreshComparisonMetrics } from "./density-reporting.mjs";
import { DENSITY_PRESSURE_STEPS, summarizeDensityPressure } from "./density-pressure.mjs";

export type { Density } from "../e2e/shared/density-selection";

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
    const store = (window as any).__kupua_store__;
    const maxReads = Math.ceil(BUFFER_CAPACITY / PAGE_SIZE) + 1;
    for (let reads = 0; reads < maxReads; reads++) {
      const before = store.getState();
      if (before.results.length === BUFFER_CAPACITY) return;
      if (before._extendForwardInFlight || before._extendBackwardInFlight) {
        throw new Error("Maintenance setup overlaps an existing read");
      }
      await before.extendForward();
      const after = store.getState();
      if (after.error || (after.results.length <= before.results.length && after.bufferOffset === before.bufferOffset)) {
        throw new Error("Maintenance setup made no admitted progress");
      }
    }
    if (store.getState().results.length !== BUFFER_CAPACITY) throw new Error("Maintenance setup did not reach configured capacity");
  });
  await waitForWindowIdle(page);
  await waitForPlacement(page, density, false);
}

/** This jump can admit a read immediately, so it belongs inside D7's observation window. */
export async function scrollToDensityTail(page: Page, density: Density) {
  await page.evaluate(async density => {
    const path = "/src/lib/scroll-geometry-ref.ts";
    const { getLayoutGeometry, getItemLayoutRow } = await import(path);
    const geometry = getLayoutGeometry();
    const state = (window as any).__kupua_store__.getState();
    const tuningPath = "/src/constants/tuning.ts";
    const { EXTEND_THRESHOLD } = await import(tuningPath);
    const indexed = document.querySelector('[data-scrubber-mode]')?.getAttribute("data-scrubber-mode") === "indexed";
    // Enter the minimum admission band; viewport size and velocity lookahead are not guarantees.
    const index = Math.max(0, state.results.length - Math.max(1, Math.floor(EXTEND_THRESHOLD / 2))) + (indexed ? state.bufferOffset : 0);
    const top = getItemLayoutRow(geometry, index).top;
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
  const button = await getDensityChangeButton(page, density);
  if (button) await button.click();
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

export async function analyzeIdentityFrames(page: Page, frames: { data: string; epochMs: number }[], reference: {
  width: number; height: number; palette: number[][];
  targets: { x: number; checkX: number; y: number; paletteIndex: number }[];
  anchor: { centerX: number; centerY: number; sampleX: number; sampleY: number };
}) {
  if (frames.length === 0 || frames.length > 128 || frames.reduce((sum, frame) => sum + frame.data.length, 0) > 16 * 1024 * 1024 ||
      reference.targets.length === 0 || reference.targets.length > 128 || reference.palette.length > 512) {
    throw new Error("Identity frame capture outside its bounds");
  }
  return page.evaluate(async ({ frames, reference }) => {
    const results: { epochMs: number; wrongIdentities: number; unknownPixels: number;
      wrongTargets: { index: number; observedPaletteIndex: number }[]; unknownTargets: number[];
      anchorDx: number | null; anchorDy: number | null }[] = [];
    let baseline: { horizontal: number; vertical: number } | null = null;
    for (const frame of frames) {
      if (!Number.isFinite(frame.epochMs)) throw new Error("Identity frame timestamp unavailable");
      const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${frame.data}`)).blob());
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const scale = canvas.width / reference.width;
      if (Math.abs(scale - canvas.height / reference.height) > 0.01) throw new Error("Identity frame viewport changed");
      const context = canvas.getContext("2d")!;
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const pixel = (horizontal: number, vertical: number) => {
        const column = Math.round(horizontal * scale);
        const row = Math.round(vertical * scale);
        if (column < 0 || row < 0 || column >= canvas.width || row >= canvas.height) throw new Error("Identity target outside frame");
        const offset = (row * canvas.width + column) * 4;
        return [pixels[offset], pixels[offset + 1], pixels[offset + 2]];
      };
      let wrongIdentities = 0;
      let unknownPixels = 0;
      const wrongTargets: { index: number; observedPaletteIndex: number }[] = [];
      const unknownTargets: number[] = [];
      for (const [index, target] of reference.targets.entries()) {
        const color = pixel(target.x, target.y);
        const complement = pixel(target.checkX, target.y);
        const matched = reference.palette.findIndex(candidate => candidate.reduce((sum, channel, index) =>
          sum + (channel - color[index]) ** 2, 0) <= 144 && candidate.reduce((sum, channel, index) =>
          sum + (255 - channel - complement[index]) ** 2, 0) <= 144);
        if (matched < 0) { unknownPixels++; unknownTargets.push(index); }
        else if (matched !== target.paletteIndex) { wrongIdentities++; wrongTargets.push({ index, observedPaletteIndex: matched }); }
      }
      const marker = (horizontal: boolean) => {
        const { centerX, centerY, sampleX, sampleY } = reference.anchor;
        const positions: number[] = [];
        for (let offset = -24; offset <= 24; offset++) {
          const coordinate = (horizontal ? centerX : centerY) + offset;
          if (pixel(horizontal ? coordinate : sampleX, horizontal ? sampleY : coordinate).every(channel => channel < 16)) positions.push(coordinate);
        }
        return positions.length ? (positions[0] + positions.at(-1)!) / 2 : null;
      };
      const horizontal = marker(true);
      const vertical = marker(false);
      if (baseline === null) {
        if (horizontal === null || vertical === null || wrongIdentities || unknownPixels) throw new Error("Identity baseline is not visible and correct");
        baseline = { horizontal, vertical };
      }
      results.push({ epochMs: frame.epochMs, wrongIdentities, unknownPixels, wrongTargets, unknownTargets,
        anchorDx: horizontal === null ? null : horizontal - baseline.horizontal,
        anchorDy: vertical === null ? null : vertical - baseline.vertical });
    }
    return results;
  }, { frames, reference });
}

/** Fixed pixels/second, not pixels/frame; browser buffering may limit achieved speed. */
export async function scrollAtSpeed(page: Page, density: Density, speed: number, duration: number,
  options: { measureBounds?: boolean; maxDistancePx?: number; captureSteps?: boolean } = {}) {
  if (options.maxDistancePx !== undefined && (!Number.isFinite(options.maxDistancePx) || options.maxDistancePx <= 0)) {
    throw new Error("Scroll distance endpoint must be finite and positive");
  }
  return page.evaluate(async ({ density, speed, duration, measureBounds, maxDistancePx, captureSteps }) => {
    const region = document.querySelector(`[aria-label="Image results ${density}"]`) as HTMLElement;
    if (!region) throw new Error("Wrong density for controlled scrolling");
    const mode = measureBounds ? document.querySelector<HTMLElement>("[data-scrubber-mode]")?.dataset.scrubberMode : undefined;
    if (measureBounds && !["seek", "indexed", "buffer"].includes(mode ?? "")) {
      throw new Error("Bounds measurement requires the scroll regime");
    }
    let physicalClampMs = 0;
    let bufferEdgeBlockedMs = 0;
    let clampedDistancePx = 0;
    let bufferEdgeEpisodeCount = 0;
    let bufferEdgeEpisodeMaxMs = 0;
    let bufferEdgeEpisodeCompletedCount = 0;
    let bufferEdgeEpisodeCompletedMaxMs: number | null = null;
    let bufferEdgeEpisodeCensoredCount = 0;
    let episodeStart: number | null = null;
    const finishEpisode = (at: number, censored: boolean) => {
      if (episodeStart === null) return;
      const elapsed = Math.max(0, at - episodeStart);
      bufferEdgeEpisodeMaxMs = Math.max(bufferEdgeEpisodeMaxMs, elapsed);
      if (censored) bufferEdgeEpisodeCensoredCount++;
      else {
        bufferEdgeEpisodeCompletedCount++;
        bufferEdgeEpisodeCompletedMaxMs = Math.max(bufferEdgeEpisodeCompletedMaxMs ?? 0, elapsed);
      }
      episodeStart = null;
    };
    const start = performance.now();
    let last = start;
    let stoppedAtPerformanceMs = start;
    let actual = 0;
    let frames = 0;
    const steps: { at: number; drivenDistancePx: number }[] = [];
    while (performance.now() - start < duration && (maxDistancePx === undefined || Math.abs(actual) < maxDistancePx)) {
      if (captureSteps && steps.length >= 2048) throw new Error("Scroll step capture exceeded its bound");
      const now = await new Promise<number>(resolve => requestAnimationFrame(resolve));
      if (document.visibilityState !== "visible") throw new Error("Controlled scrolling requires a foreground page");
      const before = region.scrollTop;
      const maximum = measureBounds ? Math.max(0, region.scrollHeight - region.clientHeight) : 0;
      const available = measureBounds ? Math.max(0, speed > 0 ? maximum - before : before) : 0;
      if (episodeStart !== null && available > 1) finishEpisode(now, false);
      const requested = maxDistancePx === undefined ? speed * (now - last) / 1000 :
        Math.sign(speed) * Math.min(Math.abs(speed) * Math.max(0, now - last) / 1000, maxDistancePx - Math.abs(actual));
      region.scrollTop += requested;
      const applied = region.scrollTop - before;
      actual += applied;
      (window as any).__densityJourney?.input(applied);
      if (captureSteps) steps.push({ at: performance.now(), drivenDistancePx: actual });
      if (measureBounds) stoppedAtPerformanceMs = performance.now();
      let temporaryBlocked = false;
      if (measureBounds && requested !== 0) {
        const lost = Math.max(0, Math.abs(requested) - available);
        const atEdge = speed > 0 ? Math.abs(region.scrollTop - maximum) < 1 : Math.abs(region.scrollTop) < 1;
        if (lost > 0 && atEdge) {
          const blockedMs = lost / Math.abs(speed) * 1000;
          clampedDistancePx += lost;
          physicalClampMs += blockedMs;
          if (mode === "seek") {
            const state = (window as any).__kupua_store__?.getState();
            if (!state || !Array.isArray(state.results) || !Number.isFinite(state.bufferOffset) || !Number.isFinite(state.total)) {
              throw new Error("Bounds measurement requires buffer coverage");
            }
            if (speed > 0 ? state.bufferOffset + state.results.length < state.total : state.bufferOffset > 0) {
              bufferEdgeBlockedMs += blockedMs;
              temporaryBlocked = true;
              if (episodeStart === null) {
                episodeStart = Math.max(start, now - blockedMs);
                bufferEdgeEpisodeCount++;
              }
            }
          }
        }
      }
      if (!temporaryBlocked) finishEpisode(now, false);
      frames++;
      last = now;
    }
    finishEpisode(last, true);
    return { commandedSpeedPxPerSec: speed, drivenDistancePx: actual, drivenDurationMs: last - start, drivenFrames: frames,
      ...(captureSteps ? { steps } : {}),
      ...(measureBounds ? { physicalClampMs, bufferEdgeBlockedMs, clampedDistancePx,
        boundsCaptureRevision: 1, bufferEdgeEpisodeCount, bufferEdgeEpisodeMaxMs,
        bufferEdgeEpisodeCompletedCount, bufferEdgeEpisodeCompletedMaxMs: bufferEdgeEpisodeCompletedMaxMs as number | null,
        bufferEdgeEpisodeCensoredCount,
        startedAtPerformanceMs: start, stoppedAtPerformanceMs } : {}) };
  }, { density, speed, duration, measureBounds: options.measureBounds === true, maxDistancePx: options.maxDistancePx,
    captureSteps: options.captureSteps === true });
}

export async function prepareDensityRecovery(page: Page, density: Density) {
  await waitForWindowIdle(page);
  await page.evaluate(async () => {
    const path = "/src/lib/image-offset-cache.ts";
    const { getRetainedSortValues, buildSearchKey } = await import(path);
    const state = (window as any).__kupua_store__.getState();
    const source = (window as any).__densitySource;
    if (!source || source.total !== state.total || source.params !== JSON.stringify(state.params)) {
      throw new Error("Recovery setup lost the paired source");
    }
    const cursor = getRetainedSortValues(source.id, buildSearchKey(state.params));
    if (!cursor) throw new Error("Recovery setup requires the retained source cursor");
    await state.restoreAroundCursor(source.id, cursor, source.offset, true);
  });
  await waitForWindowIdle(page);
  await page.evaluate(async () => {
    const path = "/src/lib/orchestration/search.ts";
    (await import(path)).scrollFocusedIntoView();
  });
  await waitForPlacement(page, density, true);
  await waitForDensityMaintenanceCooldown(page);
  await page.evaluate(() => (window as any).__kupua_store__.getState().setFocusedImageId(null));
}

export async function measureDensityRecovery(page: Page, density: "grid" | "justified",
  { backwardDurationMs = 3000, forwardDurationMs = 1500, postStopObservationMs = 0, backwardDistancePx }:
  { backwardDurationMs?: number; forwardDurationMs?: number; postStopObservationMs?: number; backwardDistancePx?: number } = {}) {
  await page.evaluate(() => {
    const store = (window as any).__kupua_store__;
    const initial = store.getState();
    const probe = { params: JSON.stringify(initial.params), total: initial.total,
      starts: [] as { time: number; backward: boolean }[], peak: 0, overflow: false,
      destination: "", unsubscribe: () => {} };
    probe.unsubscribe = store.subscribe((state: any, previous: any) => {
      for (const [field, backward] of [["_extendForwardInFlight", false], ["_extendBackwardInFlight", true]] as const) {
        if (state[field] && !previous[field]) {
          if (probe.starts.length >= 16) probe.overflow = true;
          else probe.starts.push({ time: performance.now(), backward });
        }
      }
      probe.peak = Math.max(probe.peak, Number(state._extendForwardInFlight) + Number(state._extendBackwardInFlight));
    });
    (window as any).__densityRecovery = probe;
  });
  try {
    await page.evaluate(installThumbnailProbe, { density });
    const backward = await scrollAtSpeed(page, density, -4000, backwardDurationMs,
      { measureBounds: true, maxDistancePx: backwardDistancePx });
    const forward = forwardDurationMs > 0
      ? await scrollAtSpeed(page, density, 4000, forwardDurationMs, { measureBounds: true }) : null;
    const stoppedAt = (forward ?? backward).stoppedAtPerformanceMs!;
    const motion = await page.evaluate(() => (window as any).__kupua_thumbnailProbe.stop());
    const data = await page.evaluate(async ({ density, stoppedAt }) => {
      const probe = (window as any).__densityRecovery;
      let previous = "";
      let stable = 0;
      while (performance.now() - stoppedAt < 10000) {
        await new Promise(requestAnimationFrame);
        if (document.visibilityState !== "visible") throw new Error("Recovery requires a foreground page");
        const state = (window as any).__kupua_store__.getState();
        if (state.error || state.total !== probe.total || JSON.stringify(state.params) !== probe.params) {
          throw new Error("Recovery data operation failed or changed scope");
        }
        const region = document.querySelector<HTMLElement>(`[aria-label="Image results ${density}"]`);
        if (!region) throw new Error("Recovery density disappeared");
        const bounds = region.getBoundingClientRect();
        const visible = (element: Element) => {
          const rect = element.getBoundingClientRect();
          return rect.bottom > bounds.top && rect.top < bounds.bottom && rect.right > bounds.left && rect.left < bounds.right;
        };
        const cells = [...region.querySelectorAll<HTMLElement>("[data-grid-cell]")].filter(visible);
        const missing = [...region.querySelectorAll(":scope > div > div > div:not([data-grid-cell])")].some(visible);
        const ids = cells.map(cell => cell.dataset.imageId!);
        const key = JSON.stringify(ids);
        const ready = !state.loading && !state._browseNavigation && !missing && ids.length > 0 &&
          ids.every(id => state.imagePositions.has(id));
        stable = ready && key === previous ? stable + 1 : 0;
        previous = key;
        if (stable >= 2) {
          probe.destination = key;
          return { stopDataCensored: 0, stopDataReadyMs: performance.now() - stoppedAt };
        }
      }
      return { stopDataCensored: 1, stopDataReadyMs: null };
    }, { density, stoppedAt });
    const remaining = await page.evaluate(stoppedAt => Math.max(0, 10000 - (performance.now() - stoppedAt)), stoppedAt);
    const media = data.stopDataCensored ? { mediaCensored: 1, mediaReadyMs: null,
      visibleMediaCount: 0, decodedMediaCount: 0, failedMediaCount: 0 }
      : await visibleMediaReadiness(page, density, stoppedAt, remaining);
    if (postStopObservationMs > 0) {
      await page.evaluate(async ({ stoppedAt, postStopObservationMs }) => {
        const remaining = postStopObservationMs - (performance.now() - stoppedAt);
        if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
      }, { stoppedAt, postStopObservationMs });
    }
    const cost = await page.evaluate(({ density, stoppedAt }) => {
      const probe = (window as any).__densityRecovery;
      const state = (window as any).__kupua_store__.getState();
      if (probe.overflow || state.error || state.total !== probe.total || JSON.stringify(state.params) !== probe.params) {
        throw new Error("Recovery observation invalidated");
      }
      const region = document.querySelector(`[aria-label="Image results ${density}"]`)!;
      const bounds = region.getBoundingClientRect();
      const ids = [...region.querySelectorAll<HTMLElement>("[data-grid-cell]")].filter(cell => {
        const rect = cell.getBoundingClientRect();
        return rect.bottom > bounds.top && rect.top < bounds.bottom && rect.right > bounds.left && rect.left < bounds.right;
      }).map(cell => cell.dataset.imageId);
      return { forwardReadStarts: probe.starts.filter((entry: any) => !entry.backward).length,
        backwardReadStarts: probe.starts.filter((entry: any) => entry.backward).length,
        readStartsAfterStop: probe.starts.filter((entry: any) => entry.time >= stoppedAt).length,
        peakRefillsInFlight: probe.peak,
        refillsPendingAtEnd: Number(state._extendForwardInFlight) + Number(state._extendBackwardInFlight),
        destinationChanged: probe.destination !== JSON.stringify(ids) };
    }, { density, stoppedAt });
    const { destinationChanged, ...counts } = cost;
    const completedEpisodes = [backward.bufferEdgeEpisodeCompletedMaxMs, forward?.bufferEdgeEpisodeCompletedMaxMs]
      .filter((value): value is number => typeof value === "number");
    return { ...motion, ...counts, ...data,
      stopDataCensored: destinationChanged ? 1 : data.stopDataCensored,
      stopDataReadyMs: destinationChanged ? null : data.stopDataReadyMs,
      stopMediaCensored: destinationChanged ? 1 : media.mediaCensored,
      stopMediaReadyMs: destinationChanged ? null : media.mediaReadyMs,
      stopVisibleMediaCount: media.visibleMediaCount, stopDecodedMediaCount: media.decodedMediaCount,
      stopFailedMediaCount: media.failedMediaCount,
      physicalClampMs: backward.physicalClampMs! + (forward?.physicalClampMs ?? 0),
      bufferEdgeBlockedMs: backward.bufferEdgeBlockedMs! + (forward?.bufferEdgeBlockedMs ?? 0),
      boundsCaptureRevision: 1,
      bufferEdgeEpisodeCount: backward.bufferEdgeEpisodeCount! + (forward?.bufferEdgeEpisodeCount ?? 0),
      bufferEdgeEpisodeMaxMs: Math.max(backward.bufferEdgeEpisodeMaxMs!, forward?.bufferEdgeEpisodeMaxMs ?? 0),
      bufferEdgeEpisodeCompletedCount: backward.bufferEdgeEpisodeCompletedCount! + (forward?.bufferEdgeEpisodeCompletedCount ?? 0),
      bufferEdgeEpisodeCompletedMaxMs: completedEpisodes.length ? Math.max(...completedEpisodes) : null,
      bufferEdgeEpisodeCensoredCount: backward.bufferEdgeEpisodeCensoredCount! + (forward?.bufferEdgeEpisodeCensoredCount ?? 0),
      clampedDistancePx: backward.clampedDistancePx! + (forward?.clampedDistancePx ?? 0),
      drivenDurationMs: backward.drivenDurationMs + (forward?.drivenDurationMs ?? 0),
      drivenDistancePx: Math.abs(backward.drivenDistancePx) + Math.abs(forward?.drivenDistancePx ?? 0) };
  } finally {
    await page.evaluate(() => {
      (window as any).__densityRecovery?.unsubscribe();
      delete (window as any).__densityRecovery;
      (window as any).__kupua_thumbnailProbe?.dispose();
    });
  }
}

function prefixedMetrics(prefix: string, metrics: Record<string, number | null>) {
  return Object.fromEntries(Object.entries(metrics).map(([name, value]) => [prefix + name[0].toUpperCase() + name.slice(1), value]));
}

export function installDensityJourney({ density, direction, resultsPerSecond = 100, calibrationResultsPerPixel }:
  { density: Density; direction: 1 | -1; resultsPerSecond?: number; calibrationResultsPerPixel?: number }) {
  const region = document.querySelector<HTMLElement>(`[aria-label="Image results ${density}"]`);
  const store = (window as any).__kupua_store__;
  if (!region || !store) throw new Error("Journey requires the mounted density and store");
  if (calibrationResultsPerPixel !== undefined && (!Number.isFinite(calibrationResultsPerPixel) || calibrationResultsPerPixel <= 0)) {
    throw new Error("Invalid inherited journey calibration");
  }
  (window as any).__densityJourney?.dispose();
  const initial = store.getState();
  const params = JSON.stringify(initial.params);
  const priorSeen: Set<string> | undefined = (window as any).__densityJourneyHistory;
  const metrics: Record<string, number | null> = {
    journeyCaptureRevision: 1, stabilityCaptureRevision: 1, requestedResultsPerSecond: resultsPerSecond,
    forwardReadStarts: 0, backwardReadStarts: 0, appendPublications: 0, prependPublications: 0,
    evictionPublications: 0, peakRefillsInFlight: 0, retainedComparisons: 0,
    retainedDisplacementMaxPx: null, retainedResizeMaxPx: null, retainedSourceChanges: 0,
    retainedNodeReplacements: 0, retainedUnreadySamples: 0, visibleImageSamples: 0,
    freshVisibleImages: 0, revisitedVisibleImages: 0, journeyOverflow: 0,
    priorJourneyVisibleRevisits: priorSeen ? 0 : null,
    positionMapPresent: Number(Boolean(initial.positionMap)), initialBufferCount: initial.results.length,
    appliedInputDistancePx: 0, compensationDistancePx: 0, stabilitySampleCount: 0,
    stabilitySampleTotalMs: 0, stabilitySampleMaxMs: 0,
    stabilityObservationGapMaxMs: 0, retainedComparisonCensoredCount: 0,
    paintCaptureAvailable: 0, paintMismatchCount: null,
  };
  type Witness = { left: number; top: number; width: number; height: number; rank: number;
    image: HTMLImageElement | null; imageBox: DOMRect | null; source: string };
  let previous = new Map<string, Witness>();
  const seen = new Set<string>();
  let cumulativeInput = 0;
  let previousInput = 0;
  let previousScroll = region.scrollTop;
  let firstFrontier: number | null = null;
  let furthestFrontier: number | null = null;
  let raf = 0;
  let disposed = false;
  let invalid = false;
  const started = performance.now();
  let lastSampleAt = started;
  const sample = () => {
    const sampleStarted = performance.now();
    metrics.stabilityObservationGapMaxMs = Math.max(metrics.stabilityObservationGapMaxMs!, sampleStarted - lastSampleAt);
    lastSampleAt = sampleStarted;
    const state = store.getState();
    if (state.total !== initial.total || JSON.stringify(state.params) !== params || !region.isConnected || state.error) invalid = true;
    const bounds = region.getBoundingClientRect();
    const header = density === "table" ? region.querySelector('[data-table-header]')?.getBoundingClientRect().bottom : undefined;
    const top = Math.max(bounds.top, header ?? bounds.top);
    const cells = region.querySelectorAll<HTMLElement>(density === "table" ? '[role="row"][data-image-id]' : '[data-grid-cell][data-image-id]');
    const current = new Map<string, Witness>();
    if (cells.length > 256) metrics.journeyOverflow = 1;
    const input = cumulativeInput - previousInput;
    metrics.compensationDistancePx! += Math.abs(region.scrollTop - previousScroll - input);
    for (const cell of [...cells].slice(0, 256)) {
      const box = cell.getBoundingClientRect();
      if (box.bottom <= top || box.top >= bounds.bottom || box.right <= bounds.left || box.left >= bounds.right) continue;
      const id = cell.dataset.imageId!;
      const rank = state.imagePositions.get(id);
      if (!Number.isFinite(rank)) { invalid = true; continue; }
      const image = cell.querySelector<HTMLImageElement>("img");
      const source = image ? JSON.stringify([image.getAttribute("src"), image.getAttribute("srcset"), image.getAttribute("sizes")]) : "";
      const imageBox = image?.getBoundingClientRect() ?? null;
      const witness = { left: box.left, top: box.top, width: box.width, height: box.height, rank, image, imageBox, source };
      current.set(id, witness);
      metrics.visibleImageSamples!++;
      const old = previous.get(id);
      if (old) {
        metrics.retainedComparisons!++;
        metrics.retainedDisplacementMaxPx = Math.max(metrics.retainedDisplacementMaxPx ?? 0,
          Math.hypot(box.left - old.left, box.top - old.top + input));
        metrics.retainedResizeMaxPx = Math.max(metrics.retainedResizeMaxPx ?? 0,
          Math.abs(box.width - old.width), Math.abs(box.height - old.height));
        if (imageBox && old.imageBox) {
          metrics.retainedDisplacementMaxPx = Math.max(metrics.retainedDisplacementMaxPx!,
            Math.hypot(imageBox.left - old.imageBox.left, imageBox.top - old.imageBox.top + input));
          metrics.retainedResizeMaxPx = Math.max(metrics.retainedResizeMaxPx!,
            Math.abs(imageBox.width - old.imageBox.width), Math.abs(imageBox.height - old.imageBox.height));
        }
        if (source !== old.source) metrics.retainedSourceChanges!++;
        if (image !== old.image) metrics.retainedNodeReplacements!++;
        if (image && (!image.complete || image.naturalWidth === 0 || getComputedStyle(image).visibility === "hidden"
          || getComputedStyle(image).display === "none")) metrics.retainedUnreadySamples!++;
      } else if (seen.has(id)) metrics.revisitedVisibleImages!++;
      else {
        metrics.freshVisibleImages!++;
        if (priorSeen?.has(id)) metrics.priorJourneyVisibleRevisits!++;
        if (priorSeen && !priorSeen.has(id)) {
          if (priorSeen.size >= 8192) metrics.journeyOverflow = 1;
          else priorSeen.add(id);
        }
        if (seen.size >= 4096) metrics.journeyOverflow = 1;
        else seen.add(id);
      }
    }
    const ranks = [...current.values()].map(value => value.rank);
    if (ranks.length) {
      const frontier = direction > 0 ? Math.max(...ranks) : Math.min(...ranks);
      firstFrontier ??= frontier;
      furthestFrontier = furthestFrontier === null ? frontier : direction > 0
        ? Math.max(furthestFrontier, frontier) : Math.min(furthestFrontier, frontier);
    }
    if (metrics.initialRunwayResults === undefined) {
      const ordered = [...current.values()].sort((left, right) => left.top - right.top || left.rank - right.rank);
      const first = ordered[0];
      const lastTop = ordered.at(-1)?.top;
      const last = ordered.find(value => lastTop !== undefined && Math.abs(value.top - lastTop) < 1
        && value.top > (first?.top ?? Infinity) + 1 && value.rank > first.rank);
      if (calibrationResultsPerPixel === undefined && (!first || !last)) throw new Error("Journey demand calibration requires two visible rows");
      const resultsPerPixel = calibrationResultsPerPixel ?? (last!.rank - first!.rank) / (last!.top - first!.top);
      metrics.resultsPerPixel = resultsPerPixel;
      metrics.calibrationInherited = Number(calibrationResultsPerPixel !== undefined);
      metrics.commandedSpeedPxPerSec = resultsPerSecond / resultsPerPixel;
      metrics.initialRunwayResults = ranks.length ? direction > 0 ? initial.bufferOffset + initial.results.length - 1 - Math.max(...ranks)
        : Math.min(...ranks) - initial.bufferOffset : null;
      metrics.initialRunwayMs = metrics.initialRunwayResults === null ? null : metrics.initialRunwayResults / resultsPerSecond * 1000;
      metrics.containerWidth = bounds.width;
      metrics.containerHeight = bounds.height;
      metrics.devicePixelRatio = devicePixelRatio;
      metrics.initialVisibleImages = current.size;
    }
    for (const id of previous.keys()) if (!current.has(id)) metrics.retainedComparisonCensoredCount!++;
    previous = current;
    previousInput = cumulativeInput;
    previousScroll = region.scrollTop;
    const cost = performance.now() - sampleStarted;
    metrics.stabilitySampleCount!++;
    metrics.stabilitySampleTotalMs! += cost;
    metrics.stabilitySampleMaxMs = Math.max(metrics.stabilitySampleMaxMs!, cost);
  };
  const unsubscribe = store.subscribe((state: any, before: any) => {
    if (state._extendForwardInFlight && !before._extendForwardInFlight) metrics.forwardReadStarts!++;
    if (state._extendBackwardInFlight && !before._extendBackwardInFlight) metrics.backwardReadStarts!++;
    metrics.peakRefillsInFlight = Math.max(metrics.peakRefillsInFlight!, Number(state._extendForwardInFlight) + Number(state._extendBackwardInFlight));
    if (state.results !== before.results) {
      const previousEnd = before.bufferOffset + before.results.length;
      if (state.bufferOffset < before.bufferOffset) metrics.prependPublications!++;
      if (state.bufferOffset + state.results.length > previousEnd) metrics.appendPublications!++;
      if (state.bufferOffset > before.bufferOffset || state.bufferOffset + state.results.length < previousEnd) metrics.evictionPublications!++;
    }
  });
  const probe = {
    input(delta: number) { cumulativeInput += delta; metrics.appliedInputDistancePx! += Math.abs(delta); },
    snapshot() {
      sample();
      if (invalid || metrics.journeyOverflow) throw new Error("Journey observation invalidated");
      const state = store.getState();
      const elapsed = performance.now() - started;
      const progressed = Math.abs((furthestFrontier ?? 0) - (firstFrontier ?? 0));
      const publications = direction > 0 ? metrics.appendPublications! : metrics.prependPublications!;
      return { ...metrics, journeyDurationMs: elapsed, progressedResults: progressed,
        achievedResultsPerSecond: elapsed > 0 ? progressed * 1000 / elapsed : 0,
        refillCoverageComplete: Number(publications >= 2),
        refillsPendingAtEnd: Number(state._extendForwardInFlight) + Number(state._extendBackwardInFlight) };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      unsubscribe();
      previous.clear(); seen.clear();
      if ((window as any).__densityJourney === probe) delete (window as any).__densityJourney;
    },
  };
  (window as any).__densityJourney = probe;
  try {
    sample();
    const tick = () => { if (!disposed) { sample(); raf = requestAnimationFrame(tick); } };
    raf = requestAnimationFrame(tick);
  } catch (error) { probe.dispose(); throw error; }
}

export async function captureDensityJourney({ density, direction, durationMs, resultsPerSecond, loadSteps, recoveryTimeoutMs, reverseDurationMs, networkConstrained }:
  { density: Density; direction: 1 | -1; durationMs: number; resultsPerSecond: number; loadSteps: readonly number[];
    recoveryTimeoutMs: number; reverseDurationMs: number; networkConstrained: boolean }) {
  if (document.visibilityState !== "visible" || loadSteps.length !== 3 || loadSteps.some(rate => !Number.isFinite(rate) || rate <= 0)
    || durationMs <= 0 || recoveryTimeoutMs <= 0 || reverseDurationMs < 0) throw new Error("Invalid pressure journey configuration");
  const localPage = { evaluate: (callback: (argument: any) => any, argument: any) => callback(argument) } as unknown as Page;
  const store = (window as any).__kupua_store__;
  const initialState = store.getState();
  const params = JSON.stringify(initialState.params);
  let visibilityInterrupted = false;
  const checkVisibility = () => { if (document.visibilityState !== "visible") visibilityInterrupted = true; };
  const requireForeground = () => {
    if (visibilityInterrupted || document.visibilityState !== "visible") throw new Error("Journey requires uninterrupted foreground visibility");
  };
  document.addEventListener("visibilitychange", checkVisibility);
  const starts: { time: number; backward: boolean }[] = [];
  let admissionOverflow = false;
  let peakRefills = 0;
  const unsubscribe = store.subscribe((state: any, before: any) => {
    for (const [field, backward] of [["_extendForwardInFlight", false], ["_extendBackwardInFlight", true]] as const) if (state[field] && !before[field]) {
      if (starts.length >= 64) admissionOverflow = true;
      else starts.push({ time: performance.now(), backward });
    }
    peakRefills = Math.max(peakRefills, Number(state._extendForwardInFlight) + Number(state._extendBackwardInFlight));
  });
  const metrics: Record<string, number | null> = { endurancePhaseCount: 0, enduranceMaxGapMs: 0,
    enduranceInterrupted: 0, timingCaptureRevision: 2, observerStopLagMs: 0, referenceResultsPerSecond: resultsPerSecond,
    plannedMotionDurationMs: durationMs, networkConstrained: Number(networkConstrained) };
  const windows: { prefix: string; start: number; end: number }[] = [];
  let stoppedAt = 0;
  let firstStartedAt = 0;
  try {
    installDensityJourney({ density, direction, resultsPerSecond });
    const initial = (window as any).__densityJourney.snapshot();
    for (const [index, prefix] of ["early", "middle", "late"].entries()) {
      requireForeground();
      const before = (window as any).__densityJourney.snapshot();
      installThumbnailProbe({ density });
      const movement = await scrollAtSpeed(localPage, density,
        direction * initial.commandedSpeedPxPerSec * loadSteps[index] / resultsPerSecond,
        durationMs / 3, { measureBounds: true });
      const exposure = window.__kupua_thumbnailProbe!.stop();
      metrics.observerStopLagMs = Math.max(metrics.observerStopLagMs!, performance.now() - movement.stoppedAtPerformanceMs!);
      const after = (window as any).__densityJourney.snapshot();
      const { startedAtPerformanceMs, stoppedAtPerformanceMs, steps: _steps, ...motion } = movement;
      if (stoppedAt) metrics.enduranceMaxGapMs = Math.max(metrics.enduranceMaxGapMs!, startedAtPerformanceMs! - stoppedAt);
      firstStartedAt ||= startedAtPerformanceMs!;
      stoppedAt = stoppedAtPerformanceMs!;
      const elapsed = stoppedAt - startedAtPerformanceMs!;
      Object.assign(metrics, prefixedMetrics(prefix, { ...exposure, ...motion,
        drivenDistancePx: Math.abs(motion.drivenDistancePx), commandedSpeedPxPerSec: Math.abs(motion.commandedSpeedPxPerSec),
        requestedResultsPerSecond: loadSteps[index], progressedResults: after.progressedResults - before.progressedResults,
        achievedResultsPerSecond: (after.progressedResults - before.progressedResults) * 1000 / elapsed }));
      windows.push({ prefix, start: performance.timeOrigin + startedAtPerformanceMs!, end: performance.timeOrigin + stoppedAt });
      metrics.endurancePhaseCount!++;
    }
    Object.assign(metrics, (window as any).__densityJourney.snapshot());
    (window as any).__densityJourney.dispose();
    if (reverseDurationMs > 0) {
      requireForeground();
      installDensityJourney({ density, direction: direction === 1 ? -1 : 1, resultsPerSecond,
        calibrationResultsPerPixel: initial.resultsPerPixel });
      const reverse = (window as any).__densityJourney.snapshot();
      installThumbnailProbe({ density });
      const movement = await scrollAtSpeed(localPage, density, -direction * reverse.commandedSpeedPxPerSec,
        reverseDurationMs, { measureBounds: true });
      const exposure = window.__kupua_thumbnailProbe!.stop();
      metrics.observerStopLagMs = Math.max(metrics.observerStopLagMs!, performance.now() - movement.stoppedAtPerformanceMs!);
      const { startedAtPerformanceMs, stoppedAtPerformanceMs, steps: _steps, ...motion } = movement;
      Object.assign(metrics, prefixedMetrics("reversal", { ...exposure, ...(window as any).__densityJourney.snapshot(), ...motion,
        drivenDistancePx: Math.abs(motion.drivenDistancePx), commandedSpeedPxPerSec: Math.abs(motion.commandedSpeedPxPerSec) }));
      windows.push({ prefix: "reversal", start: performance.timeOrigin + startedAtPerformanceMs!, end: performance.timeOrigin + stoppedAtPerformanceMs! });
      stoppedAt = stoppedAtPerformanceMs!;
      (window as any).__densityJourney.dispose();
    }
    window.__kupua_thumbnailProbe!.dispose();
    metrics.recoveryStartLagMs = performance.now() - stoppedAt;
    if (metrics.observerStopLagMs! > 25 || metrics.recoveryStartLagMs! > 25) throw new Error("Journey observation boundary too late");
    const snapshot = () => {
      requireForeground();
      const state = store.getState();
      if (state.error || state.total !== initialState.total || JSON.stringify(state.params) !== params
        || document.visibilityState !== "visible") throw new Error("Journey recovery changed scope");
      const region = document.querySelector<HTMLElement>(`[aria-label="Image results ${density}"]`);
      if (!region) throw new Error("Journey recovery density disappeared");
      const bounds = region.getBoundingClientRect();
      const top = Math.max(bounds.top, density === "table" ? region.querySelector("[data-table-header]")?.getBoundingClientRect().bottom ?? bounds.top : bounds.top);
      const visible = (element: Element) => { const rect = element.getBoundingClientRect();
        return rect.bottom > top && rect.top < bounds.bottom && rect.right > bounds.left && rect.left < bounds.right; };
      const cells = [...region.querySelectorAll<HTMLElement>(density === "table" ? '[role="row"][data-image-id]' : "[data-grid-cell]")].filter(visible);
      const missing = [...region.querySelectorAll(density === "table" ? '[role="row"]:not([data-image-id]):not([data-table-header])'
        : ":scope > div > div > div:not([data-grid-cell])")].some(visible);
      const ids = cells.map(cell => cell.dataset.imageId!);
      return { key: JSON.stringify(ids), ready: !state.loading && !state._browseNavigation && !missing && ids.length > 0
        && ids.every(id => state.imagePositions.has(id)) };
    };
    let previous = "";
    let stable = 0;
    let destination = "";
    while (performance.now() - stoppedAt < recoveryTimeoutMs) {
      const view = snapshot();
      stable = view.ready && view.key === previous ? stable + 1 : 0;
      previous = view.key;
      if (stable >= 2) { destination = view.key; break; }
      await new Promise(requestAnimationFrame);
    }
    let dataReadyMs = destination ? performance.now() - stoppedAt : null;
    if (dataReadyMs !== null && dataReadyMs > recoveryTimeoutMs) { destination = ""; dataReadyMs = null; }
    const media = destination ? await visibleMediaReadiness(localPage, density, stoppedAt,
      Math.max(0, recoveryTimeoutMs - (performance.now() - stoppedAt)))
      : { mediaCensored: 1, mediaReadyMs: null, visibleMediaCount: 0, decodedMediaCount: 0, failedMediaCount: 0 };
    const readyAt = media.mediaReadyMs === null ? performance.now() : stoppedAt + media.mediaReadyMs;
    const lateMedia = media.mediaReadyMs !== null && media.mediaReadyMs > recoveryTimeoutMs;
    const stateAtReady = store.getState();
    const peakAtReady = peakRefills;
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    const finalView = snapshot();
    const changed = Boolean(destination) && finalView.key !== destination;
    if (admissionOverflow) throw new Error("Journey admission observation overflow");
    Object.assign(metrics, { stopDataCensored: Number(!destination || changed), stopDataReadyMs: changed ? null : dataReadyMs,
      stopMediaCensored: changed || lateMedia ? 1 : media.mediaCensored, stopMediaReadyMs: changed || lateMedia ? null : media.mediaReadyMs,
      stopVisibleMediaCount: media.visibleMediaCount, stopDecodedMediaCount: media.decodedMediaCount, stopFailedMediaCount: media.failedMediaCount,
      stopCohortChanged: Number(changed), postReadyCohortStable: Number(Boolean(destination) && !changed),
      recoveryObservationMs: readyAt - stoppedAt, recoveryLimitMs: recoveryTimeoutMs,
      recoveryDeadlineOverrunMs: Math.max(0, readyAt - stoppedAt - recoveryTimeoutMs),
      forwardReadStarts: starts.filter(entry => entry.time >= firstStartedAt && entry.time < readyAt && !entry.backward).length,
      backwardReadStarts: starts.filter(entry => entry.time >= firstStartedAt && entry.time < readyAt && entry.backward).length,
      readStartsAfterStop: starts.filter(entry => entry.time >= stoppedAt && entry.time < readyAt).length,
      peakRefillsInFlight: Math.max(metrics.peakRefillsInFlight!, peakAtReady),
      refillsPendingAtEnd: Number(stateAtReady._extendForwardInFlight) + Number(stateAtReady._extendBackwardInFlight) });
    metrics.enduranceInterrupted = Number(metrics.enduranceMaxGapMs! >= 250);
    Object.assign(metrics, summarizeDensityPressure(metrics));
    return { timingCaptureRevision: 2, metrics, windows, startedEpoch: performance.timeOrigin + firstStartedAt,
      stoppedEpoch: performance.timeOrigin + stoppedAt, readyEpoch: performance.timeOrigin + readyAt, finishedAt: performance.now() };
  } finally {
    document.removeEventListener("visibilitychange", checkVisibility);
    unsubscribe();
    (window as any).__densityJourney?.dispose();
    window.__kupua_thumbnailProbe?.dispose();
  }
}

export async function measureDensityJourney(page: Page, density: Density, direction: 1 | -1, requests: RequestProbe,
  { durationMs = 9000, resultsPerSecond = 100, loadSteps = DENSITY_PRESSURE_STEPS, recoveryTimeoutMs = 4000, reverseDurationMs = 0, networkConstrained = false }:
  { durationMs?: number; resultsPerSecond?: number; loadSteps?: readonly number[]; recoveryTimeoutMs?: number; reverseDurationMs?: number; networkConstrained?: boolean } = {}) {
  const observed = await page.evaluate(async config => {
    const path = "/e2e-perf/density-browser.ts";
    return (await import(path)).captureDensityJourney(config) as Awaited<ReturnType<typeof captureDensityJourney>>;
  }, { density, direction, durationMs, resultsPerSecond, loadSteps: [...loadSteps], recoveryTimeoutMs, reverseDurationMs, networkConstrained });
  const metrics = observed.metrics;
  metrics.controllerReturnLagMs = await page.evaluate(finishedAt => performance.now() - finishedAt, observed.finishedAt);
  await requests.flush();
  for (const window of observed.windows) Object.assign(metrics,
    prefixedMetrics(window.prefix, requests.snapshotBetween(window.start, window.end)));
  Object.assign(metrics, requests.snapshotBetween(observed.startedEpoch, observed.stoppedEpoch),
    prefixedMetrics("recovery", requests.snapshotBetween(observed.stoppedEpoch, observed.readyEpoch)));
  if (metrics.requestCaptureOverflow || metrics.requestClockMissingCount) throw new Error("Journey request capture invalidated");
  return metrics;
}

export async function measureDensityEndurance(page: Page, density: "grid" | "justified", requests: RequestProbe,
  { phaseDurationMs = 8000 }: { phaseDurationMs?: number } = {}) {
  const metrics: Record<string, number | null> = { endurancePhaseCount: 0, enduranceMaxGapMs: 0, enduranceInterrupted: 0 };
  let previousStop: number | null = null;
  try {
    for (const prefix of ["early", "middle", "late"]) {
      requests.beginPhase();
      await page.evaluate(installThumbnailProbe, { density });
      const movement = await scrollAtSpeed(page, density, 1200, phaseDurationMs, { measureBounds: true });
      const exposure = await page.evaluate(() => (window as any).__kupua_thumbnailProbe.stop());
      const { startedAtPerformanceMs, stoppedAtPerformanceMs, ...motion } = movement;
      if (previousStop !== null) metrics.enduranceMaxGapMs = Math.max(metrics.enduranceMaxGapMs!, startedAtPerformanceMs! - previousStop);
      previousStop = stoppedAtPerformanceMs!;
      Object.assign(metrics, prefixedMetrics(prefix, { ...exposure, ...motion, ...requests.snapshot() }));
      metrics.endurancePhaseCount!++;
    }
    metrics.enduranceInterrupted = metrics.enduranceMaxGapMs! >= 250 ? 1 : 0;
    return metrics;
  } finally {
    await page.evaluate(() => (window as any).__kupua_thumbnailProbe?.dispose());
  }
}

export async function measureSearchRefresh(page: Page, density: "grid" | "justified") {
  try {
    const action = await page.evaluate(async () => {
      const store = (window as any).__kupua_store__;
      const initial = store.getState();
      const startedAt = performance.now();
      const probe = { startedAt, actionEpochMs: performance.timeOrigin + startedAt,
        dataReadyMs: null as number | null, ids: new Set<string>(), unsubscribe: () => {} };
      (window as any).__densityRefresh = probe;
      probe.unsubscribe = store.subscribe((state: any, previous: any) => {
        if (probe.dataReadyMs === null && !state.loading && state.results.length > 0
          && (state.results !== initial.results || previous.loading)) {
          probe.dataReadyMs = performance.now() - startedAt;
          probe.ids = new Set(state.results.map((image: any) => image.id));
        }
      });
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([store.getState().search(), new Promise((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error("Refresh action timed out")), 10000);
        })]);
      } catch { throw new Error("Density refresh action failed"); }
      finally { clearTimeout(timer); }
      if (store.getState().error || probe.dataReadyMs === null) throw new Error("Refresh did not publish results");
      return { startedAt, actionEpochMs: probe.actionEpochMs, dataReadyMs: probe.dataReadyMs };
    });
    await page.evaluate(async density => {
      const probe = (window as any).__densityRefresh;
      while (performance.now() - probe.startedAt < 10000) {
        await new Promise(requestAnimationFrame);
        if (document.visibilityState !== "visible") throw new Error("Refresh requires a foreground page");
        const region = document.querySelector(`[aria-label="Image results ${density}"]`);
        if (!region) continue;
        const bounds = region.getBoundingClientRect();
        const cells = [...region.querySelectorAll<HTMLElement>("[data-grid-cell]")].filter(cell => {
          const rect = cell.getBoundingClientRect();
          return rect.bottom > bounds.top && rect.top < bounds.bottom;
        });
        if (cells.length > 0 && cells.every(cell => probe.ids.has(cell.dataset.imageId))) return;
      }
      throw new Error("Refresh published results did not become visible");
    }, density);
    const remaining = () => page.evaluate(start => Math.max(0, 10000 - (performance.now() - start)), action.startedAt);
    const placementMs = await waitForPlacement(page, density, false, action.startedAt, await remaining());
    const media = await visibleMediaReadiness(page, density, action.startedAt, await remaining());
    return { actionEpochMs: action.actionEpochMs, dataReadyMs: action.dataReadyMs, placementMs, ...media };
  } finally {
    await page.evaluate(() => {
      (window as any).__densityRefresh?.unsubscribe();
      delete (window as any).__densityRefresh;
    });
  }
}

export async function measureDensityRefreshContention(page: Page, density: "grid" | "justified",
  cdp: CDPSession, requests: RequestProbe, runIndex = 0) {
  const metrics: Record<string, number | null> = {};
  const order = runIndex % 2 ? ["busy", "quiet"] : ["quiet", "busy"];
  try {
    for (const prefix of order) {
      await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
      await cdp.send("Network.setCacheDisabled", { cacheDisabled: false });
      await restoreDensitySource(page);
      await selectDensity(page, density);
      await prepareDensityRecovery(page, density);
      await page.evaluate(async () => {
        const store = (window as any).__kupua_store__;
        const before = store.getState().results.length;
        await store.getState().extendForward();
        if (store.getState().results.length <= before) throw new Error("Refresh setup could not establish runway");
        (window as any).__densityRefreshPrimingResults = store.getState().results;
      });
      await waitForWindowIdle(page);
      await waitForPlacement(page, density, true);
      await visibleMediaReadiness(page, density, await page.evaluate(() => performance.now()));
      await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
      await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 80,
        downloadThroughput: 4 * 1024 * 1024 / 8, uploadThroughput: 1024 * 1024 / 8 });
      const priming = await scrollAtSpeed(page, density, 1200, 1500, { measureBounds: true });
      const stable = await page.evaluate(() => {
        const state = (window as any).__kupua_store__.getState();
        return state.results === (window as any).__densityRefreshPrimingResults
          && !state._extendForwardInFlight && !state._extendBackwardInFlight;
      });
      if (!stable || priming.bufferEdgeBlockedMs! > 0 || priming.drivenDistancePx < 1200) {
        throw new Error("Refresh priming changed the data window or failed to move");
      }
      let primingMediaCensored: number | null = null;
      if (prefix === "quiet") {
        const deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
          const snapshot = requests.snapshot();
          if (snapshot.mediaRequestsPending === 0 && snapshot.dataRequestsPending === 0) {
            const ready = await visibleMediaReadiness(page, density, await page.evaluate(() => performance.now()), Math.max(0, deadline - Date.now()));
            primingMediaCensored = ready.mediaCensored;
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            if (requests.snapshot().mediaRequestsPending === 0 && requests.snapshot().dataRequestsPending === 0) break;
          }
          await page.waitForTimeout(25);
        }
      }
      requests.beginPhase();
      const { actionEpochMs, ...action } = await measureSearchRefresh(page, density);
      Object.assign(metrics, prefixedMetrics(prefix, { ...action, ...requests.snapshot(),
        mediaPendingAtDispatch: requests.pendingAt("media", actionEpochMs),
        dataPendingAtDispatch: requests.pendingAt("data", actionEpochMs), primingMediaCensored,
        primingDistancePx: priming.drivenDistancePx }));
    }
    Object.assign(metrics, refreshComparisonMetrics(metrics));
    return metrics;
  } finally {
    await page.evaluate(() => { delete (window as any).__densityRefreshPrimingResults; });
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: false });
  }
}
