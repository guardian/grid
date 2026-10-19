/**
 * Additive, browser-local thumbnail observation; not an exact paint or causal CLS probe.
 * Install with page.evaluate(installThumbnailProbe, { density, sampleLimit? }).
 * stop() is idempotent, releases resources, and returns numbers/null only; dispose()
 * also removes the global. No identity, URL, DOM node or per-frame trace is returned.
 *
 * Pending includes unloaded/undecoded sourced images and no-data placeholders;
 * intentional no-source slots and failed images are separate, not network delays.
 * thumbnailPendingAreaRatioMean/Max, thumbnailBlankViewportMs and
 * thumbnailExposureAreaMs exclude no-data placeholders; aggregate pending metrics
 * continue to include them. Both use the same viewport denominator and observation clock.
 * Exposure uses thumbnail SLOT area, not letterboxed bitmap area. exposureAreaMs is
 * clipped pixel²·ms; blankViewportMs is time with ANY pending area. Ratio mean is
 * time-weighted over exposureObservedMs. Observation starts at the first rAF, after
 * installation-time decode promises can settle; no exposure or maximum is inferred
 * for the initial interval. exposureStartDelayMs reports that unobserved interval.
 * elapsedMs and scroll speed still cover install through stop. Left-endpoint rAF
 * integration is an approximation, and loaded images still require successful decode.
 * Readiness lead is measured at observed load/decode, not viewport-crossing time.
 * Already-loaded discoveries have unknown lead; directionless events are omitted.
 * Percentiles use bounded reservoir samples, not an unbounded frame/event trace.
 * Shift values are interval sums (not Web Vitals session-window CLS); attribution
 * means a reported source node belongs to a thumbnail slot, not that it caused it.
 * Grid skeleton and Table Pic-column recognition follows current product markup.
 * Logical order means DOM order among surviving identities, not geometric order.
 * trackingOverflow or regionDetached invalidates a run; neither is silently hidden.
 */
export function installThumbnailProbe(options, helpersOnly = false) {
  // Helpers live inside the installer so Playwright's function serialization has
  // no module/closure dependencies. The second argument is a pure-test seam only.
  const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
  const positive = (value) => Math.max(0, finite(value));
  const clampRatio = (value) => Math.min(1, positive(value));
  function clipRect(rect, clip) {
    const left = Math.max(finite(rect.left), finite(clip.left));
    const top = Math.max(finite(rect.top), finite(clip.top));
    const right = Math.max(left, Math.min(finite(rect.right), finite(clip.right)));
    const bottom = Math.max(top, Math.min(finite(rect.bottom), finite(clip.bottom)));
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  }
  const area = (rect) => finite(positive(rect.right - rect.left) * positive(rect.bottom - rect.top));
  function readinessLeadPx(rect, viewport, direction) {
    if (!direction) return null;
    const value = direction > 0 ? rect.top - viewport.bottom : viewport.top - rect.bottom;
    return Number.isFinite(value) ? value : null;
  }
  function classifyThumbnail({ hasIdentity, hasSource, failed, loaded, decoded }) {
    if (!hasIdentity) return 'placeholder';
    if (!hasSource) return 'missing';
    if (failed) return 'failed';
    if (!loaded) return 'loading';
    return decoded ? 'ready' : 'decoding';
  }
  function sameGeneration(record, current) {
    return record.element === current.element && record.image === current.image
      && record.identity === current.identity && record.source === current.source
      && (!record.selectedSource || record.selectedSource === current.selectedSource);
  }
  function orderChanged(previous, next) {
    const oldSet = new Set(previous);
    const newSet = new Set(next);
    const before = previous.filter((id) => newSet.has(id));
    const after = next.filter((id) => oldSet.has(id));
    return before.length === after.length && before.some((id, i) => id !== after[i]);
  }
  function createSample(limit) {
    const capacity = Math.max(1, Math.min(10000, Math.floor(finite(limit, 2048))));
    const values = [];
    let count = 0;
    let seed = 0x12345678;
    return {
      add(value) {
        if (!Number.isFinite(value)) return;
        count++;
        if (values.length < capacity) values.push(value);
        else {
          // Deterministic reservoir sampling; no measurement RNG side effects.
          seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
          const index = Math.floor((seed >>> 0) / 4294967296 * count);
          if (index < capacity) values[index] = value;
        }
      },
      percentile(fraction) {
        if (!values.length) return null;
        const sorted = [...values].sort((a, b) => a - b);
        return sorted[Math.max(0, Math.ceil(clampRatio(fraction) * sorted.length) - 1)];
      },
      get count() { return count; },
      get size() { return values.length; },
      get capacity() { return capacity; },
      clear() { values.length = 0; },
    };
  }
  function createExposure() {
    let elapsedMs = 0;
    let exposureAreaMs = 0;
    let ratioMs = 0;
    let blankViewportMs = 0;
    let pendingAreaRatioMax = 0;
    return {
      observe(pendingArea, viewportArea) {
        const ratio = viewportArea > 0 ? clampRatio(pendingArea / viewportArea) : 0;
        pendingAreaRatioMax = Math.max(pendingAreaRatioMax, ratio);
        return ratio;
      },
      add(dt, pendingArea, viewportArea) {
        const duration = positive(dt);
        const boundedArea = Math.min(positive(pendingArea), positive(viewportArea));
        const ratio = this.observe(boundedArea, viewportArea);
        elapsedMs += duration;
        exposureAreaMs += finite(boundedArea * duration);
        ratioMs += finite(ratio * duration);
        if (boundedArea > 0) blankViewportMs += duration;
      },
      snapshot() {
        return {
          pendingAreaRatioMean: elapsedMs ? clampRatio(ratioMs / elapsedMs) : 0,
          pendingAreaRatioMax,
          blankViewportMs: finite(blankViewportMs),
          exposureAreaMs: finite(exposureAreaMs),
          elapsedMs: finite(elapsedMs),
        };
      },
    };
  }
  if (helpersOnly) return { clipRect, area, readinessLeadPx, classifyThumbnail, sameGeneration, orderChanged, createSample, createExposure };

  const labels = { grid: 'Image results grid', justified: 'Image results justified', table: 'Image results table' };
  if (!options || !Object.hasOwn(labels, options.density)) throw new Error('Thumbnail probe requires a supported density');
  const region = document.querySelector(`[role="region"][aria-label="${labels[options.density]}"]`);
  if (!region) throw new Error('Thumbnail probe results region is absent');
  window.__kupua_thumbnailProbe?.dispose();

  const table = options.density === 'table';
  const frames = createSample(options.sampleLimit);
  const loads = createSample(options.sampleLimit);
  const decodes = createSample(options.sampleLimit);
  const exposure = createExposure();
  const thumbnailExposure = createExposure();
  const placeholderExposure = createExposure();
  const failedExposure = createExposure();
  const missingExposure = createExposure();
  const records = new Map();
  let history = new WeakMap();
  let previousOrder = [];
  let dirty = true;
  let stopped = false;
  let result;
  let raf;
  let shiftObserver;
  let mutationObserver;
  let direction = 0;
  let lastScrollTop = region.scrollTop;
  let lastScrollLeft = region.scrollLeft;
  let scrollDistancePx = 0;
  let imageIdentityChanges = 0;
  let imageSourceChanges = 0;
  let elementGenerationChanges = 0;
  let logicalOrderChanges = 0;
  let loadedCount = 0;
  let decodedCount = 0;
  let failedCount = 0;
  let decodeFailedCount = 0;
  let alreadyLoadedCount = 0;
  let lateReadyCount = 0;
  let lateDecodedCount = 0;
  let directionlessReadyCount = 0;
  let layoutShiftValue = 0;
  let layoutShiftRawValue = 0;
  let thumbnailShiftValue = 0;
  let thumbnailShiftRawValue = 0;
  let layoutShiftSupported = 0;
  let regionDetached = 0;
  const maxTrackedEntries = 10000;
  let trackedEntriesMax = 0;
  let trackingOverflow = 0;
  let thumbnailVisibleWaitCount = 0;
  let thumbnailVisibleWaitMaxMs = 0;
  let thumbnailVisibleWaitCompletedMaxMs = null;
  let thumbnailVisibleWaitCompletedCount = 0;
  let thumbnailVisibleWaitCensoredCount = 0;
  const started = performance.now();
  let lastTime = started;
  let exposureStartedAt = null;

  function scroll() {
    const top = region.scrollTop;
    const left = region.scrollLeft;
    const dy = top - lastScrollTop;
    if (dy) direction = Math.sign(dy);
    scrollDistancePx += Math.hypot(dy, left - lastScrollLeft);
    lastScrollTop = top;
    lastScrollLeft = left;
  }
  function viewport() {
    const rect = region.getBoundingClientRect();
    const left = rect.left + region.clientLeft;
    const top = rect.top + region.clientTop;
    let clipped = clipRect({ left, top, right: left + region.clientWidth, bottom: top + region.clientHeight },
      { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight });
    if (table) {
      const header = region.querySelector('[data-table-header]');
      if (header) clipped = clipRect(clipped, { ...clipped, top: Math.max(clipped.top, header.getBoundingClientRect().bottom) });
    }
    return clipped;
  }
  function sourceOf(image) {
    if (!image) return '';
    const src = image.getAttribute('src') || '';
    const srcset = image.getAttribute('srcset') || '';
    return src || srcset ? JSON.stringify([src, srcset, image.getAttribute('sizes') || '']) : '';
  }
  function current(record) {
    return { element: record.element, image: record.slot?.querySelector('img') ?? null,
      identity: record.element.getAttribute('data-image-id') || '', source: sourceOf(record.image),
      selectedSource: record.image?.currentSrc || '' };
  }
  function active(record) {
    return !stopped && region.isConnected && region.contains(record.element)
      && records.get(record.element) === record && sameGeneration(record, current(record));
  }
  function lead(record, sample) {
    scroll();
    const distance = readinessLeadPx(record.slot.getBoundingClientRect(), viewport(), direction);
    if (distance === null) directionlessReadyCount++;
    else sample.add(distance);
    return distance;
  }
  function fail(record, decodeFailure = false) {
    if (!active(record) || record.failed) return;
    record.failed = true;
    failedCount++;
    if (decodeFailure) decodeFailedCount++;
  }
  function ready(record) {
    const image = record.image;
    if (!image || !record.source || record.failed || !active(record)) return;
    if (!(image.complete && image.naturalWidth > 0)) return;
    if (!record.loaded) {
      record.selectedSource = image.currentSrc || '';
      record.loaded = true;
      loadedCount++;
      if (!record.alreadyLoaded && lead(record, loads) < 0) lateReadyCount++;
    }
    if (record.decodeStarted) return;
    record.decodeStarted = true;
    if (typeof image.decode !== 'function') return;
    // Never decode an incomplete lazy image: decode() can otherwise start a fetch.
    Promise.resolve().then(() => {
      if (!active(record) || !image.complete || image.naturalWidth <= 0) return false;
      return image.decode().then(() => true);
    }).then((decoded) => {
      if (!decoded || !active(record) || record.failed) return;
      record.decoded = true;
      decodedCount++;
      if (!record.alreadyLoaded && lead(record, decodes) < 0) lateDecodedCount++;
    }).catch(() => fail(record, true));
  }
  function finishVisibleWait(record, now, completed) {
    if (record?.visibleWaitStartedAt == null) return;
    const duration = Math.max(0, now - record.visibleWaitStartedAt);
    thumbnailVisibleWaitMaxMs = Math.max(thumbnailVisibleWaitMaxMs, duration);
    if (completed) {
      thumbnailVisibleWaitCompletedCount++;
      thumbnailVisibleWaitCompletedMaxMs = Math.max(thumbnailVisibleWaitCompletedMaxMs ?? 0, duration);
    } else thumbnailVisibleWaitCensoredCount++;
    record.visibleWaitStartedAt = null;
  }
  function refresh(observedLoadImage = null) {
    if (!dirty) return;
    dirty = false;
    const cells = table
      ? [...region.querySelectorAll('[role="row"]:not([data-table-header])')].filter((cell) => !cell.querySelector('[role="columnheader"]'))
      : [...region.querySelectorAll('[data-grid-cell]')];
    // Grid's no-data skeletons deliberately have no identity or grid-cell marker.
    if (!table) {
      for (const cell of region.querySelectorAll(':scope > div > div > div:not([data-grid-cell])')) cells.push(cell);
    }
    let thumbnailIndex = -1;
    let thumbnailHeader = null;
    if (table) {
      const headers = [...region.querySelectorAll('[role="columnheader"]')];
      thumbnailIndex = headers.findIndex((header) => header.style.width.includes('--col-thumbnail') || header.textContent.trim() === 'Pic');
      thumbnailHeader = headers[thumbnailIndex] ?? null;
    }
    const retained = new Set();
    const order = [];
    if (cells.length > maxTrackedEntries) trackingOverflow = 1;
    const boundedCells = cells.slice(0, maxTrackedEntries);
    const boundedSet = new Set(boundedCells);
    for (const element of records.keys()) {
      if (!boundedSet.has(element)) {
        finishVisibleWait(records.get(element), performance.now(), false);
        records.delete(element);
      }
    }
    for (const element of boundedCells) {
      const identity = element.getAttribute('data-image-id') || '';
      if (identity) order.push(identity);
      const rowImage = table ? element.querySelector('img') : null;
      let slot = table
        ? element.querySelectorAll('[role="gridcell"]')[thumbnailIndex] || rowImage?.closest('[role="gridcell"]') || rowImage?.parentElement
        : element.querySelector(':scope > div');
      if (!identity) slot = element;
      if (table && thumbnailIndex < 0 && !rowImage) continue;
      if (!slot && !identity) slot = element;
      if (!slot) continue;
      const image = slot.querySelector('img');
      const source = sourceOf(image);
      const selectedSource = image?.currentSrc || '';
      const state = { element, identity, image, source, selectedSource };
      retained.add(element);
      const old = records.get(element);
      if (old && sameGeneration(old, state) && old.slot === slot) { ready(old); continue; }
      finishVisibleWait(old, performance.now(), false);
      const previous = old || history.get(element);
      if (previous) {
        if (previous.identity !== identity) imageIdentityChanges++;
        if (previous.source !== source || (previous.selectedSource && previous.selectedSource !== selectedSource)) imageSourceChanges++;
        if (!sameGeneration(previous, state)) elementGenerationChanges++;
      }
      history.set(element, state);
      const alreadyLoaded = Boolean(image && image !== observedLoadImage && source && image.complete && image.naturalWidth > 0);
      const record = { ...state, slot, thumbnailHeader, alreadyLoaded, loaded: false, decoded: false,
        failed: false, decodeStarted: false, visibleWaitStartedAt: null };
      records.set(element, record);
      if (alreadyLoaded) alreadyLoadedCount++;
      if (image && source && image.complete && image.naturalWidth === 0) fail(record);
      else ready(record);
    }
    for (const element of records.keys()) {
      if (!retained.has(element)) {
        finishVisibleWait(records.get(element), performance.now(), false);
        records.delete(element);
      }
    }
    trackedEntriesMax = Math.max(trackedEntriesMax, records.size);
    if (orderChanged(previousOrder, order)) logicalOrderChanges++;
    previousOrder = order;
  }
  function imageEvent(event) {
    dirty = true;
    refresh(event.type === 'load' ? event.target : null);
    for (const record of records.values()) {
      if (record.image !== event.target) continue;
      if (event.type === 'error') fail(record);
      else ready(record);
      break;
    }
  }
  function measure(now = performance.now()) {
    scroll();
    for (const record of records.values()) {
      if (!sameGeneration(record, current(record))) { dirty = true; break; }
    }
    refresh();
    if (!region.isConnected) regionDetached = 1;
    const view = viewport();
    const viewportArea = area(view);
    let pendingArea = 0;
    let thumbnailPendingArea = 0;
    let placeholderArea = 0;
    let failedArea = 0;
    let missingArea = 0;
    let pendingCount = 0;
    let mountedPendingCount = 0;
    let visibleCount = 0;
    for (const record of records.values()) {
      ready(record);
      let rect = record.slot.getBoundingClientRect();
      if (!record.identity) {
        if (table && record.thumbnailHeader) {
          const header = record.thumbnailHeader.getBoundingClientRect();
          rect = { left: header.left, right: header.right, top: rect.top, bottom: rect.bottom };
        } else if (options.density === 'grid') rect = { left: rect.left, right: rect.right, top: rect.top, bottom: Math.min(rect.bottom, rect.top + 190) };
      }
      const clippedArea = area(clipRect(clipRect(rect, record.element.getBoundingClientRect()), view));
      const state = classifyThumbnail({ hasIdentity: !!record.identity, hasSource: !!record.source,
        failed: record.failed, loaded: record.loaded, decoded: record.decoded });
      const thumbnailPending = state === 'loading' || state === 'decoding';
      const pending = thumbnailPending || state === 'placeholder';
      if (exposureStartedAt !== null) {
        if (clippedArea > 0 && thumbnailPending) {
          if (record.visibleWaitStartedAt === null) {
            record.visibleWaitStartedAt = now;
            thumbnailVisibleWaitCount++;
          }
          thumbnailVisibleWaitMaxMs = Math.max(thumbnailVisibleWaitMaxMs, Math.max(0, now - record.visibleWaitStartedAt));
        } else finishVisibleWait(record, now, clippedArea > 0 && state === 'ready');
      }
      if (pending) mountedPendingCount++;
      if (clippedArea <= 0) continue;
      visibleCount++;
      if (pending) { pendingArea += clippedArea; pendingCount++; }
      if (thumbnailPending) thumbnailPendingArea += clippedArea;
      if (state === 'placeholder') placeholderArea += clippedArea;
      if (state === 'failed') failedArea += clippedArea;
      if (state === 'missing') missingArea += clippedArea;
    }
    if (exposureStartedAt !== null) {
      exposure.observe(pendingArea, viewportArea);
      thumbnailExposure.observe(thumbnailPendingArea, viewportArea);
    }
    return { pendingArea, thumbnailPendingArea, viewportArea, placeholderArea, failedArea, missingArea, pendingCount, mountedPendingCount, visibleCount };
  }
  function shifts(entries) {
    if (stopped) return;
    refresh();
    for (const entry of entries) {
      if (entry.startTime < started || !Number.isFinite(entry.value)) continue;
      const value = positive(entry.value);
      const attributed = (entry.sources || []).some(({ node }) => {
        if (!node || !region.contains(node)) return false;
        for (const record of records.values()) {
          if (node === record.image) return true;
          if (record.identity && record.slot !== record.element && (record.slot === node || record.slot.contains(node))) return true;
        }
        return false;
      });
      layoutShiftRawValue += value;
      if (attributed) thumbnailShiftRawValue += value;
      if (!entry.hadRecentInput) {
        layoutShiftValue += value;
        if (attributed) thumbnailShiftValue += value;
      }
    }
  }
  let previous = measure();
  function advance(now, frame) {
    if (exposureStartedAt === null) {
      lastTime = Math.max(started, now);
      if (frame) exposureStartedAt = lastTime;
      previous = measure(now);
      return;
    }
    const dt = Math.max(0, now - lastTime);
    exposure.add(dt, previous.pendingArea, previous.viewportArea);
    thumbnailExposure.add(dt, previous.thumbnailPendingArea, previous.viewportArea);
    placeholderExposure.add(dt, previous.placeholderArea, previous.viewportArea);
    failedExposure.add(dt, previous.failedArea, previous.viewportArea);
    missingExposure.add(dt, previous.missingArea, previous.viewportArea);
    if (frame) frames.add(dt);
    lastTime = now;
    previous = measure(now);
  }
  function tick(now) {
    if (stopped) return;
    advance(now, true);
    raf = requestAnimationFrame(tick);
  }
  function cleanup() {
    cancelAnimationFrame(raf);
    mutationObserver?.disconnect();
    shiftObserver?.disconnect();
    region.removeEventListener('load', imageEvent, true);
    region.removeEventListener('error', imageEvent, true);
    region.removeEventListener('scroll', scroll);
    records.clear();
    history = new WeakMap();
    previousOrder = [];
    frames.clear(); loads.clear(); decodes.clear();
  }
  const probe = {
    stop() {
      if (result) return { ...result };
      const stoppedAt = performance.now();
      advance(stoppedAt, false);
      shifts(shiftObserver?.takeRecords() || []);
      for (const record of records.values()) finishVisibleWait(record, stoppedAt, false);
      stopped = true;
      const metrics = exposure.snapshot();
      const thumbnails = thumbnailExposure.snapshot();
      const elapsedMs = Math.max(0, stoppedAt - started);
      result = {
        ...metrics,
        elapsedMs,
        exposureObservedMs: metrics.elapsedMs,
        exposureStartDelayMs: Math.max(0, (exposureStartedAt ?? stoppedAt) - started),
        thumbnailPendingAreaRatioMean: thumbnails.pendingAreaRatioMean,
        thumbnailPendingAreaRatioMax: thumbnails.pendingAreaRatioMax,
        thumbnailBlankViewportMs: thumbnails.blankViewportMs,
        thumbnailExposureAreaMs: thumbnails.exposureAreaMs,
        thumbnailCaptureRevision: 1,
        thumbnailWaitCaptureRevision: 1,
        thumbnailVisibleWaitCount, thumbnailVisibleWaitMaxMs, thumbnailVisibleWaitCompletedMaxMs,
        thumbnailVisibleWaitCompletedCount, thumbnailVisibleWaitCensoredCount,
        readinessLeadPxMedian: loads.percentile(0.5),
        decodedReadinessLeadPxMedian: decodes.percentile(0.5),
        lateReadyCount, lateDecodedCount, loadedCount, decodedCount,
        pendingAtEnd: previous.pendingCount,
        mountedPendingAtEnd: previous.mountedPendingCount,
        visibleSlotsAtEnd: previous.visibleCount,
        failedCount, decodeFailedCount, alreadyLoadedCount, directionlessReadyCount,
        layoutShiftValue: layoutShiftSupported ? layoutShiftValue : null,
        thumbnailShiftValue: layoutShiftSupported ? thumbnailShiftValue : null,
        layoutShiftRawValue: layoutShiftSupported ? layoutShiftRawValue : null,
        thumbnailShiftRawValue: layoutShiftSupported ? thumbnailShiftRawValue : null,
        layoutShiftRecentInputValue: layoutShiftSupported ? layoutShiftRawValue - layoutShiftValue : null,
        thumbnailShiftRecentInputValue: layoutShiftSupported ? thumbnailShiftRawValue - thumbnailShiftValue : null,
        layoutShiftSupported, imageIdentityChanges, imageSourceChanges, elementGenerationChanges,
        logicalOrderChanges, scrollDistancePx,
        actualSpeedPxPerSec: elapsedMs > 0 ? scrollDistancePx * 1000 / elapsedMs : 0,
        frameP95Ms: frames.percentile(0.95),
        frameCount: frames.count, frameSampleCount: frames.size,
        readinessObservedCount: loads.count, readinessSampleCount: loads.size,
        decodedReadinessObservedCount: decodes.count, decodedReadinessSampleCount: decodes.size,
        sampleLimit: frames.capacity, regionDetached, maxTrackedEntries, trackedEntriesMax, trackingOverflow,
        placeholderAreaRatioMean: placeholderExposure.snapshot().pendingAreaRatioMean,
        failedAreaRatioMean: failedExposure.snapshot().pendingAreaRatioMean,
        missingThumbnailAreaRatioMean: missingExposure.snapshot().pendingAreaRatioMean,
      };
      cleanup();
      return { ...result };
    },
    dispose() {
      if (!stopped) probe.stop();
      if (window.__kupua_thumbnailProbe === probe) delete window.__kupua_thumbnailProbe;
    },
  };
  mutationObserver = new MutationObserver(() => { dirty = true; });
  mutationObserver.observe(region, { childList: true, subtree: true, attributes: true,
    attributeFilter: ['src', 'srcset', 'sizes', 'data-image-id', 'data-grid-cell'] });
  try {
    if (!PerformanceObserver.supportedEntryTypes || PerformanceObserver.supportedEntryTypes.includes('layout-shift')) {
      shiftObserver = new PerformanceObserver((list) => shifts(list.getEntries()));
      shiftObserver.observe({ type: 'layout-shift', buffered: false });
      layoutShiftSupported = 1;
    }
  } catch { shiftObserver?.disconnect(); }
  region.addEventListener('load', imageEvent, true);
  region.addEventListener('error', imageEvent, true);
  region.addEventListener('scroll', scroll, { passive: true });
  window.__kupua_thumbnailProbe = probe;
  raf = requestAnimationFrame(tick);
}

export const { clipRect, area, readinessLeadPx, classifyThumbnail, sameGeneration, orderChanged, createSample, createExposure }
  = installThumbnailProbe(null, true);
