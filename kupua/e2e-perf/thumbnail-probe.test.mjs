import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {
  installThumbnailProbe, clipRect, area, readinessLeadPx, classifyThumbnail,
  sameGeneration, orderChanged, createSample, createExposure,
} from './thumbnail-probe.mjs';

const viewport = { left: 0, top: 100, right: 100, bottom: 200 };

test('clips thumbnail slots at every viewport edge and rejects disjoint area', () => {
  assert.equal(area(clipRect({ left: -25, top: 75, right: 25, bottom: 125 }, viewport)), 625);
  assert.equal(area(clipRect({ left: 75, top: 175, right: 125, bottom: 225 }, viewport)), 625);
  assert.equal(area(clipRect({ left: -50, top: 50, right: 150, bottom: 250 }, viewport)), 10000);
  assert.equal(area(clipRect({ left: 101, top: 110, right: 150, bottom: 130 }, viewport)), 0);
  assert.equal(area(clipRect({ left: 0, top: 201, right: 50, bottom: 250 }, viewport)), 0);
  assert.equal(area(clipRect({ left: 100, top: 100, right: 125, bottom: 200 }, viewport)), 0);
});

test('readiness lead uses the entering edge for both vertical directions', () => {
  assert.equal(readinessLeadPx({ top: 225, bottom: 250 }, viewport, 1), 25);
  assert.equal(readinessLeadPx({ top: 175, bottom: 225 }, viewport, 1), -25);
  assert.equal(readinessLeadPx({ top: 200, bottom: 250 }, viewport, 1), 0);
  assert.equal(readinessLeadPx({ top: 50, bottom: 75 }, viewport, -1), 25);
  assert.equal(readinessLeadPx({ top: 75, bottom: 125 }, viewport, -1), -25);
  assert.equal(readinessLeadPx({ top: 50, bottom: 100 }, viewport, -1), 0);
  assert.equal(readinessLeadPx({ top: 175, bottom: 225 }, viewport, 0), null);
  assert.equal(readinessLeadPx({ top: NaN, bottom: 225 }, viewport, 1), null);
});

test('no observed crossings (including already-cached discovery) produce null, not zero', () => {
  const samples = createSample(3);
  assert.equal(samples.percentile(0.5), null);
  samples.add(null);
  samples.add(NaN);
  samples.add(Infinity);
  assert.equal(samples.count, 0);
  assert.equal(samples.percentile(0.5), null);
  samples.add(0);
  assert.equal(samples.percentile(0.5), 0);
});

test('classifies no-data, intentional missing source, failures, load and decode separately', () => {
  const pending = { hasIdentity: true, hasSource: true, failed: false, loaded: false, decoded: false };
  assert.equal(classifyThumbnail(pending), 'loading');
  assert.equal(classifyThumbnail({ ...pending, loaded: true }), 'decoding');
  assert.equal(classifyThumbnail({ ...pending, loaded: true, decoded: true }), 'ready');
  assert.equal(classifyThumbnail({ ...pending, failed: true }), 'failed');
  assert.equal(classifyThumbnail({ ...pending, failed: true, loaded: true, decoded: true }), 'failed');
  assert.equal(classifyThumbnail({ ...pending, hasSource: false }), 'missing');
  assert.equal(classifyThumbnail({ ...pending, hasIdentity: false, hasSource: false }), 'placeholder');
  const exposure = createExposure();
  for (const state of [{ ...pending, failed: true }, { ...pending, hasSource: false }]) {
    const kind = classifyThumbnail(state);
    exposure.add(10, ['loading', 'decoding', 'placeholder'].includes(kind) ? 500 : 0, 1000);
  }
  assert.equal(exposure.snapshot().pendingAreaRatioMean, 0);
  assert.equal(exposure.snapshot().blankViewportMs, 0);
});

test('exposure integrates left-endpoint area weighted by time, not frame count', () => {
  const exposure = createExposure();
  exposure.add(10, 50, 100);
  exposure.add(30, 0, 100);
  exposure.add(10, 100, 200);
  assert.deepEqual(exposure.snapshot(), {
    pendingAreaRatioMean: 0.2,
    pendingAreaRatioMax: 0.5,
    blankViewportMs: 20,
    exposureAreaMs: 1500,
    elapsedMs: 50,
  });
});

test('exposure integrators keep mixed thumbnail and placeholder intervals separate', () => {
  const aggregate = createExposure();
  const thumbnails = createExposure();
  for (const frame of [
    { dt: 10, thumbnail: 20, placeholder: 30 },
    { dt: 30, thumbnail: 0, placeholder: 50 },
    { dt: 10, thumbnail: 40, placeholder: 0 },
  ]) {
    aggregate.add(frame.dt, frame.thumbnail + frame.placeholder, 100);
    thumbnails.add(frame.dt, frame.thumbnail, 100);
  }
  assert.equal(aggregate.snapshot().pendingAreaRatioMean, 0.48);
  assert.equal(thumbnails.snapshot().pendingAreaRatioMean, 0.12);
  assert.equal(aggregate.snapshot().blankViewportMs, 50);
  assert.equal(thumbnails.snapshot().blankViewportMs, 20);
  assert.equal(thumbnails.snapshot().pendingAreaRatioMax, 0.4);
  assert.equal(thumbnails.snapshot().exposureAreaMs, 600);
});

test('exposure remains bounded with overlapping slots, zero viewports and invalid input', () => {
  const exposure = createExposure();
  exposure.add(10, 300, 100);
  exposure.add(10, 300, 0);
  exposure.add(-5, 100, 100);
  exposure.add(NaN, Infinity, 100);
  exposure.add(Infinity, 100, 100);
  const summary = exposure.snapshot();
  assert.equal(summary.pendingAreaRatioMean, 0.5);
  assert.equal(summary.pendingAreaRatioMax, 1);
  assert.equal(summary.exposureAreaMs, 1000);
  assert.equal(summary.blankViewportMs, 10);
  assert.equal(summary.elapsedMs, 20);
  assert.ok(Object.values(summary).every(Number.isFinite));
  assert.ok(Object.values(createExposure().snapshot()).every((value) => value === 0));
});

test('bounded deterministic samples retain counters without growing with run length', () => {
  const first = createSample(8);
  const second = createSample(8);
  for (let i = 0; i < 100000; i++) { first.add(i); second.add(i); }
  assert.equal(first.size, 8);
  assert.equal(first.count, 100000);
  assert.equal(first.percentile(0.95), second.percentile(0.95));
  assert.ok(first.percentile(0.5) >= 0 && first.percentile(0.5) < 100000);
  assert.equal(createSample(1e9).capacity, 10000);
  assert.equal(createSample(-10).capacity, 1);
  assert.equal(createSample(NaN).capacity, 2048);
  assert.equal(createSample().capacity, 2048);
  first.clear();
  assert.equal(first.size, 0);
  assert.equal(first.percentile(0.95), null);
});

test('nearest-rank p95 handles short samples without claiming an absent frame', () => {
  const frames = createSample(20);
  for (const value of [16, 17, 18, 19, 100]) frames.add(value);
  assert.equal(frames.percentile(0.95), 100);
  assert.equal(frames.percentile(0.5), 18);
});

test('generation guards reject element, image, identity, raw source and selected-source reuse', () => {
  const record = { element: {}, image: {}, identity: 'fixture-a', source: 'fixture-src', selectedSource: 'selected-a' };
  assert.equal(sameGeneration(record, { ...record }), true);
  for (const change of [{ element: {} }, { image: {} }, { identity: 'fixture-b' }, { source: 'fixture-next' }, { selectedSource: 'selected-b' }]) {
    assert.equal(sameGeneration(record, { ...record, ...change }), false);
  }
  // A browser selecting currentSrc for the first load isn't a new source generation.
  assert.equal(sameGeneration({ ...record, selectedSource: '' }, record), true);
});

test('logical reorder uses surviving identities, independent of recycling and window churn', () => {
  assert.equal(orderChanged(['a', 'b', 'c'], ['b', 'c', 'd']), false);
  assert.equal(orderChanged(['a', 'b', 'c'], ['c', 'b', 'd']), true);
  assert.equal(orderChanged(['a', 'b'], ['c', 'd']), false);
  assert.equal(orderChanged(['a'], ['a']), false);
  assert.equal(orderChanged([], ['a', 'b']), false);
});

function browserStub({ cached = false, top = 120, shiftsSupported = false, placeholder = false } = {}) {
  let shiftCallback;
  let now = 0;
  let tick;
  let mutation;
  let resolveDecode;
  let decodeCalls = 0;
  let identity = placeholder ? '' : 'fixture-a';
  const attributes = new Map([['src', 'fixture-image']]);
  const image = {
    complete: cached, naturalWidth: cached ? 10 : 0, currentSrc: cached ? 'fixture-image' : '',
    getAttribute: (key) => attributes.get(key) ?? null,
    decode() { decodeCalls++; return new Promise((resolve) => { resolveDecode = resolve; }); },
  };
  const rect = () => ({ left: 0, right: 50, top, bottom: top + 50 });
  const slot = {
    querySelector: () => image,
    getBoundingClientRect: rect,
    contains: (node) => node === image,
  };
  const cell = {
    getAttribute: () => identity,
    querySelector: () => placeholder ? null : slot,
    getBoundingClientRect: rect,
  };
  const events = new Map();
  const region = {
    scrollTop: 0, scrollLeft: 0, clientLeft: 0, clientTop: 0, clientWidth: 100, clientHeight: 100, isConnected: true,
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 100, bottom: 100 }),
    contains: (node) => [cell, slot, image].includes(node),
    querySelector: () => null,
    querySelectorAll: (selector) => (placeholder ? selector.startsWith(':scope > div') : selector === '[data-grid-cell]') ? [cell] : [],
    addEventListener: (name, callback) => events.set(name, callback),
    removeEventListener: (name) => events.delete(name),
  };
  const window = { innerWidth: 100, innerHeight: 100 };
  const context = {
    window, document: { querySelector: () => region }, performance: { now: () => now },
    requestAnimationFrame: (callback) => { tick = callback; return 1; },
    cancelAnimationFrame: () => { tick = null; },
    MutationObserver: class {
      constructor(callback) { mutation = callback; }
      observe() {}
      disconnect() { mutation = null; }
    },
    PerformanceObserver: class {
      static supportedEntryTypes = shiftsSupported ? ['layout-shift'] : [];
      constructor(callback) { shiftCallback = callback; }
      observe() {}
      takeRecords() { return []; }
      disconnect() {}
    },
  };
  vm.runInNewContext(`(${installThumbnailProbe.toString()})`, context)({ density: 'grid', sampleLimit: 4 });
  return {
    window, image, cell, slot, region, events, attributes,
    shifts(entries) { shiftCallback({ getEntries: () => entries }); },
    get probe() { return window.__kupua_thumbnailProbe; },
    get decodeCalls() { return decodeCalls; },
    get stopped() { return tick === null && mutation === null && events.size === 0; },
    frame(time) { now = time; tick(time); },
    elapse(time) { now = time; },
    load() { image.complete = true; image.naturalWidth = 10; image.currentSrc = attributes.get('src'); events.get('load')({ type: 'load', target: image }); },
    reuse() { identity = 'fixture-b'; attributes.set('src', 'fixture-next'); image.complete = false; image.naturalWidth = 0; image.currentSrc = ''; mutation(); },
    scrollTo(value, nextTop) { region.scrollTop = value; top = nextTop; events.get('scroll')(); },
    resolve() { resolveDecode(); },
  };
}
const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

test('visible thumbnail waits finish at decoded readiness, not at load', async () => {
  const browser = browserStub({ top: 0 });
  browser.frame(10);
  browser.frame(50);
  browser.load();
  await flushPromises();
  browser.frame(70);
  browser.resolve();
  await flushPromises();
  browser.frame(90);
  const result = browser.probe.stop();
  assert.equal(result.thumbnailWaitCaptureRevision, 1);
  assert.equal(result.thumbnailVisibleWaitCount, 1);
  assert.equal(result.thumbnailVisibleWaitMaxMs, 80);
  assert.equal(result.thumbnailVisibleWaitCompletedMaxMs, 80);
  assert.equal(result.thumbnailVisibleWaitCompletedCount, 1);
  assert.equal(result.thumbnailVisibleWaitCensoredCount, 0);
});

test('visible waits censor departure, source replacement and observation end separately', () => {
  const browser = browserStub({ top: 0 });
  browser.frame(10);
  browser.frame(40);
  browser.scrollTo(50, 120);
  browser.frame(50);
  browser.scrollTo(60, 20);
  browser.frame(70);
  browser.reuse();
  browser.frame(100);
  browser.frame(140);
  const result = browser.probe.stop();
  assert.equal(result.thumbnailVisibleWaitCount, 3);
  assert.equal(result.thumbnailVisibleWaitMaxMs, 40);
  assert.equal(result.thumbnailVisibleWaitCompletedMaxMs, null);
  assert.equal(result.thumbnailVisibleWaitCompletedCount, 0);
  assert.equal(result.thumbnailVisibleWaitCensoredCount, 3);
});

test('offscreen images and unobserved startup do not invent visible waits', () => {
  for (const firstFrame of [false, true]) {
    const browser = browserStub({ top: 120 });
    if (firstFrame) browser.frame(20);
    browser.elapse(40);
    const result = browser.probe.stop();
    assert.equal(result.thumbnailVisibleWaitCount, 0);
    assert.equal(result.thumbnailVisibleWaitMaxMs, 0);
    assert.equal(result.thumbnailVisibleWaitCompletedMaxMs, null);
    assert.equal(result.thumbnailVisibleWaitCensoredCount, 0);
  }
});

test('serialized observer separates missing-data placeholder exposure from thumbnail pending exposure', () => {
  for (const placeholder of [true, false]) {
    const browser = browserStub({ placeholder, top: 0 });
    browser.frame(8);
    browser.frame(24);
    const result = browser.probe.stop();
    assert.equal(result.elapsedMs, 24);
    assert.equal(result.exposureObservedMs, 16);
    assert.equal(result.exposureStartDelayMs, 8);
    assert.equal(result.pendingAreaRatioMean, 0.25);
    assert.equal(result.pendingAreaRatioMax, 0.25);
    assert.equal(result.blankViewportMs, 16);
    assert.equal(result.exposureAreaMs, 40000);
    assert.equal(result.thumbnailPendingAreaRatioMean, placeholder ? 0 : 0.25);
    assert.equal(result.thumbnailPendingAreaRatioMax, placeholder ? 0 : 0.25);
    assert.equal(result.thumbnailBlankViewportMs, placeholder ? 0 : 16);
    assert.equal(result.thumbnailExposureAreaMs, placeholder ? 0 : 40000);
    assert.equal(result.placeholderAreaRatioMean, placeholder ? 0.25 : 0);
  }
});

test('serialized observer waits for natural load before decoding offscreen lazy images', async () => {
  const browser = browserStub();
  browser.frame(16);
  await flushPromises();
  assert.equal(browser.decodeCalls, 0);
  browser.scrollTo(50, 70);
  browser.load();
  await flushPromises();
  assert.equal(browser.decodeCalls, 1);
  browser.resolve();
  await flushPromises();
  browser.frame(32);
  const result = browser.probe.stop();
  assert.equal(result.loadedCount, 1);
  assert.equal(result.decodedCount, 1);
  assert.equal(result.readinessLeadPxMedian, -30);
  assert.equal(result.decodedReadinessLeadPxMedian, -30);
  assert.equal(result.lateReadyCount, 1);
  assert.equal(result.imageSourceChanges, 0);
  assert.equal(result.scrollDistancePx, 50);
  assert.equal(result.actualSpeedPxPerSec, 1562.5);
  assert.equal(result.pendingAtEnd, 0);
  assert.equal(result.layoutShiftSupported, 0);
  assert.equal(result.layoutShiftValue, null);
  assert.equal(result.thumbnailShiftValue, null);
  assert.equal(result.layoutShiftRawValue, null);
  assert.ok(Object.values(result).every((value) => value === null || Number.isFinite(value)));
  assert.deepEqual(browser.probe.stop(), result);
  assert.equal(browser.stopped, true);
});

test('serialized observer starts after warm decode without inventing initial exposure or crossings', async () => {
  const browser = browserStub({ cached: true, top: 0 });
  await flushPromises();
  browser.resolve();
  await flushPromises();
  browser.frame(16);
  browser.frame(32);
  const result = browser.probe.stop();
  assert.equal(result.elapsedMs, 32);
  assert.equal(result.exposureObservedMs, 16);
  assert.equal(result.exposureStartDelayMs, 16);
  assert.equal(result.pendingAreaRatioMean, 0);
  assert.equal(result.pendingAreaRatioMax, 0);
  assert.equal(result.blankViewportMs, 0);
  assert.equal(result.exposureAreaMs, 0);
  assert.equal(result.thumbnailPendingAreaRatioMean, 0);
  assert.equal(result.thumbnailPendingAreaRatioMax, 0);
  assert.equal(result.thumbnailBlankViewportMs, 0);
  assert.equal(result.thumbnailExposureAreaMs, 0);
  assert.equal(result.alreadyLoadedCount, 1);
  assert.equal(result.loadedCount, 1);
  assert.equal(result.decodedCount, 1);
  assert.equal(result.readinessLeadPxMedian, null);
  assert.equal(result.decodedReadinessLeadPxMedian, null);
  assert.equal(result.readinessObservedCount, 0);
});

test('serialized observer still counts loaded but undecoded images after its first rAF', async () => {
  const browser = browserStub({ cached: true, top: 0 });
  await flushPromises();
  browser.frame(16);
  browser.frame(32);
  const result = browser.probe.stop();
  assert.equal(result.loadedCount, 1);
  assert.equal(result.decodedCount, 0);
  assert.equal(result.pendingAtEnd, 1);
  assert.equal(result.exposureObservedMs, 16);
  assert.equal(result.thumbnailPendingAreaRatioMean, 0.25);
  assert.equal(result.thumbnailPendingAreaRatioMax, 0.25);
  assert.equal(result.thumbnailBlankViewportMs, 16);
  assert.equal(result.thumbnailExposureAreaMs, 40000);
  browser.resolve();
  await flushPromises();
  assert.deepEqual(browser.probe.stop(), result);
});

test('serialized observer stopping before its first frame reports no inferred exposure and cleans up', async () => {
  const browser = browserStub({ cached: true, top: 0 });
  await flushPromises();
  browser.elapse(10);
  const probe = browser.probe;
  const result = probe.stop();
  assert.equal(result.elapsedMs, 10);
  assert.equal(result.exposureObservedMs, 0);
  assert.equal(result.exposureStartDelayMs, 10);
  assert.equal(result.frameP95Ms, null);
  assert.equal(result.pendingAtEnd, 1);
  assert.equal(result.thumbnailPendingAreaRatioMean, 0);
  assert.equal(result.thumbnailPendingAreaRatioMax, 0);
  assert.equal(result.thumbnailBlankViewportMs, 0);
  assert.equal(result.thumbnailExposureAreaMs, 0);
  assert.equal(browser.stopped, true);
  browser.resolve();
  await flushPromises();
  assert.deepEqual(probe.stop(), result);
  probe.dispose();
  assert.equal(browser.window.__kupua_thumbnailProbe, undefined);
});

test('serialized observer rejects stale decode after source reuse and disposes listeners', async () => {
  const browser = browserStub({ cached: true, top: 0 });
  await flushPromises();
  browser.reuse();
  browser.frame(16);
  browser.resolve();
  await flushPromises();
  const probe = browser.probe;
  const result = probe.stop();
  assert.equal(result.decodedCount, 0);
  assert.equal(result.imageIdentityChanges, 1);
  assert.equal(result.imageSourceChanges, 1);
  assert.equal(result.logicalOrderChanges, 0);
  assert.equal(result.pendingAtEnd, 1);
  assert.equal(browser.decodeCalls, 1);
  probe.dispose();
  assert.equal(browser.window.__kupua_thumbnailProbe, undefined);
  assert.equal(browser.stopped, true);
});

test('serialized observer records a failed replacement without accepting stale source decode', async () => {
  const browser = browserStub({ cached: true, top: 0 });
  await flushPromises();
  browser.reuse();
  // currentSrc may still describe the old bitmap while the raw src has changed.
  browser.image.currentSrc = 'fixture-image';
  browser.resolve();
  await flushPromises();
  browser.image.complete = true;
  browser.image.naturalWidth = 0;
  browser.image.currentSrc = 'fixture-next';
  browser.events.get('error')({ type: 'error', target: browser.image });
  browser.frame(16);
  const result = browser.probe.stop();
  assert.equal(result.decodedCount, 0);
  assert.equal(result.imageIdentityChanges, 1);
  assert.equal(result.failedCount, 1);
  assert.equal(result.pendingAtEnd, 0);
  assert.equal(result.readinessLeadPxMedian, null);
});

test('serialized observer cannot update a stopped snapshot when decode resolves later', async () => {
  const browser = browserStub({ cached: true, top: 0 });
  await flushPromises();
  const probe = browser.probe;
  const result = probe.stop();
  browser.resolve();
  await flushPromises();
  assert.equal(result.decodedCount, 0);
  assert.deepEqual(probe.stop(), result);
  probe.dispose();
  assert.equal(browser.stopped, true);
});

test('serialized observer separates raw and recent-input-excluded layout-shift attribution sums', () => {
  const browser = browserStub({ shiftsSupported: true });
  browser.shifts([
    { startTime: 1, value: 0.125, hadRecentInput: false, sources: [{ node: browser.image }] },
    { startTime: 2, value: 0.25, hadRecentInput: true, sources: [{ node: browser.slot }] },
    { startTime: 3, value: 0.5, hadRecentInput: false, sources: [{ node: browser.cell }] },
    { startTime: -1, value: 1, hadRecentInput: false, sources: [{ node: browser.image }] },
  ]);
  const result = browser.probe.stop();
  assert.equal(result.layoutShiftSupported, 1);
  assert.equal(result.layoutShiftValue, 0.625);
  assert.equal(result.layoutShiftRawValue, 0.875);
  assert.equal(result.thumbnailShiftValue, 0.125);
  assert.equal(result.thumbnailShiftRawValue, 0.375);
  assert.equal(result.thumbnailShiftRecentInputValue, 0.25);
});

test('serialized installer exposes the exact pure helpers without module closure dependencies', () => {
  const serialized = vm.runInNewContext(`(${installThumbnailProbe.toString()})`);
  const helpers = serialized(null, true);
  assert.equal(helpers.readinessLeadPx({ top: 250, bottom: 300 }, viewport, 1), 50);
  const exposure = helpers.createExposure();
  exposure.add(16, 50, 100);
  assert.equal(exposure.snapshot().pendingAreaRatioMean, 0.5);
  assert.throws(() => serialized({ density: 'unknown' }), /supported density/);
});
