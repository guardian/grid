export async function install(options = {}) {
  const expectedMode = options.expectedMode ?? 'phantom';
  const [searchModule, selectionModule, preferenceModule, geometryModule, navigationModule, schemaModule, cacheModule] = await Promise.all([
    import('/src/stores/search-store.ts'),
    import('/src/stores/selection-store.ts'),
    import('/src/stores/ui-prefs-store.ts'),
    import('/src/lib/scroll-geometry-ref.ts'),
    import('/src/lib/orchestration/search.ts'),
    import('/src/lib/search-params-schema.ts'),
    import('/src/lib/image-offset-cache.ts'),
  ]);
  const store = searchModule.useSearchStore;
  const selectionStore = selectionModule.useSelectionStore;
  const records = window.__cto?.records ?? [];
  window.__cto?.cleanup();
  const harness = { ids: {}, records, releases: [], scope: null, expectedMode, modulePath: options.modulePath ?? import.meta.url, runners: { basic: runBasic.toString(), transitions: runTransitions.toString(), history: runHistory.toString(), edges: runEdges.toString(), lifetime: runBufferLifetime.toString(), lowOffset: runLowOffsetReset.toString(), ai: runAiTransitions.toString(), interruptions: runInterruptions.toString(), touch: runTouchComposition.toString(), layout: runLayout.toString(), fullscreen: runFullscreen.toString() } };
  const queries = { buffer: 'keyword:"mid length half celebration"', indexed: 'city:Dublin', seek: undefined };
  const container = () => document.querySelector('[aria-label="Image results grid"], [aria-label="Image results table"]');
  const elementFor = (imageId) => Array.from(container()?.querySelectorAll('[data-image-id]') ?? [])
    .find(element => element.dataset.imageId === imageId);

  harness.wait = async (predicate, label, timeout = 15000) => {
    const start = performance.now();
    while (performance.now() - start < timeout) {
      if (predicate()) return;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw new Error('CTO readiness timeout: ' + label);
  };

  harness.capture = () => {
    const state = store.getState();
    const selected = selectionStore.getState();
    const viewport = container();
    const bounds = viewport?.getBoundingClientRect();
    const header = viewport?.querySelector('[data-table-header]')?.getBoundingClientRect();
    const usableTop = bounds ? Math.max(bounds.top, header?.bottom ?? bounds.top) : 0;
    const centre = bounds ? (usableTop + bounds.bottom) / 2 : 0;
    const url = new URL(location.href);
    const detailId = url.searchParams.get('image');
    const detail = document.querySelector('[data-detail-image-id]');
    const media = detail?.querySelector('img[fetchpriority="high"]');
    const anchor = window.__kupua_getViewportAnchorId__();
    const tracked = {};
    for (const [role, imageId] of Object.entries(harness.ids)) {
      const element = elementFor(imageId);
      const rect = element?.getBoundingClientRect();
      tracked[role] = {
        loaded: state.imagePositions.has(imageId),
        rank: state.imagePositions.get(imageId) ?? null,
        focused: state.focusedImageId === imageId,
        selected: selected.selectedIds.has(imageId),
        selectionAnchor: selected.anchorId === imageId,
        viewportAnchor: anchor === imageId,
        detail: detailId === imageId,
        rendered: !!rect,
        intersects: !!rect && !!bounds && rect.bottom > usableTop && rect.top < bounds.bottom && rect.right > bounds.left && rect.left < bounds.right,
        full: !!rect && !!bounds && rect.top >= usableTop && rect.bottom <= bounds.bottom,
        centre: rect ? Math.round(((rect.top + rect.bottom) / 2 - centre) * 10) / 10 : null,
        top: rect ? Math.round((rect.top - usableTop) * 10) / 10 : null,
      };
    }
    return {
      mode: preferenceModule.getEffectiveFocusMode(),
      coarse: preferenceModule.useUiPrefsStore.getState()._pointerCoarse,
      source: state.dataSource.constructor.name,
      visiblePage: document.visibilityState === 'visible',
      tier: state.total <= 1000 ? 'buffer' : state.total <= 65000 ? 'indexed' : 'seek',
      view: header ? 'table' : 'grid',
      total: state.total, loaded: state.results.length, offset: state.bufferOffset,
      scroll: Math.round(viewport?.scrollTop ?? 0),
      scrollLeft: Math.round(viewport?.scrollLeft ?? 0),
      maxScroll: viewport ? viewport.scrollHeight - viewport.clientHeight : 0,
      width: viewport?.clientWidth ?? 0, height: viewport?.clientHeight ?? 0,
      columns: geometryModule.getScrollGeometry().columns,
      loading: state.loading,
      finding: state.sortAroundFocusStatus !== null,
      extending: state._extendForwardInFlight || state._extendBackwardInFlight,
      error: !!state.error,
      hasFocus: state.focusedImageId !== null,
      focusLoaded: state.focusedImageId !== null && state.imagePositions.has(state.focusedImageId),
      selected: selected.selectedIds.size,
      rings: viewport?.querySelectorAll('[data-grid-cell].ring-2, [role="row"][aria-selected="true"]').length ?? 0,
      detailOpen: !!detailId,
      detailMatches: !!detailId && detail?.dataset.detailImageId === detailId,
      mediaReady: !!media && media.complete && media.naturalWidth > 0,
      fullscreen: !!document.fullscreenElement,
      preview: document.querySelector('[data-fullscreen-preview]')?.dataset.fullscreenPreview === 'active',
      previewMediaReady: Array.from(document.querySelectorAll('[data-fullscreen-preview="active"] img')).some(image => image.complete && image.naturalWidth > 0),
      densityGeneration: window.__kupua_getDensityRestoreGeneration__(),
      seekGeneration: state._seekGeneration,
      searchStarted: window.__kupua_getSearchLifecycle__().started,
      searchSettled: window.__kupua_getSearchLifecycle__().settled,
      mapReady: !!state.positionMap,
      scrubber: document.querySelector('[data-scrubber-mode]')?.dataset.scrubberMode ?? null,
      filling: state._bufferSelfCorrecting,
      tracked,
    };
  };

  harness.observe = async (label, duration = 2600) => {
    if (document.visibilityState !== 'visible') throw new Error('CTO page is hidden');
    const start = performance.now();
    let frames = 0;
    let changes = 0;
    let previous = '';
    let final;
    const ranges = {};
    while (performance.now() - start < duration) {
      await new Promise(resolve => requestAnimationFrame(resolve));
      if (document.visibilityState !== 'visible') throw new Error('CTO page became hidden');
      final = harness.capture();
      const fingerprint = JSON.stringify({ scroll: final.scroll, offset: final.offset, tracked: final.tracked, focus: final.hasFocus, selected: final.selected });
      if (previous && previous !== fingerprint) changes++;
      previous = fingerprint;
      for (const [role, value] of Object.entries(final.tracked)) {
        const range = ranges[role] ??= { min: null, max: null, clippedFrames: 0, absentFrames: 0 };
        if (value.centre !== null) {
          range.min = range.min === null ? value.centre : Math.min(range.min, value.centre);
          range.max = range.max === null ? value.centre : Math.max(range.max, value.centre);
        }
        if (!value.full) range.clippedFrames++;
        if (!value.rendered) range.absentFrames++;
      }
      frames++;
    }
    const result = { label, frames, changes, ranges, final };
    harness.records.push(result);
    return result;
  };

  harness.ready = async () => {
    await harness.wait(() => {
      const state = store.getState();
      if (state.error && !state.loading) throw new Error('CTO list ended in a data error');
      return !state.loading && state.sortAroundFocusStatus === null && !!container() && !!window.__kupua_getViewportAnchorId__();
    }, 'list data and DOM');
  };

  harness.density = async (view) => {
    const before = harness.capture();
    if (before.view === view) return;
    document.querySelector(`button[aria-label="Switch to ${view} view"]`).click();
    await harness.wait(() => harness.capture().view === view && window.__kupua_getDensityRestoreGeneration__() > before.densityGeneration, 'density placement');
    await harness.ready();
  };

  harness.navigate = async (search) => {
    const expectedKey = cacheModule.buildSearchKey(schemaModule.canonicalizeSearchParams(search));
    const previousKey = cacheModule.buildSearchKey(store.getState().params);
    const previousGeneration = window.__kupua_getSearchLifecycle__().started;
    navigationModule.pushNavigate(window.__kupua_router__.navigate, { to: '/search', search });
    await harness.wait(() => {
      const state = store.getState();
      if (state.error && !state.loading && cacheModule.buildSearchKey(state.params) === expectedKey) throw new Error('CTO search scope ended in a data error');
      return cacheModule.buildSearchKey(state.params) === expectedKey
        && (previousKey === expectedKey || window.__kupua_getSearchLifecycle__().started > previousGeneration)
        && !state.loading && state.sortAroundFocusStatus === null;
    }, 'search scope', 30000);
  };

  harness.prepare = async (tier, view) => {
    if (new URL(location.href).searchParams.has('image') || document.fullscreenElement) throw new Error('CTO prepare requires closed detail/fullscreen');
    if (preferenceModule.getEffectiveFocusMode() !== harness.expectedMode) throw new Error('CTO mode does not match the installed probe');
    for (const release of harness.releases.splice(0)) release();
    harness.ids = {};
    store.getState().setFocusedImageId(null);
    selectionStore.getState().clear();
    const density = new URL(location.href).searchParams.get('density');
    const search = { nonFree: 'true', until: '2026-03-04T00:00:00Z', ...(density ? { density } : {}), ...(queries[tier] ? { query: queries[tier] } : {}) };
    await harness.navigate(search);
    await harness.wait(() => {
      const state = store.getState();
      return tier === 'buffer' ? state.total > 0 && state.total <= 1000 && state.results.length === state.total
        : tier === 'indexed' ? state.total > 1000 && state.total <= 65000 && !!state.positionMap
          : state.total > 65000;
    }, 'natural tier', 30000);
    await harness.density(view);
    if (store.getState().bufferOffset > 0) await store.getState().seek(0);
    await harness.ready();
    const viewport = container();
    const target = Math.min(2000, Math.max(0, viewport.scrollHeight - viewport.clientHeight - 600));
    viewport.scrollTop = target;
    viewport.dispatchEvent(new Event('scroll'));
    await harness.wait(() => Math.abs(container().scrollTop - target) <= 1 && !!window.__kupua_getViewportAnchorId__(), 'setup scroll');
    harness.scope = { tier, view, search: { nonFree: 'true', until: '2026-03-04T00:00:00Z', ...(queries[tier] ? { query: queries[tier] } : {}), ...(view === 'table' ? { density: 'table' } : {}) } };
    document.activeElement?.blur();
    return harness.capture();
  };

  harness.pick = (role = 'open') => {
    const imageId = window.__kupua_getViewportAnchorId__();
    const element = elementFor(imageId);
    if (!element) throw new Error('CTO anchor is not rendered');
    const rect = element.getBoundingClientRect();
    const bounds = container().getBoundingClientRect();
    harness.ids[role] = imageId;
    return { x: rect.left + Math.min(rect.width / 2, 180), y: Math.max(bounds.top + 45, Math.min(bounds.bottom - 10, rect.top + Math.min(rect.height / 2, 90))) };
  };

  harness.rememberDetail = (role = 'last') => {
    harness.ids[role] = new URL(location.href).searchParams.get('image');
  };

  harness.choose = (role, delta = 0) => {
    const state = store.getState();
    const anchor = window.__kupua_getViewportAnchorId__();
    const rank = state.imagePositions.get(anchor);
    const image = state.results[rank - state.bufferOffset + delta];
    const element = image && elementFor(image.id);
    if (!element) throw new Error('CTO candidate is not rendered');
    const rect = element.getBoundingClientRect();
    const bounds = container().getBoundingClientRect();
    const header = container().querySelector('[data-table-header]')?.getBoundingClientRect();
    if (rect.top < (header?.bottom ?? bounds.top) || rect.bottom > bounds.bottom) throw new Error('CTO candidate is not fully visible');
    document.querySelectorAll('[data-cto-target]').forEach(previous => previous.removeAttribute('data-cto-target'));
    harness.ids[role] = image.id;
    element.dataset.ctoTarget = role;
    return { x: rect.left + Math.min(rect.width / 2, 180), y: rect.top + Math.min(rect.height / 2, 90) };
  };

  harness.detailReady = async () => {
    await harness.wait(() => {
      const imageId = new URL(location.href).searchParams.get('image');
      return imageId && document.querySelector('[data-detail-image-id]')?.dataset.detailImageId === imageId;
    }, 'detail identity', 8000);
    return harness.capture();
  };

  harness.listBehindDetailReady = async () => {
    await harness.wait(() => {
      const state = store.getState();
      const imageId = new URL(location.href).searchParams.get('image');
      return !state.loading && state.sortAroundFocusStatus === null && state.imagePositions.has(imageId) && !state._phantomFocusImageId;
    }, 'underlying detail list', 15000);
    return harness.capture();
  };

  harness.neighbour = (direction = 1) => {
    const state = store.getState();
    const imageId = new URL(location.href).searchParams.get('image') ?? state.focusedImageId;
    const rank = state.imagePositions.get(imageId);
    harness.ids.expected = rank === undefined ? null : state.results[rank - state.bufferOffset + direction]?.id ?? null;
    return harness.ids.expected !== null;
  };

  harness.setCoarse = (coarse) => preferenceModule.useUiPrefsStore.setState({ _pointerCoarse: coarse });

  harness.holdNext = (kind = 'cursor') => {
    const source = store.getState().dataSource;
    const original = source.searchAfter;
    const own = Object.prototype.hasOwnProperty.call(source, 'searchAfter');
    const descriptor = Object.getOwnPropertyDescriptor(source, 'searchAfter');
    let claimed = false;
    let unblock = () => {};
    let active = true;
    harness.gate = { called: false, responseReady: false, waiting: false, released: false, aborted: false, cursor: false, errorType: null };
    const release = () => {
      if (!active) return;
      active = false;
      harness.gate.released = true;
      unblock();
      if (own) Object.defineProperty(source, 'searchAfter', descriptor);
      else delete source.searchAfter;
    };
    source.searchAfter = async function(...args) {
      const matches = kind === 'first' ? !args[1] && !args[0]?.ids : kind === 'any' ? true : !!args[1];
      const hold = !claimed && matches;
      if (hold) {
        claimed = true;
        harness.gate.called = true;
        harness.gate.cursor = !!args[1];
      }
      let response;
      try {
        response = await original.apply(this, args);
      } catch (error) {
        if (hold) harness.gate.errorType = error?.name ?? 'Error';
        throw error;
      }
      if (hold && active) {
        harness.gate.responseReady = true;
        harness.gate.waiting = true;
        await new Promise(resolve => { unblock = resolve; });
        harness.gate.aborted = !!args[3]?.aborted;
      }
      return response;
    };
    harness.releases.push(release);
    harness.release = release;
  };

  harness.cleanup = () => {
    for (const release of harness.releases.splice(0)) release();
    document.querySelectorAll('[data-cto-target]').forEach(element => element.removeAttribute('data-cto-target'));
    harness.ids = {};
    delete window.__cto;
  };
  window.__cto = harness;
  return { installed: true, expectedMode, mode: preferenceModule.getEffectiveFocusMode(), source: store.getState().dataSource.constructor.name };
}

export async function runBasic(page, options) {
  const { tier, view, transport } = options;
  const label = `${transport}/${tier}/${view}`;
  const result = { label, checks: {} };
  let stage = 'prepare';
  try {
    await page.bringToFront();
    const prepared = await page.evaluate(({ tier, view }) => window.__cto.prepare(tier, view), { tier, view });
    result.baseline = { mode: prepared.mode, source: prepared.source, tier: prepared.tier, total: prepared.total, view: prepared.view };
    stage = 'fresh keyboard';
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(previous => window.__cto.capture().scroll > previous, prepared.scroll, { timeout: 5000 });
    const down = await page.evaluate(() => window.__cto.capture());
    await page.keyboard.press('PageDown');
    await page.waitForFunction(previous => window.__cto.capture().scroll > previous, down.scroll, { timeout: 5000 });
    await page.keyboard.press('PageUp');
    await page.keyboard.press('Enter');
    await page.keyboard.press('f');
    const fresh = await page.evaluate(label => window.__cto.observe(label, 600), label + '/fresh-keys');
    result.checks.freshKeys = { scrollDown: down.scroll > prepared.scroll, noFocus: !fresh.final.hasFocus, noRing: fresh.final.rings === 0, enterNoDetail: !fresh.final.detailOpen, noPreview: !fresh.final.preview && !fresh.final.fullscreen };
    stage = 'single-click original return';
    const point = await page.evaluate(() => window.__cto.pick('open'));
    const before = await page.evaluate(() => window.__cto.capture());
    await page.mouse.click(point.x, point.y);
    await page.evaluate(() => window.__cto.detailReady());
    let decoded = true;
    try { await page.evaluate(() => window.__cto.wait(() => window.__cto.capture().mediaReady, 'media decode', 4000)); } catch { decoded = false; }
    const opened = await page.evaluate(() => window.__cto.capture());
    await page.keyboard.press('Backspace');
    await page.waitForFunction(() => !new URL(location.href).searchParams.has('image') && !document.querySelector('[data-detail-image-id]'), null, { timeout: 5000 });
    const returned = await page.evaluate(label => window.__cto.observe(label), label + '/original-return');
    result.checks.originalReturn = { openedCorrectIdentity: opened.tracked.open.detail && opened.detailMatches, decoded, centreDelta: returned.final.tracked.open.centre - before.tracked.open.centre, sameScroll: returned.final.scroll === before.scroll, visible: returned.final.tracked.open.intersects, storedFocus: returned.final.tracked.open.focused, rings: returned.final.rings, watchChanges: returned.changes };
    stage = 'traversal return';
    const nextPoint = await page.evaluate(() => window.__cto.pick('entry'));
    await page.mouse.click(nextPoint.x, nextPoint.y);
    await page.evaluate(() => window.__cto.detailReady());
    let moves = 0;
    for (const direction of [1, 1, -1]) {
      const available = await page.evaluate(direction => window.__cto.neighbour(direction), direction);
      if (!available) throw new Error('CTO adjacent fixture not loaded');
      await page.keyboard.press(direction === 1 ? 'ArrowRight' : 'ArrowLeft');
      await page.waitForFunction(() => new URL(location.href).searchParams.get('image') === window.__cto.ids.expected && document.querySelector('[data-detail-image-id]')?.dataset.detailImageId === window.__cto.ids.expected, null, { timeout: 5000 });
      moves++;
    }
    await page.evaluate(() => window.__cto.rememberDetail('last'));
    await page.getByRole('button', { name: 'Back to search', exact: true }).click();
    await page.waitForFunction(() => !new URL(location.href).searchParams.has('image') && !document.querySelector('[data-detail-image-id]'), null, { timeout: 5000 });
    const traversed = await page.evaluate(label => window.__cto.observe(label), label + '/traversed-return');
    result.checks.traversal = { moves, centre: traversed.final.tracked.last.centre, full: traversed.final.tracked.last.full, storedLast: traversed.final.tracked.last.focused, rings: traversed.final.rings, watchChanges: traversed.changes };
    stage = 'hidden-focus keys and scroll-away';
    const region = page.getByRole('region', { name: view === 'grid' ? 'Image results grid' : 'Image results table', exact: true });
    const bounds = await region.boundingBox();
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.wheel(0, view === 'grid' ? 1800 : 900);
    await page.waitForFunction(() => !window.__cto.capture().tracked.last.intersects, null, { timeout: 5000 });
    const away = await page.evaluate(() => { document.activeElement?.blur(); return window.__cto.capture(); });
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(previous => window.__cto.capture().scroll > previous, away.scroll, { timeout: 5000 });
    await page.keyboard.press('Enter');
    await page.keyboard.press('f');
    const hidden = await page.evaluate(label => window.__cto.observe(label, 600), label + '/hidden-keys');
    result.checks.hiddenKeys = { storedLastUnchanged: hidden.final.tracked.last.focused, remainsOffscreen: !hidden.final.tracked.last.intersects, rings: hidden.final.rings, enterNoDetail: !hidden.final.detailOpen, noPreview: !hidden.final.preview && !hidden.final.fullscreen };
    stage = 'hidden-focus density';
    const densityBefore = await page.evaluate(() => { window.__cto.ids.viewport = window.__kupua_getViewportAnchorId__(); return window.__cto.capture(); });
    const targetView = view === 'grid' ? 'table' : 'grid';
    await page.getByRole('button', { name: `Switch to ${targetView} view`, exact: true }).click();
    await page.waitForFunction(previous => window.__kupua_getDensityRestoreGeneration__() > previous, densityBefore.densityGeneration, { timeout: 5000 });
    const density = await page.evaluate(label => window.__cto.observe(label), label + '/hidden-density');
    result.checks.hiddenDensity = { sourceFocusLoaded: densityBefore.tracked.last.loaded, sourceFocusVisible: densityBefore.tracked.last.intersects, destinationFocusVisible: density.final.tracked.last.intersects, destinationFocusCentre: density.final.tracked.last.centre, storedLast: density.final.tracked.last.focused, rings: density.final.rings, viewedImageBefore: densityBefore.tracked.viewport.centre, viewedImageAfter: density.final.tracked.viewport.centre, watchChanges: density.changes };
    result.completed = true;
  } catch (error) {
    result.completed = false;
    result.failedStage = stage;
    result.errorType = error?.name ?? 'Error';
    result.state = await page.evaluate(() => window.__cto?.capture() ?? { harnessAbsent: true });
  } finally {
    if (await page.evaluate(() => !!document.fullscreenElement)) await page.evaluate(() => document.exitFullscreen().catch(() => {}));
    if (await page.evaluate(() => new URL(location.href).searchParams.has('image'))) {
      await page.getByRole('button', { name: 'Back to search', exact: true }).click();
      await page.waitForFunction(() => !new URL(location.href).searchParams.has('image'), null, { timeout: 5000 });
    }
  }
  await page.evaluate(value => window.__cto.records.push({ workflow: value }), result);
  return result;
}

export async function runTransitions(page, options) {
  const { tier, view, transport } = options;
  const label = `${transport}/${tier}/${view}/transitions`;
  const result = { label, checks: {} };
  let stage = 'prepare';
  try {
    await page.bringToFront();
    await page.evaluate(({ tier, view }) => window.__cto.prepare(tier, view), { tier, view });
    stage = 'selection without focus';
    await page.evaluate(() => window.__cto.choose('selected'));
    const tick = page.locator('[data-cto-target="selected"]');
    await tick.hover();
    await tick.getByRole('button', { name: 'Select image', exact: true }).click();
    await page.waitForFunction(() => window.__cto.capture().selected === 1, null, { timeout: 5000 });
    const firstSelection = await page.evaluate(() => window.__cto.capture());
    const body = await page.evaluate(() => window.__cto.choose('body', 1));
    await page.mouse.click(body.x, body.y);
    await page.waitForFunction(() => window.__cto.capture().selected === 2, null, { timeout: 5000 });
    const range = await page.evaluate(() => window.__cto.choose('range', 2));
    await page.keyboard.down('Shift');
    await page.mouse.click(range.x, range.y);
    await page.keyboard.up('Shift');
    await page.waitForFunction(() => window.__cto.capture().selected >= 3 && !window.__kupua_selection_store__.getState().isRangeWalking, null, { timeout: 5000 });
    const ranged = await page.evaluate(() => window.__cto.capture());
    const beforeClear = ranged.scroll;
    await page.getByRole('button', { name: 'Clear selection', exact: true }).click();
    await page.waitForFunction(() => window.__cto.capture().selected === 0);
    const cleared = await page.evaluate(() => window.__cto.capture());
    result.checks.selection = { tickCount: firstSelection.selected, bodyAndRangeCount: ranged.selected, noFocusCreated: !ranged.hasFocus && !cleared.hasFocus, noDetailOpened: !ranged.detailOpen, noRing: ranged.rings === 0, clearStationary: cleared.scroll === beforeClear };
    stage = 'selection over hidden focus';
    const opening = await page.evaluate(() => window.__cto.pick('hidden'));
    await page.mouse.click(opening.x, opening.y);
    await page.evaluate(() => window.__cto.detailReady());
    await page.getByRole('button', { name: 'Back to search', exact: true }).click();
    await page.waitForFunction(() => !new URL(location.href).searchParams.has('image'));
    await page.evaluate(() => window.__cto.choose('sortSelection', 1));
    const selected = page.locator('[data-cto-target="sortSelection"]');
    await selected.hover();
    await selected.getByRole('button', { name: 'Select image', exact: true }).click();
    await page.waitForFunction(() => window.__cto.capture().selected === 1);
    await page.getByRole('button', { name: 'Sort descending, click to sort ascending', exact: true }).click();
    await page.waitForFunction(() => { const state = window.__kupua_store__.getState(); return state.params.orderBy === 'uploadTime' && !state.loading && state.sortAroundFocusStatus === null; }, null, { timeout: 15000 });
    const sorted = await page.evaluate(label => window.__cto.observe(label), label + '/selection-sort');
    result.checks.selectionSort = { selected: sorted.final.selected, targetVisible: sorted.final.tracked.sortSelection.intersects, oldFocusRetained: sorted.final.tracked.hidden.focused, rings: sorted.final.rings, watchChanges: sorted.changes };
    if (tier === 'buffer') {
      stage = 'selection fill completion';
      await page.waitForFunction(() => { const state = window.__kupua_store__.getState(); return state.bufferOffset === 0 && state.results.length === state.total && !state._bufferSelfCorrecting && !state._extendBackwardInFlight && !state._extendForwardInFlight; }, null, { timeout: 15000 });
      const filled = await page.evaluate(label => window.__cto.observe(label, 1000), label + '/selection-filled');
      result.checks.selectionSort.fillComplete = true;
      result.checks.selectionSort.firstTargetRange = sorted.ranges.sortSelection;
      result.checks.selectionSort.filledTargetRange = filled.ranges.sortSelection;
    }
    await page.getByRole('button', { name: 'Clear selection', exact: true }).click();
    const sortClear = await page.evaluate(() => window.__cto.capture());
    await page.getByRole('button', { name: 'Sort ascending, click to sort descending', exact: true }).click();
    await page.waitForFunction(() => { const state = window.__kupua_store__.getState(); return state.params.orderBy === '-uploadTime' && !state.loading && state.sortAroundFocusStatus === null && state.bufferOffset === 0; }, null, { timeout: 15000 });
    const relaxed = await page.evaluate(() => window.__cto.capture());
    result.checks.unselectedSort = { clearRetainedHidden: sortClear.tracked.hidden.focused, sortClearedFocus: !relaxed.hasFocus, resetToTop: relaxed.scroll === 0, rings: relaxed.rings };
    stage = 'filter broadening after hidden-focus scroll-away';
    const viewport = await page.getByRole('region', { name: view === 'grid' ? 'Image results grid' : 'Image results table', exact: true }).boundingBox();
    await page.mouse.move(viewport.x + viewport.width / 2, viewport.y + viewport.height / 2);
    await page.mouse.wheel(0, 1500);
    await page.waitForFunction(() => window.__cto.capture().scroll > 500);
    const filterPoint = await page.evaluate(() => window.__cto.pick('filterAnchor'));
    await page.mouse.click(filterPoint.x, filterPoint.y);
    await page.evaluate(() => window.__cto.detailReady());
    await page.getByRole('button', { name: 'Back to search', exact: true }).click();
    await page.waitForFunction(() => !new URL(location.href).searchParams.has('image'));
    await page.mouse.move(viewport.x + viewport.width / 2, viewport.y + viewport.height / 2);
    await page.mouse.wheel(0, view === 'grid' ? 1800 : 900);
    await page.waitForFunction(() => !window.__cto.capture().tracked.filterAnchor.intersects);
    const filterBefore = await page.evaluate(() => { window.__cto.ids.viewed = window.__kupua_getViewportAnchorId__(); return window.__cto.capture(); });
    await page.getByRole('button', { name: 'Show date range filter', exact: true }).click();
    await page.getByRole('button', { name: 'Anytime', exact: true }).click();
    await page.waitForFunction(previous => { const state = window.__kupua_store__.getState(); return window.__kupua_getSearchLifecycle__().started > previous && state.params.until === undefined && !state.loading && state.sortAroundFocusStatus === null; }, filterBefore.searchStarted, { timeout: 15000 });
    const filtered = await page.evaluate(label => window.__cto.observe(label), label + '/filter');
    result.checks.filter = { beforeHiddenLoaded: filterBefore.tracked.filterAnchor.loaded, beforeHiddenVisible: filterBefore.tracked.filterAnchor.intersects, afterHiddenVisible: filtered.final.tracked.filterAnchor.intersects, hiddenRetained: filtered.final.tracked.filterAnchor.focused, rings: filtered.final.rings, viewedBefore: filterBefore.tracked.viewed.centre, viewedAfter: filtered.final.tracked.viewed.centre, destinationTotal: filtered.final.total, destinationTier: filtered.final.tier };
    stage = 'empty query and clear recovery';
    const editor = page.locator('.ProseMirror.Cql__ContentEditable');
    await editor.click();
    await page.keyboard.press('Meta+a');
    await page.keyboard.type('l7_cto_no_results_20261001');
    await page.waitForFunction(() => { const state = window.__kupua_store__.getState(); return state.params.query?.includes('l7_cto_no_results_20261001') && !state.loading && state.total === 0; }, null, { timeout: 15000 });
    const empty = await page.evaluate(() => window.__cto.capture());
    await page.getByRole('button', { name: 'Clear search', exact: true }).click();
    await page.waitForFunction(() => { const state = window.__kupua_store__.getState(); return !state.params.query && !state.loading && state.total > 0; }, null, { timeout: 15000 });
    const recovered = await page.evaluate(() => window.__cto.capture());
    result.checks.empty = { noFocus: !empty.hasFocus, noSelection: empty.selected === 0, noError: !empty.error, top: empty.scroll === 0, recovered: recovered.total > 0 && !recovered.error, modeRetained: recovered.mode === 'phantom' };
    result.completed = true;
  } catch (error) {
    result.completed = false;
    result.failedStage = stage;
    result.errorType = error?.name ?? 'Error';
    result.state = await page.evaluate(() => window.__cto?.capture() ?? { harnessAbsent: true });
  } finally {
    await page.keyboard.up('Shift');
    if (await page.evaluate(() => new URL(location.href).searchParams.has('image'))) {
      await page.getByRole('button', { name: 'Back to search', exact: true }).click();
      await page.waitForFunction(() => !new URL(location.href).searchParams.has('image'), null, { timeout: 5000 });
    }
  }
  await page.evaluate(value => window.__cto.records.push({ workflow: value }), result);
  return result;
}

export async function runHistory(page, options) {
  const { tier, view, transport } = options;
  const label = `${transport}/${tier}/${view}/history/${options.settledReload ? 'settled' : 'early'}`;
  const result = { label, checks: {} };
  let stage = 'prepare';
  const deep = async (ratio) => {
    if (tier === 'buffer') await page.waitForFunction(() => { const state = window.__kupua_store__.getState(); return state.results.length === state.total && state.bufferOffset === 0; }, null, { timeout: 15000 });
    const before = await page.evaluate(() => window.__cto.capture());
    const track = await page.getByRole('slider', { name: 'Result set position', exact: true }).boundingBox();
    await page.mouse.click(track.x + track.width / 2, track.y + ratio * track.height);
    await page.waitForFunction(({ previous, tier }) => { const current = window.__cto.capture(); return !current.loading && !current.finding && !!window.__kupua_getViewportAnchorId__() && (tier === 'buffer' ? current.scroll !== previous.scroll : current.seekGeneration > previous.seekGeneration); }, { previous: before, tier }, { timeout: 15000 });
  };
  const reloadProbe = async () => {
    const retained = await page.evaluate(() => ({ path: window.__cto.modulePath, ids: window.__cto.ids, origin: performance.timeOrigin }));
    await page.reload({ waitUntil: 'commit' });
    await page.waitForFunction(previous => performance.timeOrigin !== previous && !!window.__kupua_store__ && typeof window.__kupua_getViewportAnchorId__ === 'function' && document.readyState === 'complete', retained.origin, { timeout: 15000 });
    await page.evaluate(async ({ path, ids }) => { const module = await import(path); await module.install(); window.__cto.ids = ids; }, retained);
  };
  try {
    await page.bringToFront();
    await page.evaluate(({ tier, view }) => window.__cto.prepare(tier, view), { tier, view });
    await deep(0.45);
    await page.evaluate(() => { window.__cto.ids.sourceView = window.__kupua_getViewportAnchorId__(); document.activeElement?.blur(); });
    const source = await page.evaluate(() => window.__cto.capture());
    stage = 'search back-forward';
    await page.getByRole('button', { name: 'Sort descending, click to sort ascending', exact: true }).click();
    await page.waitForFunction(() => { const state = window.__kupua_store__.getState(); return state.params.orderBy === 'uploadTime' && !state.loading && state.sortAroundFocusStatus === null && !!window.__kupua_getViewportAnchorId__(); }, null, { timeout: 15000 });
    await page.evaluate(() => { window.__cto.ids.sortedView = window.__kupua_getViewportAnchorId__(); });
    const sorted = await page.evaluate(() => window.__cto.capture());
    await page.goBack();
    await page.waitForFunction(previous => { const state = window.__kupua_store__.getState(); return window.__kupua_getSearchLifecycle__().started > previous && !state.loading && state.sortAroundFocusStatus === null && state.params.orderBy === undefined; }, sorted.searchStarted, { timeout: 15000 });
    const back = await page.evaluate(label => window.__cto.observe(label), label + '/back');
    await page.goForward();
    await page.waitForFunction(previous => { const state = window.__kupua_store__.getState(); return window.__kupua_getSearchLifecycle__().started > previous && !state.loading && state.sortAroundFocusStatus === null && state.params.orderBy === 'uploadTime'; }, back.final.searchStarted, { timeout: 15000 });
    const forward = await page.evaluate(label => window.__cto.observe(label), label + '/forward');
    result.checks.history = { sourceRank: source.tracked.sourceView.rank, backCentreDelta: back.final.tracked.sourceView.centre - source.tracked.sourceView.centre, backVisible: back.final.tracked.sourceView.intersects, backNoFocus: !back.final.hasFocus, forwardCentreDelta: forward.final.tracked.sortedView.centre - sorted.tracked.sortedView.centre, forwardVisible: forward.final.tracked.sortedView.intersects, forwardNoFocus: !forward.final.hasFocus, rings: forward.final.rings };
    stage = 'list reload with selection';
    await page.evaluate(() => window.__cto.choose('persisted'));
    const tick = page.locator('[data-cto-target="persisted"]');
    await tick.hover();
    await tick.getByRole('button', { name: 'Select image', exact: true }).click();
    await page.waitForFunction(() => { const raw = sessionStorage.getItem('kupua-selection'); return raw && JSON.parse(raw).state.selectedIds.includes(window.__cto.ids.persisted); }, null, { timeout: 5000 });
    const beforeReload = await page.evaluate(() => window.__cto.capture());
    await reloadProbe();
    await page.evaluate(() => window.__cto.ready());
    const reloaded = await page.evaluate(label => window.__cto.observe(label), label + '/list-reload');
    result.checks.listReload = { mode: reloaded.final.mode, selected: reloaded.final.selected, sameSelection: reloaded.final.tracked.persisted.selected, noFocus: !reloaded.final.hasFocus, centreDelta: reloaded.final.tracked.sortedView.centre - beforeReload.tracked.sortedView.centre, rings: reloaded.final.rings };
    await page.getByRole('button', { name: 'Clear selection', exact: true }).click();
    stage = 'original detail reload';
    await deep(0.55);
    const point = await page.evaluate(() => window.__cto.pick('reloadOriginal'));
    const original = await page.evaluate(() => window.__cto.capture());
    await page.mouse.click(point.x, point.y);
    await page.evaluate(() => window.__cto.detailReady());
    await reloadProbe();
    const originalDetail = await page.evaluate(() => window.__cto.detailReady());
    if (options.settledReload) await page.evaluate(() => window.__cto.listBehindDetailReady());
    await page.getByRole('button', { name: 'Back to search', exact: true }).click();
    await page.waitForFunction(() => !new URL(location.href).searchParams.has('image') && !document.querySelector('[data-detail-image-id]'), null, { timeout: 5000 });
    const originalReturn = await page.evaluate(label => window.__cto.observe(label), label + '/original-reload-close');
    result.checks.originalReload = { underlyingLoadingWhenDetailReady: originalDetail.loading, targetLoadedWhenDetailReady: originalDetail.tracked.reloadOriginal.loaded, waitedForList: !!options.settledReload, centreDelta: originalReturn.final.tracked.reloadOriginal.centre - original.tracked.reloadOriginal.centre, visible: originalReturn.final.tracked.reloadOriginal.intersects, storedLast: originalReturn.final.tracked.reloadOriginal.focused, rings: originalReturn.final.rings };
    stage = 'traversed detail reload';
    const entry = await page.evaluate(() => window.__cto.pick('reloadEntry'));
    await page.mouse.click(entry.x, entry.y);
    await page.evaluate(() => window.__cto.detailReady());
    if (!await page.evaluate(() => window.__cto.neighbour(1))) throw new Error('CTO reload neighbour absent');
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => new URL(location.href).searchParams.get('image') === window.__cto.ids.expected && document.querySelector('[data-detail-image-id]')?.dataset.detailImageId === window.__cto.ids.expected, null, { timeout: 5000 });
    await page.evaluate(() => window.__cto.rememberDetail('reloadLast'));
    await reloadProbe();
    const detail = await page.evaluate(() => window.__cto.detailReady());
    if (options.settledReload) await page.evaluate(() => window.__cto.listBehindDetailReady());
    await page.getByRole('button', { name: 'Back to search', exact: true }).click();
    await page.waitForFunction(() => !new URL(location.href).searchParams.has('image') && !document.querySelector('[data-detail-image-id]'), null, { timeout: 5000 });
    const lastReturn = await page.evaluate(label => window.__cto.observe(label), label + '/traversed-reload-close');
    result.checks.traversedReload = { underlyingLoadingWhenDetailReady: detail.loading, targetLoadedWhenDetailReady: detail.tracked.reloadLast.loaded, waitedForList: !!options.settledReload, correctImageAfterReload: detail.tracked.reloadLast.detail && detail.detailMatches, lastVisible: lastReturn.final.tracked.reloadLast.intersects, centre: lastReturn.final.tracked.reloadLast.centre, storedLast: lastReturn.final.tracked.reloadLast.focused, rings: lastReturn.final.rings };
    result.completed = true;
  } catch (error) {
    result.completed = false;
    result.failedStage = stage;
    result.errorType = error?.name ?? 'Error';
    result.state = await page.evaluate(() => window.__cto?.capture() ?? { harnessAbsent: true });
  } finally {
    if (await page.evaluate(() => new URL(location.href).searchParams.has('image'))) {
      await page.getByRole('button', { name: 'Back to search', exact: true }).click();
      await page.waitForFunction(() => !new URL(location.href).searchParams.has('image'), null, { timeout: 5000 });
    }
  }
  await page.evaluate(value => window.__cto?.records.push({ workflow: value }), result);
  return result;
}

export async function runEdges(page, options) {
  const { tier, view, transport } = options;
  const label = `${transport}/${tier}/${view}/edges`;
  const result = { label, states: [] };
  let stage = 'prepare';
  try {
    await page.bringToFront();
    await page.evaluate(({ tier, view }) => window.__cto.prepare(tier, view), { tier, view });
    const explicit = await page.evaluate(() => window.__cto.expectedMode === 'explicit');
    for (const policy of ['none', 'hidden', 'selection']) {
      stage = policy;
      if (policy === 'selection' && explicit) {
        await page.evaluate(() => {
          window.__kupua_store__.getState().setFocusedImageId(null);
          const container = document.querySelector('[aria-label="Image results grid"], [aria-label="Image results table"]');
          container.scrollTop = Math.min(2000, Math.max(0, container.scrollHeight - container.clientHeight - 600));
          container.dispatchEvent(new Event('scroll'));
        });
        await page.waitForFunction(() => window.__cto.capture().scroll > 0 && !!window.__kupua_getViewportAnchorId__());
        const point = await page.evaluate(() => window.__cto.pick('bookmark'));
        await page.mouse.click(point.x, point.y);
        await page.waitForFunction(() => window.__cto.capture().tracked.bookmark.focused);
      }
      if (policy === 'hidden') {
        const point = await page.evaluate(() => window.__cto.pick('bookmark'));
        await page.mouse.click(point.x, point.y);
        if (explicit) {
          await page.waitForFunction(() => window.__cto.capture().tracked.bookmark.focused);
        } else {
          await page.evaluate(() => window.__cto.detailReady());
          await page.getByRole('button', { name: 'Back to search', exact: true }).click();
          await page.waitForFunction(() => !new URL(location.href).searchParams.has('image'));
        }
      }
      if (policy === 'selection') {
        await page.evaluate(() => window.__cto.choose('edgeSelection', 1));
        const tick = page.locator('[data-cto-target="edgeSelection"]');
        await tick.hover();
        await tick.getByRole('button', { name: 'Select image', exact: true }).click();
        await page.waitForFunction(() => window.__cto.capture().selected === 1);
      }
      await page.evaluate(() => document.activeElement?.blur());
      await page.keyboard.press('End');
      await page.waitForFunction(() => { const state = window.__kupua_store__.getState(); const last = state.results.at(-1); if (last) window.__cto.ids.edgeLast = last.id; const current = window.__cto.capture(); return !state.loading && state.bufferOffset + state.results.length === state.total && current.tracked.edgeLast?.full; }, null, { timeout: 15000 });
      const end = await page.evaluate(label => window.__cto.observe(label, 1000), label + '/' + policy + '/end');
      await page.keyboard.press('Home');
      await page.waitForFunction(() => { const state = window.__kupua_store__.getState(); const first = state.results[0]; if (first) window.__cto.ids.edgeFirst = first.id; const current = window.__cto.capture(); return !state.loading && state.bufferOffset === 0 && current.scroll === 0 && current.tracked.edgeFirst?.full; }, null, { timeout: 15000 });
      const home = await page.evaluate(label => window.__cto.observe(label, 1000), label + '/' + policy + '/home');
      result.states.push({ policy, lastFullyVisible: end.final.tracked.edgeLast.full, firstFullyVisible: home.final.tracked.edgeFirst.full, lastFocused: end.final.tracked.edgeLast.focused, firstFocused: home.final.tracked.edgeFirst.focused, focusAtEnd: end.final.hasFocus, focusAtHome: home.final.hasFocus, sameBookmarkAtEnd: end.final.tracked.bookmark?.focused ?? null, sameBookmarkAtHome: home.final.tracked.bookmark?.focused ?? null, selectedAtEnd: end.final.selected, selectedAtHome: home.final.selected, ringsAtEnd: end.final.rings, ringsAtHome: home.final.rings });
    }
    result.completed = true;
  } catch (error) {
    result.completed = false;
    result.failedStage = stage;
    result.errorType = error?.name ?? 'Error';
    result.state = await page.evaluate(() => window.__cto?.capture() ?? { harnessAbsent: true });
  } finally {
    if (await page.evaluate(() => new URL(location.href).searchParams.has('image'))) {
      await page.getByRole('button', { name: 'Back to search', exact: true }).click();
      await page.waitForFunction(() => !new URL(location.href).searchParams.has('image'), null, { timeout: 5000 });
    }
  }
  await page.evaluate(value => window.__cto.records.push({ workflow: value }), result);
  return result;
}

export async function runBufferLifetime(page, options) {
  const { tier, view, transport } = options;
  const label = `${transport}/${tier}/${view}/buffer-lifetime`;
  const result = { label, checks: {} };
  let stage = 'prepare';
  const state = () => page.evaluate(() => {
    const current = window.__kupua_store__.getState();
    const sample = window.__cto.capture();
    return {
      ...sample,
      prependGeneration: current._prependGeneration,
      forwardEvictGeneration: current._forwardEvictGeneration,
      lastForwardEvictCount: current._lastForwardEvictCount,
      bufferEnd: current.bufferOffset + current.results.length,
    };
  });
  try {
    await page.bringToFront();
    await page.evaluate(({ tier, view }) => window.__cto.prepare(tier, view), { tier, view });
    if (tier === 'buffer') {
      const sample = await state();
      result.checks.buffer = { fullyResident: sample.loaded === sample.total, offsetZero: sample.offset === 0, noTemporaryEdge: sample.bufferEnd === sample.total };
      result.completed = true;
      await page.evaluate(value => window.__cto.records.push({ workflow: value }), result);
      return result;
    }

    const explicit = await page.evaluate(() => window.__cto.expectedMode === 'explicit');
    const opening = await page.evaluate(() => window.__cto.pick('lifetimeBookmark'));
    await page.mouse.click(opening.x, opening.y);
    if (explicit) {
      await page.waitForFunction(() => window.__cto.capture().tracked.lifetimeBookmark.focused);
    } else {
      await page.evaluate(() => window.__cto.detailReady());
      await page.getByRole('button', { name: 'Back to search', exact: true }).click();
      await page.waitForFunction(() => !new URL(location.href).searchParams.has('image'));
    }
    await page.evaluate(() => window.__cto.choose('lifetimeSelection', 1));
    const tick = page.locator('[data-cto-target="lifetimeSelection"]');
    await tick.hover();
    await tick.getByRole('button', { name: 'Select image', exact: true }).click();
    await page.waitForFunction(() => window.__cto.capture().selected === 1);

    stage = 'scrubber landing';
    const beforeSeek = await state();
    const track = await page.getByRole('slider', { name: 'Result set position', exact: true }).boundingBox();
    await page.mouse.click(track.x + track.width / 2, track.y + track.height * 0.04);
    await page.waitForFunction(previous => {
      const current = window.__kupua_store__.getState();
      return current._seekGeneration > previous.seekGeneration && !current.loading && !current._extendForwardInFlight && !current._extendBackwardInFlight;
    }, beforeSeek, { timeout: 15000 });
    await page.waitForTimeout(250);
    const landed = await state();
    const region = page.getByRole('region', { name: view === 'grid' ? 'Image results grid' : 'Image results table', exact: true });
    const bounds = await region.boundingBox();
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);

    if (tier === 'indexed') {
      stage = 'indexed global paging';
      await page.evaluate(() => { window.__cto.ids.indexedStart = window.__kupua_getViewportAnchorId__(); });
      const start = await state();
      for (let step = 0; step < 12; step++) {
        await page.mouse.wheel(0, view === 'grid' ? 1800 : 700);
        await page.waitForTimeout(100);
      }
      await page.waitForFunction(previous => {
        const current = window.__kupua_store__.getState();
        return current.results.length > previous.loaded && !current.loading && !current._extendForwardInFlight;
      }, start, { timeout: 15000 });
      const forward = await state();
      for (let step = 0; step < 12; step++) {
        await page.mouse.wheel(0, view === 'grid' ? -1800 : -700);
        await page.waitForTimeout(100);
      }
      await page.waitForFunction(() => !window.__kupua_store__.getState().loading && !!window.__kupua_getViewportAnchorId__());
      const back = await state();
      result.checks.indexed = {
        globalRange: landed.maxScroll > 100000,
        pagesGrew: forward.loaded > start.loaded,
        noForwardEviction: forward.forwardEvictGeneration === start.forwardEvictGeneration,
        movedForward: forward.scroll > start.scroll,
        movedBack: back.scroll < forward.scroll,
        bookmarkRetained: back.tracked.lifetimeBookmark.focused,
        selectionRetained: back.tracked.lifetimeSelection.selected,
        noRings: back.rings === 0,
      };
      result.completed = true;
      await page.evaluate(value => window.__cto.records.push({ workflow: value }), result);
      return result;
    }

    stage = 'seek delayed forward edge';
    await page.evaluate(() => window.__cto.holdNext('cursor'));
    for (let step = 0; step < 24 && !await page.evaluate(() => window.__cto.gate.waiting); step++) {
      await page.mouse.wheel(0, view === 'grid' ? 2400 : 1200);
      await page.waitForTimeout(100);
    }
    await page.waitForFunction(() => window.__cto.gate.waiting, null, { timeout: 10000 });
    await page.evaluate(() => { window.__cto.ids.forwardBoundary = window.__kupua_getViewportAnchorId__(); });
    const heldForward = await state();
    const forwardWatch = await page.evaluate(label => window.__cto.observe(label, 600), label + '/forward-held');
    await page.evaluate(() => window.__cto.release());
    await page.waitForFunction(previous => {
      const current = window.__kupua_store__.getState();
      return !current._extendForwardInFlight && !current.loading && current.bufferOffset + current.results.length > previous.bufferEnd;
    }, heldForward, { timeout: 15000 });
    const releasedForward = await page.evaluate(label => window.__cto.observe(label, 1000), label + '/forward-released');

    stage = 'seek forward eviction';
    for (let step = 0; step < 50; step++) {
      const current = await state();
      if (current.forwardEvictGeneration > landed.forwardEvictGeneration) break;
      await page.mouse.wheel(0, view === 'grid' ? 3000 : 1600);
      await page.waitForTimeout(150);
    }
    await page.waitForFunction(previous => {
      const current = window.__kupua_store__.getState();
      return current._forwardEvictGeneration > previous.forwardEvictGeneration && !current._extendForwardInFlight && !current.loading;
    }, landed, { timeout: 15000 });
    const evicted = await state();

    stage = 'seek delayed backward edge';
    await page.waitForTimeout(250);
    await page.evaluate(() => window.__cto.holdNext('cursor'));
    for (let step = 0; step < 30 && !await page.evaluate(() => window.__cto.gate.waiting); step++) {
      await page.mouse.wheel(0, view === 'grid' ? -3000 : -1600);
      await page.waitForTimeout(100);
    }
    await page.waitForFunction(() => window.__cto.gate.waiting, null, { timeout: 10000 });
    await page.evaluate(() => { window.__cto.ids.backwardBoundary = window.__kupua_getViewportAnchorId__(); });
    const heldBackward = await state();
    const backwardWatch = await page.evaluate(label => window.__cto.observe(label, 600), label + '/backward-held');
    await page.evaluate(() => window.__cto.release());
    await page.waitForFunction(previous => {
      const current = window.__kupua_store__.getState();
      return current._prependGeneration > previous.prependGeneration && current.bufferOffset < previous.offset && !current._extendBackwardInFlight && !current.loading;
    }, heldBackward, { timeout: 15000 });
    const releasedBackward = await page.evaluate(label => window.__cto.observe(label, 1000), label + '/backward-released');
    result.checks.seek = {
      temporaryForwardEdge: heldForward.bufferEnd < heldForward.total,
      forwardHeldStable: forwardWatch.changes === 0,
      forwardAnchorCentreDelta: releasedForward.final.tracked.forwardBoundary.centre - heldForward.tracked.forwardBoundary.centre,
      forwardProgress: releasedForward.final.offset + releasedForward.final.loaded > heldForward.bufferEnd,
      evictionOccurred: evicted.forwardEvictGeneration > landed.forwardEvictGeneration && evicted.offset > landed.offset,
      evictedCount: evicted.lastForwardEvictCount,
      temporaryBackwardEdge: heldBackward.offset > 0,
      backwardHeldStable: backwardWatch.changes === 0,
      backwardAnchorCentreDelta: releasedBackward.final.tracked.backwardBoundary.centre - heldBackward.tracked.backwardBoundary.centre,
      prependOccurred: releasedBackward.final.offset < heldBackward.offset,
      bookmarkRetained: releasedBackward.final.tracked.lifetimeBookmark.focused,
      selectionRetained: releasedBackward.final.tracked.lifetimeSelection.selected,
      noRings: releasedBackward.final.rings === 0,
    };
    result.completed = true;
  } catch (error) {
    result.completed = false;
    result.failedStage = stage;
    result.errorType = error?.name ?? 'Error';
    result.state = await page.evaluate(() => window.__cto?.capture() ?? { harnessAbsent: true });
  } finally {
    await page.evaluate(() => window.__cto?.release?.());
    if (await page.evaluate(() => new URL(location.href).searchParams.has('image'))) {
      await page.getByRole('button', { name: 'Back to search', exact: true }).click();
      await page.waitForFunction(() => !new URL(location.href).searchParams.has('image'));
    }
  }
  await page.evaluate(value => window.__cto?.records.push({ workflow: value }), result);
  return result;
}

export async function runLowOffsetReset(page, options) {
  const { view, transport } = options;
  const label = `${transport}/seek/${view}/low-offset-reset`;
  const result = { label, checks: {} };
  let stage = 'prepare';
  const state = () => page.evaluate(() => {
    const current = window.__kupua_store__.getState();
    const sample = window.__cto.capture();
    return { ...sample, prependGeneration: current._prependGeneration, forwardEvictGeneration: current._forwardEvictGeneration, bufferEnd: current.bufferOffset + current.results.length };
  });
  try {
    await page.bringToFront();
    await page.evaluate(({ view }) => window.__cto.prepare('seek', view), { view });
    stage = 'low seek';
    const beforeSeek = await state();
    await page.evaluate(() => window.__kupua_store__.getState().seek(600));
    await page.waitForFunction(previous => {
      const current = window.__kupua_store__.getState();
      return current._seekGeneration > previous && !current.loading && !current._extendForwardInFlight && !current._extendBackwardInFlight
        && current.bufferOffset > 0 && current.bufferOffset < 1000;
    }, beforeSeek.seekGeneration, { timeout: 15000 });
    await page.waitForTimeout(250);
    const explicit = await page.evaluate(() => window.__cto.expectedMode === 'explicit');
    const opening = await page.evaluate(() => window.__cto.pick('lowBookmark'));
    await page.mouse.click(opening.x, opening.y);
    if (explicit) {
      await page.waitForFunction(() => window.__cto.capture().tracked.lowBookmark.focused);
    } else {
      await page.evaluate(() => window.__cto.detailReady());
      await page.keyboard.press('Backspace');
      await page.waitForFunction(() => !new URL(location.href).searchParams.has('image'));
    }
    const landed = await state();
    const region = page.getByRole('region', { name: view === 'grid' ? 'Image results grid' : 'Image results table', exact: true });
    const bounds = await region.boundingBox();
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);

    stage = 'forward eviction';
    for (let step = 0; step < 60; step++) {
      const current = await state();
      if (current.forwardEvictGeneration > landed.forwardEvictGeneration) break;
      await page.mouse.wheel(0, view === 'grid' ? 3000 : 1600);
      await page.waitForTimeout(150);
    }
    await page.waitForFunction(previous => {
      const current = window.__kupua_store__.getState();
      return current._forwardEvictGeneration > previous && current.bufferOffset > 0 && !current._extendForwardInFlight && !current.loading;
    }, landed.forwardEvictGeneration, { timeout: 15000 });
    const evicted = await state();

    stage = 'gated prepends to zero';
    const prependSteps = [];
    let finalHeld = null;
    let finalHeldWatch = null;
    let finalReleased = null;
    for (let cycle = 0; cycle < 6; cycle++) {
      const before = await state();
      if (before.offset === 0) break;
      await page.evaluate(() => window.__cto.holdNext('any'));
      for (let step = 0; step < 30 && !await page.evaluate(() => window.__cto.gate.waiting); step++) {
        await page.mouse.wheel(0, view === 'grid' ? -3000 : -1600);
        await page.waitForTimeout(100);
      }
      await page.waitForFunction(() => window.__cto.gate.waiting, null, { timeout: 15000 });
      await page.evaluate(() => { window.__cto.ids.zeroBoundary = window.__kupua_getViewportAnchorId__(); });
      const held = await state();
      const heldWatch = await page.evaluate(label => window.__cto.observe(label, 600), label + '/held-' + cycle);
      await page.evaluate(() => window.__cto.release());
      await page.waitForFunction(previous => {
        const current = window.__kupua_store__.getState();
        return current._prependGeneration > previous.generation && current.bufferOffset < previous.offset
          && !current._extendBackwardInFlight && !current.loading;
      }, { generation: held.prependGeneration, offset: held.offset }, { timeout: 15000 });
      const released = await page.evaluate(label => window.__cto.observe(label, 1000), label + '/released-' + cycle);
      prependSteps.push({ from: held.offset, to: released.final.offset });
      if (released.final.offset === 0) {
        finalHeld = held;
        finalHeldWatch = heldWatch;
        finalReleased = released;
        break;
      }
    }
    if (!finalHeld || !finalHeldWatch || !finalReleased) throw new Error('CTO gated prepends did not reach buffer offset zero');
    result.checks.reset = {
      soughtOffset: landed.offset,
      evictedOffset: evicted.offset,
      prependSteps,
      heldStable: finalHeldWatch.changes === 0,
      reachedZero: finalReleased.final.offset === 0,
      anchorCentreDelta: finalReleased.final.tracked.zeroBoundary.centre - finalHeld.tracked.zeroBoundary.centre,
      anchorVisible: finalReleased.final.tracked.zeroBoundary.intersects,
      bookmarkRetained: finalReleased.final.tracked.lowBookmark.focused,
      noRings: finalReleased.final.rings === 0,
    };
    result.completed = true;
  } catch (error) {
    result.completed = false;
    result.failedStage = stage;
    result.errorType = error?.name ?? 'Error';
    result.state = await page.evaluate(() => window.__cto?.capture() ?? { harnessAbsent: true });
  } finally {
    await page.evaluate(() => window.__cto?.release?.());
    if (await page.evaluate(() => new URL(location.href).searchParams.has('image'))) {
      await page.keyboard.press('Backspace');
      await page.waitForFunction(() => !new URL(location.href).searchParams.has('image'));
    }
  }
  await page.evaluate(value => window.__cto?.records.push({ workflow: value }), result);
  return result;
}

export async function runAiTransitions(page, options) {
  const { tier, view, transport } = options;
  const label = `${transport}/${tier}/${view}/ai`;
  const result = { label, checks: {} };
  let stage = 'prepare';
  try {
    await page.bringToFront();
    await page.evaluate(({ tier, view }) => window.__cto.prepare(tier, view), { tier, view });
    const explicit = await page.evaluate(() => window.__cto.expectedMode === 'explicit');
    if (!await page.getByRole('button', { name: 'Enable AI image search', exact: true }).count()) {
      return { label, blocked: 'ai-search-unavailable' };
    }
    const opening = await page.evaluate(() => window.__cto.pick('aiSource'));
    await page.mouse.click(opening.x, opening.y);
    if (explicit) {
      await page.waitForFunction(() => window.__cto.capture().tracked.aiSource.focused);
    } else {
      await page.evaluate(() => window.__cto.detailReady());
      await page.getByRole('button', { name: 'Back to search', exact: true }).click();
      await page.waitForFunction(() => !new URL(location.href).searchParams.has('image'));
    }
    const source = await page.evaluate(() => window.__cto.capture());

    stage = 'AI entry';
    await page.getByRole('button', { name: 'Enable AI image search', exact: true }).click();
    const input = page.getByRole('searchbox', { name: 'AI image search query', exact: true });
    await input.fill('a city street at night');
    await page.waitForFunction(previous => {
      const current = window.__kupua_store__.getState();
      const lifecycle = window.__kupua_getSearchLifecycle__();
      return current.params.aiQuery === 'a city street at night'
        && lifecycle.started > previous
        && lifecycle.settled === lifecycle.started
        && !current.loading;
    }, source.searchStarted, { timeout: 20000 });
    const entered = await page.evaluate(label => window.__cto.observe(label, 1000), label + '/entered');
    if (entered.final.error || entered.final.total === 0) throw new Error('CTO AI entry produced no usable results');

    stage = 'AI hidden bookmark and re-sort';
    const aiPoint = await page.evaluate(() => window.__cto.pick('aiBookmark'));
    await page.mouse.click(aiPoint.x, aiPoint.y);
    if (explicit) {
      await page.waitForFunction(() => window.__cto.capture().tracked.aiBookmark.focused);
    } else {
      await page.evaluate(() => window.__cto.detailReady());
      await page.getByRole('button', { name: 'Back to search', exact: true }).click();
      await page.waitForFunction(() => !new URL(location.href).searchParams.has('image'));
    }
    const beforeSort = await page.evaluate(() => window.__cto.capture());
    await page.getByRole('button', { name: 'Sort descending, click to sort ascending', exact: true }).click();
    await page.waitForFunction(() => {
      const current = window.__kupua_store__.getState();
      const lifecycle = window.__kupua_getSearchLifecycle__();
      return current.params.orderBy === 'relevance' && !current.loading && lifecycle.settled === lifecycle.started;
    }, null, { timeout: 15000 });
    const sorted = await page.evaluate(label => window.__cto.observe(label, 1000), label + '/sorted');

    stage = 'AI exit';
    await page.getByRole('button', { name: 'Disable AI image search', exact: true }).click();
    await page.waitForFunction(({ tier }) => {
      const current = window.__kupua_store__.getState();
      const totalMatches = tier === 'buffer' ? current.total > 0 && current.total <= 1000
        : tier === 'indexed' ? current.total > 1000 && current.total <= 65000
          : current.total > 65000;
      return !current.params.aiQuery && !current.loading && current.sortAroundFocusStatus === null && totalMatches;
    }, { tier }, { timeout: 20000 });
    const exited = await page.evaluate(label => window.__cto.observe(label, 1000), label + '/exited');
    result.checks.entry = {
      sourceTier: source.tier,
      sourceView: source.view,
      sourceBookmarkFocusedBefore: source.tracked.aiSource.focused,
      aiTotal: entered.final.total,
      aiTier: entered.final.tier,
      sourceBookmarkFocusedAfter: entered.final.tracked.aiSource.focused,
      sourceBookmarkLoadedAfter: entered.final.tracked.aiSource.loaded,
      top: entered.final.scroll === 0,
      rings: entered.final.rings,
    };
    result.checks.sort = {
      bookmarkFocusedBefore: beforeSort.tracked.aiBookmark.focused,
      bookmarkRetained: sorted.final.tracked.aiBookmark.focused,
      bookmarkLoaded: sorted.final.tracked.aiBookmark.loaded,
      bookmarkVisible: sorted.final.tracked.aiBookmark.intersects,
      scroll: sorted.final.scroll,
      rings: sorted.final.rings,
    };
    result.checks.exit = {
      destinationTier: exited.final.tier,
      destinationView: exited.final.view,
      aiBookmarkFocused: exited.final.tracked.aiBookmark.focused,
      aiBookmarkLoaded: exited.final.tracked.aiBookmark.loaded,
      aiBookmarkVisible: exited.final.tracked.aiBookmark.intersects,
      aiBookmarkCentre: exited.final.tracked.aiBookmark.centre,
      sourceBookmarkFocused: exited.final.tracked.aiSource.focused,
      sourceBookmarkLoaded: exited.final.tracked.aiSource.loaded,
      scroll: exited.final.scroll,
      rings: exited.final.rings,
      error: exited.final.error,
    };
    result.completed = true;
  } catch (error) {
    result.completed = false;
    result.failedStage = stage;
    result.errorType = error?.name ?? 'Error';
    result.state = await page.evaluate(() => window.__cto?.capture() ?? { harnessAbsent: true });
  } finally {
    if (await page.evaluate(() => new URL(location.href).searchParams.has('image'))) {
      await page.getByRole('button', { name: 'Back to search', exact: true }).click();
      await page.waitForFunction(() => !new URL(location.href).searchParams.has('image'));
    }
    if (await page.getByRole('button', { name: 'Disable AI image search', exact: true }).count()) {
      await page.getByRole('button', { name: 'Disable AI image search', exact: true }).click();
      await page.waitForFunction(() => !window.__kupua_store__.getState().params.aiQuery);
    }
  }
  await page.evaluate(value => window.__cto?.records.push({ workflow: value }), result);
  return result;
}

export async function runInterruptions(page, options) {
  const { kind, transport, view = 'grid' } = options;
  const label = `${transport}/${kind}/${view}`;
  const result = { label, checks: {} };
  let stage = 'prepare';
  let failureHandler = null;
  let failurePattern = null;
  try {
    await page.bringToFront();
    const explicit = await page.evaluate(() => window.__cto.expectedMode === 'explicit');
    if (kind === 'supersession') {
      await page.evaluate(() => window.__cto.prepare('buffer', 'table'));
      const opening = await page.evaluate(() => window.__cto.pick('supersededBookmark'));
      await page.mouse.click(opening.x, opening.y);
      if (explicit) {
        await page.waitForFunction(() => window.__cto.capture().tracked.supersededBookmark.focused);
      } else {
        await page.evaluate(() => window.__cto.detailReady());
        await page.getByRole('button', { name: 'Back to search', exact: true }).click();
        await page.waitForFunction(() => !new URL(location.href).searchParams.has('image'));
      }
      await page.evaluate(() => window.__cto.holdNext('first'));
      stage = 'held first-page sort';
      const before = await page.evaluate(() => window.__cto.capture());
      await page.getByRole('button', { name: 'Sort descending, click to sort ascending', exact: true }).click();
      await page.waitForFunction(() => window.__cto.gate.waiting, null, { timeout: 15000 });
      const pending = await page.evaluate(() => window.__cto.capture());
      await page.locator('header[role="toolbar"] a[title*="Grid"]').click();
      await page.waitForFunction(previous => {
        const current = window.__kupua_store__.getState();
        const lifecycle = window.__kupua_getSearchLifecycle__();
        return lifecycle.started > previous && lifecycle.settled === lifecycle.started
          && !current.loading && !current.params.query
          && (current.params.orderBy === undefined || current.params.orderBy === '-uploadTime');
      }, pending.searchStarted, { timeout: 20000 });
      const destination = await page.evaluate(() => window.__cto.capture());
      await page.evaluate(() => window.__cto.release());
      await page.waitForFunction(() => {
        const current = window.__kupua_store__.getState();
        const lifecycle = window.__kupua_getSearchLifecycle__();
        return !current.loading && lifecycle.settled === lifecycle.started;
      });
      const after = await page.evaluate(label => window.__cto.observe(label, 1000), label + '/released');
      const gate = await page.evaluate(() => ({ aborted: window.__cto.gate.aborted }));
      result.checks.supersession = {
        pendingGeneration: pending.searchStarted > before.searchStarted,
        oldSignalAborted: gate.aborted,
        destinationTier: destination.tier,
        destinationTotal: destination.total,
        intentUnchanged: after.final.total === destination.total && after.final.tier === destination.tier,
        oldBookmarkCleared: !after.final.tracked.supersededBookmark.focused,
        noError: !after.final.error,
        noRings: after.final.rings === 0,
      };
    } else if (kind === 'sort-density') {
      await page.evaluate(() => window.__cto.prepare('indexed', 'grid'));
      const opening = await page.evaluate(() => window.__cto.pick('cancelBookmark'));
      await page.mouse.click(opening.x, opening.y);
      if (explicit) {
        await page.waitForFunction(() => window.__cto.capture().tracked.cancelBookmark.focused);
      } else {
        await page.evaluate(() => window.__cto.detailReady());
        await page.getByRole('button', { name: 'Back to search', exact: true }).click();
        await page.waitForFunction(() => !new URL(location.href).searchParams.has('image'));
      }
      stage = 'sort then density';
      const before = await page.evaluate(() => window.__cto.capture());
      await page.getByRole('button', { name: 'Sort descending, click to sort ascending', exact: true }).click();
      await page.waitForFunction(previous => {
        const current = window.__cto.capture();
        return current.searchStarted > previous && current.loading;
      }, before.searchStarted, { timeout: 5000 });
      const pending = await page.evaluate(() => window.__cto.capture());
      await page.getByRole('button', { name: 'Switch to table view', exact: true }).click();
      const watched = await page.evaluate(label => window.__cto.observe(label, 5000), label + '/watch');
      result.checks.sortDensity = {
        started: watched.final.searchStarted,
        settled: watched.final.searchSettled,
        loading: watched.final.loading,
        retainedData: watched.final.total === before.total && watched.final.loaded > 0,
        destinationView: watched.final.view,
        bookmarkRetained: watched.final.tracked.cancelBookmark.focused,
        rings: watched.final.rings,
        pendingGeneration: pending.searchStarted,
      };
      await page.locator('header[role="toolbar"] a[title*="Grid"]').click();
      await page.waitForFunction(() => {
        const current = window.__kupua_store__.getState();
        const lifecycle = window.__kupua_getSearchLifecycle__();
        return !current.loading && lifecycle.settled === lifecycle.started && !current.error;
      }, null, { timeout: 20000 });
      result.checks.sortDensity.recovered = true;
    } else if (kind === 'failed-search') {
      await page.evaluate(view => window.__cto.prepare('indexed', view), view);
      const opening = await page.evaluate(() => window.__cto.pick('failureBookmark'));
      await page.mouse.click(opening.x, opening.y);
      if (explicit) {
        await page.waitForFunction(() => window.__cto.capture().tracked.failureBookmark.focused);
      } else {
        await page.evaluate(() => window.__cto.detailReady());
        await page.getByRole('button', { name: 'Back to search', exact: true }).click();
        await page.waitForFunction(() => !new URL(location.href).searchParams.has('image'));
      }
      let failures = 0;
      failureHandler = async route => {
        if (failures++ === 0) await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
        else await route.fallback();
      };
      failurePattern = transport.startsWith('api') ? '**/api/images/search-after' : /\/es\/(?:[^/]+\/)?_search(?:\?|$)/;
      await page.route(failurePattern, failureHandler);
      stage = 'failed first page';
      const before = await page.evaluate(() => window.__cto.capture());
      await page.getByRole('button', { name: 'Sort descending, click to sort ascending', exact: true }).click();
      await page.waitForFunction(previous => {
        const current = window.__cto.capture();
        return current.searchStarted > previous && !current.loading;
      }, before.searchStarted, { timeout: 15000 });
      const failed = await page.evaluate(() => window.__cto.capture());
      await page.unroute(failurePattern, failureHandler);
      failureHandler = null;
      failurePattern = null;
      await page.locator('header[role="toolbar"] a[title*="Grid"]').click();
      await page.waitForFunction(() => {
        const current = window.__kupua_store__.getState();
        return !current.loading && !current.error && current.total > 0;
      }, null, { timeout: 20000 });
      const recovered = await page.evaluate(() => window.__cto.capture());
      result.checks.failure = {
        intercepted: failures > 0,
        oldDataRetained: failed.loaded > 0 && failed.total === before.total,
        errorPublished: failed.error,
        bookmarkRetainedOnFailure: failed.tracked.failureBookmark.focused,
        recovered: !recovered.error && recovered.total > 0,
        recoveredNoFocus: !recovered.hasFocus,
        rings: recovered.rings,
      };
    } else if (kind === 'pending-traversal') {
      await page.evaluate(({ view }) => window.__cto.prepare('seek', view), { view });
      stage = 'deep seek setup';
      const beforeSeek = await page.evaluate(() => window.__cto.capture());
      await page.evaluate(() => {
        const state = window.__kupua_store__.getState();
        void state.seek(Math.floor(state.total * 0.4));
      });
      await page.waitForFunction(previous => {
        const current = window.__kupua_store__.getState();
        return current._seekGeneration > previous && current.bufferOffset > 0 && !current.loading
          && !current._extendForwardInFlight && !current._extendBackwardInFlight;
      }, beforeSeek.seekGeneration, { timeout: 15000 });
      await page.waitForTimeout(250);
      const region = page.getByRole('region', { name: view === 'grid' ? 'Image results grid' : 'Image results table', exact: true });
      const bounds = await region.boundingBox();
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      await page.evaluate(view => {
        const container = document.querySelector('[aria-label="Image results grid"], [aria-label="Image results table"]');
        const max = container.scrollHeight - container.clientHeight;
        container.scrollTop = Math.max(0, max - (view === 'grid' ? 1000 : 600));
        container.dispatchEvent(new Event('scroll'));
      }, view);
      await page.waitForTimeout(250);
      await page.evaluate(() => window.__cto.holdNext('any'));
      stage = 'arm edge request';
      for (let step = 0; step < 24 && !await page.evaluate(() => window.__cto.gate.called); step++) {
        await page.mouse.wheel(0, view === 'grid' ? 2400 : 1200);
        await page.waitForTimeout(100);
      }
      if (!await page.evaluate(() => window.__cto.gate.called)) {
        await page.evaluate(() => { void window.__kupua_store__.getState().extendForward(); });
      }
      await page.waitForFunction(() => window.__cto.gate.called, null, { timeout: 5000 });
      stage = 'await edge response';
      await page.waitForFunction(() => window.__cto.gate.responseReady && window.__cto.gate.waiting, null, { timeout: 15000 });
      stage = 'render edge origin';
      await page.evaluate(() => {
        const container = document.querySelector('[aria-label="Image results grid"], [aria-label="Image results table"]');
        container.scrollTop = container.scrollHeight;
        container.dispatchEvent(new Event('scroll'));
      });
      await page.waitForFunction(() => {
        const current = window.__kupua_store__.getState();
        const container = document.querySelector('[aria-label="Image results grid"], [aria-label="Image results table"]');
        const bounds = container.getBoundingClientRect();
        const header = container.querySelector('[data-table-header]')?.getBoundingClientRect();
        const usableTop = Math.max(bounds.top, header?.bottom ?? bounds.top);
        return Array.from(container.querySelectorAll('[data-image-id]')).some(element => {
          const rect = element.getBoundingClientRect();
          return current.imagePositions.has(element.dataset.imageId) && rect.bottom > usableTop && rect.top < bounds.bottom;
        });
      }, null, { timeout: 5000 });
      const point = await page.evaluate(() => {
        const current = window.__kupua_store__.getState();
        const container = document.querySelector('[aria-label="Image results grid"], [aria-label="Image results table"]');
        const bounds = container.getBoundingClientRect();
        const header = container.querySelector('[data-table-header]')?.getBoundingClientRect();
        const usableTop = Math.max(bounds.top, header?.bottom ?? bounds.top);
        const candidates = Array.from(container.querySelectorAll('[data-image-id]')).flatMap(element => {
          const position = current.imagePositions.get(element.dataset.imageId);
          const rect = element.getBoundingClientRect();
          return position !== undefined && rect.bottom > usableTop && rect.top < bounds.bottom
            ? [{ element, position, rect }]
            : [];
        }).sort((left, right) => right.position - left.position);
        const candidate = candidates[0];
        if (!candidate) throw new Error('CTO visible loaded edge image is unavailable');
        window.__cto.ids.edgeEntry = candidate.element.dataset.imageId;
        return {
          x: Math.max(bounds.left + 100, Math.min(bounds.right - 10, candidate.rect.left + Math.min(candidate.rect.width / 2, 180))),
          y: Math.max(usableTop + 5, Math.min(bounds.bottom - 5, candidate.rect.top + Math.min(candidate.rect.height / 2, 90))),
        };
      });
      stage = 'open edge detail';
      await page.mouse.click(point.x, point.y);
      if (explicit) {
        await page.waitForFunction(() => window.__cto.capture().tracked.edgeEntry.focused);
        await page.keyboard.press('Enter');
      }
      await page.evaluate(() => window.__cto.detailReady());
      stage = 'reach loaded edge';
      for (let step = 0; step < 50; step++) {
        const atEnd = await page.evaluate(() => {
          const state = window.__kupua_store__.getState();
          return new URL(location.href).searchParams.get('image') === state.results.at(-1)?.id;
        });
        if (atEnd) break;
        if (!await page.evaluate(() => window.__cto.neighbour(1))) throw new Error('CTO loaded successor absent before buffer tail');
        await page.keyboard.press('ArrowRight');
        await page.waitForFunction(() => new URL(location.href).searchParams.get('image') === window.__cto.ids.expected
          && document.querySelector('[data-detail-image-id]')?.dataset.detailImageId === window.__cto.ids.expected);
      }
      const atLoadedEnd = await page.evaluate(() => {
        const state = window.__kupua_store__.getState();
        return new URL(location.href).searchParams.get('image') === state.results.at(-1)?.id;
      });
      if (!atLoadedEnd) throw new Error('CTO did not reach the loaded buffer tail');
      await page.evaluate(() => window.__cto.rememberDetail('traversalOrigin'));
      const opened = await page.evaluate(() => window.__cto.capture());
      stage = 'pend traversal';
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(200);
      const pending = await page.evaluate(() => window.__cto.capture());
      stage = 'close pending detail';
      await page.keyboard.press('Backspace');
      await page.waitForFunction(() => !new URL(location.href).searchParams.has('image'));
      stage = 'release edge response';
      const gate = await page.evaluate(() => ({ called: window.__cto.gate.called, responseReady: window.__cto.gate.responseReady, cursor: window.__cto.gate.cursor }));
      await page.evaluate(() => window.__cto.release());
      await page.waitForFunction(previous => {
        const current = window.__kupua_store__.getState();
        return !current._extendForwardInFlight && !current.loading && current.bufferOffset + current.results.length > previous;
      }, opened.offset + opened.loaded, { timeout: 15000 });
      const released = await page.evaluate(label => window.__cto.observe(label, 1000), label + '/released');
      result.checks.traversal = {
        pendingStayedOnOrigin: pending.tracked.traversalOrigin.detail,
        closedBeforeRelease: !released.final.detailOpen,
        didNotReopen: !released.final.detailOpen && !released.final.fullscreen,
        originStored: released.final.tracked.traversalOrigin.focused,
        noRing: released.final.rings === 0,
        dataProgressed: released.final.offset + released.final.loaded > opened.offset + opened.loaded,
        requestCalled: gate.called,
        responseHeld: gate.responseReady,
        cursorRequest: gate.cursor,
      };
    } else {
      throw new Error('Unknown CTO interruption kind');
    }
    result.completed = true;
  } catch (error) {
    result.completed = false;
    result.failedStage = stage;
    result.errorType = error?.name ?? 'Error';
    result.errorMessage = String(error?.message ?? error).replace(/[0-9a-f]{8}-[0-9a-f-]{20,}/gi, '[id]').slice(0, 240);
    result.state = await page.evaluate(() => window.__cto?.capture() ?? { harnessAbsent: true });
  } finally {
    if (failureHandler && failurePattern) await page.unroute(failurePattern, failureHandler);
    await page.evaluate(() => window.__cto?.release?.());
    if (await page.evaluate(() => new URL(location.href).searchParams.has('image'))) {
      await page.getByRole('button', { name: 'Back to search', exact: true }).click();
      await page.waitForFunction(() => !new URL(location.href).searchParams.has('image'));
    }
  }
  await page.evaluate(value => window.__cto?.records.push({ workflow: value }), result);
  return result;
}

export async function runHomeScrubberCancellation(page, options) {
  const { transport } = options;
  const label = `${transport}/home-scrubber-cancellation`;
  const result = { label, checks: {} };
  let stage = 'prepare';
  const readThumb = () => page.evaluate(() => {
    const state = window.__kupua_store__.getState();
    const slider = document.querySelector('[aria-label="Result set position"]');
    const thumb = document.querySelector('[data-scrubber-thumb]');
    const trackRect = slider?.getBoundingClientRect();
    const thumbRect = thumb?.getBoundingClientRect();
    return {
      aria: Number(slider?.getAttribute('aria-valuenow') ?? 0),
      cssTop: Number.parseFloat(thumb?.style.top || '0'),
      renderedTop: trackRect && thumbRect ? thumbRect.top - trackRect.top : null,
      offset: state.bufferOffset,
      loaded: state.results.length,
      total: state.total,
      seekGeneration: state._seekGeneration,
      lifecycle: window.__kupua_getSearchLifecycle__(),
      orderBy: state.params.orderBy ?? null,
    };
  });
  try {
    await page.bringToFront();
    await page.evaluate(() => window.__cto.prepare('seek', 'table'));
    stage = 'entry A deep seek';
    const first = await page.evaluate(() => window.__cto.capture());
    await page.evaluate(() => {
      const state = window.__kupua_store__.getState();
      void state.seek(Math.floor(state.total * 0.35));
    });
    await page.waitForFunction(previous => {
      const state = window.__kupua_store__.getState();
      return state._seekGeneration > previous && state.bufferOffset > 0 && !state.loading;
    }, first.seekGeneration, { timeout: 15000 });
    const a = await readThumb();

    stage = 'entry B push and deep seek';
    await page.getByRole('button', { name: 'Sort descending, click to sort ascending', exact: true }).click();
    await page.waitForFunction(() => {
      const state = window.__kupua_store__.getState();
      return state.params.orderBy === 'uploadTime' && !state.loading && state.sortAroundFocusStatus === null;
    }, null, { timeout: 15000 });
    const beforeBSeek = await page.evaluate(() => window.__cto.capture());
    await page.evaluate(() => {
      const state = window.__kupua_store__.getState();
      void state.seek(Math.floor(state.total * 0.6));
    });
    await page.waitForFunction(previous => {
      const state = window.__kupua_store__.getState();
      return state._seekGeneration > previous && state.bufferOffset > 0 && !state.loading;
    }, beforeBSeek.seekGeneration, { timeout: 15000 });
    const b = await readThumb();

    stage = 'held Home response';
    await page.evaluate(() => window.__cto.holdNext('first'));
    await page.locator('header[role="toolbar"] a[title*="Grid"]').evaluate(element => element.click());
    await page.waitForFunction(() => window.__cto.gate.responseReady && window.__cto.gate.waiting, null, { timeout: 15000 });
    const pendingHome = await readThumb();

    stage = 'Back restores deep A';
    await page.goBack();
    await page.waitForFunction(previous => {
      const state = window.__kupua_store__.getState();
      const lifecycle = window.__kupua_getSearchLifecycle__();
      return lifecycle.started > previous && lifecycle.settled === lifecycle.started
        && state.params.orderBy === undefined && state.bufferOffset > 0 && !state.loading;
    }, pendingHome.lifecycle.started, { timeout: 20000 });
    const restored = await readThumb();

    stage = 'release stale Home';
    await page.evaluate(() => window.__cto.release());
    await page.waitForFunction(() => {
      const state = window.__kupua_store__.getState();
      const lifecycle = window.__kupua_getSearchLifecycle__();
      return lifecycle.settled === lifecycle.started && !state.loading;
    });
    await page.waitForTimeout(300);
    const released = await readThumb();
    result.checks = {
      a,
      b,
      pendingHome,
      restored,
      released,
      restoredDeep: restored.offset > 0 && restored.aria > 0,
      thumbStrandedAtTop: restored.aria > 0 && restored.cssTop < 10 && (restored.renderedTop ?? 0) < 10,
      staleReleaseDidNotReplaceA: released.orderBy === null && released.offset > 0,
    };
    result.completed = true;
  } catch (error) {
    result.completed = false;
    result.failedStage = stage;
    result.errorType = error?.name ?? 'Error';
    result.errorMessage = String(error?.message ?? error).replace(/[0-9a-f]{8}-[0-9a-f-]{20,}/gi, '[id]').slice(0, 240);
    result.state = await page.evaluate(() => window.__cto?.capture() ?? { harnessAbsent: true });
  } finally {
    await page.evaluate(() => window.__cto?.release?.());
  }
  await page.evaluate(value => window.__cto?.records.push({ workflow: value }), result);
  return result;
}

export async function runHorizontalContinuity(page, options) {
  const { transport } = options;
  const label = `${transport}/table-horizontal-continuity`;
  const result = { label, checks: {} };
  let stage = 'prepare';
  const setHorizontal = async value => {
    await page.evaluate(value => {
      const container = document.querySelector('[aria-label="Image results table"]');
      container.scrollLeft = Math.min(value, container.scrollWidth - container.clientWidth);
      container.dispatchEvent(new Event('scroll'));
    }, value);
    await page.waitForFunction(value => window.__cto.capture().scrollLeft === value, value, { timeout: 5000 });
    return page.evaluate(() => window.__cto.capture());
  };
  const prepareFocused = async role => {
    await page.evaluate(() => window.__cto.prepare('indexed', 'table'));
    await page.evaluate(() => {
      const container = document.querySelector('[aria-label="Image results table"]');
      container.scrollLeft = 0;
      container.dispatchEvent(new Event('scroll'));
    });
    const explicit = await page.evaluate(() => window.__cto.expectedMode === 'explicit');
    const point = await page.evaluate(role => window.__cto.pick(role), role);
    await page.mouse.click(point.x, point.y);
    if (explicit) {
      await page.waitForFunction(role => window.__cto.capture().tracked[role].focused, role);
    } else {
      await page.evaluate(() => window.__cto.detailReady());
      await page.keyboard.press('Backspace');
      await page.waitForFunction(() => !new URL(location.href).searchParams.has('image'));
    }
  };
  try {
    await page.bringToFront();
    stage = 'sort without focus';
    await page.evaluate(() => window.__cto.prepare('indexed', 'table'));
    const noFocusBefore = await setHorizontal(640);
    await page.getByRole('button', { name: 'Sort descending, click to sort ascending', exact: true }).evaluate(element => element.click());
    await page.waitForFunction(() => {
      const state = window.__kupua_store__.getState();
      return state.params.orderBy === 'uploadTime' && !state.loading && state.sortAroundFocusStatus === null;
    }, null, { timeout: 15000 });
    const noFocusSort = await page.evaluate(() => window.__cto.capture());

    stage = 'sort with focus setup';
    await prepareFocused('sortFocus');
    const focusBefore = await setHorizontal(640);
    stage = 'sort with focus producer';
    await page.getByRole('button', { name: 'Sort descending, click to sort ascending', exact: true }).evaluate(element => element.click());
    stage = 'sort with focus settle';
    await page.waitForFunction(() => {
      const state = window.__kupua_store__.getState();
      return state.params.orderBy === 'uploadTime' && !state.loading && state.sortAroundFocusStatus === null;
    }, null, { timeout: 15000 });
    const focusSort = await page.evaluate(() => window.__cto.capture());

    stage = 'filter with focus';
    await prepareFocused('filterFocus');
    const filterBefore = await setHorizontal(640);
    await page.getByRole('button', { name: 'Show date range filter', exact: true }).click();
    await page.getByRole('button', { name: 'Anytime', exact: true }).click();
    await page.waitForFunction(() => {
      const state = window.__kupua_store__.getState();
      return state.params.until === undefined && !state.loading && state.sortAroundFocusStatus === null;
    }, null, { timeout: 15000 });
    const filtered = await page.evaluate(() => window.__cto.capture());

    stage = 'panel with focus';
    await prepareFocused('panelFocus');
    const panelBefore = await setHorizontal(640);
    await page.getByRole('button', { name: 'Show Details panel', exact: true }).click();
    await page.waitForFunction(width => window.__cto.capture().width < width, panelBefore.width);
    const panelOpen = await page.evaluate(() => window.__cto.capture());
    const handle = await page.getByRole('separator', { name: 'Resize right panel (double-click to close)', exact: true }).boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + 80);
    await page.mouse.down();
    await page.mouse.move(handle.x - 200, handle.y + 80, { steps: 6 });
    await page.mouse.up();
    const panelDrag = await page.evaluate(() => window.__cto.capture());
    await page.getByRole('button', { name: 'Hide Details panel', exact: true }).click();
    const panelClose = await page.evaluate(() => window.__cto.capture());

    stage = 'density round-trip with focus';
    await prepareFocused('densityFocus');
    const densityBefore = await setHorizontal(640);
    await page.getByRole('button', { name: 'Switch to grid view', exact: true }).click();
    await page.waitForFunction(previous => window.__kupua_getDensityRestoreGeneration__() > previous, densityBefore.densityGeneration);
    const grid = await page.evaluate(() => window.__cto.capture());
    await page.getByRole('button', { name: 'Switch to table view', exact: true }).click();
    await page.waitForFunction(previous => window.__kupua_getDensityRestoreGeneration__() > previous, grid.densityGeneration);
    const densityReturn = await page.evaluate(() => window.__cto.capture());

    result.checks = {
      noFocusSort: { before: noFocusBefore.scrollLeft, after: noFocusSort.scrollLeft, focus: noFocusSort.hasFocus },
      focusSort: { before: focusBefore.scrollLeft, after: focusSort.scrollLeft, focusRetained: focusSort.tracked.sortFocus.focused },
      filter: { before: filterBefore.scrollLeft, after: filtered.scrollLeft, focusRetained: filtered.tracked.filterFocus.focused },
      panel: { before: panelBefore.scrollLeft, opened: panelOpen.scrollLeft, dragged: panelDrag.scrollLeft, closed: panelClose.scrollLeft },
      density: { before: densityBefore.scrollLeft, grid: grid.scrollLeft, returned: densityReturn.scrollLeft, focusRetained: densityReturn.tracked.densityFocus.focused },
    };
    result.completed = true;
  } catch (error) {
    result.completed = false;
    result.failedStage = stage;
    result.errorType = error?.name ?? 'Error';
    result.errorMessage = String(error?.message ?? error).replace(/[0-9a-f]{8}-[0-9a-f-]{20,}/gi, '[id]').slice(0, 240);
    result.state = await page.evaluate(() => window.__cto?.capture() ?? { harnessAbsent: true });
  } finally {
    await page.mouse.up();
    if (await page.getByRole('button', { name: 'Hide Details panel', exact: true }).count()) await page.getByRole('button', { name: 'Hide Details panel', exact: true }).click();
  }
  await page.evaluate(value => window.__cto?.records.push({ workflow: value }), result);
  return result;
}

export async function runMissingHistoryAnchor(page, options) {
  const { transport } = options;
  const label = `${transport}/missing-history-anchor`;
  const result = { label, checks: {} };
  let stage = 'prepare';
  try {
    await page.bringToFront();
    await page.evaluate(() => window.__cto.prepare('seek', 'grid'));
    stage = 'deep entry A';
    const beforeSeek = await page.evaluate(() => window.__cto.capture());
    await page.evaluate(() => {
      const state = window.__kupua_store__.getState();
      void state.seek(Math.floor(state.total * 0.4));
    });
    await page.waitForFunction(previous => {
      const state = window.__kupua_store__.getState();
      return state._seekGeneration > previous && state.bufferOffset > 0 && !state.loading;
    }, beforeSeek.seekGeneration, { timeout: 15000 });
    await page.evaluate(async () => {
      const cache = await import('/src/lib/image-offset-cache.ts');
      window.__cto.historyFixture = {
        key: window.__kupua_getKupuaKey__(),
        searchKey: cache.buildSearchKey(window.__kupua_store__.getState().params),
      };
    });

    stage = 'departing entry B';
    await page.getByRole('button', { name: 'Sort descending, click to sort ascending', exact: true }).click();
    await page.waitForFunction(() => {
      const state = window.__kupua_store__.getState();
      return state.params.orderBy === 'uploadTime' && !state.loading && state.sortAroundFocusStatus === null;
    }, null, { timeout: 15000 });
    await page.evaluate(() => { window.__cto.ids.departing = window.__kupua_getViewportAnchorId__(); });
    const departing = await page.evaluate(() => window.__cto.capture());
    await page.evaluate(async () => {
      const history = await import('/src/lib/history-snapshot.ts');
      const fixture = window.__cto.historyFixture;
      history.snapshotStore.set(fixture.key, {
        searchKey: fixture.searchKey,
        anchorImageId: 'cto-missing-history-anchor',
        anchorIsPhantom: true,
        anchorOffset: Math.floor(window.__kupua_store__.getState().total * 0.4),
        viewportRatio: 0.5,
        newCountSince: null,
      });
    });

    stage = 'Back restore missing anchor';
    await page.goBack();
    await page.waitForFunction(previous => {
      const state = window.__kupua_store__.getState();
      const lifecycle = window.__kupua_getSearchLifecycle__();
      return lifecycle.started > previous && lifecycle.settled === lifecycle.started
        && state.params.orderBy === undefined && !state.loading && state.sortAroundFocusStatus === null;
    }, departing.searchStarted, { timeout: 25000 });
    const restored = await page.evaluate(label => window.__cto.observe(label, 1000), label + '/restored');
    result.checks = {
      departingRank: departing.tracked.departing.rank,
      restoredOffset: restored.final.offset,
      restoredScroll: restored.final.scroll,
      restoredTop: restored.final.offset === 0 && restored.final.scroll === 0,
      noFocus: !restored.final.hasFocus,
      departingLoaded: restored.final.tracked.departing.loaded,
      departingVisible: restored.final.tracked.departing.intersects,
      departingViewportAnchor: restored.final.tracked.departing.viewportAnchor,
      rings: restored.final.rings,
    };
    result.completed = true;
  } catch (error) {
    result.completed = false;
    result.failedStage = stage;
    result.errorType = error?.name ?? 'Error';
    result.errorMessage = String(error?.message ?? error).replace(/[0-9a-f]{8}-[0-9a-f-]{20,}/gi, '[id]').slice(0, 240);
    result.state = await page.evaluate(() => window.__cto?.capture() ?? { harnessAbsent: true });
  }
  await page.evaluate(value => window.__cto?.records.push({ workflow: value }), result);
  return result;
}

export async function runSameAnchorHistoryFocus(page, options) {
  const { transport } = options;
  const label = `${transport}/same-anchor-history-focus`;
  const result = { label, checks: {} };
  let stage = 'prepare';
  const readSnapshot = () => page.evaluate(async () => {
    const history = await import('/src/lib/history-snapshot.ts');
    const snapshot = history.snapshotStore.get(window.__cto.historyFixture.key);
    return snapshot ? {
      anchorIsPhantom: snapshot.anchorIsPhantom,
      hasAnchor: snapshot.anchorImageId !== null,
      sameAnchor: snapshot.anchorImageId === window.__cto.ids.sameAnchor,
      offset: snapshot.anchorOffset,
    } : null;
  });
  const waitOrder = orderBy => page.waitForFunction(orderBy => {
    const state = window.__kupua_store__.getState();
    const lifecycle = window.__kupua_getSearchLifecycle__();
    return (state.params.orderBy ?? null) === orderBy && lifecycle.settled === lifecycle.started
      && !state.loading && state.sortAroundFocusStatus === null;
  }, orderBy, { timeout: 20000 });
  try {
    await page.bringToFront();
    await page.evaluate(() => window.__cto.prepare('indexed', 'grid'));
    await page.evaluate(() => {
      window.__cto.ids.sameAnchor = window.__kupua_getViewportAnchorId__();
      window.__cto.historyFixture = { key: window.__kupua_getKupuaKey__() };
    });

    stage = 'create phantom snapshot';
    await page.getByRole('button', { name: 'Sort descending, click to sort ascending', exact: true }).click();
    await waitOrder('uploadTime');
    await page.goBack();
    await waitOrder(null);
    const initialSnapshot = await readSnapshot();
    const restored = await page.evaluate(() => window.__cto.capture());

    stage = 'add same-anchor focus';
    const point = await page.evaluate(() => {
      const id = window.__cto.ids.sameAnchor;
      const container = document.querySelector('[aria-label="Image results grid"]');
      const element = Array.from(container.querySelectorAll('[data-image-id]')).find(candidate => candidate.dataset.imageId === id);
      if (!element) throw new Error('CTO same history anchor is not rendered');
      const rect = element.getBoundingClientRect();
      return { x: rect.left + Math.min(rect.width / 2, 180), y: rect.top + Math.min(rect.height / 2, 90) };
    });
    const explicit = await page.evaluate(() => window.__cto.expectedMode === 'explicit');
    await page.mouse.click(point.x, point.y);
    if (explicit) {
      await page.waitForFunction(() => window.__cto.capture().tracked.sameAnchor.focused);
    } else {
      await page.evaluate(() => window.__cto.detailReady());
      await page.keyboard.press('Backspace');
      await page.waitForFunction(() => !new URL(location.href).searchParams.has('image'));
    }
    const focused = await page.evaluate(() => window.__cto.capture());

    stage = 'leave focused A';
    await page.getByRole('button', { name: 'Sort descending, click to sort ascending', exact: true }).click();
    await waitOrder('uploadTime');
    const departingSnapshot = await readSnapshot();
    await page.goBack();
    await waitOrder(null);
    const returned = await page.evaluate(label => window.__cto.observe(label, 1000), label + '/returned');
    result.checks = {
      mode: returned.final.mode,
      initialSnapshot,
      departingSnapshot,
      restoredSameAnchor: restored.tracked.sameAnchor.intersects,
      focusAdded: focused.tracked.sameAnchor.focused,
      focusAfterReturn: returned.final.tracked.sameAnchor.focused,
      anchorVisibleAfterReturn: returned.final.tracked.sameAnchor.intersects,
      rings: returned.final.rings,
    };
    result.completed = true;
  } catch (error) {
    result.completed = false;
    result.failedStage = stage;
    result.errorType = error?.name ?? 'Error';
    result.errorMessage = String(error?.message ?? error).replace(/[0-9a-f]{8}-[0-9a-f-]{20,}/gi, '[id]').slice(0, 240);
    result.state = await page.evaluate(() => window.__cto?.capture() ?? { harnessAbsent: true });
  }
  await page.evaluate(value => window.__cto?.records.push({ workflow: value }), result);
  return result;
}

export async function runAiSortHistoryFocus(page, options) {
  const { transport } = options;
  const label = `${transport}/ai-sort-history-focus`;
  const result = { label, checks: {} };
  let stage = 'prepare';
  try {
    await page.bringToFront();
    await page.evaluate(() => window.__cto.prepare('buffer', 'grid'));
    if (!await page.getByRole('button', { name: 'Enable AI image search', exact: true }).count()) {
      return { label, blocked: 'ai-search-unavailable' };
    }
    stage = 'unfocused AI entry A';
    const before = await page.evaluate(() => window.__cto.capture());
    await page.getByRole('button', { name: 'Enable AI image search', exact: true }).click();
    await page.getByRole('searchbox', { name: 'AI image search query', exact: true }).fill('a city street at night');
    await page.waitForFunction(previous => {
      const state = window.__kupua_store__.getState();
      const lifecycle = window.__kupua_getSearchLifecycle__();
      return state.params.aiQuery === 'a city street at night' && state.params.orderBy === '-relevance'
        && lifecycle.started > previous && lifecycle.settled === lifecycle.started && !state.loading;
    }, before.searchStarted, { timeout: 20000 });
    const a = await page.evaluate(() => window.__cto.capture());

    stage = 'AI sort entry B';
    await page.getByRole('button', { name: 'Sort descending, click to sort ascending', exact: true }).click();
    await page.waitForFunction(() => window.__kupua_store__.getState().params.orderBy === 'relevance');
    const b = await page.evaluate(() => window.__cto.capture());
    const point = await page.evaluate(() => window.__cto.pick('aiHistoryFocus'));
    await page.mouse.click(point.x, point.y);
    const explicit = await page.evaluate(() => window.__cto.expectedMode === 'explicit');
    if (explicit) {
      await page.waitForFunction(() => window.__cto.capture().tracked.aiHistoryFocus.focused);
    } else {
      await page.evaluate(() => window.__cto.detailReady());
      await page.keyboard.press('Backspace');
      await page.waitForFunction(() => !new URL(location.href).searchParams.has('image'));
    }
    const focusedB = await page.evaluate(() => window.__cto.capture());

    stage = 'Back to unfocused AI A';
    await page.goBack();
    await page.waitForFunction(() => {
      const state = window.__kupua_store__.getState();
      return state.params.aiQuery === 'a city street at night' && state.params.orderBy === '-relevance' && !state.loading;
    }, null, { timeout: 15000 });
    await page.waitForTimeout(300);
    const back = await page.evaluate(() => window.__cto.capture());

    stage = 'Forward to focused AI B';
    await page.goForward();
    await page.waitForFunction(() => {
      const state = window.__kupua_store__.getState();
      return state.params.aiQuery === 'a city street at night' && state.params.orderBy === 'relevance' && !state.loading;
    }, null, { timeout: 15000 });
    await page.waitForTimeout(300);
    const forward = await page.evaluate(() => window.__cto.capture());
    result.checks = {
      mode: a.mode,
      aInitiallyNoFocus: !a.hasFocus,
      bInitiallyNoFocus: !b.hasFocus,
      bFocusAdded: focusedB.tracked.aiHistoryFocus.focused,
      backFocus: back.hasFocus,
      backSameFocus: back.tracked.aiHistoryFocus.focused,
      backRings: back.rings,
      forwardFocus: forward.hasFocus,
      forwardSameFocus: forward.tracked.aiHistoryFocus.focused,
      forwardRings: forward.rings,
    };
    result.completed = true;
  } catch (error) {
    result.completed = false;
    result.failedStage = stage;
    result.errorType = error?.name ?? 'Error';
    result.errorMessage = String(error?.message ?? error).replace(/[0-9a-f]{8}-[0-9a-f-]{20,}/gi, '[id]').slice(0, 240);
    result.state = await page.evaluate(() => window.__cto?.capture() ?? { harnessAbsent: true });
  } finally {
    if (await page.evaluate(() => new URL(location.href).searchParams.has('image'))) {
      await page.keyboard.press('Backspace');
      await page.waitForFunction(() => !new URL(location.href).searchParams.has('image'));
    }
    if (await page.getByRole('button', { name: 'Disable AI image search', exact: true }).count()) {
      await page.getByRole('button', { name: 'Disable AI image search', exact: true }).click();
      await page.waitForFunction(() => !window.__kupua_store__.getState().params.aiQuery);
    }
  }
  await page.evaluate(value => window.__cto?.records.push({ workflow: value }), result);
  return result;
}

export async function runImmediateSelectionReload(page, options) {
  const { transport } = options;
  const label = `${transport}/immediate-selection-reload`;
  const result = { label, checks: {} };
  let stage = 'prepare';
  const reloadProbe = async ids => {
    const retained = await page.evaluate(ids => ({ path: window.__cto.modulePath, ids, origin: performance.timeOrigin }), ids);
    await page.reload({ waitUntil: 'commit' });
    await page.waitForFunction(previous => performance.timeOrigin !== previous && !!window.__kupua_store__
      && typeof window.__kupua_getViewportAnchorId__ === 'function' && document.readyState === 'complete', retained.origin, { timeout: 15000 });
    await page.evaluate(async ({ path, ids }) => {
      const module = await import(path);
      await module.install();
      window.__cto.ids = ids;
      await window.__cto.ready();
    }, retained);
  };
  const selectRole = async role => {
    await page.evaluate(role => window.__cto.choose(role), role);
    const target = page.locator(`[data-cto-target="${role}"]`);
    await target.hover();
    const tick = target.getByRole('button', { name: 'Select image', exact: true });
    return tick.evaluate((element, role) => {
      element.click();
      const selected = window.__kupua_selection_store__.getState().selectedIds.has(window.__cto.ids[role]);
      const raw = sessionStorage.getItem('kupua-selection');
      const stored = !!raw && JSON.parse(raw).state.selectedIds.includes(window.__cto.ids[role]);
      return { selected, stored };
    }, role);
  };
  try {
    await page.bringToFront();
    await page.evaluate(() => window.__cto.prepare('buffer', 'grid'));
    stage = 'immediate reload';
    const immediateBefore = await selectRole('immediateSelection');
    const immediateIds = await page.evaluate(() => window.__cto.ids);
    await reloadProbe(immediateIds);
    const immediateAfter = await page.evaluate(() => window.__cto.capture());
    await page.evaluate(() => window.__kupua_selection_store__.getState().clear());

    stage = 'persisted control reload';
    await page.evaluate(() => window.__cto.prepare('buffer', 'grid'));
    const controlBefore = await selectRole('controlSelection');
    await page.waitForFunction(() => {
      const raw = sessionStorage.getItem('kupua-selection');
      return raw && JSON.parse(raw).state.selectedIds.includes(window.__cto.ids.controlSelection);
    }, null, { timeout: 5000 });
    const controlIds = await page.evaluate(() => window.__cto.ids);
    await reloadProbe(controlIds);
    const controlAfter = await page.evaluate(() => window.__cto.capture());
    result.checks = {
      immediateStoreSelected: immediateBefore.selected,
      immediateStorageAlreadyWritten: immediateBefore.stored,
      immediateSurvivedReload: immediateAfter.tracked.immediateSelection.selected,
      immediateSelectionCount: immediateAfter.selected,
      controlStoreSelected: controlBefore.selected,
      controlStorageAlreadyWritten: controlBefore.stored,
      controlSurvivedReload: controlAfter.tracked.controlSelection.selected,
      controlSelectionCount: controlAfter.selected,
    };
    result.completed = true;
  } catch (error) {
    result.completed = false;
    result.failedStage = stage;
    result.errorType = error?.name ?? 'Error';
    result.errorMessage = String(error?.message ?? error).replace(/[0-9a-f]{8}-[0-9a-f-]{20,}/gi, '[id]').slice(0, 240);
    result.state = await page.evaluate(() => window.__cto?.capture() ?? { harnessAbsent: true });
  }
  await page.evaluate(value => window.__cto?.records.push({ workflow: value }), result);
  return result;
}

export async function runNewImagesRefresh(page, options) {
  const { transport, position } = options;
  const label = `${transport}/new-images-refresh/${position}`;
  const result = { label, checks: {} };
  let stage = 'prepare';
  try {
    await page.bringToFront();
    await page.evaluate(() => window.__cto.prepare('indexed', 'grid'));
    if (position === 'deep') {
      const beforeSeek = await page.evaluate(() => window.__cto.capture());
      await page.evaluate(() => {
        const state = window.__kupua_store__.getState();
        void state.seek(Math.floor(state.total * 0.4));
      });
      await page.waitForFunction(previous => {
        const state = window.__kupua_store__.getState();
        return state._seekGeneration > previous && state.bufferOffset > 0 && !state.loading;
      }, beforeSeek.seekGeneration, { timeout: 15000 });
    } else if (position === 'first') {
      await page.evaluate(() => {
        const container = document.querySelector('[aria-label="Image results grid"]');
        container.scrollTop = Math.min(2000, container.scrollHeight - container.clientHeight);
        container.dispatchEvent(new Event('scroll'));
      });
      await page.waitForFunction(() => window.__cto.capture().scroll > 0);
    } else {
      throw new Error('Unknown refresh position');
    }
    await page.evaluate(() => {
      const state = window.__kupua_store__.getState();
      window.__cto.ids.refreshViewed = window.__kupua_getViewportAnchorId__();
      window.__cto.ids.refreshOldTop = state.results[0]?.id ?? null;
      window.__kupua_store__.setState({ newCount: 3 });
    });
    await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(button => button.textContent?.trim() === '3 new'));
    const before = await page.evaluate(() => window.__cto.capture());

    stage = 'held refresh publication';
    await page.evaluate(() => window.__cto.holdNext('first'));
    await page.getByRole('button', { name: '3 new', exact: true }).click();
    await page.waitForFunction(() => window.__cto.gate.responseReady && window.__cto.gate.waiting, null, { timeout: 15000 });
    const held = await page.evaluate(label => window.__cto.observe(label, 600), label + '/held');

    stage = 'release refresh';
    await page.evaluate(() => window.__cto.release());
    await page.waitForFunction(previous => {
      const state = window.__kupua_store__.getState();
      const lifecycle = window.__kupua_getSearchLifecycle__();
      return lifecycle.started === lifecycle.settled && lifecycle.started > previous
        && !state.loading && state.bufferOffset === 0;
    }, before.searchStarted, { timeout: 15000 });
    const released = await page.evaluate(label => window.__cto.observe(label, 1000), label + '/released');
    result.checks = {
      position,
      before: { offset: before.offset, scroll: before.scroll, viewedCentre: before.tracked.refreshViewed.centre },
      held: {
        offset: held.final.offset,
        scroll: held.final.scroll,
        viewedCentre: held.final.tracked.refreshViewed.centre,
        viewedVisible: held.final.tracked.refreshViewed.intersects,
        oldTopVisible: held.final.tracked.refreshOldTop.intersects,
        loading: held.final.loading,
        changes: held.changes,
      },
      released: {
        offset: released.final.offset,
        scroll: released.final.scroll,
        viewedVisible: released.final.tracked.refreshViewed.intersects,
        oldTopVisible: released.final.tracked.refreshOldTop.intersects,
        loading: released.final.loading,
      },
      requestCalled: await page.evaluate(() => window.__cto.gate.called),
      responseHeld: await page.evaluate(() => window.__cto.gate.responseReady),
    };
    result.completed = true;
  } catch (error) {
    result.completed = false;
    result.failedStage = stage;
    result.errorType = error?.name ?? 'Error';
    result.errorMessage = String(error?.message ?? error).replace(/[0-9a-f]{8}-[0-9a-f-]{20,}/gi, '[id]').slice(0, 240);
    result.state = await page.evaluate(() => window.__cto?.capture() ?? { harnessAbsent: true });
  } finally {
    await page.evaluate(() => window.__cto?.release?.());
  }
  await page.evaluate(value => window.__cto?.records.push({ workflow: value }), result);
  return result;
}

export async function runTouchComposition(page, options) {
  const { view, transport } = options;
  const label = `${transport}/synthetic-touch/${view}`;
  const result = { label, checks: {} };
  let stage = 'prepare';
  let originalCoarse = false;
  const pointer = async (type, point, pointerId = 1) => page.evaluate(({ type, point, pointerId }) => {
    const target = document.elementFromPoint(point.x, point.y) ?? document.body;
    target.dispatchEvent(new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId,
      pointerType: 'touch',
      clientX: point.x,
      clientY: point.y,
      isPrimary: true,
    }));
  }, { type, point, pointerId });
  const touch = async (type, x, y) => page.evaluate(({ type, x, y }) => {
    const wrapper = document.querySelector('[data-detail-image-id]');
    const target = wrapper?.querySelector('div.touch-none, div[class*="touch-none"]');
    if (!target) throw new Error('CTO detail touch container absent');
    const item = new Touch({ identifier: 1, target, clientX: x, clientY: y, pageX: x, pageY: y, screenX: x, screenY: y });
    target.dispatchEvent(new TouchEvent(type, {
      bubbles: true,
      cancelable: true,
      touches: type === 'touchend' ? [] : [item],
      targetTouches: type === 'touchend' ? [] : [item],
      changedTouches: [item],
    }));
  }, { type, x, y });
  const detailBounds = () => page.evaluate(() => {
    const wrapper = document.querySelector('[data-detail-image-id]');
    const target = wrapper?.querySelector('div.touch-none, div[class*="touch-none"]');
    if (!target) throw new Error('CTO detail touch container absent');
    const rect = target.getBoundingClientRect();
    return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
  });
  try {
    await page.bringToFront();
    originalCoarse = await page.evaluate(() => window.__cto.capture().coarse);
    await page.evaluate(() => window.__cto.setCoarse(true));

    stage = 'long press range';
    await page.evaluate(() => window.__cto.prepare('buffer', 'grid'));
    const anchor = await page.evaluate(() => window.__cto.choose('touchAnchor', 0));
    await page.evaluate(() => window.__cto.choose('touchRange', 2));
    await pointer('pointerdown', anchor);
    await page.waitForTimeout(650);
    await pointer('pointerup', anchor);
    await page.waitForFunction(() => window.__cto.capture().selected === 1 && !window.__cto.capture().detailOpen, null, { timeout: 5000 });
    const first = await page.evaluate(() => window.__cto.capture());
    const endpoint = await page.evaluate(() => {
      const imageId = window.__cto.ids.touchRange;
      const container = document.querySelector('[aria-label="Image results grid"]');
      const element = Array.from(container.querySelectorAll('[data-image-id]')).find(candidate => candidate.dataset.imageId === imageId);
      if (!element) throw new Error('CTO long-press endpoint absent');
      const rect = element.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });
    await pointer('pointerdown', endpoint, 2);
    await page.waitForTimeout(650);
    await pointer('pointerup', endpoint, 2);
    await page.waitForFunction(() => !window.__kupua_selection_store__.getState().isRangeWalking);
    await page.waitForTimeout(100);
    const ranged = await page.evaluate(() => window.__cto.capture());
    result.checks.longPress = {
      firstSelected: first.selected,
      firstNoDetail: !first.detailOpen,
      firstNoFocus: !first.hasFocus,
      rangeSelected: ranged.selected,
      endpointIsAnchor: ranged.tracked.touchRange.selectionAnchor,
      noDetail: !ranged.detailOpen,
      noFocus: !ranged.hasFocus,
      noRing: ranged.rings === 0,
    };
    await page.getByRole('button', { name: /^Clear selection/ }).click();
    await page.waitForFunction(() => window.__cto.capture().selected === 0);

    stage = 'swipe traversal and dismiss';
    await page.evaluate(({ view }) => window.__cto.prepare('seek', view), { view });
    const explicit = await page.evaluate(() => window.__cto.expectedMode === 'explicit');
    const opening = await page.evaluate(() => window.__cto.pick('swipeEntry'));
    if (explicit) await page.mouse.dblclick(opening.x, opening.y);
    else await page.mouse.click(opening.x, opening.y);
    await page.evaluate(() => window.__cto.detailReady());
    const openedId = await page.evaluate(() => new URL(location.href).searchParams.get('image'));
    const bounds = await detailBounds();
    const startX = bounds.x + bounds.width * 0.72;
    const endX = bounds.x + bounds.width * 0.28;
    const centreY = bounds.y + bounds.height * 0.5;
    await touch('touchstart', startX, centreY);
    await page.waitForTimeout(50);
    await touch('touchmove', endX, centreY);
    await page.waitForTimeout(50);
    await touch('touchend', endX, centreY);
    await page.waitForFunction(previous => {
      const current = new URL(location.href).searchParams.get('image');
      return current && current !== previous && document.querySelector('[data-detail-image-id]')?.dataset.detailImageId === current;
    }, openedId, { timeout: 5000 });
    await page.evaluate(() => window.__cto.rememberDetail('swipeLast'));
    const traversed = await page.evaluate(() => window.__cto.capture());
    const dismissBounds = await detailBounds();
    const dismissX = dismissBounds.x + dismissBounds.width / 2;
    const dismissStartY = dismissBounds.y + dismissBounds.height * 0.35;
    const dismissEndY = dismissStartY + 220;
    await touch('touchstart', dismissX, dismissStartY);
    await page.waitForTimeout(50);
    await touch('touchmove', dismissX, dismissEndY);
    await page.waitForTimeout(50);
    await touch('touchend', dismissX, dismissEndY);
    await page.waitForFunction(() => !new URL(location.href).searchParams.has('image'), null, { timeout: 5000 });
    const traversedReturn = await page.evaluate(label => window.__cto.observe(label, 1000), label + '/traversed-dismiss');
    result.checks.traversedDismiss = {
      changedImage: traversed.tracked.swipeLast.detail,
      visible: traversedReturn.final.tracked.swipeLast.intersects,
      centre: traversedReturn.final.tracked.swipeLast.centre,
      storedLast: traversedReturn.final.tracked.swipeLast.focused,
      rings: traversedReturn.final.rings,
    };

    stage = 'original dismiss';
    await page.evaluate(({ view }) => window.__cto.prepare('seek', view), { view });
    const originalPoint = await page.evaluate(() => window.__cto.pick('dismissOriginal'));
    const originalBefore = await page.evaluate(() => window.__cto.capture());
    if (explicit) await page.mouse.dblclick(originalPoint.x, originalPoint.y);
    else await page.mouse.click(originalPoint.x, originalPoint.y);
    await page.evaluate(() => window.__cto.detailReady());
    const originalBounds = await detailBounds();
    const originalX = originalBounds.x + originalBounds.width / 2;
    const originalStartY = originalBounds.y + originalBounds.height * 0.35;
    const originalEndY = originalStartY + 220;
    await touch('touchstart', originalX, originalStartY);
    await page.waitForTimeout(50);
    await touch('touchmove', originalX, originalEndY);
    await page.waitForTimeout(50);
    await touch('touchend', originalX, originalEndY);
    await page.waitForFunction(() => !new URL(location.href).searchParams.has('image'), null, { timeout: 5000 });
    const originalReturn = await page.evaluate(label => window.__cto.observe(label, 1000), label + '/original-dismiss');
    result.checks.originalDismiss = {
      centreDelta: originalReturn.final.tracked.dismissOriginal.centre - originalBefore.tracked.dismissOriginal.centre,
      visible: originalReturn.final.tracked.dismissOriginal.intersects,
      storedLast: originalReturn.final.tracked.dismissOriginal.focused,
      rings: originalReturn.final.rings,
    };
    result.completed = true;
  } catch (error) {
    result.completed = false;
    result.failedStage = stage;
    result.errorType = error?.name ?? 'Error';
    result.state = await page.evaluate(() => window.__cto?.capture() ?? { harnessAbsent: true });
  } finally {
    if (await page.evaluate(() => new URL(location.href).searchParams.has('image'))) {
      await page.getByRole('button', { name: 'Back to search', exact: true }).click();
      await page.waitForFunction(() => !new URL(location.href).searchParams.has('image'));
    }
    await page.evaluate(coarse => { window.__cto?.setCoarse(coarse); window.__kupua_selection_store__?.getState().clear(); }, originalCoarse);
  }
  await page.evaluate(value => window.__cto?.records.push({ workflow: value }), result);
  return result;
}

export async function runReloadSwipeIdentity(page, options) {
  const { view, transport } = options;
  const label = `${transport}/reload-swipe-identity/${view}`;
  const result = { label, checks: {} };
  let stage = 'prepare';
  let originalCoarse = false;
  const reloadProbe = async () => {
    const retained = await page.evaluate(() => ({ path: window.__cto.modulePath, ids: window.__cto.ids, origin: performance.timeOrigin }));
    await page.reload({ waitUntil: 'commit' });
    await page.waitForFunction(previous => performance.timeOrigin !== previous && !!window.__kupua_store__
      && typeof window.__kupua_getViewportAnchorId__ === 'function' && document.readyState === 'complete', retained.origin, { timeout: 15000 });
    await page.evaluate(async ({ path, ids }) => {
      const module = await import(path);
      await module.install();
      window.__cto.ids = ids;
      window.__cto.setCoarse(true);
    }, retained);
  };
  const chooseOffCentre = role => page.evaluate(role => {
    const container = document.querySelector('[aria-label="Image results grid"], [aria-label="Image results table"]');
    const bounds = container.getBoundingClientRect();
    const header = container.querySelector('[data-table-header]')?.getBoundingClientRect();
    const usableTop = Math.max(bounds.top, header?.bottom ?? bounds.top);
    const centre = (usableTop + bounds.bottom) / 2;
    const candidates = Array.from(container.querySelectorAll('[data-image-id]')).flatMap(element => {
      const rect = element.getBoundingClientRect();
      const full = rect.top >= usableTop && rect.bottom <= bounds.bottom;
      const position = window.__kupua_store__.getState().imagePositions.get(element.dataset.imageId);
      return full && position !== undefined
        ? [{ element, rect, distance: Math.abs((rect.top + rect.bottom) / 2 - centre), position }]
        : [];
    }).sort((left, right) => right.distance - left.distance);
    const candidate = candidates.find(item => item.position > 0 && item.position < window.__kupua_store__.getState().total - 2);
    if (!candidate) throw new Error('CTO off-centre detail candidate unavailable');
    window.__cto.ids[role] = candidate.element.dataset.imageId;
    return {
      x: candidate.rect.left + Math.min(candidate.rect.width / 2, 180),
      y: candidate.rect.top + Math.min(candidate.rect.height / 2, 90),
    };
  }, role);
  const touch = async (type, x, y) => page.evaluate(({ type, x, y }) => {
    const wrapper = document.querySelector('[data-detail-image-id]');
    const target = wrapper?.querySelector('div.touch-none, div[class*="touch-none"]');
    if (!target) throw new Error('CTO detail touch container absent');
    const item = new Touch({ identifier: 1, target, clientX: x, clientY: y, pageX: x, pageY: y, screenX: x, screenY: y });
    target.dispatchEvent(new TouchEvent(type, {
      bubbles: true,
      cancelable: true,
      touches: type === 'touchend' ? [] : [item],
      targetTouches: type === 'touchend' ? [] : [item],
      changedTouches: [item],
    }));
  }, { type, x, y });
  const detailBounds = () => page.evaluate(() => {
    const wrapper = document.querySelector('[data-detail-image-id]');
    const target = wrapper?.querySelector('div.touch-none, div[class*="touch-none"]');
    if (!target) throw new Error('CTO detail touch container absent');
    const rect = target.getBoundingClientRect();
    return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
  });
  const openTraverseReloadReturn = async role => {
    const point = await chooseOffCentre(role);
    const before = await page.evaluate(() => window.__cto.capture());
    await page.mouse.click(point.x, point.y);
    await page.evaluate(() => window.__cto.detailReady());
    if (!await page.evaluate(() => window.__cto.neighbour(1))) throw new Error('CTO reload swipe neighbour absent');
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => new URL(location.href).searchParams.get('image') === window.__cto.ids.expected
      && document.querySelector('[data-detail-image-id]')?.dataset.detailImageId === window.__cto.ids.expected);
    await reloadProbe();
    await page.evaluate(() => window.__cto.detailReady());
    await page.evaluate(() => window.__cto.listBehindDetailReady());
    if (!await page.evaluate(() => window.__cto.neighbour(-1))) throw new Error('CTO reload swipe previous image absent');
    await page.keyboard.press('ArrowLeft');
    await page.waitForFunction(role => new URL(location.href).searchParams.get('image') === window.__cto.ids[role]
      && document.querySelector('[data-detail-image-id]')?.dataset.detailImageId === window.__cto.ids[role], role);
    return before;
  };
  try {
    await page.bringToFront();
    originalCoarse = await page.evaluate(() => window.__cto.capture().coarse);
    await page.evaluate(() => window.__cto.setCoarse(true));

    stage = 'cancelled dismiss after reload';
    await page.evaluate(({ view }) => window.__cto.prepare('seek', view), { view });
    const before = await openTraverseReloadReturn('reloadSwipeEntry');
    const beforeDrag = await page.evaluate(() => window.__cto.capture());
    const bounds = await detailBounds();
    const x = bounds.x + bounds.width / 2;
    const y = bounds.y + bounds.height * 0.35;
    await touch('touchstart', x, y);
    await page.waitForTimeout(100);
    await touch('touchmove', x, y + 80);
    await page.waitForTimeout(200);
    await touch('touchmove', x, y + 10);
    await page.waitForTimeout(100);
    await touch('touchend', x, y + 10);
    await page.waitForTimeout(300);
    const afterCancel = await page.evaluate(() => window.__cto.capture());
    if (!afterCancel.detailOpen) throw new Error('CTO canceled dismiss closed detail');

    stage = 'completed dismiss after canceled pre-scroll';
    await touch('touchstart', x, y);
    await page.waitForTimeout(100);
    await touch('touchmove', x, y + 220);
    await page.waitForTimeout(100);
    await touch('touchend', x, y + 220);
    await page.waitForFunction(() => !new URL(location.href).searchParams.has('image'), null, { timeout: 5000 });
    const dismissed = await page.evaluate(label => window.__cto.observe(label, 1000), label + '/dismissed');

    stage = 'ordinary Backspace control';
    await page.evaluate(({ view }) => window.__cto.prepare('seek', view), { view });
    const controlBefore = await openTraverseReloadReturn('reloadBackEntry');
    const controlBeforeClose = await page.evaluate(() => window.__cto.capture());
    await page.keyboard.press('Backspace');
    await page.waitForFunction(() => !new URL(location.href).searchParams.has('image'));
    const control = await page.evaluate(label => window.__cto.observe(label, 1000), label + '/back-control');

    result.checks = {
      canceledStayedOpen: afterCancel.detailOpen,
      cancelMovedBackground: afterCancel.tracked.reloadSwipeEntry.centre - beforeDrag.tracked.reloadSwipeEntry.centre,
      dismissFinalDeltaFromOriginal: dismissed.final.tracked.reloadSwipeEntry.centre - before.tracked.reloadSwipeEntry.centre,
      dismissVisible: dismissed.final.tracked.reloadSwipeEntry.intersects,
      controlPreCloseDelta: controlBeforeClose.tracked.reloadBackEntry.centre - controlBefore.tracked.reloadBackEntry.centre,
      controlFinalDelta: control.final.tracked.reloadBackEntry.centre - controlBefore.tracked.reloadBackEntry.centre,
      controlVisible: control.final.tracked.reloadBackEntry.intersects,
      ringsAfterDismiss: dismissed.final.rings,
      ringsAfterControl: control.final.rings,
    };
    result.completed = true;
  } catch (error) {
    result.completed = false;
    result.failedStage = stage;
    result.errorType = error?.name ?? 'Error';
    result.errorMessage = String(error?.message ?? error).replace(/[0-9a-f]{8}-[0-9a-f-]{20,}/gi, '[id]').slice(0, 240);
    result.state = await page.evaluate(() => window.__cto?.capture() ?? { harnessAbsent: true });
  } finally {
    if (await page.evaluate(() => new URL(location.href).searchParams.has('image'))) {
      await page.keyboard.press('Backspace');
      await page.waitForFunction(() => !new URL(location.href).searchParams.has('image'));
    }
    await page.evaluate(coarse => window.__cto?.setCoarse(coarse), originalCoarse);
  }
  await page.evaluate(value => window.__cto?.records.push({ workflow: value }), result);
  return result;
}

export async function runLayout(page, options) {
  const { tier, view, transport } = options;
  const label = `${transport}/${tier}/${view}/layout`;
  const result = { label, states: [] };
  const originalSize = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  const summary = (sample) => ({ scroll: sample.scroll, scrollLeft: sample.scrollLeft, columns: sample.columns, hasFocus: sample.hasFocus, selected: sample.selected, rings: sample.rings, tracked: sample.tracked });
  let stage = 'prepare';
  try {
    await page.bringToFront();
    for (const policy of ['fresh', 'hidden', 'selection']) {
      stage = policy + '/prepare';
      if (await page.getByRole('button', { name: 'Hide Details panel', exact: true }).count()) await page.getByRole('button', { name: 'Hide Details panel', exact: true }).click();
      await page.evaluate(async () => { const module = await import('/src/stores/panel-store.ts'); module.usePanelStore.getState().setWidth('right', 320); });
      await page.setViewportSize(originalSize);
      await page.evaluate(({ tier, view }) => window.__cto.prepare(tier, view), { tier, view });
      const keysBefore = await page.evaluate(() => window.__cto.capture());
      await page.keyboard.press('ArrowUp');
      await page.waitForFunction(previous => window.__cto.capture().scroll < previous, keysBefore.scroll, { timeout: 5000 });
      await page.keyboard.press('ArrowRight');
      const right = await page.evaluate(() => window.__cto.capture());
      await page.keyboard.press('ArrowLeft');
      const left = await page.evaluate(() => window.__cto.capture());
      await page.evaluate(() => { const container = document.querySelector('[aria-label="Image results grid"], [aria-label="Image results table"]'); container.scrollTop = 2000; container.dispatchEvent(new Event('scroll')); });
      await page.waitForFunction(() => window.__cto.capture().scroll === 2000 && !!window.__kupua_getViewportAnchorId__());
      if (policy !== 'fresh') {
        const point = await page.evaluate(() => window.__cto.pick('hidden'));
        await page.mouse.click(point.x, point.y);
        await page.evaluate(() => window.__cto.detailReady());
        await page.getByRole('button', { name: 'Back to search', exact: true }).click();
        await page.waitForFunction(() => !new URL(location.href).searchParams.has('image'));
      }
      if (policy === 'selection') {
        await page.evaluate(() => window.__cto.choose('selection', 4));
        const tick = page.locator('[data-cto-target="selection"]');
        await tick.hover();
        await tick.getByRole('button', { name: 'Select image', exact: true }).click();
        await page.waitForFunction(() => window.__cto.capture().selected === 1);
      }
      const shortcutBefore = await page.evaluate(() => { document.activeElement?.blur(); return { started: window.__kupua_getSearchLifecycle__().started, editorActive: document.activeElement?.isContentEditable === true }; });
      await page.keyboard.press('Enter');
      await page.keyboard.press('f');
      const shortcuts = await page.evaluate(label => window.__cto.observe(label, 600), label + '/' + policy + '/shortcuts');
      const region = page.getByRole('region', { name: view === 'grid' ? 'Image results grid' : 'Image results table', exact: true });
      const bounds = await region.boundingBox();
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      await page.mouse.wheel(0, view === 'grid' ? 1800 : 900);
      await page.waitForFunction(() => window.__cto.capture().scroll > 2500);
      const before = await page.evaluate(() => { window.__cto.ids.viewed = window.__kupua_getViewportAnchorId__(); return window.__cto.capture(); });
      stage = policy + '/panel';
      await page.getByRole('button', { name: 'Show Details panel', exact: true }).click();
      await page.waitForFunction(width => window.__cto.capture().width < width, before.width);
      const opened = await page.evaluate(label => window.__cto.observe(label, 800), label + '/' + policy + '/panel-open');
      const handle = await page.getByRole('separator', { name: 'Resize right panel (double-click to close)', exact: true }).boundingBox();
      await page.mouse.move(handle.x + handle.width / 2, handle.y + 80);
      await page.mouse.down();
      await page.mouse.move(handle.x - 260, handle.y + 80, { steps: 8 });
      await page.mouse.up();
      const dragged = await page.evaluate(label => window.__cto.observe(label, 800), label + '/' + policy + '/panel-drag');
      await page.getByRole('button', { name: 'Hide Details panel', exact: true }).click();
      const closed = await page.evaluate(label => window.__cto.observe(label, 800), label + '/' + policy + '/panel-close');
      stage = policy + '/viewport';
      await page.setViewportSize({ width: 980, height: originalSize.height });
      const width = await page.evaluate(label => window.__cto.observe(label, 800), label + '/' + policy + '/width');
      await page.setViewportSize({ width: 980, height: 650 });
      const height = await page.evaluate(label => window.__cto.observe(label, 800), label + '/' + policy + '/height');
      await page.setViewportSize(originalSize);
      await page.evaluate(label => window.__cto.observe(label, 800), label + '/' + policy + '/viewport-restored');
      stage = policy + '/density rounds';
      const rounds = [];
      for (let step = 0; step < 4; step++) {
        const current = await page.evaluate(() => window.__cto.capture());
        const destination = current.view === 'grid' ? 'table' : 'grid';
        await page.getByRole('button', { name: `Switch to ${destination} view`, exact: true }).click();
        await page.waitForFunction(previous => window.__kupua_getDensityRestoreGeneration__() > previous, current.densityGeneration, { timeout: 5000 });
        const changed = await page.evaluate(label => window.__cto.observe(label, 800), label + '/' + policy + '/density-' + step);
        rounds.push(summary(changed.final));
      }
      let clear = null;
      if (policy === 'selection') {
        const previous = await page.evaluate(() => window.__cto.capture());
        await page.getByRole('button', { name: 'Clear selection', exact: true }).click();
        const next = await page.evaluate(() => window.__cto.capture());
        clear = { stationary: previous.scroll === next.scroll, hiddenRetained: next.tracked.hidden.focused, noRing: next.rings === 0 };
      }
      result.states.push({ policy, horizontalKeys: { right: right.scrollLeft, left: left.scrollLeft, noFocus: !left.hasFocus }, shortcuts: { editorActive: shortcutBefore.editorActive, noSearch: shortcuts.final.searchStarted === shortcutBefore.started, noDetail: !shortcuts.final.detailOpen, noPreview: !shortcuts.final.preview && !shortcuts.final.fullscreen }, before: summary(before), opened: summary(opened.final), dragged: summary(dragged.final), closed: summary(closed.final), width: summary(width.final), height: summary(height.final), rounds, clear });
    }
    result.completed = true;
  } catch (error) {
    result.completed = false;
    result.failedStage = stage;
    result.errorType = error?.name ?? 'Error';
    result.state = await page.evaluate(() => window.__cto?.capture() ?? { harnessAbsent: true });
  } finally {
    await page.mouse.up();
    await page.setViewportSize(originalSize);
    if (await page.getByRole('button', { name: 'Hide Details panel', exact: true }).count()) await page.getByRole('button', { name: 'Hide Details panel', exact: true }).click();
    await page.evaluate(async () => { const module = await import('/src/stores/panel-store.ts'); module.usePanelStore.getState().setWidth('right', 320); });
    if (await page.evaluate(() => new URL(location.href).searchParams.has('image'))) {
      await page.getByRole('button', { name: 'Back to search', exact: true }).click();
      await page.waitForFunction(() => !new URL(location.href).searchParams.has('image'));
    }
  }
  await page.evaluate(value => window.__cto?.records.push({ workflow: value }), result);
  return result;
}

export async function runFullscreen(page, options) {
  const { tier, view, transport } = options;
  const label = `${transport}/${tier}/${view}/fullscreen`;
  const result = { label, checks: {} };
  let stage = 'prepare';
  try {
    await page.bringToFront();
    await page.evaluate(({ tier, view }) => window.__cto.prepare(tier, view), { tier, view });
    const explicit = await page.evaluate(() => window.__cto.expectedMode === 'explicit');
    if (!await page.evaluate(() => document.fullscreenEnabled)) return { label, blocked: 'native-fullscreen-disabled' };
    stage = 'detail fullscreen';
    const point = await page.evaluate(() => window.__cto.pick('detailEntry'));
    await page.mouse.click(point.x, point.y);
    if (explicit) {
      await page.waitForFunction(() => window.__cto.capture().tracked.detailEntry.focused);
      await page.keyboard.press('Enter');
    }
    await page.evaluate(() => window.__cto.detailReady());
    await page.keyboard.press('f');
    await page.waitForFunction(() => !!document.fullscreenElement && window.__cto.capture().detailOpen && !window.__cto.capture().preview, null, { timeout: 5000 });
    const entered = await page.evaluate(label => window.__cto.observe(label, 800), label + '/detail-enter');
    await page.evaluate(() => window.__cto.neighbour(1));
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => new URL(location.href).searchParams.get('image') === window.__cto.ids.expected && document.querySelector('[data-detail-image-id]')?.dataset.detailImageId === window.__cto.ids.expected, null, { timeout: 5000 });
    await page.evaluate(() => window.__cto.rememberDetail('detailLast'));
    await page.keyboard.press('f');
    await page.waitForFunction(() => !document.fullscreenElement && window.__cto.capture().detailOpen, null, { timeout: 5000 });
    await page.getByRole('button', { name: 'Back to search', exact: true }).click();
    await page.waitForFunction(() => !new URL(location.href).searchParams.has('image'));
    const detailReturn = await page.evaluate(label => window.__cto.observe(label), label + '/detail-return');
    result.checks.detail = { nativeEntered: entered.final.fullscreen, remainedDetail: entered.final.detailMatches, mediaReady: entered.final.mediaReady, lastVisible: detailReturn.final.tracked.detailLast.intersects, centre: detailReturn.final.tracked.detailLast.centre, storedLast: detailReturn.final.tracked.detailLast.focused, rings: detailReturn.final.rings };
    stage = 'preview original';
    const previewPoint = await page.evaluate(() => window.__cto.pick('previewEntry'));
    const before = await page.evaluate(() => window.__cto.capture());
    await page.mouse.click(previewPoint.x, previewPoint.y, { button: 'middle' });
    await page.waitForFunction(() => window.__cto.capture().preview && !!document.fullscreenElement, null, { timeout: 5000 });
    const preview = await page.evaluate(label => window.__cto.observe(label, 800), label + '/preview-enter');
    if (explicit) await page.evaluate(() => { void document.exitFullscreen(); });
    else await page.keyboard.press('f');
    await page.waitForFunction(() => !document.fullscreenElement && !window.__cto.capture().preview, null, { timeout: 5000 });
    const original = await page.evaluate(label => window.__cto.observe(label), label + '/preview-original-return');
    result.checks.previewOriginal = { entered: preview.final.preview && preview.final.fullscreen, mediaReady: preview.final.previewMediaReady, noDetailRoute: !preview.final.detailOpen, centreDelta: original.final.tracked.previewEntry.centre - before.tracked.previewEntry.centre, rings: original.final.rings };
    stage = 'preview traversal';
    const traversePoint = await page.evaluate(() => window.__cto.pick('previewStart'));
    await page.mouse.click(traversePoint.x, traversePoint.y, { button: 'middle' });
    await page.waitForFunction(() => window.__cto.capture().preview && !!document.fullscreenElement, null, { timeout: 5000 });
    await page.evaluate(label => window.__cto.observe(label, 800), label + '/preview-traverse-ready');
    await page.evaluate(() => window.__cto.neighbour(1));
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => window.__kupua_store__.getState().focusedImageId === window.__cto.ids.expected, null, { timeout: 5000 });
    await page.evaluate(() => { window.__cto.ids.previewLast = window.__kupua_store__.getState().focusedImageId; });
    if (explicit) await page.evaluate(() => { void document.exitFullscreen(); });
    else await page.keyboard.press('Backspace');
    await page.waitForFunction(() => !document.fullscreenElement && !window.__cto.capture().preview, null, { timeout: 5000 });
    const traversed = await page.evaluate(label => window.__cto.observe(label), label + '/preview-traversed-return');
    result.checks.previewTraversal = { lastVisible: traversed.final.tracked.previewLast.intersects, centre: traversed.final.tracked.previewLast.centre, storedLast: traversed.final.tracked.previewLast.focused, rings: traversed.final.rings, noDetail: !traversed.final.detailOpen };
    result.completed = true;
  } catch (error) {
    result.completed = false;
    result.failedStage = stage;
    result.errorType = error?.name ?? 'Error';
    result.state = await page.evaluate(() => window.__cto?.capture() ?? { harnessAbsent: true });
  } finally {
    if (await page.evaluate(() => !!document.fullscreenElement)) await page.evaluate(() => document.exitFullscreen().catch(() => {}));
    if (await page.evaluate(() => new URL(location.href).searchParams.has('image'))) {
      await page.getByRole('button', { name: 'Back to search', exact: true }).click();
      await page.waitForFunction(() => !new URL(location.href).searchParams.has('image'));
    }
  }
  await page.evaluate(value => window.__cto?.records.push({ workflow: value }), result);
  return result;
}