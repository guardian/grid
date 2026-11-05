import { install as installShared } from './not-yet-another-audit-click-open-probe.js?ctf=20261002m';

export async function install() {
  return installShared({ expectedMode: 'explicit', modulePath: import.meta.url });
}

export async function runBasic(page, options) {
  const { tier, view, transport } = options;
  const label = `${transport}/${tier}/${view}/explicit-basic`;
  const result = { label, checks: {} };
  let stage = 'prepare';
  const rememberExpected = (direction = 1) => page.evaluate(direction => {
    const state = window.__kupua_store__.getState();
    const current = state.focusedImageId;
    const rank = state.imagePositions.get(current);
    const columns = window.__cto.capture().columns;
    const delta = direction * (window.__cto.capture().view === 'grid' ? columns : 1);
    const image = state.results[rank - state.bufferOffset + delta];
    window.__cto.ids.expectedFocus = image?.id ?? null;
    return image !== undefined;
  }, direction);
  try {
    await page.bringToFront();
    const prepared = await page.evaluate(({ tier, view }) => window.__cto.prepare(tier, view), { tier, view });
    result.baseline = { mode: prepared.mode, source: prepared.source, tier: prepared.tier, total: prepared.total, view: prepared.view };

    stage = 'no-focus keyboard';
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(previous => window.__cto.capture().scroll > previous, prepared.scroll, { timeout: 5000 });
    const down = await page.evaluate(() => window.__cto.capture());
    await page.keyboard.press('PageDown');
    await page.waitForFunction(previous => window.__cto.capture().scroll > previous, down.scroll, { timeout: 5000 });
    await page.keyboard.press('PageUp');
    await page.keyboard.press('Enter');
    await page.keyboard.press('f');
    const fresh = await page.evaluate(label => window.__cto.observe(label, 600), label + '/fresh-keys');
    result.checks.freshKeys = {
      scrollDown: down.scroll > prepared.scroll,
      noFocus: !fresh.final.hasFocus,
      noRing: fresh.final.rings === 0,
      enterNoDetail: !fresh.final.detailOpen,
      noPreview: !fresh.final.preview && !fresh.final.fullscreen,
    };

    stage = 'single click focus and arrow';
    const point = await page.evaluate(() => window.__cto.pick('clicked'));
    await page.mouse.click(point.x, point.y);
    await page.waitForFunction(() => window.__cto.capture().tracked.clicked.focused && window.__cto.capture().rings === 1);
    const clicked = await page.evaluate(() => window.__cto.capture());
    if (!await rememberExpected(1)) throw new Error('CTF expected focus neighbour absent');
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(() => window.__cto.capture().tracked.expectedFocus.focused);
    const moved = await page.evaluate(label => window.__cto.observe(label, 600), label + '/focused-arrow');
    result.checks.focus = {
      clickFocused: clicked.tracked.clicked.focused,
      clickRing: clicked.rings,
      arrowMoved: moved.final.tracked.expectedFocus.focused,
      arrowVisible: moved.final.tracked.expectedFocus.intersects,
      arrowRing: moved.final.rings,
    };

    stage = 'Enter detail return';
    const beforeDetail = await page.evaluate(() => window.__cto.capture());
    await page.keyboard.press('Enter');
    const entered = await page.evaluate(() => window.__cto.detailReady());
    await page.keyboard.press('Backspace');
    await page.waitForFunction(() => !new URL(location.href).searchParams.has('image'));
    const returned = await page.evaluate(label => window.__cto.observe(label), label + '/enter-return');
    result.checks.enter = {
      openedFocused: entered.tracked.expectedFocus.detail && entered.detailMatches,
      centreDelta: returned.final.tracked.expectedFocus.centre - beforeDetail.tracked.expectedFocus.centre,
      focusRetained: returned.final.tracked.expectedFocus.focused,
      visible: returned.final.tracked.expectedFocus.intersects,
      rings: returned.final.rings,
    };

    stage = 'F preview return';
    if (options.skipPreview) {
      result.checks.preview = { skipped: 'integrated-browser fullscreen exit gap' };
    } else {
      const beforePreview = await page.evaluate(() => window.__cto.capture());
      await page.keyboard.press('f');
      await page.waitForFunction(() => window.__cto.capture().preview && !!document.fullscreenElement, null, { timeout: 5000 });
      const preview = await page.evaluate(() => window.__cto.capture());
      await page.evaluate(() => { void document.exitFullscreen(); });
      await page.waitForFunction(() => !window.__cto.capture().preview && !document.fullscreenElement, null, { timeout: 5000 });
      const previewReturn = await page.evaluate(label => window.__cto.observe(label), label + '/preview-return');
      result.checks.preview = {
        entered: preview.preview && preview.fullscreen,
        noDetailRoute: !preview.detailOpen,
        centreDelta: previewReturn.final.tracked.expectedFocus.centre - beforePreview.tracked.expectedFocus.centre,
        focusRetained: previewReturn.final.tracked.expectedFocus.focused,
        rings: previewReturn.final.rings,
      };
    }

    stage = 'detail traversal return';
    await page.keyboard.press('Enter');
    await page.evaluate(() => window.__cto.detailReady());
    for (const direction of [1, 1, -1]) {
      if (!await page.evaluate(direction => window.__cto.neighbour(direction), direction)) throw new Error('CTF adjacent fixture not loaded');
      await page.keyboard.press(direction === 1 ? 'ArrowRight' : 'ArrowLeft');
      await page.waitForFunction(() => new URL(location.href).searchParams.get('image') === window.__cto.ids.expected
        && document.querySelector('[data-detail-image-id]')?.dataset.detailImageId === window.__cto.ids.expected);
    }
    await page.evaluate(() => window.__cto.rememberDetail('last'));
    await page.keyboard.press('Backspace');
    await page.waitForFunction(() => !new URL(location.href).searchParams.has('image'));
    const traversed = await page.evaluate(label => window.__cto.observe(label), label + '/traversed-return');
    result.checks.traversal = {
      centre: traversed.final.tracked.last.centre,
      full: traversed.final.tracked.last.full,
      focusedLast: traversed.final.tracked.last.focused,
      rings: traversed.final.rings,
    };

    stage = 'offscreen focus snap-back';
    const region = page.getByRole('region', { name: view === 'grid' ? 'Image results grid' : 'Image results table', exact: true });
    const bounds = await region.boundingBox();
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.wheel(0, view === 'grid' ? 1800 : 900);
    await page.waitForFunction(() => !window.__cto.capture().tracked.last.intersects);
    if (!await rememberExpected(1)) throw new Error('CTF snap-back neighbour absent');
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(() => window.__cto.capture().tracked.expectedFocus.focused
      && window.__cto.capture().tracked.expectedFocus.intersects);
    const snapped = await page.evaluate(label => window.__cto.observe(label, 600), label + '/snap-back');
    result.checks.snapBack = {
      movedFromStoredFocus: snapped.final.tracked.expectedFocus.focused,
      visible: snapped.final.tracked.expectedFocus.intersects,
      rings: snapped.final.rings,
    };

    stage = 'offscreen focus density';
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.wheel(0, view === 'grid' ? 1800 : 900);
    await page.waitForFunction(() => !window.__cto.capture().tracked.expectedFocus.intersects);
    const densityBefore = await page.evaluate(() => { window.__cto.ids.viewport = window.__kupua_getViewportAnchorId__(); return window.__cto.capture(); });
    const destination = view === 'grid' ? 'table' : 'grid';
    await page.getByRole('button', { name: `Switch to ${destination} view`, exact: true }).click();
    await page.waitForFunction(previous => window.__kupua_getDensityRestoreGeneration__() > previous, densityBefore.densityGeneration);
    const density = await page.evaluate(label => window.__cto.observe(label), label + '/focused-density');
    result.checks.density = {
      sourceFocusLoaded: densityBefore.tracked.expectedFocus.loaded,
      sourceFocusVisible: densityBefore.tracked.expectedFocus.intersects,
      destinationFocusVisible: density.final.tracked.expectedFocus.intersects,
      destinationFocusCentre: density.final.tracked.expectedFocus.centre,
      focusRetained: density.final.tracked.expectedFocus.focused,
      rings: density.final.rings,
      viewedBefore: densityBefore.tracked.viewport.centre,
      viewedAfter: density.final.tracked.viewport.centre,
    };
    result.completed = true;
  } catch (error) {
    result.completed = false;
    result.failedStage = stage;
    result.errorType = error?.name ?? 'Error';
    result.state = await page.evaluate(() => window.__cto?.capture() ?? { harnessAbsent: true });
  } finally {
    if (await page.evaluate(() => !!document.fullscreenElement)) await page.evaluate(() => document.exitFullscreen().catch(() => {}));
    if (await page.evaluate(() => new URL(location.href).searchParams.has('image'))) {
      await page.keyboard.press('Backspace');
      await page.waitForFunction(() => !new URL(location.href).searchParams.has('image'));
    }
  }
  await page.evaluate(value => window.__cto?.records.push({ workflow: value }), result);
  return result;
}

export async function runTransitions(page, options) {
  const { tier, view, transport } = options;
  const label = `${transport}/${tier}/${view}/explicit-transitions`;
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
    await page.waitForFunction(() => window.__cto.capture().selected === 1);
    const firstSelection = await page.evaluate(() => window.__cto.capture());
    const body = await page.evaluate(() => window.__cto.choose('body', 1));
    await page.mouse.click(body.x, body.y);
    await page.waitForFunction(() => window.__cto.capture().selected === 2);
    const range = await page.evaluate(() => window.__cto.choose('range', 2));
    await page.keyboard.down('Shift');
    await page.mouse.click(range.x, range.y);
    await page.keyboard.up('Shift');
    await page.waitForFunction(() => window.__cto.capture().selected >= 3 && !window.__kupua_selection_store__.getState().isRangeWalking);
    const ranged = await page.evaluate(() => window.__cto.capture());
    const beforeClear = ranged.scroll;
    await page.getByRole('button', { name: 'Clear selection', exact: true }).click();
    await page.waitForFunction(() => window.__cto.capture().selected === 0);
    const cleared = await page.evaluate(() => window.__cto.capture());
    result.checks.selection = {
      tickCount: firstSelection.selected,
      bodyAndRangeCount: ranged.selected,
      noFocusCreated: !ranged.hasFocus && !cleared.hasFocus,
      noDetailOpened: !ranged.detailOpen,
      noRing: ranged.rings === 0,
      clearStationary: cleared.scroll === beforeClear,
    };

    stage = 'selection with explicit focus';
    const focusPoint = await page.evaluate(() => window.__cto.pick('explicitFocus'));
    await page.mouse.click(focusPoint.x, focusPoint.y);
    await page.waitForFunction(() => window.__cto.capture().tracked.explicitFocus.focused);
    await page.evaluate(() => window.__cto.choose('sortSelection', 1));
    const selected = page.locator('[data-cto-target="sortSelection"]');
    await selected.hover();
    await selected.getByRole('button', { name: 'Select image', exact: true }).click();
    await page.waitForFunction(() => window.__cto.capture().selected === 1);
    await page.getByRole('button', { name: 'Sort descending, click to sort ascending', exact: true }).click();
    await page.waitForFunction(() => {
      const state = window.__kupua_store__.getState();
      return state.params.orderBy === 'uploadTime' && !state.loading && state.sortAroundFocusStatus === null;
    }, null, { timeout: 15000 });
    const selectedSort = await page.evaluate(label => window.__cto.observe(label), label + '/selection-sort');
    result.checks.selectionSort = {
      selected: selectedSort.final.selected,
      selectionVisible: selectedSort.final.tracked.sortSelection.intersects,
      explicitFocusRetained: selectedSort.final.tracked.explicitFocus.focused,
      explicitFocusVisible: selectedSort.final.tracked.explicitFocus.intersects,
      rings: selectedSort.final.rings,
    };
    if (tier === 'buffer') {
      await page.waitForFunction(() => {
        const state = window.__kupua_store__.getState();
        return state.results.length === state.total && state.bufferOffset === 0 && !state._bufferSelfCorrecting
          && !state._extendBackwardInFlight && !state._extendForwardInFlight;
      }, null, { timeout: 15000 });
      const filled = await page.evaluate(label => window.__cto.observe(label, 1000), label + '/selection-filled');
      result.checks.selectionSort.fillComplete = true;
      result.checks.selectionSort.filledFocusCentre = filled.final.tracked.explicitFocus.centre;
      result.checks.selectionSort.filledSelectionCentre = filled.final.tracked.sortSelection.centre;
    }

    stage = 'ordinary sort with explicit focus';
    await page.getByRole('button', { name: 'Clear selection', exact: true }).click();
    const beforeOrdinarySort = await page.evaluate(() => window.__cto.capture());
    await page.getByRole('button', { name: 'Sort ascending, click to sort descending', exact: true }).click();
    await page.waitForFunction(() => {
      const state = window.__kupua_store__.getState();
      return state.params.orderBy === '-uploadTime' && !state.loading && state.sortAroundFocusStatus === null;
    }, null, { timeout: 15000 });
    const ordinarySort = await page.evaluate(label => window.__cto.observe(label), label + '/ordinary-sort');
    result.checks.ordinarySort = {
      focusBefore: beforeOrdinarySort.tracked.explicitFocus.focused,
      focusRetained: ordinarySort.final.tracked.explicitFocus.focused,
      focusVisible: ordinarySort.final.tracked.explicitFocus.intersects,
      focusCentre: ordinarySort.final.tracked.explicitFocus.centre,
      rings: ordinarySort.final.rings,
      notResetToTop: ordinarySort.final.scroll > 0,
    };

    stage = 'filter broadening with explicit focus';
    const region = page.getByRole('region', { name: view === 'grid' ? 'Image results grid' : 'Image results table', exact: true });
    const bounds = await region.boundingBox();
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    const scrollBeforeFilterFocus = await page.evaluate(() => window.__cto.capture().scroll);
    await page.mouse.wheel(0, view === 'grid' ? 1500 : 900);
    await page.waitForFunction(previous => window.__cto.capture().scroll > previous
      && !window.__cto.capture().tracked.explicitFocus.intersects, scrollBeforeFilterFocus);
    const filterPoint = await page.evaluate(() => window.__cto.choose('filterFocus', 1));
    await page.mouse.click(filterPoint.x, filterPoint.y);
    await page.waitForFunction(() => window.__cto.capture().tracked.filterFocus.focused);
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.wheel(0, view === 'grid' ? 1800 : 900);
    await page.waitForFunction(() => !window.__cto.capture().tracked.filterFocus.intersects);
    const filterBefore = await page.evaluate(() => { window.__cto.ids.viewed = window.__kupua_getViewportAnchorId__(); return window.__cto.capture(); });
    await page.getByRole('button', { name: 'Show date range filter', exact: true }).click();
    await page.getByRole('button', { name: 'Anytime', exact: true }).click();
    await page.waitForFunction(previous => {
      const state = window.__kupua_store__.getState();
      return window.__kupua_getSearchLifecycle__().started > previous && state.params.until === undefined
        && !state.loading && state.sortAroundFocusStatus === null;
    }, filterBefore.searchStarted, { timeout: 15000 });
    const filtered = await page.evaluate(label => window.__cto.observe(label), label + '/filter');
    result.checks.filter = {
      beforeFocusLoaded: filterBefore.tracked.filterFocus.loaded,
      beforeFocusVisible: filterBefore.tracked.filterFocus.intersects,
      afterFocusVisible: filtered.final.tracked.filterFocus.intersects,
      focusRetained: filtered.final.tracked.filterFocus.focused,
      rings: filtered.final.rings,
      viewedBefore: filterBefore.tracked.viewed.centre,
      viewedAfter: filtered.final.tracked.viewed.centre,
      destinationTotal: filtered.final.total,
      destinationTier: filtered.final.tier,
    };

    stage = 'empty query and recovery';
    const editor = page.locator('.ProseMirror.Cql__ContentEditable');
    await editor.click();
    await page.keyboard.press('Meta+a');
    await page.keyboard.type('l7_ctf_no_results_20261002');
    await page.waitForFunction(() => {
      const state = window.__kupua_store__.getState();
      return state.params.query?.includes('l7_ctf_no_results_20261002') && !state.loading && state.total === 0;
    }, null, { timeout: 15000 });
    const empty = await page.evaluate(() => window.__cto.capture());
    await page.getByRole('button', { name: 'Clear search', exact: true }).click();
    await page.waitForFunction(() => {
      const state = window.__kupua_store__.getState();
      return !state.params.query && !state.loading && state.total > 0;
    }, null, { timeout: 15000 });
    const recovered = await page.evaluate(() => window.__cto.capture());
    result.checks.empty = {
      focusCleared: !empty.hasFocus,
      noSelection: empty.selected === 0,
      noError: !empty.error,
      top: empty.scroll === 0,
      recovered: recovered.total > 0 && !recovered.error,
      modeRetained: recovered.mode === 'explicit',
    };
    result.completed = true;
  } catch (error) {
    result.completed = false;
    result.failedStage = stage;
    result.errorType = error?.name ?? 'Error';
    result.state = await page.evaluate(() => window.__cto?.capture() ?? { harnessAbsent: true });
  } finally {
    await page.keyboard.up('Shift');
    if (await page.evaluate(() => new URL(location.href).searchParams.has('image'))) {
      await page.keyboard.press('Backspace');
      await page.waitForFunction(() => !new URL(location.href).searchParams.has('image'));
    }
  }
  await page.evaluate(value => window.__cto?.records.push({ workflow: value }), result);
  return result;
}

export async function runHistory(page, options) {
  const { tier, view, transport } = options;
  const label = `${transport}/${tier}/${view}/explicit-history/${options.settledReload ? 'settled' : 'early'}`;
  const result = { label, checks: {} };
  let stage = 'prepare';
  const deep = async ratio => {
    if (tier === 'buffer') await page.waitForFunction(() => {
      const state = window.__kupua_store__.getState();
      return state.results.length === state.total && state.bufferOffset === 0;
    }, null, { timeout: 15000 });
    const before = await page.evaluate(() => window.__cto.capture());
    const track = await page.getByRole('slider', { name: 'Result set position', exact: true }).boundingBox();
    await page.mouse.click(track.x + track.width / 2, track.y + ratio * track.height);
    await page.waitForFunction(({ previous, tier }) => {
      const current = window.__cto.capture();
      return !current.loading && !current.finding && !!window.__kupua_getViewportAnchorId__()
        && (tier === 'buffer' ? current.scroll !== previous.scroll : current.seekGeneration > previous.seekGeneration);
    }, { previous: before, tier }, { timeout: 15000 });
  };
  const reloadProbe = async () => {
    const retained = await page.evaluate(() => ({ path: window.__cto.modulePath, ids: window.__cto.ids, origin: performance.timeOrigin }));
    await page.reload({ waitUntil: 'commit' });
    await page.waitForFunction(previous => performance.timeOrigin !== previous && !!window.__kupua_store__
      && typeof window.__kupua_getViewportAnchorId__ === 'function' && document.readyState === 'complete', retained.origin, { timeout: 15000 });
    await page.evaluate(async ({ path, ids }) => {
      const module = await import(path);
      await module.install();
      window.__cto.ids = ids;
    }, retained);
  };
  try {
    await page.bringToFront();
    await page.evaluate(({ tier, view }) => window.__cto.prepare(tier, view), { tier, view });
    await deep(0.45);
    await page.evaluate(() => { window.__cto.ids.sourceView = window.__kupua_getViewportAnchorId__(); document.activeElement?.blur(); });
    const source = await page.evaluate(() => window.__cto.capture());

    stage = 'search back-forward';
    await page.getByRole('button', { name: 'Sort descending, click to sort ascending', exact: true }).click();
    await page.waitForFunction(() => {
      const state = window.__kupua_store__.getState();
      return state.params.orderBy === 'uploadTime' && !state.loading && state.sortAroundFocusStatus === null && !!window.__kupua_getViewportAnchorId__();
    }, null, { timeout: 15000 });
    await page.evaluate(() => { window.__cto.ids.sortedView = window.__kupua_getViewportAnchorId__(); });
    const sorted = await page.evaluate(() => window.__cto.capture());
    await page.goBack();
    await page.waitForFunction(previous => {
      const state = window.__kupua_store__.getState();
      return window.__kupua_getSearchLifecycle__().started > previous && !state.loading
        && state.sortAroundFocusStatus === null && state.params.orderBy === undefined;
    }, sorted.searchStarted, { timeout: 15000 });
    const back = await page.evaluate(label => window.__cto.observe(label), label + '/back');
    await page.goForward();
    await page.waitForFunction(previous => {
      const state = window.__kupua_store__.getState();
      return window.__kupua_getSearchLifecycle__().started > previous && !state.loading
        && state.sortAroundFocusStatus === null && state.params.orderBy === 'uploadTime';
    }, back.final.searchStarted, { timeout: 15000 });
    const forward = await page.evaluate(label => window.__cto.observe(label), label + '/forward');
    result.checks.history = {
      sourceRank: source.tracked.sourceView.rank,
      backCentreDelta: back.final.tracked.sourceView.centre - source.tracked.sourceView.centre,
      backVisible: back.final.tracked.sourceView.intersects,
      backNoFocus: !back.final.hasFocus,
      forwardCentreDelta: forward.final.tracked.sortedView.centre - sorted.tracked.sortedView.centre,
      forwardVisible: forward.final.tracked.sortedView.intersects,
      forwardNoFocus: !forward.final.hasFocus,
      rings: forward.final.rings,
    };

    stage = 'list reload with selection';
    await page.evaluate(() => window.__cto.choose('persisted'));
    const tick = page.locator('[data-cto-target="persisted"]');
    await tick.hover();
    await tick.getByRole('button', { name: 'Select image', exact: true }).click();
    await page.waitForFunction(() => {
      const raw = sessionStorage.getItem('kupua-selection');
      return raw && JSON.parse(raw).state.selectedIds.includes(window.__cto.ids.persisted);
    });
    const beforeReload = await page.evaluate(() => window.__cto.capture());
    await reloadProbe();
    await page.evaluate(() => window.__cto.ready());
    const reloaded = await page.evaluate(label => window.__cto.observe(label), label + '/list-reload');
    result.checks.listReload = {
      mode: reloaded.final.mode,
      selected: reloaded.final.selected,
      sameSelection: reloaded.final.tracked.persisted.selected,
      noFocus: !reloaded.final.hasFocus,
      centreDelta: reloaded.final.tracked.sortedView.centre - beforeReload.tracked.sortedView.centre,
      rings: reloaded.final.rings,
    };
    await page.getByRole('button', { name: 'Clear selection', exact: true }).click();

    stage = 'original detail reload';
    await deep(0.55);
    const point = await page.evaluate(() => window.__cto.pick('reloadOriginal'));
    const original = await page.evaluate(() => window.__cto.capture());
    await page.mouse.dblclick(point.x, point.y);
    await page.evaluate(() => window.__cto.detailReady());
    await reloadProbe();
    const originalDetail = await page.evaluate(() => window.__cto.detailReady());
    if (options.settledReload) await page.evaluate(() => window.__cto.listBehindDetailReady());
    await page.keyboard.press('Backspace');
    await page.waitForFunction(() => !new URL(location.href).searchParams.has('image'));
    const originalReturn = await page.evaluate(label => window.__cto.observe(label), label + '/original-reload-close');
    result.checks.originalReload = {
      underlyingLoadingWhenDetailReady: originalDetail.loading,
      targetLoadedWhenDetailReady: originalDetail.tracked.reloadOriginal.loaded,
      waitedForList: !!options.settledReload,
      centreDelta: originalReturn.final.tracked.reloadOriginal.centre - original.tracked.reloadOriginal.centre,
      visible: originalReturn.final.tracked.reloadOriginal.intersects,
      focused: originalReturn.final.tracked.reloadOriginal.focused,
      rings: originalReturn.final.rings,
    };

    stage = 'traversed detail reload';
    const entry = await page.evaluate(() => window.__cto.pick('reloadEntry'));
    await page.mouse.dblclick(entry.x, entry.y);
    await page.evaluate(() => window.__cto.detailReady());
    if (!await page.evaluate(() => window.__cto.neighbour(1))) throw new Error('CTF reload neighbour absent');
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => new URL(location.href).searchParams.get('image') === window.__cto.ids.expected
      && document.querySelector('[data-detail-image-id]')?.dataset.detailImageId === window.__cto.ids.expected);
    await page.evaluate(() => window.__cto.rememberDetail('reloadLast'));
    await reloadProbe();
    const detail = await page.evaluate(() => window.__cto.detailReady());
    if (options.settledReload) await page.evaluate(() => window.__cto.listBehindDetailReady());
    await page.keyboard.press('Backspace');
    await page.waitForFunction(() => !new URL(location.href).searchParams.has('image'));
    const lastReturn = await page.evaluate(label => window.__cto.observe(label), label + '/traversed-reload-close');
    result.checks.traversedReload = {
      underlyingLoadingWhenDetailReady: detail.loading,
      targetLoadedWhenDetailReady: detail.tracked.reloadLast.loaded,
      waitedForList: !!options.settledReload,
      correctImageAfterReload: detail.tracked.reloadLast.detail && detail.detailMatches,
      lastVisible: lastReturn.final.tracked.reloadLast.intersects,
      centre: lastReturn.final.tracked.reloadLast.centre,
      focusedLast: lastReturn.final.tracked.reloadLast.focused,
      rings: lastReturn.final.rings,
    };
    result.completed = true;
  } catch (error) {
    result.completed = false;
    result.failedStage = stage;
    result.errorType = error?.name ?? 'Error';
    result.state = await page.evaluate(() => window.__cto?.capture() ?? { harnessAbsent: true });
  } finally {
    if (await page.evaluate(() => new URL(location.href).searchParams.has('image'))) {
      await page.keyboard.press('Backspace');
      await page.waitForFunction(() => !new URL(location.href).searchParams.has('image'));
    }
  }
  await page.evaluate(value => window.__cto?.records.push({ workflow: value }), result);
  return result;
}

export async function runLayout(page, options) {
  const { tier, view, transport } = options;
  const label = `${transport}/${tier}/${view}/explicit-layout`;
  const result = { label, states: [] };
  const originalSize = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  const summary = sample => ({ scroll: sample.scroll, scrollLeft: sample.scrollLeft, columns: sample.columns, hasFocus: sample.hasFocus, selected: sample.selected, rings: sample.rings, tracked: sample.tracked });
  let stage = 'prepare';
  try {
    await page.bringToFront();
    for (const policy of ['fresh', 'focus', 'selection']) {
      stage = policy + '/prepare';
      if (await page.getByRole('button', { name: 'Hide Details panel', exact: true }).count()) await page.getByRole('button', { name: 'Hide Details panel', exact: true }).click();
      await page.evaluate(async () => { const module = await import('/src/stores/panel-store.ts'); module.usePanelStore.getState().setWidth('right', 320); });
      await page.setViewportSize(originalSize);
      await page.evaluate(({ tier, view }) => window.__cto.prepare(tier, view), { tier, view });
      await page.evaluate(() => {
        const container = document.querySelector('[aria-label="Image results grid"], [aria-label="Image results table"]');
        container.scrollTop = 2000;
        container.dispatchEvent(new Event('scroll'));
      });
      await page.waitForFunction(() => window.__cto.capture().scroll === 2000 && !!window.__kupua_getViewportAnchorId__());
      if (policy !== 'fresh') {
        const point = await page.evaluate(() => window.__cto.pick('focus'));
        await page.mouse.click(point.x, point.y);
        await page.waitForFunction(() => window.__cto.capture().tracked.focus.focused);
      }
      if (policy === 'selection') {
        await page.evaluate(() => window.__cto.choose('selection', 4));
        const tick = page.locator('[data-cto-target="selection"]');
        await tick.hover();
        await tick.getByRole('button', { name: 'Select image', exact: true }).click();
        await page.waitForFunction(() => window.__cto.capture().selected === 1);
      }
      const shortcutBefore = await page.evaluate(() => { document.activeElement?.blur(); return window.__cto.capture(); });
      await page.keyboard.press('Enter');
      let enterActive = false;
      if (policy === 'focus') {
        await page.evaluate(() => window.__cto.detailReady());
        enterActive = true;
        await page.keyboard.press('Backspace');
        await page.waitForFunction(() => !new URL(location.href).searchParams.has('image'));
      }
      let previewActive = false;
      if (!options.skipPreview) {
        await page.keyboard.press('f');
        if (policy !== 'fresh') {
          await page.waitForFunction(() => window.__cto.capture().preview && !!document.fullscreenElement);
          previewActive = true;
          await page.evaluate(() => { void document.exitFullscreen(); });
          await page.waitForFunction(() => !document.fullscreenElement && !window.__cto.capture().preview);
        }
      }
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
        await page.waitForFunction(previous => window.__kupua_getDensityRestoreGeneration__() > previous, current.densityGeneration);
        rounds.push(summary((await page.evaluate(label => window.__cto.observe(label, 800), label + '/' + policy + '/density-' + step)).final));
      }
      let clear = null;
      if (policy === 'selection') {
        const previous = await page.evaluate(() => window.__cto.capture());
        await page.getByRole('button', { name: 'Clear selection', exact: true }).click();
        const next = await page.evaluate(() => window.__cto.capture());
        clear = { stationary: previous.scroll === next.scroll, focusRetained: next.tracked.focus.focused, ringRestored: next.rings === 1 };
      }
      result.states.push({
        policy,
        shortcuts: {
          enterExpected: policy === 'focus',
          previewExpected: policy !== 'fresh' && !options.skipPreview,
          previewSkipped: !!options.skipPreview,
          enterActive,
          previewActive,
          noUnexpectedDetail: !shortcuts.final.detailOpen,
          noUnexpectedFullscreen: !shortcuts.final.preview && !shortcuts.final.fullscreen,
        },
        before: summary(before),
        opened: summary(opened.final),
        dragged: summary(dragged.final),
        closed: summary(closed.final),
        width: summary(width.final),
        height: summary(height.final),
        rounds,
        clear,
        initialFocus: shortcutBefore.tracked.focus?.focused ?? false,
      });
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
    if (await page.evaluate(() => !!document.fullscreenElement)) await page.evaluate(() => document.exitFullscreen().catch(() => {}));
    if (await page.evaluate(() => new URL(location.href).searchParams.has('image'))) {
      await page.keyboard.press('Backspace');
      await page.waitForFunction(() => !new URL(location.href).searchParams.has('image'));
    }
    if (await page.getByRole('button', { name: 'Hide Details panel', exact: true }).count()) await page.getByRole('button', { name: 'Hide Details panel', exact: true }).click();
  }
  await page.evaluate(value => window.__cto?.records.push({ workflow: value }), result);
  return result;
}

export async function runDensitySupersession(page, options) {
  const { kind, transport } = options;
  const label = `${transport}/explicit-density-supersession/${kind}`;
  const result = { label, checks: {} };
  let stage = 'prepare';
  const installRafGate = () => page.evaluate(() => {
    const originalRequest = window.requestAnimationFrame;
    const originalCancel = window.cancelAnimationFrame;
    let nextId = 1;
    const queue = new Map();
    window.__ctfRafGate = {
      queue,
      flush: () => {
        const callbacks = [...queue.entries()];
        queue.clear();
        for (const [, callback] of callbacks) callback(performance.now());
        return callbacks.length;
      },
      restore: () => {
        window.requestAnimationFrame = originalRequest;
        window.cancelAnimationFrame = originalCancel;
        delete window.__ctfRafGate;
      },
    };
    window.requestAnimationFrame = callback => {
      const id = nextId++;
      queue.set(id, callback);
      return id;
    };
    window.cancelAnimationFrame = id => queue.delete(id);
  });
  const flushRaf = () => page.evaluate(() => window.__ctfRafGate.flush());
  try {
    await page.bringToFront();
    await page.evaluate(() => window.__cto.prepare('buffer', 'grid'));
    const focusPoint = await page.evaluate(() => window.__cto.pick('oldFocus'));
    await page.mouse.click(focusPoint.x, focusPoint.y);
    await page.waitForFunction(() => window.__cto.capture().tracked.oldFocus.focused);
    const densityGenerationBefore = await page.evaluate(() => window.__cto.capture().densityGeneration);
    if (kind === 'no-saved-wheel') {
      await page.evaluate(async () => {
        const module = await import('/src/hooks/useScrollEffects.ts');
        module.clearDensityFocusRatio();
        window.__ctfDensityRelease = module.suppressDensityFocusSave();
      });
    }
    await installRafGate();
    stage = 'density mount';
    await page.getByRole('button', { name: 'Switch to table view', exact: true }).evaluate(element => element.click());
    await page.waitForFunction(() => !!document.querySelector('[aria-label="Image results table"]')
      && window.__ctfRafGate.queue.size > 0, null, { polling: 25, timeout: 5000 });
    if (kind === 'no-saved-wheel') {
      await page.evaluate(() => { window.__ctfDensityRelease?.(); delete window.__ctfDensityRelease; });
    }
    stage = 'first density frame';
    const frame1Callbacks = await flushRaf();
    await page.waitForFunction(() => window.__ctfRafGate.queue.size > 0, null, { polling: 25, timeout: 5000 });
    if (kind === 'no-saved-wheel') {
      stage = 'newer wheel';
      const region = page.getByRole('region', { name: 'Image results table', exact: true });
      const bounds = await region.boundingBox();
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      const beforeWheel = await page.evaluate(() => window.__cto.capture());
      await page.mouse.wheel(0, 640);
      await page.waitForFunction(previous => window.__cto.capture().scroll > previous, beforeWheel.scroll, { polling: 25, timeout: 5000 });
      const newer = await page.evaluate(() => window.__cto.capture());
      stage = 'second density frame';
      let frame2Callbacks = 0;
      let postInputFrames = 0;
      for (; postInputFrames < 5; postInputFrames++) {
        frame2Callbacks += await flushRaf();
        if (await page.evaluate(previous => window.__cto.capture().densityGeneration > previous, densityGenerationBefore)) break;
        await page.waitForFunction(() => window.__ctfRafGate.queue.size > 0, null, { polling: 25, timeout: 1000 });
      }
      await page.evaluate(() => window.__ctfRafGate.restore());
      await page.waitForTimeout(300);
      const final = await page.evaluate(() => window.__cto.capture());
      result.checks = {
        frame1Callbacks,
        frame2Callbacks,
        postInputFrames: postInputFrames + 1,
        densityAcknowledged: final.densityGeneration > densityGenerationBefore,
        newerScroll: newer.scroll,
        finalScroll: final.scroll,
        newerWheelPreserved: final.scroll === newer.scroll,
        oldFocusRetained: final.tracked.oldFocus.focused,
        oldFocusCentre: final.tracked.oldFocus.centre,
        rings: final.rings,
      };
    } else if (kind === 'saved-new-focus') {
      stage = 'newer focus';
      const point = await page.evaluate(() => window.__cto.choose('newFocus', 1));
      await page.mouse.click(point.x, point.y);
      await page.waitForFunction(() => window.__cto.capture().tracked.newFocus.focused, null, { polling: 25, timeout: 5000 });
      const newer = await page.evaluate(() => window.__cto.capture());
      stage = 'second density frame';
      let frame2Callbacks = 0;
      let postInputFrames = 0;
      for (; postInputFrames < 5; postInputFrames++) {
        frame2Callbacks += await flushRaf();
        if (await page.evaluate(previous => window.__cto.capture().densityGeneration > previous, densityGenerationBefore)) break;
        await page.waitForFunction(() => window.__ctfRafGate.queue.size > 0, null, { polling: 25, timeout: 1000 });
      }
      await page.evaluate(() => window.__ctfRafGate.restore());
      await page.waitForTimeout(300);
      const final = await page.evaluate(() => window.__cto.capture());
      result.checks = {
        frame1Callbacks,
        frame2Callbacks,
        postInputFrames: postInputFrames + 1,
        densityAcknowledged: final.densityGeneration > densityGenerationBefore,
        newerFocusRetained: final.tracked.newFocus.focused,
        newerFocusBeforeCentre: newer.tracked.newFocus.centre,
        newerFocusAfterCentre: final.tracked.newFocus.centre,
        oldFocusBeforeCentre: newer.tracked.oldFocus.centre,
        oldFocusAfterCentre: final.tracked.oldFocus.centre,
        placementChangedAfterNewFocus: final.scroll !== newer.scroll,
        rings: final.rings,
      };
    } else {
      throw new Error('Unknown CTF density supersession kind');
    }
    result.completed = true;
  } catch (error) {
    result.completed = false;
    result.failedStage = stage;
    result.errorType = error?.name ?? 'Error';
    result.errorMessage = String(error?.message ?? error).replace(/[0-9a-f]{8}-[0-9a-f-]{20,}/gi, '[id]').slice(0, 240);
    result.state = await page.evaluate(() => window.__cto?.capture() ?? { harnessAbsent: true });
  } finally {
    await page.evaluate(() => {
      window.__ctfDensityRelease?.();
      delete window.__ctfDensityRelease;
      window.__ctfRafGate?.restore?.();
    });
  }
  await page.evaluate(value => window.__cto?.records.push({ workflow: value }), result);
  return result;
}

export async function runVerticalResizeMatrix(page, options) {
  const { transport } = options;
  const label = `${transport}/explicit-vertical-resize`;
  const result = { label, cells: [] };
  const originalSize = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  let stage = 'prepare';
  const choosePosition = (role, position) => page.evaluate(({ role, position }) => {
    const container = document.querySelector('[aria-label="Image results grid"], [aria-label="Image results table"]');
    const bounds = container.getBoundingClientRect();
    const header = container.querySelector('[data-table-header]')?.getBoundingClientRect();
    const usableTop = Math.max(bounds.top, header?.bottom ?? bounds.top);
    const usableBottom = bounds.bottom;
    const targetY = position === 'upper' ? usableTop + 50
      : position === 'lower' ? usableBottom - 50
        : (usableTop + usableBottom) / 2;
    const candidates = Array.from(container.querySelectorAll('[data-image-id]')).flatMap(element => {
      const rect = element.getBoundingClientRect();
      const full = rect.top >= usableTop && rect.bottom <= usableBottom;
      return full ? [{ element, rect, distance: Math.abs((rect.top + rect.bottom) / 2 - targetY) }] : [];
    }).sort((left, right) => left.distance - right.distance);
    const candidate = candidates[0];
    if (!candidate) throw new Error('CTF visible vertical candidate unavailable');
    window.__cto.ids[role] = candidate.element.dataset.imageId;
    return {
      x: candidate.rect.left + Math.min(candidate.rect.width / 2, 180),
      y: candidate.rect.top + Math.min(candidate.rect.height / 2, 90),
    };
  }, { role, position });
  const point = value => value ? {
    centre: value.centre,
    top: value.top,
    full: value.full,
    intersects: value.intersects,
    focused: value.focused,
    selected: value.selected,
    viewportAnchor: value.viewportAnchor,
  } : null;
  try {
    await page.bringToFront();
    for (const view of ['grid', 'table']) {
      for (const position of ['upper', 'centre', 'lower']) {
        for (const policy of ['none', 'focus', 'selection', 'selection-focus']) {
          stage = `${view}/${position}/${policy}`;
          await page.setViewportSize(originalSize);
          await page.evaluate(({ view }) => window.__cto.prepare('buffer', view), { view });
          const primary = await choosePosition('verticalPrimary', position);
          if (policy === 'focus' || policy === 'selection-focus') {
            await page.mouse.click(primary.x, primary.y);
            await page.waitForFunction(() => window.__cto.capture().tracked.verticalPrimary.focused);
          }
          if (policy === 'selection') {
            const target = page.locator('[data-cto-target="verticalPrimary"]');
            await page.evaluate(() => {
              const id = window.__cto.ids.verticalPrimary;
              const container = document.querySelector('[aria-label="Image results grid"], [aria-label="Image results table"]');
              const element = Array.from(container.querySelectorAll('[data-image-id]')).find(candidate => candidate.dataset.imageId === id);
              if (element) element.dataset.ctoTarget = 'verticalPrimary';
            });
            await target.hover();
            await target.getByRole('button', { name: 'Select image', exact: true }).click();
            await page.waitForFunction(() => window.__cto.capture().tracked.verticalPrimary.selected);
          }
          if (policy === 'selection-focus') {
            await page.evaluate(() => window.__cto.choose('verticalSelection', 1));
            const target = page.locator('[data-cto-target="verticalSelection"]');
            await target.hover();
            await target.getByRole('button', { name: 'Select image', exact: true }).click();
            await page.waitForFunction(() => window.__cto.capture().tracked.verticalSelection.selected);
          }
          const before = await page.evaluate(() => window.__cto.capture());
          await page.setViewportSize({ width: originalSize.width, height: 650 });
          await page.waitForTimeout(300);
          const shrunk = await page.evaluate(() => window.__cto.capture());
          await page.setViewportSize(originalSize);
          await page.waitForTimeout(300);
          const restored = await page.evaluate(() => window.__cto.capture());
          await page.setViewportSize({ width: originalSize.width, height: 1050 });
          await page.waitForTimeout(300);
          const grown = await page.evaluate(() => window.__cto.capture());
          await page.setViewportSize(originalSize);
          await page.waitForTimeout(300);
          const final = await page.evaluate(() => window.__cto.capture());
          result.cells.push({
            view,
            position,
            policy,
            scrolls: [before.scroll, shrunk.scroll, restored.scroll, grown.scroll, final.scroll],
            primary: [before, shrunk, restored, grown, final].map(sample => point(sample.tracked.verticalPrimary)),
            selection: [before, shrunk, restored, grown, final].map(sample => point(sample.tracked.verticalSelection)),
            rings: [before.rings, shrunk.rings, restored.rings, grown.rings, final.rings],
          });
        }
      }
    }
    result.completed = true;
  } catch (error) {
    result.completed = false;
    result.failedStage = stage;
    result.errorType = error?.name ?? 'Error';
    result.errorMessage = String(error?.message ?? error).slice(0, 240);
    result.state = await page.evaluate(() => window.__cto?.capture() ?? { harnessAbsent: true });
  } finally {
    await page.setViewportSize(originalSize);
  }
  await page.evaluate(value => window.__cto?.records.push({ workflow: value }), result);
  return result;
}